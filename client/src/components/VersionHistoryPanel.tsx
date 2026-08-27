import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { History, Loader2, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../stores/workspace";
import { useAuthStore } from "../stores/auth";
import { formatDateTime, timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import type { JSONContent } from "@tiptap/core";

interface Version {
  id: string;
  version: number;
  content: JSONContent;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export function VersionHistoryPanel({ documentId }: { documentId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const role = useWorkspaceStore((s) => s.role);
  const canRestore = role === "OWNER" || role === "EDITOR";
  const currentUser = useAuthStore((s) => s.user);

  const load = async () => {
    setLoading(true);
    try {
      const { versions } = await api<{ versions: Version[] }>(
        `/documents/${documentId}/versions`,
      );
      setVersions(versions);
      setSelected(null);
      setError(null);
    } catch {
      setError("Failed to load version history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const restore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await api(`/documents/${documentId}/versions/${selected.version}/restore`, {
        method: "POST",
      });
      setConfirmRestore(false);
      setRestoring(false);
      await load();
    } catch {
      setRestoring(false);
      setError("Failed to restore version");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {loading && versions.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-zinc-400">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : (
          versions.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setSelected(v);
                setConfirmRestore(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                selected?.id === v.id
                  ? "border-blue-200 bg-blue-50"
                  : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                v{v.version}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-zinc-800">
                  {v.createdBy.name}
                </span>
                <span className="block text-[11px] text-zinc-400">{timeAgo(v.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>

      {selected && (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <p className="text-xs font-semibold text-zinc-800">
              Version {selected.version}
            </p>
            <p className="text-[11px] text-zinc-400">
              {formatDateTime(selected.createdAt)}
            </p>
          </div>
          <VersionPreview content={selected.content} />
          <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Avatar name={selected.createdBy.name} size="xs" />
              {selected.createdBy.name}
              {selected.createdBy.id === currentUser?.id && " (you)"}
            </p>
            {canRestore &&
              (confirmRestore ? (
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="text-zinc-600">Restore this version?</span>
                  <button
                    onClick={restore}
                    disabled={restoring}
                    className="rounded-md bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {restoring ? "Restoring…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmRestore(false)}
                    className="font-medium text-zinc-500 hover:underline"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmRestore(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-blue-200 hover:text-blue-700"
                >
                  <RotateCcw size={11} /> Restore
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionPreview({ content }: { content: JSONContent }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: false,
    editorProps: {
      attributes: { class: "prose-editor prose-editor--compact focus:outline-none" },
    },
    immediatelyRender: false,
  });

  return (
    <div className="max-h-48 overflow-y-auto px-3 py-2">
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}

export function HistoryIcon() {
  return <History size={15} />;
}
