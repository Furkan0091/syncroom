import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { NotFoundError } from "../utils/errors";
import { requireMembership } from "./workspace.service";
import { activityService } from "./activity.service";

/** A minimal empty TipTap/ProseMirror document. */
export const emptyDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export async function createDocument(
  workspaceId: string,
  actorId: string,
  input: { title: string },
) {
  await requireMembership(workspaceId, actorId, ["OWNER", "EDITOR"]);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        workspaceId,
        title: input.title,
        content: emptyDocument,
        version: 1,
        createdById: actorId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });

    // Version history starts at v1 with the initial content.
    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        content: emptyDocument as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });

    return document;
  });
}

export async function listDocuments(workspaceId: string, userId: string) {
  await requireMembership(workspaceId, userId);
  return prisma.document.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  });
}

/** Loads a document and verifies the user belongs to its workspace. */
export async function getDocumentForUser(documentId: string, userId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError("Document not found");
  await requireMembership(document.workspaceId, userId);
  return document;
}

export async function updateTitle(
  documentId: string,
  actorId: string,
  input: { title: string },
) {
  const document = await getDocumentForUser(documentId, actorId);
  await requireMembership(document.workspaceId, actorId, ["OWNER", "EDITOR"]);
  return prisma.document.update({
    where: { id: documentId },
    data: { title: input.title },
  });
}

export async function listVersions(documentId: string, userId: string) {
  const document = await getDocumentForUser(documentId, userId);
  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { version: "desc" },
    take: 100,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
  return { document, versions };
}

/**
 * Restores the document to a previous snapshot. The current content is
 * preserved as a new version, so nothing is ever lost.
 */
export async function restoreVersion(
  documentId: string,
  versionNumber: number,
  actorId: string,
) {
  const document = await getDocumentForUser(documentId, actorId);
  await requireMembership(document.workspaceId, actorId, ["OWNER", "EDITOR"]);

  const snapshot = await prisma.documentVersion.findUnique({
    where: {
      documentId_version: { documentId, version: versionNumber },
    },
  });
  if (!snapshot) throw new NotFoundError("Version not found");

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.document.update({
      where: { id: documentId },
      data: {
        content: snapshot.content as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId,
        version: current.version,
        content: current.content as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });

    return current;
  });

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  const activity = await activityService.record(
    document.workspaceId,
    actorId,
    "VERSION_RESTORED",
    `${actor?.name ?? "Someone"} restored version ${versionNumber}`,
    documentId,
  );

  return { document: updated, activity };
}
