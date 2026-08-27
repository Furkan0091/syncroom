# SyncRoom

**Real-Time Collaborative Workspace**

Multiple users work inside the same shared document and see each other's changes instantly — no page refresh, no polling, no fake real-time.

The core loop is always: **Connect → Join Workspace → Synchronize State → Collaborate → Persist → Broadcast → Recover**.

---

## Overview

Traditional web apps are single-user by default: when two people work on the same thing, someone has to refresh, reconcile, or wait. SyncRoom treats collaboration as the primary model instead of an add-on. A backend Socket.IO server owns synchronization, presence, permissions and persistence; the React client is a thin view over a live event stream.

The application demonstrates:

- WebSocket architecture (Socket.IO rooms per workspace)
- Real-time document synchronization with optimistic updates
- User presence (who is online, who is editing, who left)
- Version-based optimistic concurrency with conflict detection
- Persisted version history with restore
- Real-time comments, mentions, notifications and activity feed
- Authenticated WebSocket connections and role-based authorization
- Reconnection handling with state resynchronization

## Core Features

| Feature | What it does |
| --- | --- |
| Shared editor | TipTap/ProseMirror rich-text document, editable by every member with the right role. Changes sync to all connected clients through the server — never peer-to-peer, never faked locally. |
| Presence | In-memory presence per workspace. Statuses: Online / Editing / Viewing / Idle. Updates broadcast the moment someone connects, changes state, or disconnects. |
| Version history | Every accepted update is persisted as a numbered snapshot (`v1`, `v2`, …) with author and timestamp. Any version can be previewed and restored (restore keeps the current state as a new version, so nothing is lost). |
| Conflict handling | Updates carry the base version they were edited from. Stale updates are rejected with the latest state; clients reconcile and rebase pending edits. |
| Comments & mentions | Threaded comments on the document. `@Name` mentions create a real-time notification for that user. |
| Activity feed | Persisted, real-time feed of workspace events (join/leave, edits, comments, invitations, restores). |
| Notifications | Mentions, comments and invitations arrive via WebSocket and appear in the bell in real time. |
| Invitations | Workspace owners invite members by email with an explicit role (Editor/Viewer). |
| Search | Practical search across the user's workspaces, documents, comments and activity. |
| Connection awareness | A live indicator shows Connected / Reconnecting / Offline; the client resynchronizes automatically after a reconnect. |

## Architecture

```
                 User A
                    │
                    │ WebSocket
                    ▼
             ┌───────────────┐
             │   SyncRoom    │
             │    Server     │
             └───────┬───────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
      Validate    Presence    Events
          │          │          │
          └──────────┼──────────┘
                     │
                     ▼
               PostgreSQL
                     │
                     ▼
              Version History
                     │
                     ▼
             Broadcast Update
                /       \
               /         \
              ▼           ▼
           User B       User C
```

The backend is the single source of truth:

- **REST** handles normal operations (auth, workspaces, members, versions, notifications, search).
- **WebSocket (Socket.IO)** handles everything real-time: room membership, presence, document updates, comments, activity and notifications.

Server-side responsibilities: authentication, workspace authorization, WebSocket connection management, event validation, synchronization, presence, persistence, version tracking, conflict detection and reconnection handling. None of the synchronization logic lives in the frontend.

## WebSocket Events

All clients in a workspace join the room `workspace:<id>`. Each user also has a personal room `user:<id>` for targeted notifications.

### Client → Server

| Event | Payload |
| --- | --- |
| `workspace:join` | `{ workspaceId }` |
| `workspace:leave` | `{ workspaceId }` |
| `presence:update` | `{ status: "ONLINE" \| "EDITING" \| "VIEWING" \| "IDLE" }` |
| `document:update` | `{ documentId, baseVersion, content, eventId }` |
| `document:sync` | `{ documentId }` |
| `comment:create` | `{ documentId, content, parentId? }` |

### Server → Client

| Event | Payload |
| --- | --- |
| `workspace:joined` | `{ workspaceId, users }` |
| `workspace:presence` | `{ workspaceId, users }` |
| `document:updated` | `{ documentId, version, content, title, updatedBy, timestamp }` |
| `document:ack` | `{ documentId, version, eventId }` |
| `document:conflict` | `{ documentId, baseVersion, currentVersion, content }` |
| `document:synced` | `{ documentId, title, version, content, updatedBy }` |
| `comment:created` / `comment:updated` / `comment:deleted` | `{ comment }` / `{ commentId }` |
| `activity:new` | `{ activity }` |
| `notification:new` | `{ notification }` |
| `error` | `{ code, message }` |

