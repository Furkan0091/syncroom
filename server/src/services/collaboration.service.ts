import type { Server, Socket } from "socket.io";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { presenceStore, type PresenceStatus, type PresenceUser } from "../presence/presence.store";
import { ServerEvents, workspaceRoom, userRoom } from "../events/contract";
import { activityService } from "./activity.service";
import { createComment as createCommentService } from "./comment.service";
import { requireMembership, touchLastAccessed } from "./workspace.service";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import type { AuthUser } from "../middleware/auth";
import { ActivityType } from "@prisma/client";

interface UpdateDocumentPayload {
  documentId: string;
  baseVersion: number;
  content: Record<string, unknown>;
  eventId: string;
}

interface CreateCommentPayload {
  documentId: string;
  content: string;
  parentId?: string;
}

/**
 * The main coordination layer between WebSockets, presence, persistence and
 * connected clients. Socket event handlers delegate here; business logic never
 * lives in the socket handlers themselves.
 */
export class CollaborationService {
  /** eventId -> timestamp, to prevent duplicate update processing. */
  private processedEvents = new Map<string, number>();
  private readonly eventTtlMs = 10 * 60 * 1000;

  constructor(private io: Server) {}

  // -------------------------------------------------------------------------
  // Workspace lifecycle
  // -------------------------------------------------------------------------

  async joinWorkspace(socket: Socket, user: AuthUser, workspaceId: string) {
    const membership = await requireMembership(workspaceId, user.id);
    void membership;

    const room = workspaceRoom(workspaceId);
    socket.join(room);

    const presenceUser = presenceStore.join(workspaceId, user.id, user.name, socket.id);
    await touchLastAccessed(workspaceId, user.id);

    const activity = await activityService.record(
      workspaceId,
      user.id,
      ActivityType.USER_JOINED,
      `${user.name} joined the workspace`,
    );

    this.io.to(room).emit(ServerEvents.ACTIVITY_NEW, { activity });
    this.broadcastPresence(workspaceId);

    // Acknowledge with the current presence snapshot.
    socket.emit(ServerEvents.WORKSPACE_JOINED, {
      workspaceId,
      users: presenceStore.list(workspaceId),
    });

    return presenceUser;
  }

  async leaveWorkspace(socket: Socket, user: AuthUser, workspaceId: string) {
    const room = workspaceRoom(workspaceId);
    socket.leave(room);

    const left = presenceStore.leave(workspaceId, user.id, socket.id);
    if (!left) return;

    this.broadcastPresence(workspaceId);

    const activity = await activityService.record(
      workspaceId,
      user.id,
      ActivityType.USER_LEFT,
      `${user.name} left the workspace`,
    );
    this.io.to(room).emit(ServerEvents.ACTIVITY_NEW, { activity });
  }

