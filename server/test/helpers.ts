import http from "node:http";
import type { Server as HttpServer } from "http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { prisma } from "../src/prisma";
import { createApp } from "../src/app";
import { createSocketServer } from "../src/websocket/socket";
import * as authService from "../src/services/auth.service";
import { createWorkspace, inviteMember } from "../src/services/workspace.service";
import { createDocument } from "../src/services/document.service";

/** Truncates every table (in dependency order). */
export async function resetDb() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.documentVersion.deleteMany(),
    prisma.document.deleteMany(),
    prisma.workspaceMember.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export interface TestServer {
  httpServer: HttpServer;
  io: ReturnType<typeof createSocketServer>["io"];
  url: string;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const app = createApp();
  const httpServer = http.createServer(app);
  const { io } = createSocketServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    httpServer,
    io,
    url: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        httpServer.close(() => resolve());
      }),
  };
}

export async function createUser(name: string, email?: string) {
  const result = await authService.register({
    name,
    email: email ?? `${name.toLowerCase().replace(/\s+/g, ".")}@test.dev`,
    password: "password123",
  });
  return { user: result.user, token: result.token };
}

export async function connectClient(
  url: string,
  token: string,
  opts: { reconnection?: boolean } = {},
): Promise<ClientSocket> {
  const socket = ioc(url, {
    transports: ["websocket"],
    reconnection: opts.reconnection ?? false,
    auth: { token },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(err));
  });
  return socket;
}

export function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);
    const handler = (data: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

export interface Fixture {
  server: TestServer;
  owner: Awaited<ReturnType<typeof createUser>>;
  editor: Awaited<ReturnType<typeof createUser>>;
  viewer: Awaited<ReturnType<typeof createUser>>;
  outsider: Awaited<ReturnType<typeof createUser>>;
  workspaceId: string;
  documentId: string;
}

/** Owner + Editor + Viewer + Outsider in one workspace with one document. */
export async function createFixture(): Promise<Fixture> {
  const server = await startServer();
  const owner = await createUser("Owner");
  const editor = await createUser("Editor");
  const viewer = await createUser("Viewer");
  const outsider = await createUser("Outsider");

  const workspace = await createWorkspace(owner.user.id, {
    name: "Fixture Workspace",
    description: "test",
  });
  await inviteMember(workspace.id, owner.user.id, { email: editor.user.email, role: "EDITOR" });
  await inviteMember(workspace.id, owner.user.id, { email: viewer.user.email, role: "VIEWER" });

  const document = await createDocument(workspace.id, owner.user.id, {
    title: "Shared Document",
  });

  return {
    server,
    owner,
    editor,
    viewer,
    outsider,
    workspaceId: workspace.id,
    documentId: document.id,
  };
}
