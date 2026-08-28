import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Mail, UserPlus, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotificationsStore } from "../stores/notifications";
import { timeAgo } from "../lib/format";

const TYPE_ICON: Record<string, typeof Bell> = {
  MENTION: Mail,
  COMMENT: MessageSquare,
  INVITE: UserPlus,
  ACTIVITY: Bell,
};

export function NotificationsBell() {
  const { notifications, unreadCount, load, markRead, markAllRead } = useNotificationsStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const openNotification = async (n: (typeof notifications)[number]) => {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    if (n.workspaceId) navigate(`/w/${n.workspaceId}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <p className="text-xs font-semibold text-zinc-800">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">
                No notifications yet.
              </p>
            )}
            {notifications.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-zinc-50 px-3 py-2.5 text-left transition hover:bg-zinc-50 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <span className="mt-0.5 rounded-md bg-blue-50 p-1.5 text-blue-600">
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-zinc-800">{n.message}</span>
                    <span className="block text-[11px] text-zinc-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
