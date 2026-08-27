import { z } from "zod";
import { ValidationError } from "../utils/errors";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const roleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: roleSchema.default("EDITOR"),
});

export const updateMemberRoleSchema = z.object({
  role: roleSchema,
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export const updateDocumentTitleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(2000),
  parentId: z.string().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(2000),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(100),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const versionParamSchema = z.object({
  version: z.coerce.number().int().positive(),
});

// --- Socket payloads -------------------------------------------------------

export const workspaceJoinSchema = z.object({
  workspaceId: z.string().min(1),
});

export const documentUpdateSchema = z.object({
  documentId: z.string().min(1),
  baseVersion: z.number().int().positive(),
  content: z.record(z.any()).refine((v) => v && typeof v === "object", {
    message: "content must be a document object",
  }),
  eventId: z.string().min(1).max(80),
});

export const documentSyncSchema = z.object({
  documentId: z.string().min(1),
});

export const presenceUpdateSchema = z.object({
  status: z.enum(["ONLINE", "EDITING", "VIEWING", "IDLE"]),
});

export const socketCommentCreateSchema = z.object({
  documentId: z.string().min(1),
  content: z.string().trim().min(1, "Comment cannot be empty").max(2000),
  parentId: z.string().optional(),
});

/** Validates `data` against `schema`, throwing a ValidationError on failure. */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first ? first.message : "Invalid input");
  }
  return result.data;
}
