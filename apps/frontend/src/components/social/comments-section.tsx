'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { timeAgo } from '@/lib/format';
import type { Comment } from '@/types';

function CommentItem({
  comment,
  onReply,
  onDelete,
  currentUserId,
  isReply = false,
}: {
  comment: Comment;
  onReply: (parentId: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  currentUserId?: number;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');

  async function submitReply() {
    if (!text.trim()) return;
    await onReply(comment.id, text.trim());
    setText('');
    setReplying(false);
  }

  return (
    <div className={isReply ? 'ml-10' : ''}>
      <div className="flex gap-2">
        <Avatar src={comment.user.avatarUrl} name={comment.user.displayName} size={32} />
        <div className="flex-1">
          <div className="rounded-2xl bg-slate-100 px-3 py-2">
            <Link href={`/${comment.user.username}`} className="text-sm font-semibold hover:underline">
              {comment.user.displayName}
            </Link>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{comment.content}</p>
          </div>
          <div className="mt-1 flex gap-3 px-3 text-xs text-slate-400">
            <span>{timeAgo(comment.createdAt)}</span>
            {!isReply && (
              <button onClick={() => setReplying((v) => !v)} className="hover:text-orange-600">
                Trả lời
              </button>
            )}
            {currentUserId === comment.userId && (
              <button onClick={() => onDelete(comment.id)} className="hover:text-red-600">
                Xóa
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-2 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReply()}
                placeholder="Viết trả lời..."
                className="h-9 flex-1 rounded-full border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              />
              <button
                onClick={submitReply}
                className="rounded-full bg-orange-500 px-4 text-sm font-medium text-white"
              >
                Gửi
              </button>
            </div>
          )}

          {comment.replies?.map((reply) => (
            <div key={reply.id} className="mt-3">
              <CommentItem
                comment={reply}
                onReply={onReply}
                onDelete={onDelete}
                currentUserId={currentUserId}
                isReply
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommentsSection({ postId }: { postId: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    socialApi
      .comments(postId)
      .then((page) => setComments(page.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [postId]);

  async function addTopComment() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (!text.trim()) return;
    const created = await socialApi.addComment(postId, text.trim());
    setComments((prev) => [{ ...created, replies: [] }, ...prev]);
    setText('');
  }

  async function reply(parentId: number, content: string) {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const created = await socialApi.addComment(postId, content, parentId);
    setComments((prev) =>
      prev.map((c) =>
        c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c,
      ),
    );
  }

  async function remove(id: number) {
    await socialApi.deleteComment(id);
    setComments((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== id) })),
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Bình luận</h2>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTopComment()}
          placeholder={user ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
          className="h-10 flex-1 rounded-full border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
        />
        <button
          onClick={addTopComment}
          className="rounded-full bg-orange-500 px-5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Gửi
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Đang tải bình luận...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={reply}
              onDelete={remove}
              currentUserId={user?.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
