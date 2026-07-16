'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TimeAgo } from '@/components/ui/time-ago';
import type { Comment } from '@/types';
import { useCommentSocket } from './use-comment-socket';

function CommentItem({
  comment,
  onReply,
  onDelete,
  onLoadMoreReplies,
  currentUserId,
  isReply = false,
}: {
  comment: Comment;
  onReply: (parentId: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLoadMoreReplies?: (parentId: number) => Promise<void>;
  currentUserId?: number;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const shownReplies = comment.replies?.length ?? 0;
  const totalReplies = comment.replyCount ?? shownReplies;
  const remainingReplies = totalReplies - shownReplies;

  async function submitReply() {
    if (!text.trim()) return;
    await onReply(comment.id, text.trim());
    setText('');
    setReplying(false);
  }

  async function loadMore() {
    if (!onLoadMoreReplies) return;
    setLoadingMore(true);
    try {
      await onLoadMoreReplies(comment.id);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className={isReply ? 'ml-12' : ''}>
      <div className="flex gap-md">
        <Avatar src={comment.user.avatarUrl} name={comment.user.displayName} size={isReply ? 32 : 40} />
        <div className="flex-1">
          <div className="flex items-center gap-sm">
            <Link href={`/${comment.user.username}`} className="font-headline-md text-body-sm font-semibold text-on-surface hover:underline">
              {comment.user.displayName}
            </Link>
            <span className="font-body-sm text-label-caps text-on-surface-variant">
              @{comment.user.username} • <TimeAgo date={comment.createdAt} />
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap font-body-md text-body-sm text-on-surface">{comment.content}</p>
          <div className="mt-1 flex gap-lg text-on-surface-variant">
            {!isReply && (
              <button onClick={() => setReplying((v) => !v)} className="flex items-center gap-xs text-label-caps hover:text-tertiary">
                <Icon name="chat_bubble" className="text-[14px]" /> Trả lời
              </button>
            )}
            {currentUserId === comment.userId && (
              <button onClick={() => onDelete(comment.id)} className="flex items-center gap-xs text-label-caps hover:text-error">
                <Icon name="delete" className="text-[14px]" /> Xóa
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-2 flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReply()}
                placeholder="Viết trả lời..."
                className="h-9 flex-1 rounded-full px-3"
              />
              <Button size="sm" onClick={submitReply}>
                Gửi
              </Button>
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

          {!isReply && remainingReplies > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-3 flex items-center gap-xs text-label-caps text-tertiary hover:underline disabled:opacity-60"
            >
              <Icon name="subdirectory_arrow_right" className="text-[14px]" />
              {loadingMore ? 'Đang tải...' : `Xem thêm ${remainingReplies} trả lời`}
            </button>
          )}
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socialApi
      .comments(postId)
      .then((page) => setComments(page.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [postId]);

  useCommentSocket(postId, setComments);

  async function addTopComment() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (!text.trim()) return;
    setError(null);
    try {
      const created = await socialApi.addComment(postId, text.trim());
      setComments((prev) => [{ ...created, replies: [] }, ...prev]);
      setText('');
    } catch {
      setError('Không gửi được bình luận. Vui lòng thử lại.');
    }
  }

  async function reply(parentId: number, content: string) {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setError(null);
    try {
      const created = await socialApi.addComment(postId, content, parentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? {
                ...c,
                replies: [...(c.replies ?? []), created],
                replyCount: (c.replyCount ?? c.replies?.length ?? 0) + 1,
              }
            : c,
        ),
      );
    } catch {
      setError('Không gửi được trả lời. Vui lòng thử lại.');
    }
  }

  async function loadMoreReplies(parentId: number) {
    const parent = comments.find((c) => c.id === parentId);
    const loaded = parent?.replies ?? [];
    const cursor = loaded.length ? loaded[loaded.length - 1].id : undefined;
    const page = await socialApi.replies(postId, parentId, cursor);
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== parentId) return c;
        const existing = c.replies ?? [];
        const seen = new Set(existing.map((r) => r.id));
        const merged = [...existing, ...page.data.filter((r) => !seen.has(r.id))];
        return { ...c, replies: merged };
      }),
    );
  }

  async function remove(id: number) {
    setError(null);
    try {
      await socialApi.deleteComment(id);
      setComments((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== id) })),
      );
    } catch {
      setError('Không xoá được bình luận. Vui lòng thử lại.');
    }
  }

  return (
    <section id="comments" className="space-y-4">
      <h2 className="border-b border-outline-variant pb-sm font-headline-md text-headline-md text-on-surface">
        Bình luận
      </h2>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTopComment()}
          placeholder={user ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
          className="flex-1 rounded-full"
        />
        <Button onClick={addTopComment}>Gửi</Button>
      </div>
      {error && <p className="text-body-sm text-error">{error}</p>}

      {loading ? (
        <p className="text-body-sm text-on-surface-variant">Đang tải bình luận...</p>
      ) : comments.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
      ) : (
        <div className="space-y-5">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={reply}
              onDelete={remove}
              onLoadMoreReplies={loadMoreReplies}
              currentUserId={user?.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
