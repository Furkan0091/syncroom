# Building a Real-Time Collaboration System

*A technical case study of SyncRoom — engineering decisions, not screenshots.*

---

## Problem

Traditional web applications are built around the request-response model: one user, one browser, one page. When multiple people need to work on the same document, the default experience is terrible — edit, save, refresh, hope nobody overwrote you. Refreshing to see someone else's changes is not collaboration; it's archaeology.

SyncRoom was built to answer one question: **what does the backend of a genuinely collaborative application look like?** The answer turned out to be a real-time event system with the server as the single source of truth, not a CRUD app with WebSockets bolted on.

## Real-Time Requirements

Building this surfaced five hard requirements that a request-response architecture cannot meet:

1. **Instant updates** — when User A types, User B sees it without any action. The latency budget is network round-trip + one server hop; there is no polling interval to hide behind.
2. **Presence** — the system must know, at any instant, who is in a workspace and what they are doing, without consulting a database.
3. **Shared state** — all clients must converge on one authoritative document state, even when edits arrive from multiple users at once.
4. **Connection awareness** — connections drop constantly (laptops sleep, networks flap). The client must know it is disconnected, say so, and recover without losing work.
5. **Event ordering** — when two edits arrive "at the same time," there must be a deterministic rule for which one wins and what the loser does about it.

## WebSocket Architecture

```
Client ── WebSocket ── SyncRoom Server ── Event Validation ── Broadcast ── Connected Clients
```

The client connects to the server over a single authenticated WebSocket. Workspaces map to Socket.IO rooms (`workspace:<id>`), so every broadcast is a room broadcast — the server never has to enumerate recipients.

Two design decisions mattered here:

- **The server broadcasts, never the client.** When User A edits, their client sends one `document:update` event. The server validates it, persists it, and broadcasts the new state to everyone else in the room. There is no optimistic "fake it" path where clients tell each other what happened.
- **Handlers are thin.** Socket event handlers parse and validate the payload, then delegate to a `CollaborationService`. All business logic — membership checks, role checks, version validation, persistence, snapshot creation — lives in one place, shared by the REST and WebSocket paths.

The REST API still exists for non-real-time operations (auth, workspace management, version browsing, search). The rule: *if it needs to be live, it is a socket event; if it is an infrequent operation with a defined outcome, it is REST.*

## Presence System

Presence is fundamentally different from persistence: it describes *live* connections, so storing it in PostgreSQL would be both slow and wrong (a crashed tab would linger for hours).

The `PresenceStore` is an in-memory map:

```
workspaceId → userId → { name, status, socketIds: Set }
```

Key decisions:

- **A user can have multiple sockets** (two tabs, a phone). Presence is keyed per user, and each entry tracks the set of sockets that represent it. The user leaves only when the last socket disconnects.
- **The list is authoritative.** Every join, leave, or status change broadcasts the full presence list for the workspace. Clients replace their local list wholesale — there is no per-user patching to drift out of sync.
- **Disconnects are detected server-side.** The `disconnect` event removes the socket from every room it joined, and any users that fully departed are announced immediately.
- **Statuses are derived from user behavior**: the editor emits `EDITING` on focus, `VIEWING` on blur, and the client reports `IDLE` after 30 seconds of inactivity.

The store is deliberately isolated behind a small class. Scaling to multiple server instances means swapping the map for a Redis pub/sub store — nothing else in the system changes.

## Event Synchronization

Document updates follow a strict pipeline:

```
document:update ──▶ authenticate ──▶ authorize ──▶ version check ──▶ apply
      ──▶ persist ──▶ snapshot ──▶ broadcast ──▶ ack
```

- **Authentication** happens at the WebSocket handshake (JWT verified by middleware); the connection is bound to a user id that the server trusts.
- **Authorization** re-checks, per event, that the user is a workspace member with an editor role. Client-supplied identity is never trusted.
- **Version check** — see below.
- **Apply + persist** happen in a single transaction: the document content and version are updated, and a `DocumentVersion` row is written with the new content, author and timestamp. The version history is therefore *by construction* complete — every version in the history was once the live document.
- **Broadcast** excludes the sender (they already applied the change optimistically); the sender gets a lightweight `document:ack` carrying the new version.
- **Deduplication**: every update carries a client-generated `eventId`. The server remembers recently processed ids per user, so a retried emit cannot apply the same change twice.

## Concurrent Updates

The classic hard problem. Two users edit the same document; both save; both are "right." Without coordination, the second save silently destroys the first.

