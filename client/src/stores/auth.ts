import { create } from "zustand";
import { api, getToken, setToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import type { User } from "../types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  status: "loading",

  init: async () => {
    const token = getToken();
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    try {
      const { user } = await api<{ user: User }>("/auth/me");
      set({ user, token, status: "authenticated" });
    } catch {
      setToken(null);
      set({ user: null, token: null, status: "unauthenticated" });
    }
  },

  login: async (email, password) => {
    const { user, token } = await api<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(token);
    set({ user, token, status: "authenticated" });
  },

  register: async (name, email, password) => {
    const { user, token } = await api<{ user: User; token: string }>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    setToken(token);
    set({ user, token, status: "authenticated" });
  },

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Token is discarded client-side regardless.
    }
    disconnectSocket();
    setToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },
}));
