import { prisma } from "../prisma";

/**
 * Practical search across the user's own workspaces: workspaces, documents,
 * comments and activity. Deliberately simple — no full-text engine.
 */
export async function search(userId: string, query: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) {
    return { workspaces: [], documents: [], comments: [], activity: [] };
  }

  const contains = { contains: query, mode: "insensitive" as const };

  const [workspaces, documents, comments, activity] = await Promise.all([
    prisma.workspace.findMany({
      where: {
        id: { in: workspaceIds },
        OR: [{ name: contains }, { description: { ...contains } }],
      },
      take: 5,
      select: { id: true, name: true, description: true },
    }),
    prisma.document.findMany({
      where: { workspaceId: { in: workspaceIds }, title: contains },
      take: 5,
      select: {
        id: true,
        title: true,
        workspaceId: true,
        workspace: { select: { name: true } },
      },
    }),
    prisma.comment.findMany({
      where: { workspaceId: { in: workspaceIds }, content: contains },
      take: 5,
      select: {
        id: true,
        content: true,
        workspaceId: true,
        documentId: true,
        document: { select: { title: true } },
        author: { select: { name: true } },
      },
    }),
    prisma.activity.findMany({
      where: { workspaceId: { in: workspaceIds }, message: contains },
      take: 5,
      select: {
        id: true,
        message: true,
        workspaceId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
  ]);

  return { workspaces, documents, comments, activity };
}
