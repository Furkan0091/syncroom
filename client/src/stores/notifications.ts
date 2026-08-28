import { create } from "zustand";
import { api } from "../lib/api";
import type { Notification } from "../types";

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  load: () => Promise<void>;
  add: (notification: Notification) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  load: async () => {
    try {
      const { notifications, unreadCount } = await api<{
        notifications: Notification[];
        unreadCount: number;
      }>("/notifications");
      set({ notifications, unreadCount });
    } catch {
      // Notifications are non-critical — fail silently.
    }
  },

  add: (notification) => {
    set((state) => {
      // Multiple socket handlers may deliver the same event — only count new ones.
      const exists = state.notifications.some((n) => n.id === notification.id);
      return {
        notifications: [
          notification,
          ...state.notifications.filter((n) => n.id !== notification.id),
        ],
        unreadCount: !exists && !notification.read ? state.unreadCount + 1 : state.unreadCount,
      };
    });
  },

  markRead: async (id) => {
    await api(`/notifications/${id}/read`, { method: "POST" });
    set((state) => {
      const wasUnread = state.notifications.some((n) => n.id === id && !n.read);
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },

  markAllRead: async () => {
    await api("/notifications/read-all", { method: "POST" });
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  reset: () => set({ notifications: [], unreadCount: 0 }),
}));