Every event is validated with zod on the server: authentication, workspace membership, role, document ownership and version are all checked server-side. Client-supplied user ids, roles and permissions are never trusted.

## Presence System

Presence is maintained **in memory** on the server (per workspace → per user), not in the database — it reflects live connections, not history.

- A user's presence entry holds the set of sockets they have open in a workspace, so multiple tabs keep one user entry.
- Presence is broadcast as the full list (`workspace:presence`) whenever someone joins, leaves, or changes status — every client reconciles to the server's authoritative list.
- When a socket disconnects, the server removes it from every room and broadcasts the update immediately.
- The design is deliberately isolated in `PresenceStore` so it can be backed by Redis pub/sub for horizontal scaling without touching the rest of the system.

## Concurrency

Document updates use **server-authoritative version numbers** (optimistic concurrency):

```
Document version: 42

User A sends update (baseVersion 42)   →  server accepts → version 43
User B sends update (baseVersion 42)   →  server detects stale version
                                             ↓
                                     document:conflict
                                             ↓
                              B receives latest state and reconciles
```

- Each document has a `version` column; each accepted update increments it and persists a `DocumentVersion` snapshot.
- The client sends its edits optimistically (the UI responds instantly), debounced (~800 ms), with the version it edited from and a unique `eventId`.
- If another user saved in between, the server rejects the stale update with the current state. The client applies the server state, and if it has pending edits it **rebases** them onto the newest version instead of silently dropping them.
- `eventId` deduplication prevents the same update from being applied twice (e.g. a retried emit).

This is a deliberate, documented simplification: a full CRDT/OT engine (Google-Docs grade) is out of scope — the goal is sound, reliable version-based synchronization.

## Persistence

PostgreSQL + Prisma. Models:

```
User ── WorkspaceMember ── Workspace ── Document ── DocumentVersion
  │                                 │
  ├── Comment                       └── Activity
  └── Notification
```

- `Document.content` stores the TipTap/ProseMirror JSON document.
- Every accepted update creates a `DocumentVersion` row (content + author + timestamp) — that is the version history.
- `WorkspaceMember` records role and `lastAccessedAt` (powers "Recent workspaces").
- Appropriate indexes exist on membership, document lookup, version history, comments, activity and notifications.

## Reconnection

1. Client detects the disconnect (Socket.IO client) and shows **Reconnecting…**.
2. Socket.IO reconnects; the server re-authenticates the JWT from the handshake.
3. The client re-emits `workspace:join` and `document:sync`.
4. The server replies with the authoritative presence list and the latest document state.
5. The editor reconciles and the indicator returns to **Live**.

Any edits made while offline are kept locally and pushed as soon as the connection returns.

## REST API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | name, email, password (hashed with bcrypt) |
| `POST` | `/api/auth/login` | returns JWT |
| `GET` | `/api/auth/me` | current user |
| `POST` | `/api/auth/logout` | discards session client-side |
| `GET` / `POST` | `/api/workspaces` | list recent / create |
| `GET` / `PUT` / `DELETE` | `/api/workspaces/:id` | owner can update/delete |
| `GET` / `POST` | `/api/workspaces/:id/members` | list / invite by email |
| `PATCH` / `DELETE` | `/api/workspaces/:id/members/:userId` | change role / remove |
| `GET` / `POST` | `/api/workspaces/:id/documents` | list / create |
| `GET` / `PATCH` | `/api/documents/:id` | fetch / rename |
| `GET` | `/api/documents/:id/versions` | version history |
| `POST` | `/api/documents/:id/versions/:version/restore` | restore (creates a new version) |
| `GET` / `POST` | `/api/documents/:id/comments` | list / create |
| `PATCH` / `DELETE` | `/api/comments/:id` | edit / delete |
| `GET` | `/api/workspaces/:id/activity` | activity feed |
| `GET` | `/api/notifications` | list + unread count |
| `POST` | `/api/notifications/read-all` · `/api/notifications/:id/read` | mark read |
| `GET` | `/api/search?q=` | workspaces, documents, comments, activity |

## Local Setup

Requirements: Node 18+ (24 recommended), Docker (for PostgreSQL), npm.

```bash
# 1. Install dependencies (workspaces: server + client)
npm install

# 2. Start PostgreSQL (port 5433 — 5432 is often taken by other stacks)
npm run db:up

# 3. Configure environment
cp .env.example server/.env   # adjust values if needed

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run both servers (API :4100, client :5174)
npm run dev
```

