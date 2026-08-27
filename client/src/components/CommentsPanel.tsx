import { useState } from "react";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { useCommentsStore, deleteComment } from "../stores/comments";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
import { ClientEvents, getSocket } from "../lib/socket";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import type { Comment } from "../types";

export function CommentsPanel({ documentId }: { documentId: string }) {
  const comments = useCommentsStore((s) => s.comments);
  const loading = useCommentsStore((s) => s.loading);
  const currentUser = useAuthStore((s) => s.user);
  const role = useWorkspaceStore((s) => s.role);
  const [draft, setDraft] = useState("");

  const canComment = role === "OWNER" || role === "EDITOR" || role === "VIEWER";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !documentId) return;
    getSocket()?.emit(ClientEvents.COMMENT_CREATE, { documentId, content });
    setDraft("");
  };

  const reply = (parentId: string, content: string) => {
    if (!content.trim()) return;
    getSocket()?.emit(ClientEvents.COMMENT_CREATE, { documentId, content, parentId });
  };

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="text-xs text-zinc-400">
            No comments yet. Add one to start a discussion — mention someone with
            @Name to notify them.
          </p>
        )}
        {comments.map((comment) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            onReply={reply}
            canDelete={comment.author.id === currentUser?.id || role === "OWNER"}
          />
        ))}
      </div>
      {canComment && (
        <form onSubmit={submit} className="mt-3 border-t border-zinc-100 pt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
            placeholder="Add a comment… (@Name to notify)"
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CommentThread({
  comment,
  onReply,
  canDelete,
}: {
  comment: Comment;
  onReply: (parentId: string, content: string) => void;
  canDelete: boolean;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  return (
    <div>
      <CommentItem comment={comment} canDelete={canDelete} />
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-zinc-100 pl-3">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} canDelete={canDelete} />
          ))}
        </div>
      )}
      <button
        onClick={() => setShowReply((v) => !v)}
        className="mt-1.5 text-xs font-medium text-zinc-400 transition hover:text-blue-600"
      >
        {showReply ? "Cancel" : "Reply"}
      </button>
      {showReply && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onReply(comment.id, replyDraft);
            setReplyDraft("");
            setShowReply(false);
          }}
          className="mt-2"
        >
          <input
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Write a reply…"
            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </form>
      )}
    </div>
  );
}

function CommentItem({ comment, canDelete }: { comment: Comment; canDelete: boolean }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-zinc-800">{comment.author.name}</span>
          <span className="text-[11px] text-zinc-400">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700">
          {comment.content}
        </p>
        {canDelete &&
          (confirming ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
              Delete?
              <button
                onClick={async () => {
                  await deleteComment(comment.id).catch(() => {});
                }}
                className="font-medium text-rose-600 hover:underline"
              >
                Yes
              </button>
              <button onClick={() => setConfirming(false)} className="font-medium hover:underline">
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400 transition hover:text-rose-600"
              title="Delete comment"
            >
              <Trash2 size={11} /> Delete
            </button>
          ))}
      </div>
    </div>
  );
}

// Icon used in panel header by the parent page.
export function CommentsIcon() {
  return <MessageSquare size={15} />;
}
