import { Loader2 } from "lucide-react";
import { useActivityStore } from "../stores/activity";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";

const TYPE_ICON: Record<string, string> = {
  USER_JOINED: "joined",
  USER_LEFT: "left",
  DOCUMENT_UPDATED: "updated the document",
  COMMENT_CREATED: "commented",
  COMMENT_REPLIED: "replied",
  VERSION_CREATED: "created a version",
  VERSION_RESTORED: "restored a version",
  MEMBER_INVITED: "invited a member",
  MEMBER_REMOVED: "removed a member",
  WORKSPACE_CREATED: "created the workspace",
};

export function ActivityPanel() {
  const items = useActivityStore((s) => s.items);
  const loading = useActivityStore((s) => s.loading);

  if (loading && items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-xs text-zinc-400">No activity yet in this workspace.</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="flex gap-2.5">
          <Avatar name={item.actor.name} size="sm" />
          <div className="min-w-0">
            <p className="text-sm leading-snug text-zinc-700">
              <span className="font-medium text-zinc-900">{item.actor.name}</span>{" "}
              {TYPE_ICON[item.type] ?? "did something"}
            </p>
            <p className="text-[11px] text-zinc-400">{timeAgo(item.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
