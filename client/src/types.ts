export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export type Role = "OWNER" | "EDITOR" | "VIEWER";

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  role: Role;
  owner: { id: string; name: string };
  memberCount: number;
  documentCount: number;
  lastAccessedAt: string;
  createdAt: string;
}

export interface Member {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
  user: User;
}

export interface DocumentSummary {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  _count?: { comments: number };
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  description: string | null;
  owner: User;
  members: Member[];
  documents: DocumentSummary[];
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  documentId: string | null;
  createdAt: string;
  actor: { id: string; name: string };
}

export interface Comment {
  id: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
  replies?: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  workspaceId: string | null;
  read: boolean;
  createdAt: string;
}

export interface PresenceUser {
  userId: string;
  name: string;
  status: "ONLINE" | "EDITING" | "VIEWING" | "IDLE";
  lastActive: number;
}

export type SaveState = "loading" | "saved" | "saving" | "syncing" | "conflict" | "offline";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";
