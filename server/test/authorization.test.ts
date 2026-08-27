import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { connectClient, createFixture, resetDb, waitForEvent, type Fixture } from "./helpers";
import { ServerEvents } from "../src/events/contract";

describe("authorization & permissions", () => {
  let fx: Fixture;

  afterAll(async () => {
    await fx?.server.close();
  });

  beforeEach(async () => {
    await resetDb();
    fx = await createFixture();
  });

  it("lets the owner update the workspace", async () => {
    const res = await request(fx.server.httpServer)
      .put(`/api/workspaces/${fx.workspaceId}`)
      .set("Authorization", `Bearer ${fx.owner.token}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.workspace.name).toBe("Renamed");
  });

  it("rejects workspace updates from an editor", async () => {
    const res = await request(fx.server.httpServer)
      .put(`/api/workspaces/${fx.workspaceId}`)
      .set("Authorization", `Bearer ${fx.editor.token}`)
      .send({ name: "Hijack" });
    expect(res.status).toBe(403);
  });

  it("lets the owner invite members by email", async () => {
    const res = await request(fx.server.httpServer)
      .post(`/api/workspaces/${fx.workspaceId}/members`)
      .set("Authorization", `Bearer ${fx.owner.token}`)
      .send({ email: fx.outsider.user.email, role: "VIEWER" });
    expect(res.status).toBe(201);
    expect(res.body.member.user.email).toBe(fx.outsider.user.email);
  });

  it("rejects invitations from editors", async () => {
    const res = await request(fx.server.httpServer)
      .post(`/api/workspaces/${fx.workspaceId}/members`)
      .set("Authorization", `Bearer ${fx.editor.token}`)
      .send({ email: "someone@test.dev", role: "VIEWER" });
    expect(res.status).toBe(403);
  });

  it("rejects invitations for unknown emails", async () => {
    const res = await request(fx.server.httpServer)
      .post(`/api/workspaces/${fx.workspaceId}/members`)
      .set("Authorization", `Bearer ${fx.owner.token}`)
      .send({ email: "ghost@test.dev", role: "VIEWER" });
    expect(res.status).toBe(404);
  });

  it("lets the owner remove members but not the owner", async () => {
    const res = await request(fx.server.httpServer)
      .delete(`/api/workspaces/${fx.workspaceId}/members/${fx.viewer.user.id}`)
      .set("Authorization", `Bearer ${fx.owner.token}`);
    expect(res.status).toBe(200);

    const selfRemove = await request(fx.server.httpServer)
      .delete(`/api/workspaces/${fx.workspaceId}/members/${fx.owner.user.id}`)
      .set("Authorization", `Bearer ${fx.owner.token}`);
    expect(selfRemove.status).toBe(403);
  });

  it("lets viewers view but not edit documents via REST", async () => {
    const view = await request(fx.server.httpServer)
      .get(`/api/documents/${fx.documentId}`)
      .set("Authorization", `Bearer ${fx.viewer.token}`);
    expect(view.status).toBe(200);

    const edit = await request(fx.server.httpServer)
      .patch(`/api/documents/${fx.documentId}`)
      .set("Authorization", `Bearer ${fx.viewer.token}`)
      .send({ title: "Hijack" });
    expect(edit.status).toBe(403);
  });

  it("rejects users outside the workspace entirely", async () => {
    const res = await request(fx.server.httpServer)
      .get(`/api/workspaces/${fx.workspaceId}`)
      .set("Authorization", `Bearer ${fx.outsider.token}`);
    expect(res.status).toBe(404);
  });

  it("rejects document updates from a viewer over the socket", async () => {
    const socket = await connectClient(fx.server.url, fx.viewer.token);
    try {
      socket.emit("workspace:join", { workspaceId: fx.workspaceId });
      await waitForEvent(socket, "workspace:joined");

      const errorPromise = waitForEvent<{ code: string }>(socket, ServerEvents.ERROR);
      socket.emit("document:update", {
        documentId: fx.documentId,
        baseVersion: 1,
        content: { type: "doc", content: [] },
        eventId: "evt_unauthorized_1",
      });

      const error = await errorPromise;
      expect(error.code).toBe("FORBIDDEN");
    } finally {
      socket.disconnect();
    }
  });

  it("rejects document updates from users outside the workspace", async () => {
    const socket = await connectClient(fx.server.url, fx.outsider.token);
    try {
      // Joining the workspace fails for non-members.
      const joinError = waitForEvent<{ code: string }>(socket, ServerEvents.ERROR);
      socket.emit("workspace:join", { workspaceId: fx.workspaceId });
      expect((await joinError).code).toBe("NOT_FOUND");

      // Even if the client then tries to push an update, it is rejected.
      const errorPromise = waitForEvent<{ code: string }>(socket, ServerEvents.ERROR);
      socket.emit("document:update", {
        documentId: fx.documentId,
        baseVersion: 1,
        content: { type: "doc", content: [] },
        eventId: "evt_unauthorized_2",
      });
      const error = await errorPromise;
      expect(error.code).toBe("NOT_FOUND");
    } finally {
      socket.disconnect();
    }
  });
});
