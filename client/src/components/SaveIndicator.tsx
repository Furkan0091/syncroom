import { Check, CloudOff, Loader2, RefreshCcw, TriangleAlert } from "lucide-react";
import { useDocumentStore } from "../stores/document";
import type { SaveState } from "../types";

const CONFIG: Record<
  SaveState,
  { label: string; icon: typeof Check; className: string }
> = {
  loading: { label: "Loading…", icon: Loader2, className: "text-zinc-400" },
  saved: { label: "Saved", icon: Check, className: "text-emerald-600" },
  saving: { label: "Saving…", icon: Loader2, className: "text-zinc-500" },
  syncing: { label: "Syncing…", icon: Loader2, className: "text-blue-600" },
  conflict: { label: "Synced latest version", icon: RefreshCcw, className: "text-amber-600" },
  offline: { label: "Offline — will sync on reconnect", icon: CloudOff, className: "text-rose-600" },
};

export function SaveIndicator() {
  const saveState = useDocumentStore((s) => s.saveState);
  const config = CONFIG[saveState];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.className}`}
      role="status"
      aria-label={config.label}
    >
      <Icon size={13} className={saveState === "syncing" ? "animate-spin" : ""} />
      {config.label}
    </span>
  );
}

export function ConflictBanner() {
  const conflictAt = useDocumentStore((s) => s.conflictAt);
  if (!conflictAt) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <p>
        This document changed while you were editing. The latest version has been
        synchronized. Unsaved local changes from the conflicting edit were not applied.
      </p>
    </div>
  );
}
