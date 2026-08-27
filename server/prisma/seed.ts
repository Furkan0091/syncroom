import { PrismaClient, ActivityType, Role, Prisma } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

const PASSWORD = "password123";

const onboardingV1 = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Customer Onboarding Process" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This document defines how we onboard a new customer from signed contract to first value. It is a shared document — edits sync live to every connected member of the workspace.",
        },
      ],
    },
  ],
};

const onboardingV2 = {
  type: "doc",
  content: [
    ...(onboardingV1.content as Array<Record<string, unknown>>),
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "1. Kickoff call" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Schedule within 48 hours of signature. Invite the customer success manager, the implementation lead, and the customer's project owner.",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Introduce the team and agree on communication channels" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Define the success criteria and target date" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Share this workspace so everyone works from one source of truth" }],
            },
          ],
        },
      ],
    },
  ],
};

const onboardingV3 = {
  type: "doc",
  content: [
    ...(onboardingV2.content as Array<Record<string, unknown>>),
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "2. Handoff checklist" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Before the first value date, confirm the following with the customer:",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Admin accounts created and verified" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "SSO or password policy configured" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Data import validated against source systems" }],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "3. Go-live" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Everything above is tracked here. If something is missing, mention the owner with @Name and it will notify them in real time.",
        },
      ],
    },
    {
      type: "codeBlock",
      content: [
        {
          type: "text",
          text: "onboarding: {\n  kickoff: \"within 48h\",\n  workspace: \"shared\",\n  goal: \"first value in 14 days\"\n}",
        },
      ],
    },
  ],
};

