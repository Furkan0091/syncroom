import { usePresenceStore } from "../stores/presence";
import { useAuthStore } from "../stores/auth";
import { Avatar } from "./Avatar";
import type { PresenceUser } from "../types";

const STATUS_LABEL: Record<PresenceUser["status"], string> = {
  EDITING: "Editing",
  VIEWING: "Viewing",
  ONLINE: "Online",
  IDLE: "Idle",
};

const STATUS_DOT: Record<PresenceUser["status"], string> = {
  EDITING: "bg-emerald-500",
  VIEWING: "bg-sky-500",
  ONLINE: "bg-emerald-400",
  IDLE: "bg-amber-400",
};

export function ActiveUsersPanel() {
  const users = usePresenceStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.user);

  const sorted = [...users].sort((a, b) => {
    // Current user first, then by status (editing users float up).
    if (a.userId === currentUser?.id) return -1;
    if (b.userId === currentUser?.id) return 1;
    const rank: Record<PresenceUser["status"], number> = { EDITING: 0, ONLINE: 1, VIEWING: 2, IDLE: 3 };
    return rank[a.status] - rank[b.status];
  });

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <p className="text-xs text-zinc-400">No other users are connected right now.</p>
      )}
      {sorted.map((user) => {
        const isMe = user.userId === currentUser?.id;
        return (
          <div key={user.userId} className="flex items-center gap-2.5">
            <div className="relative">
              <Avatar name={user.name} size="md" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${STATUS_DOT[user.status]}`}
                title={STATUS_LABEL[user.status]}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-800">
                {user.name}
                {isMe && <span className="ml-1 text-xs font-normal text-zinc-400">(you)</span>}
              </p>
              <p className="text-xs text-zinc-500">{STATUS_LABEL[user.status]}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
