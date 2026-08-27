import { io, type Socket } from "socket.io-client";
import { getToken } from "./api";

let socket: Socket | null = null;

/** Connects (or returns the existing) Socket.IO client authenticated with the JWT. */
export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io({
    auth: { token: getToken() },
    transports: ["websocket"],
    // Socket.IO auto-reconnects; the server re-authenticates each handshake.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Server event names (mirrors server/src/events/contract.ts). */
export const ServerEvents = {
  WORKSPACE_JOINED: "workspace:joined",
  WORKSPACE_PRESENCE: "workspace:presence",
  DOCUMENT_UPDATED: "document:updated",
  DOCUMENT_ACK: "document:ack",
  DOCUMENT_CONFLICT: "document:conflict",
  DOCUMENT_SYNCED: "document:synced",
  COMMENT_CREATED: "comment:created",
  COMMENT_UPDATED: "comment:updated",
  COMMENT_DELETED: "comment:deleted",
  ACTIVITY_NEW: "activity:new",
  NOTIFICATION_NEW: "notification:new",
  ERROR: "error",
} as const;

export const ClientEvents = {
  WORKSPACE_JOIN: "workspace:join",
  WORKSPACE_LEAVE: "workspace:leave",
  PRESENCE_UPDATE: "presence:update",
  DOCUMENT_UPDATE: "document:update",
  DOCUMENT_SYNC: "document:sync",
  COMMENT_CREATE: "comment:create",
} as const;
