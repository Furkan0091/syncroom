import type { Socket } from "socket.io";
import { CollaborationService } from "../services/collaboration.service";
import {
  documentSyncSchema,
  documentUpdateSchema,
  presenceUpdateSchema,
  socketCommentCreateSchema,
  validate,
  workspaceJoinSchema,
} from "../validation/schemas";
import { ClientEvents, ServerEvents } from "../events/contract";
import type { AuthUser } from "../middleware/auth";

export function registerHandlers(socket: Socket, collaboration: CollaborationService) {
  const user = socket.data.user as AuthUser;

  const safe = (handler: () => Promise<void>) => {
    handler().catch((err: unknown) => {
      socket.emit(ServerEvents.ERROR, {
        code: err instanceof Error && "code" in err ? (err as { code: string }).code : "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    });
  };

  socket.on(ClientEvents.WORKSPACE_JOIN, (payload: unknown) => {
    safe(async () => {
      const { workspaceId } = validate(workspaceJoinSchema, payload);
      socket.data.workspaceId = workspaceId;
      await collaboration.joinWorkspace(socket, user, workspaceId);
    });
  });

  socket.on(ClientEvents.WORKSPACE_LEAVE, (payload: unknown) => {
    safe(async () => {
      const { workspaceId } = validate(workspaceJoinSchema, payload);
      if (socket.data.workspaceId === workspaceId) {
        socket.data.workspaceId = undefined;
      }
      await collaboration.leaveWorkspace(socket, user, workspaceId);
    });
  });

  socket.on(ClientEvents.PRESENCE_UPDATE, (payload: unknown) => {
    safe(async () => {
      const { status } = validate(presenceUpdateSchema, payload);
      const { workspaceId } = socket.data as { workspaceId?: string };
      if (!workspaceId) return;
      await collaboration.updatePresence(socket, user, workspaceId, status);
    });
  });

  socket.on(ClientEvents.DOCUMENT_UPDATE, (payload: unknown) => {
    safe(async () => {
      const data = validate(documentUpdateSchema, payload);
      const { workspaceId } = socket.data as { workspaceId?: string };
      if (!workspaceId) {
        throw new Error("Join a workspace before editing documents");
      }
      await collaboration.updateDocument(socket, user, workspaceId, data);
    });
  });

  socket.on(ClientEvents.DOCUMENT_SYNC, (payload: unknown) => {
    safe(async () => {
      const { documentId } = validate(documentSyncSchema, payload);
      await collaboration.synchronizeClient(socket, user, documentId);
    });
  });

  socket.on(ClientEvents.COMMENT_CREATE, (payload: unknown) => {
    safe(async () => {
      const data = validate(socketCommentCreateSchema, payload);
      await collaboration.createComment(socket, user, data);
    });
  });
}
