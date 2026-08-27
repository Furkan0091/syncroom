import { Router } from "express";
import * as documentService from "../services/document.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import {
  idParamSchema,
  updateDocumentTitleSchema,
  validate,
  versionParamSchema,
} from "../validation/schemas";
import { getCollaboration } from "../websocket/socket";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

// GET /api/documents/:id
documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const document = await documentService.getDocumentForUser(id, req.user!.id);
    res.json({ document });
  }),
);

// PATCH /api/documents/:id — rename
documentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(updateDocumentTitleSchema, req.body);
    const document = await documentService.updateTitle(id, req.user!.id, input);
    res.json({ document });
  }),
);

// GET /api/documents/:id/versions
documentsRouter.get(
  "/:id/versions",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const { document, versions } = await documentService.listVersions(id, req.user!.id);
    res.json({ document, versions });
  }),
);

// POST /api/documents/:id/versions/:version/restore
documentsRouter.post(
  "/:id/versions/:version/restore",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    const { version } = validate(versionParamSchema, req.params);
    const { document, activity } = await documentService.restoreVersion(id, version, req.user!.id);

    const collaboration = getCollaboration();
    collaboration.broadcastDocumentUpdated(document.workspaceId, {
      documentId: document.id,
      title: document.title,
      version: document.version,
      content: document.content,
      updatedBy: { id: req.user!.id, name: req.user!.name },
      timestamp: document.updatedAt,
    });
    collaboration.broadcastActivity(document.workspaceId, activity);

    res.json({ document, activity });
  }),
);
