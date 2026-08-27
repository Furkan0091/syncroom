import { Router } from "express";
import { notificationService } from "../services/notification.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { idParamSchema, validate } from "../validation/schemas";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/notifications
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      notificationService.list(req.user!.id),
      notificationService.unreadCount(req.user!.id),
    ]);
    res.json({ notifications, unreadCount });
  }),
);

// POST /api/notifications/read-all
notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user!.id);
    res.json({ ok: true });
  }),
);

// POST /api/notifications/:id/read
notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const { id } = validate(idParamSchema, req.params);
    await notificationService.markRead(req.user!.id, id);
    res.json({ ok: true });
  }),
);
