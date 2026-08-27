import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";
import { api } from "../lib/api";
import { ClientEvents, getSocket } from "../lib/socket";
import type { SaveState } from "../types";

const PUSH_DEBOUNCE_MS = 800;

/**
 * The client-side synchronization state machine.
 *
 * Local edits are applied optimistically, debounced, then pushed over the
 * socket with the version they were based on (`baseVersion`). The server
 * accepts the update only if `baseVersion` still matches; otherwise it replies
 * with a conflict carrying the latest state, which we apply.
 */
interface DocumentState {
  documentId: string | null;
  title: string;
  version: number;
  baseVersion: number;
  content: JSONContent | null;
  saveState: SaveState;
  conflictAt: number | null;
  load: (documentId: string, title: string, version: number, content: JSONContent) => void;
  setLocalContent: (content: JSONContent) => void;
  pushNow: () => void;
  handleAck: (payload: { version: number; eventId: string }) => void;
  handleConflict: (payload: {
    currentVersion: number;
    content: JSONContent;
  }) => void;
  handleRemoteUpdate: (payload: {
    version: number;
    content: JSONContent;
    title?: string;
  }) => void;
  handleSynced: (payload: { version: number; content: JSONContent; title: string }) => void;
  markOffline: () => void;
  reset: () => void;
}

// Module-level sync state (not reactive): the in-flight event id and the
// debounce timer for pushing edits.
let pendingEventId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  documentId: null,
  title: "",
  version: 0,
  baseVersion: 0,
  content: null,
  saveState: "loading",
  conflictAt: null,

  load: (documentId, title, version, content) => {
    set({
      documentId,
      title,
      version,
      baseVersion: version,
      content,
      saveState: "saved",
      conflictAt: null,
    });
  },

  setLocalContent: (content) => {
    set({ content, saveState: "saving" });
    schedulePush();
  },

  pushNow: () => {
    const { documentId, baseVersion, content, saveState } = get();
    if (!documentId || !content || saveState === "offline") return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      set({ saveState: "offline" });
      return;
    }

    pendingEventId = crypto.randomUUID();
    set({ saveState: "syncing" });
    socket.emit(ClientEvents.DOCUMENT_UPDATE, {
      documentId,
      baseVersion,
      content,
      eventId: pendingEventId,
    });
  },

  handleAck: ({ version, eventId }) => {
    // Ignore acks for events we no longer track (e.g. after a conflict resync).
    if (eventId !== pendingEventId) return;
    pendingEventId = null;
    set({ version, baseVersion: version, saveState: "saved" });
  },

  handleConflict: ({ currentVersion, content }) => {
    pendingEventId = null;
    set({
      version: currentVersion,
      baseVersion: currentVersion,
      content,
      saveState: "saved",
      conflictAt: Date.now(),
    });
  },

  handleRemoteUpdate: ({ version, content, title }) => {
    const state = get();
    if (!state.documentId || version <= state.version) return;

    const hasPendingEdits = state.saveState === "saving" || state.saveState === "syncing";

    if (hasPendingEdits) {
      // Someone else saved on top of our base. Keep our local edits, rebase
      // onto the newest version, and re-push so our content lands next.
      set({ version, baseVersion: version, saveState: "saving" });
      schedulePush(200);
    } else {
      set({
        version,
        baseVersion: version,
        content,
        title: title ?? state.title,
        saveState: "saved",
      });
    }
  },

  handleSynced: ({ version, content, title }) => {
    const state = get();
    const hasPendingEdits =
      state.saveState === "saving" ||
      state.saveState === "syncing" ||
      state.saveState === "offline";

    if (hasPendingEdits && state.content) {
      // Offline edits must not be clobbered by the resync: rebase them onto
      // the latest server version and push them immediately.
      pendingEventId = null;
      set({ version, baseVersion: version, title, saveState: "saving" });
      schedulePush(100);
    } else {
      pendingEventId = null;
      set({ version, baseVersion: version, content, title, saveState: "saved" });
    }
  },

  markOffline: () => {
    if (get().saveState === "saved") return;
    set({ saveState: "offline" });
  },

  reset: () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    pendingEventId = null;
    set({
      documentId: null,
      title: "",
      version: 0,
      baseVersion: 0,
      content: null,
      saveState: "loading",
      conflictAt: null,
    });
  },
}));

function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    useDocumentStore.getState().pushNow();
  }, delay);
}

/** Loads a document (REST) and initializes the sync state. */
export async function openDocument(documentId: string) {
  const { document } = await api<{
    document: { id: string; title: string; version: number; content: JSONContent };
  }>(`/documents/${documentId}`);
  useDocumentStore.getState().load(
    document.id,
    document.title,
    document.version,
    document.content,
  );
  return document;
}
