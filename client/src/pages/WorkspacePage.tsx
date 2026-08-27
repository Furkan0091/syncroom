import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FilePlus2,
  FileText,
  Loader2,
  LogOut,
  MessageSquare,
  Radio,
  Share2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import {
  ClientEvents,
  ServerEvents,
  connectSocket,
  getSocket,
} from "../lib/socket";
import { useAuthStore } from "../stores/auth";
import { useConnectionStore } from "../stores/connection";
import { useWorkspaceStore } from "../stores/workspace";
import { useDocumentStore, openDocument } from "../stores/document";
import { useCommentsStore } from "../stores/comments";
import { usePresenceStore } from "../stores/presence";
import { useNotificationsStore } from "../stores/notifications";
import { ConnectionIndicator } from "../components/ConnectionIndicator";
import { SaveIndicator, ConflictBanner } from "../components/SaveIndicator";
import { NotificationsBell } from "../components/NotificationsBell";
import { RichTextEditor } from "../components/RichTextEditor";
import { ActiveUsersPanel } from "../components/ActiveUsersPanel";
import { CommentsPanel } from "../components/CommentsPanel";
import { ActivityPanel } from "../components/ActivityPanel";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel";
import { InviteMemberModal } from "../components/InviteMemberModal";
import { Avatar, AvatarStack } from "../components/Avatar";
import { Logo } from "./LoginPage";
import type { ActivityItem, Comment, Notification, PresenceUser } from "../types";

type Tab = "users" | "comments" | "activity" | "versions";

const TABS: Array<{ id: Tab; label: string; icon: typeof UserRound }> = [
  { id: "users", label: "Active", icon: UserRound },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "activity", label: "Activity", icon: TrendingUp },
  { id: "versions", label: "Versions", icon: Radio },
];

