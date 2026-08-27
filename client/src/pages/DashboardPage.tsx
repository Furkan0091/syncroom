import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, LogOut, Plus, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useNotificationsStore } from "../stores/notifications";
import { timeAgo } from "../lib/format";
import { Avatar, AvatarStack } from "../components/Avatar";
import { CreateWorkspaceModal } from "../components/CreateWorkspaceModal";
import { NotificationsBell } from "../components/NotificationsBell";
import { SearchBar } from "../components/SearchBar";
import { Logo } from "./LoginPage";
import type { WorkspaceSummary } from "../types";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    const { workspaces } = await api<{ workspaces: WorkspaceSummary[] }>("/workspaces");
    setWorkspaces(workspaces);
  };

  useEffect(() => {
    load().catch(() => setWorkspaces([]));
    useNotificationsStore.getState().load();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-sm font-bold tracking-tight text-zinc-900">SyncRoom</span>
          </Link>
          <div className="flex-1 flex justify-center px-4">
            <SearchBar />
          </div>
          <NotificationsBell />
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white py-1 pl-1 pr-2">
            <Avatar name={user?.name ?? "?"} size="sm" />
            <span className="max-w-28 truncate text-xs font-medium text-zinc-700">
              {user?.name}
            </span>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Recent workspaces
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Jump back into a shared space — presence, documents and activity are
              waiting for you.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <Plus size={15} /> New workspace
          </button>
        </div>

        {workspaces === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-zinc-200 bg-white" />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <FileText size={28} className="mx-auto text-zinc-300" />
            <h2 className="mt-3 text-sm font-semibold text-zinc-800">No workspaces yet</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Create one and invite teammates — everything inside is live.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => navigate(`/w/${ws.id}`)}
                className="group rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-zinc-900">
                      {ws.name}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">
                      {ws.description ?? "No description"}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="mt-1 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
                  />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <AvatarStack
                    names={[ws.owner.name]}
                    max={3}
                  />
                  <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={11} /> {ws.documentCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {ws.memberCount}
                    </span>
                    <span>· opened {timeAgo(ws.lastAccessedAt)}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <CreateWorkspaceModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}
