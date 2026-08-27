import { Prisma, Role, type WorkspaceMember } from "@prisma/client";
import { prisma } from "../prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors";
import { activityService } from "./activity.service";
import { notificationService } from "./notification.service";

export type RoleName = "OWNER" | "EDITOR" | "VIEWER";

const memberInclude = {
  user: { select: { id: true, name: true, email: true, createdAt: true } },
} satisfies Prisma.WorkspaceMemberInclude;

/** Throws unless the user is a member of the workspace (optionally with a role). */
export async function requireMembership(
  workspaceId: string,
  userId: string,
  roles?: RoleName[],
): Promise<WorkspaceMember> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw new NotFoundError("Workspace not found");
  }
  if (roles && !roles.includes(membership.role as RoleName)) {
    throw new ForbiddenError("You don't have permission to do this");
  }
  return membership;
}

export async function listForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    orderBy: { lastAccessedAt: "desc" },
    include: {
      workspace: {
        include: {
          owner: { select: { id: true, name: true } },
          members: { include: memberInclude },
          _count: { select: { documents: true, members: true } },
        },
      },
    },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    description: m.workspace.description,
    role: m.role,
    owner: m.workspace.owner,
    memberCount: m.workspace._count.members,
    documentCount: m.workspace._count.documents,
    lastAccessedAt: m.lastAccessedAt,
    createdAt: m.workspace.createdAt,
  }));
}

export async function getForUser(workspaceId: string, userId: string) {
  const membership = await requireMembership(workspaceId, userId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: memberInclude,
        orderBy: { createdAt: "asc" },
      },
      documents: {
        orderBy: { updatedAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { comments: true } },
        },
      },
    },
  });
  if (!workspace) throw new NotFoundError("Workspace not found");

  return { workspace, role: membership.role };
}

export async function createWorkspace(
  userId: string,
  input: { name: string; description?: string },
) {
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        ownerId: userId,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });
    return ws;
  });

  await activityService.record(
    workspace.id,
    userId,
    "WORKSPACE_CREATED",
    "created the workspace",
  );

  return workspace;
}

export async function updateWorkspace(
  workspaceId: string,
  actorId: string,
  input: { name?: string; description?: string | null },
) {
  await requireMembership(workspaceId, actorId, ["OWNER"]);
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function removeWorkspace(workspaceId: string, actorId: string) {
  await requireMembership(workspaceId, actorId, ["OWNER"]);
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function listMembers(workspaceId: string, userId: string) {
  await requireMembership(workspaceId, userId);
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: memberInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteMember(
  workspaceId: string,
  actorId: string,
  input: { email: string; role: RoleName },
) {
  await requireMembership(workspaceId, actorId, ["OWNER"]);

  const invitee = await prisma.user.findUnique({ where: { email: input.email } });
  if (!invitee) {
    throw new NotFoundError("No user found with that email");
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: invitee.id } },
  });
  if (existing) {
    throw new ConflictError("That user is already a member");
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new NotFoundError("Workspace not found");

  const member = await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: invitee.id,
      role: input.role,
    },
    include: memberInclude,
  });

  await activityService.record(
    workspaceId,
    actorId,
    "MEMBER_INVITED",
    `invited ${invitee.name} as ${roleLabel(input.role)}`,
  );

  const notification = await notificationService.create(
    invitee.id,
    "INVITE",
    `You were added to ${workspace.name} as ${roleLabel(input.role)}`,
    workspaceId,
  );

  return { member, invitee, notification };
}

export async function updateMemberRole(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
  role: RoleName,
) {
  const membership = await requireMembership(workspaceId, actorId, ["OWNER"]);

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new NotFoundError("Member not found");

  if (targetUserId === membership.userId && role !== "OWNER") {
    throw new ForbiddenError("You cannot change your own owner role");
  }

  return prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    data: { role },
    include: memberInclude,
  });
}

export async function removeMember(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
) {
  await requireMembership(workspaceId, actorId, ["OWNER"]);

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new NotFoundError("Workspace not found");

  if (workspace.ownerId === targetUserId) {
    throw new ForbiddenError("You cannot remove the workspace owner");
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    include: memberInclude,
  });
  if (!member) throw new NotFoundError("Member not found");

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });

  await activityService.record(
    workspaceId,
    actorId,
    "MEMBER_REMOVED",
    `removed ${member.user.name} from the workspace`,
  );

  return member;
}

export async function touchLastAccessed(workspaceId: string, userId: string) {
  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {
    // Membership may have been revoked between check and update — ignore.
  });
}

function roleLabel(role: RoleName): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export type WorkspaceMemberWithUser = Prisma.WorkspaceMemberGetPayload<{
  include: typeof memberInclude;
}>;
