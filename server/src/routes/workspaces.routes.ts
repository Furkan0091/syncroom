import { Router } from "express";
import {
  createWorkspace,
  getForUser,
  inviteMember,
  listForUser,
  listMembers,
  removeMember,
  removeWorkspace,
  updateMemberRole,
  updateWorkspace,
} from "../services/workspace.service";
import * as documentService from "../services/document.service";
import { activityService } from "../services/activity.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import {
  createDocumentSchema,
  createWorkspaceSchema,
  idParamSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  userIdParamSchema,
  validate,
} from "../validation/schemas";
import { getCollaboration } from "../websocket/socket";

export const workspacesRouter = Router();

workspacesRouter.use(requireAuth);

// GET /api/workspaces — recent workspaces for the current user
workspacesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const workspaces = await listForUser(req.user!.id);
    res.json({ workspaces });
  }),
);

// POST /api/workspaces
workspacesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = validate(createWorkspaceSchema, req.body);
    const workspace = await createWorkspace(req.user!.id, input);
    res.status(201).json({ workspace });
  }),
);

// GET /api/workspaces/:id
workspacesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const result = await getForUser(id, req.user!.id);
    res.json(result);
  }),
);

// PUT /api/workspaces/:id
workspacesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(updateWorkspaceSchema, req.body);
    const workspace = await updateWorkspace(id, req.user!.id, input);
    res.json({ workspace });
  }),
);

// DELETE /api/workspaces/:id
workspacesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    await removeWorkspace(id, req.user!.id);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// GET /api/workspaces/:id/members
workspacesRouter.get(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const members = await listMembers(id, req.user!.id);
    res.json({ members });
  }),
);

// POST /api/workspaces/:id/members — invite by email
workspacesRouter.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(inviteMemberSchema, req.body);
    const { member, invitee, notification } = await inviteMember(id, req.user!.id, input);
    getCollaboration().notifyUser(invitee.id, notification);
    res.status(201).json({ member });
  }),
);

// PATCH /api/workspaces/:id/members/:userId — change role
workspacesRouter.patch(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const { userId } = validate(userIdParamSchema, req.params);
    const { role } = validate(updateMemberRoleSchema, req.body);
    const member = await updateMemberRole(id, req.user!.id, userId, role);
    res.json({ member });
  }),
);

// DELETE /api/workspaces/:id/members/:userId
workspacesRouter.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const { userId } = validate(userIdParamSchema, req.params);
    await removeMember(id, req.user!.id, userId);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// GET /api/workspaces/:id/documents
workspacesRouter.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const documents = await documentService.listDocuments(id, req.user!.id);
    res.json({ documents });
  }),
);

// POST /api/workspaces/:id/documents
workspacesRouter.post(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(createDocumentSchema, req.body);
    const document = await documentService.createDocument(id, req.user!.id, input);
    res.status(201).json({ document });
  }),
);

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

// GET /api/workspaces/:id/activity
workspacesRouter.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const activity = await activityService.list(id, req.user!.id);
    res.json({ activity });
  }),
);
