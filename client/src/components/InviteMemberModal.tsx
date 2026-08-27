import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { Modal } from "./Modal";
import type { Role } from "../types";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  EDITOR: "Can edit documents and comment",
  VIEWER: "Can view and comment",
  OWNER: "Full control — use sparingly",
};

export function InviteMemberModal({ open, onClose, workspaceId }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { member } = await api<{ member: { user: { name: string } } }>(
        `/workspaces/${workspaceId}/members`,
        { method: "POST", body: { email: email.trim(), role } },
      );
      setSuccess(`${member.user.name} was added to the workspace.`);
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite a member">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {success}
          </p>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            autoFocus
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Role</label>
          <div className="space-y-1.5">
            {(["EDITOR", "VIEWER"] as Role[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                  role === r ? "border-blue-300 bg-blue-50" : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-800">{r}</span>
                  <span className="block text-xs text-zinc-500">{ROLE_DESCRIPTIONS[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
