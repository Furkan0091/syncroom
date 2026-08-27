import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { startServer, resetDb, type TestServer } from "./helpers";
import { createUser } from "./helpers";

describe("authentication", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("registers a new user and returns a token", async () => {
    const res = await request(server.httpServer)
      .post("/api/auth/register")
      .send({ name: "Furqan", email: "furqan@syncroom.dev", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.name).toBe("Furqan");
    expect(res.body.user.email).toBe("furqan@syncroom.dev");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects duplicate registration", async () => {
    await createUser("Furqan", "furqan@syncroom.dev");
    const res = await request(server.httpServer)
      .post("/api/auth/register")
      .send({ name: "Furqan 2", email: "furqan@syncroom.dev", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("validates input", async () => {
    const res = await request(server.httpServer)
      .post("/api/auth/register")
      .send({ name: "X", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with valid credentials", async () => {
    await createUser("Furqan", "furqan@syncroom.dev");
    const res = await request(server.httpServer)
      .post("/api/auth/login")
      .send({ email: "furqan@syncroom.dev", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    await createUser("Furqan", "furqan@syncroom.dev");
    const res = await request(server.httpServer)
      .post("/api/auth/login")
      .send({ email: "furqan@syncroom.dev", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the current user from /me", async () => {
    const { token } = await createUser("Furqan", "furqan@syncroom.dev");
    const res = await request(server.httpServer)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("furqan@syncroom.dev");
  });

  it("rejects /me without a token", async () => {
    const res = await request(server.httpServer).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects /me with an invalid token", async () => {
    const res = await request(server.httpServer)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
