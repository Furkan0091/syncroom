import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { connectClient, createFixture, resetDb, waitForEvent, type Fixture } from "./helpers";
import { ServerEvents } from "../src/events/contract";

describe("real-time collaboration", () => {
  let fx: Fixture;
  let userA: ClientSocket;
  let userB: ClientSocket;

  async function joinBoth(): Promise<{
    presenceA: { users: Array<{ userId: string }> };
    presenceB: { users: Array<{ userId: string }> };
  }> {
    userA = await connectClient(fx.server.url, fx.owner.token);
    userB = await connectClient(fx.server.url, fx.editor.token);

    // Join A first, then register listeners before B joins so the presence
    // broadcast (which fires during B's join) is captured.
    const aJoined = waitForEvent(userA, ServerEvents.WORKSPACE_JOINED);
    userA.emit("workspace:join", { workspaceId: fx.workspaceId });
    await aJoined;

    const presenceA = waitForEvent<{ users: Array<{ userId: string }> }>(
      userA,
      ServerEvents.WORKSPACE_PRESENCE,
    );
    const presenceB = waitForEvent<{ users: Array<{ userId: string }> }>(
      userB,
      ServerEvents.WORKSPACE_PRESENCE,
    );
    const bJoined = waitForEvent(userB, ServerEvents.WORKSPACE_JOINED);
    userB.emit("workspace:join", { workspaceId: fx.workspaceId });
    await bJoined;

    const [pa, pb] = await Promise.all([presenceA, presenceB]);
    return { presenceA: pa, presenceB: pb };
  }

  afterAll(async () => {
    userA?.disconnect();
    userB?.disconnect();
    await fx?.server.close();
  });

  beforeEach(async () => {
    await resetDb();
    fx = await createFixture();
  });

  it("shows both users in each other's presence lists", async () => {
    const { presenceA, presenceB } = await joinBoth();

    const userIdsA = presenceA.users.map((u) => u.userId).sort();
    const userIdsB = presenceB.users.map((u) => u.userId).sort();

    expect(userIdsA).toContain(fx.owner.user.id);
    expect(userIdsA).toContain(fx.editor.user.id);
    expect(userIdsB).toEqual(userIdsA);
  });

  it("records USER_JOINED activity in real time", async () => {
    await joinBoth();
    const activity = waitForEvent<{ activity: { type: string; message: string } }>(
      userB,
      ServerEvents.ACTIVITY_NEW,
    );
    // Trigger a join activity by having a third client connect after the two.
    const sarah = await connectClient(fx.server.url, fx.viewer.token);
    sarah.emit("workspace:join", { workspaceId: fx.workspaceId });
    await waitForEvent(sarah, ServerEvents.WORKSPACE_JOINED);

    const { activity: act } = await activity;
    expect(act.type).toBe("USER_JOINED");
    sarah.disconnect();
  });

  it("broadcasts document updates to other clients and acks the sender", async () => {
    await joinBoth();
    const updatedPromise = waitForEvent<{
      documentId: string;
      version: number;
      content: { type: string };
      updatedBy: { id: string };
    }>(userB, ServerEvents.DOCUMENT_UPDATED);

    const ackPromise = waitForEvent<{ version: number; eventId: string }>(
      userA,
      ServerEvents.DOCUMENT_ACK,
    );

    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      eventId: "evt_update_1",
    });

    const [updated, ack] = await Promise.all([updatedPromise, ackPromise]);
    expect(updated.documentId).toBe(fx.documentId);
    expect(updated.version).toBe(2);
    expect(updated.updatedBy.id).toBe(fx.owner.user.id);
    expect(ack.version).toBe(2);
    expect(ack.eventId).toBe("evt_update_1");
  });

  it("persists updates and creates version snapshots", async () => {
    await joinBoth();
    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      eventId: "evt_persist_1",
    });
    await waitForEvent(userA, ServerEvents.DOCUMENT_ACK);

    const res = (await fetch(`${fx.server.url}/api/documents/${fx.documentId}/versions`, {
      headers: { Authorization: `Bearer ${fx.owner.token}` },
    }).then((r) => r.json())) as {
      document: { version: number };
      versions: Array<{ version: number }>;
    };

    expect(res.document.version).toBe(2);
    expect(res.versions).toHaveLength(2);
    expect(res.versions[0]?.version).toBe(2);
    expect(res.versions[1]?.version).toBe(1);
  });

  it("rejects stale updates with a conflict and sends the latest state", async () => {
    await joinBoth();
    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      eventId: "evt_conflict_1",
    });
    await waitForEvent(userA, ServerEvents.DOCUMENT_ACK);

    const conflictPromise = waitForEvent<{
      baseVersion: number;
      currentVersion: number;
      content: { type: string };
    }>(userA, ServerEvents.DOCUMENT_CONFLICT);

    // Same client sends an update based on the stale version 1.
    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      eventId: "evt_conflict_2",
    });

    const conflict = await conflictPromise;
    expect(conflict.baseVersion).toBe(1);
    expect(conflict.currentVersion).toBe(2);
    expect(conflict.content.type).toBe("doc");
  });

  it("ignores duplicate events with the same eventId", async () => {
    await joinBoth();
    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 1,
      content: { type: "doc", content: [] },
      eventId: "evt_dup_1",
    });
    const ack1 = await waitForEvent<{ version: number }>(userA, ServerEvents.DOCUMENT_ACK);

    // Same eventId replayed — server must not apply it again.
    userA.emit("document:update", {
      documentId: fx.documentId,
      baseVersion: 2,
      content: { type: "doc", content: [] },
      eventId: "evt_dup_1",
    });
    const ack2 = await waitForEvent<{ version: number; duplicate?: boolean }>(
      userA,
      ServerEvents.DOCUMENT_ACK,
    );

    expect(ack1.version).toBe(2);
    expect(ack2.version).toBe(2);
    expect(ack2.duplicate).toBe(true);
  });

  it("propagates presence status changes", async () => {
    await joinBoth();
    const presencePromise = waitForEvent<{ users: Array<{ userId: string; status: string }> }>(
      userB,
      ServerEvents.WORKSPACE_PRESENCE,
    );
    userA.emit("presence:update", { status: "EDITING" });
    const { users } = await presencePromise;

    const ownerPresence = users.find((u) => u.userId === fx.owner.user.id);
    expect(ownerPresence?.status).toBe("EDITING");
  });

  it("updates presence when a user disconnects", async () => {
    await joinBoth();
    const presencePromise = waitForEvent<{ users: Array<{ userId: string }> }>(
      userB,
      ServerEvents.WORKSPACE_PRESENCE,
    );
    const activityPromise = waitForEvent<{ activity: { type: string } }>(
      userB,
      ServerEvents.ACTIVITY_NEW,
    );

    userA.disconnect();

    const [{ users }, { activity }] = await Promise.all([presencePromise, activityPromise]);
    expect(users.map((u) => u.userId)).not.toContain(fx.owner.user.id);
    expect(activity.type).toBe("USER_LEFT");
  });

  it("delivers comments and activity to the whole workspace in real time", async () => {
    await joinBoth();
    const commentPromise = waitForEvent<{
      comment: { content: string; author: { id: string } };
    }>(userB, ServerEvents.COMMENT_CREATED);
    const activityPromise = waitForEvent<{ activity: { type: string } }>(
      userB,
      ServerEvents.ACTIVITY_NEW,
    );

    userA.emit("comment:create", {
      documentId: fx.documentId,
      content: "Should we update this section?",
    });

    const [{ comment }, { activity }] = await Promise.all([commentPromise, activityPromise]);
    expect(comment.content).toBe("Should we update this section?");
    expect(comment.author.id).toBe(fx.owner.user.id);
    expect(activity.type).toBe("COMMENT_CREATED");
  });

  it("notifies mentioned users in real time", async () => {
    await joinBoth();
    // The editor (userB) must be connected to receive the personal notification.
    const notificationPromise = waitForEvent<{
      notification: { type: string; userId: string; message: string };
    }>(userB, ServerEvents.NOTIFICATION_NEW);

    userA.emit("comment:create", {
      documentId: fx.documentId,
      content: `@${fx.editor.user.name} can you review this section?`,
    });

    const { notification } = await notificationPromise;
    expect(notification.type).toBe("MENTION");
    expect(notification.userId).toBe(fx.editor.user.id);
    expect(notification.message).toContain("mentioned");
  });
});