  async handleDisconnect(socket: Socket, user: AuthUser) {
    const affected = presenceStore.removeSocket(socket.id);
    for (const { workspaceId, user: leftUser } of affected) {
      const room = workspaceRoom(workspaceId);
      this.broadcastPresence(workspaceId);

      try {
        const activity = await activityService.record(
          workspaceId,
          user.id,
          ActivityType.USER_LEFT,
          `${leftUser.name} left the workspace`,
        );
        this.io.to(room).emit(ServerEvents.ACTIVITY_NEW, { activity });
      } catch (err) {
        // The workspace may already be gone (e.g. deleted mid-session);
        // presence is already updated, so a failed activity write is harmless.
        console.error("[syncroom] failed to record USER_LEFT activity:", err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  async updatePresence(socket: Socket, user: AuthUser, workspaceId: string, status: PresenceStatus) {
    presenceStore.setStatus(workspaceId, user.id, status);
    this.broadcastPresence(workspaceId);
  }

  broadcastPresence(workspaceId: string) {
    const room = workspaceRoom(workspaceId);
    const users: PresenceUser[] = presenceStore.list(workspaceId);
    this.io.to(room).emit(ServerEvents.WORKSPACE_PRESENCE, { workspaceId, users });
  }

  // -------------------------------------------------------------------------
  // Document synchronization
  // -------------------------------------------------------------------------

  /** Responds to `document:sync` with the latest persisted state. */
  async synchronizeClient(socket: Socket, user: AuthUser, documentId: string) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundError("Document not found");
    await requireMembership(document.workspaceId, user.id);

    const author = document.createdById
      ? await prisma.user.findUnique({ where: { id: document.createdById } })
      : null;

    socket.emit(ServerEvents.DOCUMENT_SYNCED, {
      documentId: document.id,
      title: document.title,
      version: document.version,
      content: document.content,
      updatedBy: author ? { id: author.id, name: author.name } : null,
      timestamp: document.updatedAt,
    });
  }

  /**
   * The core update path:
   *   1. deduplicate by eventId
   *   2. authorize (membership + role)
   *   3. validate the base version against the persisted version
   *   4. persist + snapshot + record activity
   *   5. broadcast to the workspace (excluding the sender) and ack the sender
   */
  async updateDocument(
    socket: Socket,
    user: AuthUser,
    workspaceId: string,
    payload: UpdateDocumentPayload,
  ) {
    // Idempotency: ignore duplicate events from the same user.
    const dedupeKey = `${user.id}:${payload.eventId}`;
    if (this.wasProcessed(dedupeKey)) {
      socket.emit(ServerEvents.DOCUMENT_ACK, {
        documentId: payload.documentId,
        version: payload.baseVersion,
        eventId: payload.eventId,
        duplicate: true,
      });
      return;
    }

    const document = await prisma.document.findUnique({
      where: { id: payload.documentId },
    });
    if (!document) throw new NotFoundError("Document not found");

    if (document.workspaceId !== workspaceId) {
      throw new ForbiddenError("Document does not belong to this workspace");
    }

    await requireMembership(workspaceId, user.id, ["OWNER", "EDITOR"]);

    // Optimistic concurrency check: the client must have edited from the
    // version the server currently holds. Stale updates are rejected and the
    // client receives the latest state to reconcile against.
    if (payload.baseVersion !== document.version) {
      socket.emit(ServerEvents.DOCUMENT_CONFLICT, {
        documentId: document.id,
        baseVersion: payload.baseVersion,
        currentVersion: document.version,
        content: document.content,
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.document.update({
        where: { id: document.id },
        data: {
          content: payload.content as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: next.version,
          content: next.content as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });

      return next;
    });

    this.processedEvents.set(dedupeKey, Date.now());

    const activity = await activityService.record(
      workspaceId,
      user.id,
      ActivityType.DOCUMENT_UPDATED,
      `${user.name} updated the document`,
      document.id,
    );

    // Everyone else in the workspace gets the new state.
    socket.to(workspaceRoom(workspaceId)).emit(ServerEvents.DOCUMENT_UPDATED, {
      documentId: document.id,
      title: updated.title,
      version: updated.version,
      content: updated.content,
      updatedBy: { id: user.id, name: user.name },
      timestamp: updated.updatedAt,
    });

    this.io.to(workspaceRoom(workspaceId)).emit(ServerEvents.ACTIVITY_NEW, { activity });

    // The sender gets a lightweight ack so it can mark its edits as saved.
    socket.emit(ServerEvents.DOCUMENT_ACK, {
      documentId: document.id,
      version: updated.version,
      eventId: payload.eventId,
    });
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async createComment(socket: Socket, user: AuthUser, payload: CreateCommentPayload) {
    const result = await createCommentService(payload.documentId, user, {
      content: payload.content,
      parentId: payload.parentId,
    });
    const { comment, activity, workspaceId, notifications } = result;

    const room = workspaceRoom(workspaceId);
    this.io.to(room).emit(ServerEvents.COMMENT_CREATED, { comment });
    if (activity) {
      this.io.to(room).emit(ServerEvents.ACTIVITY_NEW, { activity });
    }
    for (const notification of notifications ?? []) {
      this.notifyUser(notification.userId, notification);
    }
  }

  /** Broadcasts a comment created through the REST API (same path as socket). */
  async broadcastCommentCreated(workspaceId: string, comment: unknown, activity?: unknown) {
    const room = workspaceRoom(workspaceId);
    this.io.to(room).emit(ServerEvents.COMMENT_CREATED, { comment });
    if (activity) {
      this.io.to(room).emit(ServerEvents.ACTIVITY_NEW, { activity });
    }
  }

  async broadcastCommentUpdated(workspaceId: string, comment: unknown) {
    this.io.to(workspaceRoom(workspaceId)).emit(ServerEvents.COMMENT_UPDATED, { comment });
  }

  async broadcastCommentDeleted(workspaceId: string, commentId: string) {
    this.io.to(workspaceRoom(workspaceId)).emit(ServerEvents.COMMENT_DELETED, { commentId });
  }

  /** Emits a notification to the target user's personal room. */
  notifyUser(userId: string, notification: unknown) {
    this.io.to(userRoom(userId)).emit(ServerEvents.NOTIFICATION_NEW, { notification });
  }

  /** Broadcasts a document state change triggered outside the socket path (e.g. restore). */
  broadcastDocumentUpdated(workspaceId: string, payload: Record<string, unknown>) {
    this.io.to(workspaceRoom(workspaceId)).emit(ServerEvents.DOCUMENT_UPDATED, payload);
  }

  broadcastActivity(workspaceId: string, activity: unknown) {
    this.io.to(workspaceRoom(workspaceId)).emit(ServerEvents.ACTIVITY_NEW, { activity });
  }

  // -------------------------------------------------------------------------

  private wasProcessed(key: string): boolean {
    const now = Date.now();
    const timestamp = this.processedEvents.get(key);
    if (timestamp === undefined) return false;

    // Expire old entries to keep the map bounded.
    if (now - timestamp > this.eventTtlMs) {
      this.processedEvents.delete(key);
      return false;
    }
    return true;
  }
}
