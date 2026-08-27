/**
 * Socket.IO event contract.
 *
 * Client -> Server
 *   workspace:join      { workspaceId }
 *   workspace:leave     { workspaceId }
 *   presence:update     { status: "ONLINE" | "EDITING" | "VIEWING" | "IDLE" }
 *   document:update     { documentId, baseVersion, content, eventId }
 *   document:sync       { documentId }
 *   comment:create      { documentId, content, parentId? }
 *
 * Server -> Client
 *   workspace:joined    { workspaceId, users }
 *   workspace:presence  { workspaceId, users }
 *   document:updated    { documentId, version, content, title, updatedBy, timestamp }
 *   document:ack        { documentId, version, eventId }
 *   document:conflict   { documentId, baseVersion, currentVersion, content }
 *   document:synced     { documentId, title, version, content, updatedBy }
 *   comment:created     { comment }
 *   comment:updated     { comment }
 *   comment:deleted     { commentId }
 *   activity:new        { activity }
 *   notification:new    { notification }
 *   error               { code, message }
 */

export const ClientEvents = {
  WORKSPACE_JOIN: "workspace:join",
  WORKSPACE_LEAVE: "workspace:leave",
  PRESENCE_UPDATE: "presence:update",
  DOCUMENT_UPDATE: "document:update",
  DOCUMENT_SYNC: "document:sync",
  COMMENT_CREATE: "comment:create",
} as const;

export type ClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];

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

export type ServerEventName = (typeof ServerEvents)[keyof typeof ServerEvents];

/** Socket.IO room for a workspace. */
export function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

/** Personal room for a user — used for targeted notifications. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
