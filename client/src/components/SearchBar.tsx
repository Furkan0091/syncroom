import { useEffect, useRef, useState } from "react";
import { FileText, MessagesSquare, Search, TrendingUp, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";

interface SearchResults {
  workspaces: Array<{ id: string; name: string; description: string | null }>;
  documents: Array<{ id: string; title: string; workspaceId: string; workspace: { name: string } }>;
  comments: Array<{
    id: string;
    content: string;
    workspaceId: string;
    documentId: string;
    document: { title: string };
  }>;
  activity: Array<{
    id: string;
    message: string;
    workspaceId: string;
    actor: { name: string };
    createdAt: string;
  }>;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!query.trim()) {
      requestIdRef.current += 1;
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await api<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
        // Ignore stale responses from superseded requests.
        if (requestId !== requestIdRef.current) return;
        setResults(data);
        setOpen(true);
      } catch {
        if (requestId === requestIdRef.current) setResults(null);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const total =
    (results?.workspaces.length ?? 0) +
    (results?.documents.length ?? 0) +
    (results?.comments.length ?? 0) +
    (results?.activity.length ?? 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search workspaces, documents, comments…"
          className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-9 pr-8 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-4 py-3 text-xs text-zinc-400">Searching…</p>
          ) : total === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-400">
              No results for “{query}”
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {results!.workspaces.length > 0 && (
                <ResultGroup label="Workspaces">
                  {results!.workspaces.map((w) => (
                    <ResultRow
                      key={w.id}
                      icon={<TrendingUp size={14} />}
                      title={w.name}
                      subtitle={w.description ?? ""}
                      onClick={() => go(`/w/${w.id}`)}
                    />
                  ))}
                </ResultGroup>
              )}
              {results!.documents.length > 0 && (
                <ResultGroup label="Documents">
                  {results!.documents.map((d) => (
                    <ResultRow
                      key={d.id}
                      icon={<FileText size={14} />}
                      title={d.title}
                      subtitle={d.workspace.name}
                      onClick={() => go(`/w/${d.workspaceId}`)}
                    />
                  ))}
                </ResultGroup>
              )}
              {results!.comments.length > 0 && (
                <ResultGroup label="Comments">
                  {results!.comments.map((c) => (
                    <ResultRow
                      key={c.id}
                      icon={<MessagesSquare size={14} />}
                      title={c.content.slice(0, 60)}
                      subtitle={c.document.title}
                      onClick={() => go(`/w/${c.workspaceId}`)}
                    />
                  ))}
                </ResultGroup>
              )}
              {results!.activity.length > 0 && (
                <ResultGroup label="Activity">
                  {results!.activity.map((a) => (
                    <ResultRow
                      key={a.id}
                      icon={<TrendingUp size={14} />}
                      title={a.message}
                      subtitle={`${a.actor.name} · ${timeAgo(a.createdAt)}`}
                      onClick={() => go(`/w/${a.workspaceId}`)}
                    />
                  ))}
                </ResultGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-100 py-1 last:border-0">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-blue-50/60"
    >
      <span className="mt-0.5 text-zinc-400">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-zinc-800">{title}</span>
        {subtitle && <span className="block truncate text-xs text-zinc-400">{subtitle}</span>}
      </span>
    </button>
  );
}
