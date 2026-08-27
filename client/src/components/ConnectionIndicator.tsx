import { useConnectionStore } from "../stores/connection";
import type { ConnectionStatus } from "../types";

const CONFIG: Record<ConnectionStatus, { label: string; dot: string; pulse?: boolean }> = {
  connected: { label: "Live", dot: "bg-emerald-500", pulse: true },
  connecting: { label: "Connecting…", dot: "bg-amber-400" },
  reconnecting: { label: "Reconnecting…", dot: "bg-amber-400", pulse: true },
  offline: { label: "Offline", dot: "bg-rose-500" },
};

export function ConnectionIndicator() {
  const status = useConnectionStore((s) => s.status);
  const config = CONFIG[status];

  return (
    <div
      title={`Connection status: ${config.label}`}
      className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600"
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.dot} opacity-60`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>
      {config.label}
    </div>
  );
}
