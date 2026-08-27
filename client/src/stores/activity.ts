import { create } from "zustand";
import { api } from "../lib/api";
import type { ActivityItem } from "../types";

const MAX_ITEMS = 50;

interface ActivityState {
  items: ActivityItem[];
  loading: boolean;
  load: (workspaceId: string) => Promise<void>;
  prepend: (activity: ActivityItem) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityState>()((set) => ({
  items: [],
  loading: false,

  load: async (workspaceId) => {
    set({ loading: true });
    try {
      const { activity } = await api<{ activity: ActivityItem[] }>(
        `/workspaces/${workspaceId}/activity`,
      );
      set({ items: activity, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  prepend: (activity) => {
    set((state) => ({
      items: [activity, ...state.items.filter((a) => a.id !== activity.id)].slice(0, MAX_ITEMS),
    }));
  },

  reset: () => set({ items: [], loading: false }),
}));
