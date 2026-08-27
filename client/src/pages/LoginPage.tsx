import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight text-zinc-900">SyncRoom</span>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-900">Sign in</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Enter a workspace. See everyone working in real time.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          No account?{" "}
          <Link to="/register" className="font-medium text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-white/60 px-4 py-3 text-center">
          <p className="text-xs text-zinc-500">
            Demo users (password <span className="font-mono">password123</span>):
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            furqan@syncroom.dev · ahmed@syncroom.dev · sarah@syncroom.dev
          </p>
        </div>
      </div>
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" fill="#2547eb" />
      <circle cx="38" cy="50" r="14" fill="white" />
      <circle cx="62" cy="50" r="14" fill="#93b4fd" />
    </svg>
  );
}
