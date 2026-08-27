import { prisma } from "../prisma";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { requireMembership } from "./workspace.service";
import { notificationService } from "./notification.service";
import { activityService } from "./activity.service";
import type { AuthUser } from "../middleware/auth";

const commentInclude = {
  author: { select: { id: true, name: true } },
} as const;

function withReplies(comment: { id: string }) {
  return prisma.comment.findMany({
    where: { parentId: comment.id },
    orderBy: { createdAt: "asc" },
    include: commentInclude,
  });
}

export async function listByDocument(documentId: string, userId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError("Document not found");
  await requireMembership(document.workspaceId, userId);

  const topLevel = await prisma.comment.findMany({
    where: { documentId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: commentInclude,
  });

  const threads = await Promise.all(
    topLevel.map(async (comment) => ({
      ...comment,
      replies: await withReplies(comment),
    })),
  );

  return threads;
}

export async function createComment(
  documentId: string,
  actor: AuthUser,
  input: { content: string; parentId?: string },
  workspaceId?: string,
) {
  const document = workspaceId
    ? await prisma.document.findFirst({ where: { id: documentId, workspaceId } })
    : await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError("Document not found");
  await requireMembership(document.workspaceId, actor.id);

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.documentId !== documentId || parent.parentId) {
      throw new NotFoundError("Parent comment not found");
    }
  }

  const comment = await prisma.comment.create({
    data: {
      documentId,
      workspaceId: document.workspaceId,
      authorId: actor.id,
      content: input.content,
      parentId: input.parentId ?? null,
    },
    include: commentInclude,
  });

  const activity = await activityService.record(
    document.workspaceId,
    actor.id,
    input.parentId ? "COMMENT_REPLIED" : "COMMENT_CREATED",
    input.parentId
      ? `${actor.name} replied to a comment`
      : `${actor.name} added a comment`,
    documentId,
  );

  const notifications = await notifyMentions(
    document.workspaceId,
    documentId,
    actor,
    input.content,
  );

  return { comment, activity, workspaceId: document.workspaceId, notifications };
}

export async function updateComment(
  commentId: string,
  actorId: string,
  input: { content: string },
) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError("Comment not found");
  if (comment.authorId !== actorId) {
    throw new ForbiddenError("You can only edit your own comments");
  }
  return prisma.comment.update({
    where: { id: commentId },
    data: { content: input.content },
    include: commentInclude,
  });
}

export async function removeComment(commentId: string, actorId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError("Comment not found");

  const membership = await requireMembership(comment.workspaceId, actorId);
  const isOwner = membership.role === "OWNER";
  if (comment.authorId !== actorId && !isOwner) {
    throw new ForbiddenError("You don't have permission to delete this comment");
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return comment;
}

/** Finds `@Name` mentions of workspace members and notifies them. */
async function notifyMentions(
  workspaceId: string,
  documentId: string,
  actor: AuthUser,
  content: string,
): Promise<Awaited<ReturnType<typeof notificationService.create>>[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true } } },
  });

  const notifications = [];
  for (const member of members) {
    if (member.userId === actor.id) continue;
    const pattern = new RegExp(`@${escapeRegExp(member.user.name)}`, "i");
    if (!pattern.test(content)) continue;

    notifications.push(
      await notificationService.create(
        member.userId,
        "MENTION",
        `${actor.name} mentioned you in a comment`,
        workspaceId,
      ),
    );
  }
  return notifications;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
