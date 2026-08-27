import { useCallback, useEffect, useReducer, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useDocumentStore } from "../stores/document";
import { ClientEvents, getSocket } from "../lib/socket";
import { EditorToolbar } from "./EditorToolbar";

interface RichTextEditorProps {
  canEdit: boolean;
  workspaceId: string;
}

export function RichTextEditor({ canEdit, workspaceId }: RichTextEditorProps) {
  const content = useDocumentStore((s) => s.content);
  const documentId = useDocumentStore((s) => s.documentId);
  const saveState = useDocumentStore((s) => s.saveState);

  // Guards against feedback loops when applying remote content: setContent()
  // dispatches a transaction which fires onUpdate, so we skip the first
  // onUpdate after a programmatic set.
  const applyingRemote = useRef(false);
  const lastEmitted = useRef<string | null>(null);
  const lastRemote = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing… mention someone with @Name",
      }),
    ],
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "prose-editor focus:outline-none",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      if (applyingRemote.current) {
        applyingRemote.current = false;
        return;
      }
      lastEmitted.current = JSON.stringify(editor.getJSON());
      useDocumentStore.getState().setLocalContent(editor.getJSON());
    },
    onFocus: () => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(ClientEvents.PRESENCE_UPDATE, { status: "EDITING" });
      }
    },
    onBlur: () => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(ClientEvents.PRESENCE_UPDATE, { status: "VIEWING" });
      }
      // Flush pending edits immediately when leaving the editor.
      const state = useDocumentStore.getState();
      if (state.saveState === "saving") state.pushNow();
    },
  });

  // Apply remote content (from other users, conflicts, or resync) to the editor.
  useEffect(() => {
    if (!editor || !content || !documentId) return;
    const serialized = JSON.stringify(content);
    if (serialized === lastEmitted.current || serialized === lastRemote.current) return;

    lastRemote.current = serialized;
    applyingRemote.current = true;
    editor.commands.setContent(content, false);
  }, [content, editor, documentId]);

  // Keep the toolbar in sync with editor state changes.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", forceRender);
    return () => {
      editor.off("transaction", forceRender);
    };
  }, [editor]);

  const emitPresence = useCallback(
    (status: "EDITING" | "VIEWING" | "IDLE") => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(ClientEvents.PRESENCE_UPDATE, { status });
      }
    },
    [workspaceId],
  );

  // Idle detection: after 30 seconds without activity, mark the user idle.
  useEffect(() => {
    if (!documentId) return;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const reset = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => emitPresence("IDLE"), 30_000);
    };
    const onActivity = () => reset();
    reset();
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [documentId, emitPresence]);

  if (!editor) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} />
      <div
        className={`flex-1 overflow-y-auto px-8 py-6 sm:px-12 ${saveState === "loading" ? "opacity-60" : ""}`}
      >
        <EditorContent editor={editor} />
        {!canEdit && (
          <p className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            You have viewer access — this document is read-only.
          </p>
        )}
      </div>
    </div>
  );
}