async function main() {
  console.log("[seed] Starting...");

  // Users -------------------------------------------------------------------
  const furqan = await prisma.user.upsert({
    where: { email: "furqan@syncroom.dev" },
    update: {},
    create: { name: "Furqan", email: "furqan@syncroom.dev", passwordHash: await hashPassword(PASSWORD) },
  });
  const ahmed = await prisma.user.upsert({
    where: { email: "ahmed@syncroom.dev" },
    update: {},
    create: { name: "Ahmed", email: "ahmed@syncroom.dev", passwordHash: await hashPassword(PASSWORD) },
  });
  const sarah = await prisma.user.upsert({
    where: { email: "sarah@syncroom.dev" },
    update: {},
    create: { name: "Sarah", email: "sarah@syncroom.dev", passwordHash: await hashPassword(PASSWORD) },
  });

  // Workspaces ---------------------------------------------------------------
  const onboardingWs = await prisma.workspace.upsert({
    where: { id: "ws_customer_onboarding" },
    update: {},
    create: {
      id: "ws_customer_onboarding",
      name: "Customer Onboarding",
      description: "Live document and discussions for the onboarding program.",
      ownerId: furqan.id,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: onboardingWs.id, userId: furqan.id } },
    update: { role: Role.OWNER },
    create: { workspaceId: onboardingWs.id, userId: furqan.id, role: Role.OWNER },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: onboardingWs.id, userId: ahmed.id } },
    update: { role: Role.EDITOR },
    create: { workspaceId: onboardingWs.id, userId: ahmed.id, role: Role.EDITOR },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: onboardingWs.id, userId: sarah.id } },
    update: { role: Role.EDITOR },
    create: { workspaceId: onboardingWs.id, userId: sarah.id, role: Role.EDITOR },
  });

  const productWs = await prisma.workspace.upsert({
    where: { id: "ws_product_strategy" },
    update: {},
    create: {
      id: "ws_product_strategy",
      name: "Product Strategy",
      description: "Roadmap notes and strategy discussion.",
      ownerId: sarah.id,
    },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: productWs.id, userId: sarah.id } },
    update: { role: Role.OWNER },
    create: { workspaceId: productWs.id, userId: sarah.id, role: Role.OWNER },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: productWs.id, userId: furqan.id } },
    update: { role: Role.EDITOR },
    create: { workspaceId: productWs.id, userId: furqan.id, role: Role.EDITOR },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: productWs.id, userId: ahmed.id } },
    update: { role: Role.VIEWER },
    create: { workspaceId: productWs.id, userId: ahmed.id, role: Role.VIEWER },
  });

  // Documents ----------------------------------------------------------------
  const onboardingDoc = await prisma.document.upsert({
    where: { id: "doc_onboarding_process" },
    update: {},
    create: {
      id: "doc_onboarding_process",
      workspaceId: onboardingWs.id,
      title: "Customer Onboarding Process",
      content: onboardingV3 as unknown as Prisma.InputJsonValue,
      version: 3,
      createdById: furqan.id,
    },
  });

  // Version history for the onboarding doc (v1 by Furqan, v2 by Sarah, v3 by Ahmed)
  await prisma.documentVersion.upsert({
    where: { documentId_version: { documentId: onboardingDoc.id, version: 1 } },
    update: {},
    create: {
      documentId: onboardingDoc.id,
      version: 1,
      content: onboardingV1 as unknown as Prisma.InputJsonValue,
      createdById: furqan.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    },
  });
  await prisma.documentVersion.upsert({
    where: { documentId_version: { documentId: onboardingDoc.id, version: 2 } },
    update: {},
    create: {
      documentId: onboardingDoc.id,
      version: 2,
      content: onboardingV2 as unknown as Prisma.InputJsonValue,
      createdById: sarah.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
  });
  await prisma.documentVersion.upsert({
    where: { documentId_version: { documentId: onboardingDoc.id, version: 3 } },
    update: {},
    create: {
      documentId: onboardingDoc.id,
      version: 3,
      content: onboardingV3 as unknown as Prisma.InputJsonValue,
      createdById: ahmed.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 30),
    },
  });

  const supportPlaybookContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Support Playbook" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "First response target: 4 hours. Escalation path: Sarah for technical, Ahmed for process.",
          },
        ],
      },
    ],
  };
  const supportPlaybook = await prisma.document.upsert({
    where: { id: "doc_support_playbook" },
    update: {},
    create: {
      id: "doc_support_playbook",
      workspaceId: onboardingWs.id,
      title: "Support Playbook",
      content: supportPlaybookContent as unknown as Prisma.InputJsonValue,
      version: 1,
      createdById: sarah.id,
    },
  });
  await prisma.documentVersion.upsert({
    where: { documentId_version: { documentId: supportPlaybook.id, version: 1 } },
    update: {},
    create: {
      documentId: supportPlaybook.id,
      version: 1,
      content: supportPlaybookContent as unknown as Prisma.InputJsonValue,
      createdById: sarah.id,
    },
  });

  const roadmapContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "2026 Roadmap Notes" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Draft ideas for the next two quarters. Comments welcome." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Offline-first editing" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Rich embeds and diagrams" }] },
            ],
          },
        ],
      },
    ],
  };
  const roadmapDoc = await prisma.document.upsert({
    where: { id: "doc_roadmap_notes" },
    update: {},
    create: {
      id: "doc_roadmap_notes",
      workspaceId: productWs.id,
      title: "2026 Roadmap Notes",
      content: roadmapContent as unknown as Prisma.InputJsonValue,
      version: 1,
      createdById: sarah.id,
    },
  });
  await prisma.documentVersion.upsert({
    where: { documentId_version: { documentId: roadmapDoc.id, version: 1 } },
    update: {},
    create: {
      documentId: roadmapDoc.id,
      version: 1,
      content: roadmapContent as unknown as Prisma.InputJsonValue,
      createdById: sarah.id,
    },
  });

  // Comments -----------------------------------------------------------------
  await prisma.comment.upsert({
    where: { id: "cmt_kickoff_question" },
    update: {},
    create: {
      id: "cmt_kickoff_question",
      documentId: onboardingDoc.id,
      workspaceId: onboardingWs.id,
      authorId: ahmed.id,
      content: "Should we update this section with the new 48-hour SLA?",
      createdAt: new Date(Date.now() - 1000 * 60 * 25),
    },
  });
  await prisma.comment.upsert({
    where: { id: "cmt_kickoff_reply" },
    update: {},
    create: {
      id: "cmt_kickoff_reply",
      documentId: onboardingDoc.id,
      workspaceId: onboardingWs.id,
      authorId: furqan.id,
      parentId: "cmt_kickoff_question",
      content: "Yes, I'll handle it.",
      createdAt: new Date(Date.now() - 1000 * 60 * 20),
    },
  });
  await prisma.comment.upsert({
    where: { id: "cmt_handoff_mention" },
    update: {},
    create: {
      id: "cmt_handoff_mention",
      documentId: onboardingDoc.id,
      workspaceId: onboardingWs.id,
      authorId: sarah.id,
      content: "@Furqan can you review the handoff checklist?",
      createdAt: new Date(Date.now() - 1000 * 60 * 12),
    },
  });

  // Activity -----------------------------------------------------------------
  await prisma.activity.upsert({
    where: { id: "act_join" },
    update: {},
    create: {
      id: "act_join",
      workspaceId: onboardingWs.id,
      actorId: ahmed.id,
      type: ActivityType.USER_JOINED,
      message: "Ahmed joined the workspace",
      createdAt: new Date(Date.now() - 1000 * 60 * 10),
    },
  });
  await prisma.activity.upsert({
    where: { id: "act_updated" },
    update: {},
    create: {
      id: "act_updated",
      workspaceId: onboardingWs.id,
      actorId: sarah.id,
      type: ActivityType.DOCUMENT_UPDATED,
      message: "Sarah updated the document",
      documentId: onboardingDoc.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 8),
    },
  });
  await prisma.activity.upsert({
    where: { id: "act_comment" },
    update: {},
    create: {
      id: "act_comment",
      workspaceId: onboardingWs.id,
      actorId: ahmed.id,
      type: ActivityType.COMMENT_CREATED,
      message: "Ahmed added a comment",
      documentId: onboardingDoc.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 5),
    },
  });

  // Notifications ------------------------------------------------------------
  await prisma.notification.upsert({
    where: { id: "ntf_mention" },
    update: {},
    create: {
      id: "ntf_mention",
      userId: furqan.id,
      type: "MENTION",
      message: "Sarah mentioned you in a comment",
      workspaceId: onboardingWs.id,
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 12),
    },
  });
  await prisma.notification.upsert({
    where: { id: "ntf_invite" },
    update: {},
    create: {
      id: "ntf_invite",
      userId: ahmed.id,
      type: "INVITE",
      message: "You were added to Product Strategy as Viewer",
      workspaceId: productWs.id,
      read: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
  });

  console.log("[seed] Done.");
  console.log("  Users:   Furqan / Ahmed / Sarah — all with password:", PASSWORD);
  console.log("  Sign in: furqan@syncroom.dev, ahmed@syncroom.dev, sarah@syncroom.dev");
  console.log("  Open the 'Customer Onboarding' workspace in two browsers to see live sync.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
