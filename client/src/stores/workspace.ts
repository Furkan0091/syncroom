import { create } from "zustand";
import { api } from "../lib/api";
import { useActivityStore } from "./activity";
import type { ActivityItem, DocumentSummary, Member, Role, WorkspaceDetail } from "../types";

interface WorkspaceState {
  workspace: WorkspaceDetail | null;
  role: Role | null;
  loading: boolean;
  error: string | null;
  load: (workspaceId: string) => Promise<void>;
  createDocument: (title: string) => Promise<DocumentSummary>;
  addDocument: (doc: DocumentSummary) => void;
  renameDocument: (documentId: string, title: string) => void;
  bumpDocument: (documentId: string, version: number, updatedAt: string) => void;
  addActivity: (activity: ActivityItem) => void;
  replaceMembers: (members: Member[]) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  workspace: null,
  role: null,
  loading: false,
  error: null,

  load: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const [detail, activity] = await Promise.all([
        api<{ workspace: WorkspaceDetail; role: Role }>(`/workspaces/${workspaceId}`),
        api<{ activity: ActivityItem[] }>(`/workspaces/${workspaceId}/activity`),
      ]);
      set({
        workspace: detail.workspace,
        role: detail.role,
        loading: false,
      });
      useActivityStore.getState().load(workspaceId);
      void activity;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to load workspace" });
    }
  },

  createDocument: async (title) => {
    const ws = get().workspace;
    if (!ws) throw new Error("No workspace loaded");
    const { document } = await api<{ document: DocumentSummary }>(
      `/workspaces/${ws.id}/documents`,
      { method: "POST", body: { title } },
    );
    get().addDocument(document);
    return document;
  },

  addDocument: (doc) => {
    const ws = get().workspace;
    if (!ws) return;
    const exists = ws.documents.some((d) => d.id === doc.id);
    set({
      workspace: {
        ...ws,
        documents: exists
          ? ws.documents.map((d) => (d.id === doc.id ? doc : d))
          : [doc, ...ws.documents],
      },
    });
  },

  renameDocument: (documentId, title) => {
    const ws = get().workspace;
    if (!ws) return;
    set({
      workspace: {
        ...ws,
        documents: ws.documents.map((d) => (d.id === documentId ? { ...d, title } : d)),
      },
    });
  },

  bumpDocument: (documentId, version, updatedAt) => {
    const ws = get().workspace;
    if (!ws) return;
    set({
      workspace: {
        ...ws,
        documents: ws.documents
          .map((d) => (d.id === documentId ? { ...d, version, updatedAt } : d))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      },
    });
  },

  addActivity: (activity) => {
    useActivityStore.getState().prepend(activity);
  },

  replaceMembers: (members) => {
    const ws = get().workspace;
    if (!ws) return;
    set({ workspace: { ...ws, members } });
  },

  reset: () => set({ workspace: null, role: null, loading: false, error: null }),
}));
