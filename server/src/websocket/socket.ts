import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { prisma } from "../prisma";
import { config } from "../config";
import { verifyToken } from "../utils/jwt";
import { userRoom } from "../events/contract";
import { CollaborationService } from "../services/collaboration.service";
import { registerHandlers } from "./handlers";
import type { AuthUser } from "../middleware/auth";

/** Authenticates the WebSocket handshake using the JWT passed as `auth.token`. */
async function authenticateSocket(socket: import("socket.io").Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return next(new Error("User no longer exists"));
    }

    socket.data.user = { id: user.id, name: user.name, email: user.email } satisfies AuthUser;
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
}

let activeCollaboration: CollaborationService | null = null;

/** Returns the singleton collaboration service (used by REST controllers to broadcast). */
export function getCollaboration(): CollaborationService {
  if (!activeCollaboration) {
    throw new Error("Socket.IO server not initialized");
  }
  return activeCollaboration;
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      credentials: true,
    },
    // Reconnection is handled by the client library; allow default behaviour
    // plus a generous ping timeout so brief network blips don't drop sessions.
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.use(authenticateSocket);

  const collaboration = new CollaborationService(io);
  activeCollaboration = collaboration;

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;

    // Personal room for targeted notifications.
    socket.join(userRoom(user.id));

    registerHandlers(socket, collaboration);

    socket.on("disconnect", () => {
      void collaboration.handleDisconnect(socket, user);
    });
  });

  return { io, collaboration };
}

export type { CollaborationService };
