import { Router } from "express";
import * as commentService from "../services/comment.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import {
  createCommentSchema,
  idParamSchema,
  updateCommentSchema,
  validate,
} from "../validation/schemas";
import { getCollaboration } from "../websocket/socket";

export const commentsRouter = Router();

commentsRouter.use(requireAuth);

// GET /api/documents/:id/comments
commentsRouter.get(
  "/document/:id/comments",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const comments = await commentService.listByDocument(id, req.user!.id);
    res.json({ comments });
  }),
);

// POST /api/documents/:id/comments (REST path; the socket path also exists)
commentsRouter.post(
  "/document/:id/comments",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(createCommentSchema, req.body);
    const result = await commentService.createComment(id, req.user!, input);
    const collaboration = getCollaboration();
    collaboration.broadcastCommentCreated(result.workspaceId, result.comment, result.activity);
    for (const notification of result.notifications ?? []) {
      collaboration.notifyUser(notification.userId, notification);
    }
    res.status(201).json({ comment: result.comment });
  }),
);

// PATCH /api/comments/:id
commentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(updateCommentSchema, req.body);
    const comment = await commentService.updateComment(id, req.user!.id, input);
    const workspaceId = comment.workspaceId;
    getCollaboration().broadcastCommentUpdated(workspaceId, comment);
    res.json({ comment });
  }),
);

// DELETE /api/comments/:id
commentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const comment = await commentService.removeComment(id, req.user!.id);
    getCollaboration().broadcastCommentDeleted(comment.workspaceId, id);
    res.json({ ok: true });
  }),
);
