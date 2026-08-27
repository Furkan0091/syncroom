import { prisma } from "../prisma";
import { NotFoundError } from "../utils/errors";

export type NotificationType = "MENTION" | "COMMENT" | "INVITE" | "ACTIVITY";

export const notificationService = {
  async create(
    userId: string,
    type: NotificationType,
    message: string,
    workspaceId?: string,
  ) {
    return prisma.notification.create({
      data: { userId, type, message, workspaceId },
    });
  },

  async list(userId: string, limit = 40) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, read: false } });
  },

  async markRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundError("Notification not found");
    }
    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  },

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },
};