export function WorkspacePage() {
  const { workspaceId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { workspace, role, loading, error, load, createDocument, renameDocument } =
    useWorkspaceStore();
  const documentState = useDocumentStore();
  const setConnectionStatus = useConnectionStore((s) => s.setStatus);
  const [tab, setTab] = useState<Tab>("users");
  const [showInvite, setShowInvite] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const joinedRef = useRef(false);
  const activeDocIdRef = useRef<string | null>(null);
  // Hooks must not come after early returns — keep them all up here.
  const presenceCount = usePresenceStore((s) => s.users.length);

  const canEdit = role === "OWNER" || role === "EDITOR";

  const joinWorkspace = useCallback(() => {
    const socket = getSocket();
    if (!socket || !workspaceId) return;
    socket.emit(ClientEvents.WORKSPACE_JOIN, { workspaceId });
    joinedRef.current = true;
  }, [workspaceId]);

  const openDoc = useCallback(
    async (documentId: string) => {
      setActiveDocId(documentId);
      activeDocIdRef.current = documentId;
      try {
        const doc = await openDocument(documentId);
        setTitleDraft(doc.title);
        useCommentsStore.getState().load(documentId);
        // Ask the server for the authoritative state (also covers resync).
        getSocket()?.emit(ClientEvents.DOCUMENT_SYNC, { documentId });
      } catch {
        useDocumentStore.getState().reset();
      }
    },
    [],
  );

  // ---- Socket lifecycle -----------------------------------------------------
  useEffect(() => {
    const socket = connectSocket();
    setConnectionStatus("connecting");

    const onConnect = () => {
      setConnectionStatus("connected");
      joinWorkspace();
      const docId = activeDocIdRef.current;
      if (docId) {
        getSocket()?.emit(ClientEvents.DOCUMENT_SYNC, { documentId: docId });
      }
    };
    const onDisconnect = () => setConnectionStatus("reconnecting");
    const onConnectError = () => setConnectionStatus("offline");
    const onJoined = (payload: { users: PresenceUser[] }) => {
      usePresenceStore.getState().setUsers(payload.users);
    };
    const onPresence = (payload: { users: PresenceUser[] }) => {
      usePresenceStore.getState().setUsers(payload.users);
    };
    const onDocumentUpdated = (payload: {
      documentId: string;
      version: number;
      content: import("@tiptap/core").JSONContent;
      title?: string;
    }) => {
      useDocumentStore.getState().handleRemoteUpdate(payload);
      useWorkspaceStore
        .getState()
        .bumpDocument(payload.documentId, payload.version, new Date().toISOString());
    };
    const onAck = (payload: { version: number; eventId: string }) =>
      useDocumentStore.getState().handleAck(payload);
    const onConflict = (payload: {
      currentVersion: number;
      content: import("@tiptap/core").JSONContent;
    }) => useDocumentStore.getState().handleConflict(payload);
    const onSynced = (payload: {
      documentId: string;
      version: number;
      content: import("@tiptap/core").JSONContent;
      title: string;
    }) => {
      if (payload.documentId === activeDocIdRef.current) {
        useDocumentStore.getState().handleSynced(payload);
      }
    };
    const onCommentCreated = (payload: { comment: Comment }) =>
      useCommentsStore.getState().add(payload.comment);
    const onCommentUpdated = (payload: { comment: Comment }) =>
      useCommentsStore.getState().update(payload.comment);
    const onCommentDeleted = (payload: { commentId: string }) =>
      useCommentsStore.getState().remove(payload.commentId);
    const onActivity = (payload: { activity: ActivityItem }) =>
      useWorkspaceStore.getState().addActivity(payload.activity);
    const onNotification = (payload: { notification: Notification }) =>
      useNotificationsStore.getState().add(payload.notification);
    const onError = (payload: { code: string; message: string }) => {
      // Surface connection-level errors without breaking the UI.
      console.warn("[syncroom] socket error:", payload);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on(ServerEvents.WORKSPACE_JOINED, onJoined);
    socket.on(ServerEvents.WORKSPACE_PRESENCE, onPresence);
    socket.on(ServerEvents.DOCUMENT_UPDATED, onDocumentUpdated);
    socket.on(ServerEvents.DOCUMENT_ACK, onAck);
    socket.on(ServerEvents.DOCUMENT_CONFLICT, onConflict);
    socket.on(ServerEvents.DOCUMENT_SYNCED, onSynced);
    socket.on(ServerEvents.COMMENT_CREATED, onCommentCreated);
    socket.on(ServerEvents.COMMENT_UPDATED, onCommentUpdated);
    socket.on(ServerEvents.COMMENT_DELETED, onCommentDeleted);
    socket.on(ServerEvents.ACTIVITY_NEW, onActivity);
    socket.on(ServerEvents.NOTIFICATION_NEW, onNotification);
    socket.on(ServerEvents.ERROR, onError);

    // If the socket is already connected (e.g. navigation between pages),
    // join immediately.
    if (socket.connected) {
      setConnectionStatus("connected");
      joinWorkspace();
    }

    return () => {
      if (joinedRef.current && workspaceId) {
        socket.emit(ClientEvents.WORKSPACE_LEAVE, { workspaceId });
      }
      joinedRef.current = false;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(ServerEvents.WORKSPACE_JOINED, onJoined);
      socket.off(ServerEvents.WORKSPACE_PRESENCE, onPresence);
      socket.off(ServerEvents.DOCUMENT_UPDATED, onDocumentUpdated);
      socket.off(ServerEvents.DOCUMENT_ACK, onAck);
      socket.off(ServerEvents.DOCUMENT_CONFLICT, onConflict);
      socket.off(ServerEvents.DOCUMENT_SYNCED, onSynced);
      socket.off(ServerEvents.COMMENT_CREATED, onCommentCreated);
      socket.off(ServerEvents.COMMENT_UPDATED, onCommentUpdated);
      socket.off(ServerEvents.COMMENT_DELETED, onCommentDeleted);
      socket.off(ServerEvents.ACTIVITY_NEW, onActivity);
      socket.off(ServerEvents.NOTIFICATION_NEW, onNotification);
      socket.off(ServerEvents.ERROR, onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ---- Load workspace data ---------------------------------------------------
  useEffect(() => {
    if (!workspaceId) return;
    useWorkspaceStore.getState().reset();
    useDocumentStore.getState().reset();
    useCommentsStore.getState().reset();
    usePresenceStore.getState().reset();
    load(workspaceId).then(() => {
      // Open the most recently updated document by default.
      const docs = useWorkspaceStore.getState().workspace?.documents;
      if (docs && docs.length > 0 && !activeDocId) {
        openDoc(docs[0]!.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const createDoc = async () => {
    setCreatingDoc(true);
    try {
      const doc = await createDocument("Untitled document");
      await openDoc(doc.id);
    } catch {
      // Permission or network error — ignored here.
    } finally {
      setCreatingDoc(false);
    }
  };

  const commitTitle = async () => {
    const docId = documentState.documentId;
    if (!docId || !titleDraft.trim() || titleDraft === documentState.title) return;
    try {
      const { document } = await api<{ document: { id: string; title: string } }>(
        `/documents/${docId}`,
        { method: "PATCH", body: { title: titleDraft.trim() } },
      );
      renameDocument(document.id, document.title);
      useDocumentStore.setState({ title: document.title });
    } catch {
      setTitleDraft(documentState.title);
    }
  };

  if (loading) {
    return (
      <FullScreen>
        <Loader2 size={22} className="animate-spin text-zinc-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading workspace…</p>
      </FullScreen>
    );
  }

  if (error || !workspace) {
    return (
      <FullScreen>
        <p className="text-sm font-medium text-rose-600">{error ?? "Workspace unavailable"}</p>
        <Link to="/" className="mt-3 text-sm font-medium text-blue-600 hover:underline">
          Back to workspaces
        </Link>
      </FullScreen>
    );
  }

  const activeDoc = workspace.documents.find((d) => d.id === activeDocId) ?? workspace.documents[0];

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
        >
          <ArrowLeft size={15} />
        </Link>
        <Link to="/" className="flex items-center gap-1.5">
          <Logo size={20} />
        </Link>
        <div className="h-5 w-px bg-zinc-200" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-zinc-900">{workspace.name}</h1>
          <p className="truncate text-[11px] text-zinc-400">
            {workspace.members.length} member{workspace.members.length === 1 ? "" : "s"} ·{" "}
            {workspace.description || "shared workspace"}
          </p>
        </div>
        <div className="flex-1" />
        <SaveIndicator />
        <ConnectionIndicator />
        <NotificationsBell />
        <AvatarStack names={workspace.members.map((m) => m.user.name)} max={4} />
        {role === "OWNER" && (
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            <Share2 size={13} /> Invite
          </button>
        )}
        <button
          onClick={() => logout()}
          title="Sign out"
          className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
        >
          <LogOut size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: documents */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Documents
            </p>
            {canEdit && (
              <button
                onClick={createDoc}
                disabled={creatingDoc}
                title="New document"
                className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-blue-600"
              >
                <FilePlus2 size={14} />
              </button>
            )}
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {workspace.documents.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-400">
                No documents yet. {canEdit ? "Create the first one." : ""}
              </p>
            )}
            {workspace.documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => openDoc(doc.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                  doc.id === activeDoc?.id
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <FileText size={13} className="shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                {doc._count && doc._count.comments > 0 && (
                  <span className="text-[10px] text-zinc-400">({doc._count.comments})</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-100 px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Members
            </p>
            <div className="space-y-1">
              {workspace.members.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.user.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
                    {m.user.name}
                    {m.user.id === user?.id && <span className="text-zinc-400"> (you)</span>}
                  </span>
                  <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-medium uppercase text-zinc-400">
                    {m.role[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: editor */}
        <main className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-8 pt-4 pb-3">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              readOnly={!canEdit}
              placeholder="Untitled document"
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
            />
            {activeDoc && (
              <span className="shrink-0 text-[11px] text-zinc-400">
                v{activeDoc.version}
              </span>
            )}
          </div>
          <ConflictBanner />
          {activeDoc ? (
            <div className="min-h-0 flex-1">
              <RichTextEditor
                key={activeDoc.id}
                canEdit={canEdit}
                workspaceId={workspaceId}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              Select a document to start collaborating.
            </div>
          )}
        </main>

        {/* Right: collaboration panels */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-white">
          <div className="flex border-b border-zinc-200">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition ${
                    tab === t.id
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  <Icon size={13} />
                  {t.label}
                  {t.id === "users" && presenceCount > 0 && (
                    <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">
                      {presenceCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
            {tab === "users" && <ActiveUsersPanel />}
            {tab === "comments" && activeDoc && <CommentsPanel documentId={activeDoc.id} />}
            {tab === "activity" && <ActivityPanel />}
            {tab === "versions" && activeDoc && <VersionHistoryPanel documentId={activeDoc.id} />}
          </div>
        </aside>
      </div>

      <InviteMemberModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        workspaceId={workspace.id}
      />
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50">
      {children}
    </div>
  );
}
