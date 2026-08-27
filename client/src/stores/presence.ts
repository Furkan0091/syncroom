import { create } from "zustand";
import type { PresenceUser } from "../types";

interface PresenceState {
  users: PresenceUser[];
  setUsers: (users: PresenceUser[]) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
  reset: () => set({ users: [] }),
}));
