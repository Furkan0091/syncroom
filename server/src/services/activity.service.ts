import { ActivityType } from "@prisma/client";
import { prisma } from "../prisma";
import { requireMembership } from "./workspace.service";

const activityInclude = {
  actor: { select: { id: true, name: true } },
} as const;

export type ActivityWithActor = Awaited<ReturnType<typeof activityService.record>>;

export const activityService = {
  async record(
    workspaceId: string,
    actorId: string,
    type: ActivityType,
    message: string,
    documentId?: string,
  ) {
    return prisma.activity.create({
      data: {
        workspaceId,
        actorId,
        type,
        message,
        documentId,
      },
      include: activityInclude,
    });
  },

  async list(workspaceId: string, userId: string, limit = 50) {
    await requireMembership(workspaceId, userId);
    return prisma.activity.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: activityInclude,
    });
  },
};