SyncRoom uses **version-based optimistic concurrency** — a deliberately pragmatic choice, documented honestly:

```
Document version: 42

User A sends update (baseVersion 42)  → accepted, version becomes 43
User B sends update (baseVersion 42)  → stale! server replies document:conflict
                                         with the latest state (v43)
```

- The client sends the version it edited **from**, not the version it expects to produce. The server accepts only if that matches the persisted version; otherwise it responds with the conflict and the authoritative state.
- On the client, edits are applied **optimistically** (the UI responds to typing immediately), debounced (~800 ms), and pushed with the base version. This keeps the UI fast while keeping the server authoritative.
- When a conflict arrives, the client reconciles to the server state. If it has unsynced local edits, it **rebases** them onto the newest version and re-pushes, rather than dropping them silently. If a genuinely conflicting edit has to be discarded, the UI says so — a banner explains that the document was resynchronized.

The trade-off is explicit: whole-document replacement with base-version validation is less sophisticated than CRDT/OT merging, but it is deterministic, explainable, and reliable. For a production collaboration product, the next step is a CRDT layer (Yjs) — but a small reliable system beats a large fragile one.

## Optimistic Updates

Optimism is a UI property, not a correctness property. The client shows keystrokes immediately; the *synchronization* still goes through the server. The state machine on the client is explicit:

```
saved → saving (debounce) → syncing (event in flight) → saved (ack)
                          ↘ offline (socket down — queued locally)
                          ↘ conflict (stale — reconcile + rebase)
```

Each transition is visible to the user via the save indicator, so "the system is working" is never a guess.

## Persistence

PostgreSQL via Prisma. The schema is shaped by the collaboration model:

- `Document.content` stores the TipTap/ProseMirror JSON document; `Document.version` is the concurrency token.
- `DocumentVersion` rows are immutable snapshots (document, version, content, author, timestamp). Restoring a version does **not** delete anything: it copies the snapshot into the document, bumps the version, and writes the current state as a new snapshot. Version history is append-only and lossless.
- `WorkspaceMember` carries the role and `lastAccessedAt`, which powers the "recent workspaces" list.
- Activity and notifications are persisted so the UI can be rebuilt after a refresh, but live updates always arrive over WebSocket first.

The database is the source of truth for *state*; the socket layer is the source of truth for *who is here right now*. The two never fight because they answer different questions.

## Failure / Reconnection Handling

Connections fail. The design assumes it:

1. The Socket.IO client detects the drop and the UI switches to **Reconnecting…** — the user is never left with stale data and a false sense of liveness.
2. Socket.IO reconnects and the server re-authenticates the JWT from the handshake.
3. The client re-emits `workspace:join` and `document:sync`; the server replies with the authoritative presence list and latest document state.
4. The editor reconciles, pending local edits are re-pushed, and the indicator returns to **Live**.

Edits made while offline are not lost: they stay in the local state and are pushed when the connection returns (rejected with a conflict only if someone else genuinely saved over them in the meantime).

Server-side, disconnect cleanup is defensive: presence is updated synchronously with the socket lifecycle, and activity recording is best-effort (a workspace deleted mid-session must not crash the cleanup path).

## Lessons Learned

- **Design the event contract first.** Naming events `document:updated` vs `document:update` (past vs imperative, server vs client) and documenting payloads up front prevented a whole class of ambiguity. The contract lives in one file on each side.
- **The server must own the truth.** Every temptation to "just apply it locally and broadcast" undermines the system. Optimistic UI is fine — optimistic *state* is a bug.
- **Version numbers are a coordination protocol.** The base version is the client saying "I saw what you saw." That single field buys conflict detection, idempotency debugging, and a resync trigger, all without CRDT complexity.
- **Presence and persistence are different systems.** Keeping live presence in memory made it fast, honest, and trivially correct on disconnect — and cleanly swappable for Redis later.
- **Reconnection is a feature, not an error path.** It deserves the same design attention as the happy path: explicit UI state, explicit resync protocol, explicit reconciliation rules.
- **WebSocket lifecycle is subtle.** Multiple sockets per user, join/leave races, disconnects that arrive after the socket object is gone — the presence store's socket-set model absorbed all of these cleanly.
- **Write the tests that prove it's real.** The suite connects two real Socket.IO clients and asserts that an edit made by one arrives at the other, that stale updates get conflicts, and that a reconnecting client resynchronizes. If the tests can't demonstrate real-time behavior, the app doesn't have it.
