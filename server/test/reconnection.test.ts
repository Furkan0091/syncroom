import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectClient, createFixture, resetDb, waitForEvent, type Fixture } from "./helpers";
import { ServerEvents } from "../src/events/contract";

describe("reconnection & resynchronization", () => {
  let fx: Fixture;

  afterAll(async () => {
    await fx?.server.close();
  });

  beforeEach(async () => {
    await resetDb();
    fx = await createFixture();
  });

  it("re-authenticates, rejoins the workspace and resyncs the latest document state", async () => {
    // 1. First session: connect, join, make an edit.
    const first = await connectClient(fx.server.url, fx.owner.token, { reconnection: true });
    first.emit("workspace:join", { workspaceId: fx.workspaceId });
    await waitForEvent(first, ServerEvents.WORKSPACE_JOINED);

    first.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] },
      eventId: "evt_reconnect_1",
    });
    await waitForEvent<{ version: number }>(first, ServerEvents.DOCUMENT_ACK);

    // 2. Simulate a dropped connection.
    first.disconnect();

    // 3. A second client edits while the first is away, so the resync must
    //    return the newer state.
    const second = await connectClient(fx.server.url, fx.editor.token);
    second.emit("workspace:join", { workspaceId: fx.workspaceId });
    await waitForEvent(second, ServerEvents.WORKSPACE_JOINED);
    second.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 2,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "from editor" }] }] },
      eventId: "evt_reconnect_2",
    });
    await waitForEvent<{ version: number }>(second, ServerEvents.DOCUMENT_ACK);

    // 4. Reconnect as the original user, rejoin, and ask for the latest state.
    const reconnected = await connectClient(fx.server.url, fx.owner.token, { reconnection: true });
    reconnected.emit("workspace:join", { workspaceId: fx.workspaceId });
    await waitForEvent(reconnected, ServerEvents.WORKSPACE_JOINED);

    const syncedPromise = waitForEvent<{
      documentId: string;
      version: number;
      content: { content: Array<{ content: Array<{ text?: string }> }> };
    }>(reconnected, ServerEvents.DOCUMENT_SYNCED);
    reconnected.emit("document:sync", { documentId: fx.documentId });
    const synced = await syncedPromise;

    expect(synced.documentId).toBe(fx.documentId);
    expect(synced.version).toBe(3);
    expect(synced.content.content[0]?.content?.[0]?.text).toBe("from editor");

    reconnected.disconnect();
    second.disconnect();
  });

  it("returns the current presence after a reconnect", async () => {
    const first = await connectClient(fx.server.url, fx.owner.token, { reconnection: true });
    first.emit("workspace:join", { workspaceId: fx.workspaceId });
    await waitForEvent(first, ServerEvents.WORKSPACE_JOINED);
    first.disconnect();

    const reconnected = await connectClient(fx.server.url, fx.owner.token, { reconnection: true });
    const joined = waitForEvent<{ users: Array<{ userId: string }> }>(
      reconnected,
      ServerEvents.WORKSPACE_JOINED,
    );
    reconnected.emit("workspace:join", { workspaceId: fx.workspaceId });
    const { users } = await joined;

    // Only the reconnected user should be present now.
    expect(users).toHaveLength(1);
    expect(users[0]?.userId).toBe(fx.owner.user.id);

    reconnected.disconnect();
  });

  it("rejects sockets with an invalid token at the handshake", async () => {
    const socket = await import("socket.io-client").then(({ io }) =>
      io(fx.server.url, { transports: ["websocket"], auth: { token: "bad-token" } }),
    );
    const error = await new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for connect_error")), 5000);
      socket.once("connect_error", (err: Error) => {
        clearTimeout(timer);
        resolve(err);
      });
    });
    expect(error.message).toBeTruthy();
    socket.disconnect();
  });
});
