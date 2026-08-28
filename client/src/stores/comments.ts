import { create } from "zustand";
import { api } from "../lib/api";
import type { Comment } from "../types";

interface CommentsState {
  comments: Comment[];
  loading: boolean;
  load: (documentId: string) => Promise<void>;
  add: (comment: Comment) => void;
  update: (comment: Comment) => void;
  remove: (commentId: string) => void;
  reset: () => void;
}

export const useCommentsStore = create<CommentsState>()((set) => ({
  comments: [],
  loading: false,

  load: async (documentId) => {
    set({ loading: true });
    try {
      const { comments } = await api<{ comments: Comment[] }>(
        `/documents/${documentId}/comments`,
      );
      set({ comments, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  add: (comment) => {
    set((state) => {
      if (comment.parentId) {
        const parentExists = state.comments.some((top) => top.id === comment.parentId);
        if (parentExists) {
          return {
            comments: state.comments.map((top) =>
              top.id === comment.parentId
                ? { ...top, replies: [...(top.replies ?? []), comment] }
                : top,
            ),
          };
        }
        // Parent not loaded yet (e.g. reply arrived before the panel) —
        // keep the reply as a top-level comment so it isn't dropped.
      }
      return { comments: [...state.comments, comment] };
    });
  },

  update: (comment) => {
    set((state) => {
      const apply = (c: Comment): Comment => (c.id === comment.id ? comment : c);
      return {
        comments: state.comments.map((top) =>
          top.id === comment.id
            ? apply(top)
            : top.replies
              ? { ...top, replies: top.replies.map(apply) }
              : top,
        ),
      };
    });
  },

  remove: (commentId) => {
    set((state) => ({
      comments: state.comments
        .filter((top) => top.id !== commentId)
        .map((top) =>
          top.replies ? { ...top, replies: top.replies.filter((r) => r.id !== commentId) } : top,
        ),
    }));
  },

  reset: () => set({ comments: [], loading: false }),
}));

// Re-export for convenience in components.
export function deleteComment(commentId: string): Promise<unknown> {
  return api(`/comments/${commentId}`, { method: "DELETE" });
}

export function updateComment(commentId: string, content: string): Promise<{ comment: Comment }> {
  return api(`/comments/${commentId}`, { method: "PATCH", body: { content } });
}