Open **http://localhost:5174** and sign in as any demo user (password `password123`):

```
furqan@syncroom.dev   — Owner of "Customer Onboarding"
ahmed@syncroom.dev    — Editor
sarah@syncroom.dev    — Editor
```

**Demo:** open the *Customer Onboarding* workspace in two browsers (Furqan and Ahmed), edit the document in one and watch the other update instantly. Add a comment, mention someone, and see the notification arrive live. Version history grows with every edit.

### Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://syncroom:syncroom@localhost:5433/syncroom` | PostgreSQL connection string |
| `JWT_SECRET` | — | Signs JWTs (use a long random string in production) |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `PORT` | `4100` | API + WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5174` | CORS origin |

## Docker

`docker compose up --build` runs the full stack: **PostgreSQL**, **SyncRoom server** (Node) and **SyncRoom client** (nginx). The server applies migrations and seeds on boot. Open **http://localhost:8080**.

For development, run only the database in Docker (`npm run db:up`) and the apps with `npm run dev`.

## Project Structure

```
syncroom/
├── client/                     # React + TypeScript + Tailwind + TipTap
│   └── src/
│       ├── components/         # editor, panels, modals, indicators
│       ├── pages/              # login, register, dashboard, workspace
│       ├── stores/             # zustand (document sync, presence, comments, …)
│       └── lib/                # api client, socket layer, formatting
├── server/                     # Node + Express + TypeScript + Prisma + Socket.IO
│   ├── prisma/                 # schema + seed data
│   ├── src/
│   │   ├── routes/             # REST endpoints
│   │   ├── services/           # business logic (incl. collaboration service)
│   │   ├── websocket/          # Socket.IO setup + event handlers
│   │   ├── presence/           # in-memory presence store
│   │   ├── events/             # event contract (documented)
│   │   ├── middleware/         # auth, error handling
│   │   ├── validation/         # zod schemas
│   │   └── app.ts / index.ts   # HTTP + WS bootstrap
│   └── test/                   # vitest + supertest + socket.io-client
└── docker-compose.yml          # postgres + server + client
```

## Testing

```bash
npm test          # server tests (needs Docker Postgres running)
```

The suite spins up the real HTTP + Socket.IO server against a dedicated test database (`syncroom_test`) and covers:

- **Authentication** — register, login, invalid credentials, protected routes
- **Authorization** — owner/editor/viewer permissions over REST and WebSocket, invitation rules, outsider rejection
- **Collaboration** — join/leave, presence lists, document update broadcast + ack, version validation, conflict detection, duplicate `eventId` handling, comment delivery, mention notifications
- **Reconnection** — reconnect → re-auth → rejoin → resync latest state, presence after reconnect, invalid-token rejection

A browser-level check drives the real UI with puppeteer (two isolated browser
contexts) and verifies live sync, presence, comments and mention notifications:

```bash
# dev servers running + seeded DB, Chrome installed
node scripts/e2e-browser.mjs
```

## Case Study

A full engineering write-up — *Building a Real-Time Collaboration System* — covering event design, WebSocket lifecycle, concurrency, optimistic updates, failure recovery and persistence decisions: **[docs/case-study.md](docs/case-study.md)**.

## Future Improvements

- CRDT-based synchronization for fine-grained conflict-free merges
- Horizontal WebSocket scaling with a Redis presence adapter and Socket.IO Redis adapter
- Offline-first editing with a local change queue
- Collaborative cursors and selections
- More document types (whiteboards, diagrams, code)
- Search backed by a full-text engine

---

## Portfolio Card

**Title:** SyncRoom
**Subtitle:** Real-Time Collaborative Workspace

> Real-time collaborative workspace built around WebSockets, shared state synchronization, user presence, and concurrent updates.

**Tags:** React · TypeScript · Node.js · Express · PostgreSQL · Prisma · WebSockets · Socket.IO

**Highlights**

1. **Real-Time Collaboration** — multiple users work in the same workspace and receive changes instantly.
2. **WebSocket Architecture** — Socket.IO handles all live communication; the server owns synchronization, never the client.
3. **Presence & Activity** — see who is online, who is editing, and what is happening right now.
4. **Concurrent Update Handling** — version-based validation rejects stale updates and clients reconcile instead of blind-overwriting.
5. **Version History** — every change is a numbered, inspectable, restorable snapshot.
