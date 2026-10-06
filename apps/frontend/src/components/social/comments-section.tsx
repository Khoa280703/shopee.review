'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/login-href';
import { TimeAgo } from '@/components/ui/time-ago';
import type { Comment } from '@/types';
import { useCommentSocket } from './use-comment-socket';
import { applyCommentDeletion, upsertReply, upsertTopLevelComment } from './comment-utils';

/** Enter should submit, except mid-IME composition (Vietnamese Telex/VNI,
 * Japanese/Korean input methods all hold a "marked text" state while composing
 * — committing on that Enter sends an unfinished word). Also guards against a
 * second Enter firing while the previous submit is still in flight. */
function isSubmitEnter(e: React.KeyboardEvent, submitting: boolean): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && !submitting;
}

function CommentItem({
  comment,
  onReply,
  onDelete,
  onLoadMoreReplies,
  currentUserId,
  isReply = false,
}: {
  comment: Comment;
  onReply: (parentId: number, content: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onLoadMoreReplies?: (parentId: number) => Promise<void>;
  currentUserId?: number;
  isReply?: boolean;
}) {
  const t = useTranslations('social');
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const shownReplies = comment.replies?.length ?? 0;
  const totalReplies = comment.replyCount ?? shownReplies;
  const remainingReplies = totalReplies - shownReplies;

  async function submitReply() {
    const value = text.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onReply(comment.id, value);
      // Only clear the box / close it on success (FE audit M3) — on failure
      // the typed text would otherwise be silently lost, forcing a retype.
      if (ok) {
        setText('');
        setReplying(false);
      }
    } finally {
      setSubmitting(false);
    }
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
          <p
            className={
              comment.isDeleted
                ? 'mt-1 whitespace-pre-wrap font-body-md text-body-sm italic text-on-surface-variant'
                : 'mt-1 whitespace-pre-wrap font-body-md text-body-sm text-on-surface'
            }
          >
            {comment.isDeleted ? t('comments.deletedPlaceholder') : comment.content}
          </p>
          {!comment.isDeleted && (
            <div className="mt-1 flex gap-lg text-on-surface-variant">
              {!isReply && (
                <button onClick={() => setReplying((v) => !v)} className="flex items-center gap-xs text-label-caps hover:text-tertiary">
                  <Icon name="chat_bubble" className="text-[14px]" /> {t('comments.reply')}
                </button>
              )}
              {currentUserId === comment.userId && (
                <button onClick={() => onDelete(comment.id)} className="flex items-center gap-xs text-label-caps hover:text-error">
                  <Icon name="delete" className="text-[14px]" /> {t('comments.delete')}
                </button>
              )}
            </div>
          )}

          {replying && (
            <div className="mt-2 flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => isSubmitEnter(e, submitting) && submitReply()}
                placeholder={t('comments.replyPlaceholder')}
                disabled={submitting}
                className="h-9 flex-1 rounded-full px-3"
              />
              <Button size="sm" onClick={submitReply} disabled={submitting}>
                {t('comments.send')}
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
              {loadingMore
                ? t('comments.loadingMore')
                : t('comments.showMoreReplies', { count: remainingReplies })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentsSection({ postId }: { postId: number }) {
  const t = useTranslations('social');
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setLoading(true);
    socialApi
      .comments(postId)
      .then((page) => {
        setComments(page.data);
        setNextCursor(page.nextCursor);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [postId]);

  useCommentSocket(postId, setComments);

  async function loadMoreComments() {
    if (!nextCursor || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const page = await socialApi.comments(postId, nextCursor);
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.data.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setError(t('comments.loadError'));
    } finally {
      setLoadingMoreComments(false);
    }
  }

  async function addTopComment() {
    if (!user) {
      router.push(loginHref(pathname));
      return;
    }
    const value = text.trim();
    if (!value || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await socialApi.addComment(postId, value);
      setComments((prev) => upsertTopLevelComment(prev, created));
      setText('');
    } catch {
      setError(t('comments.errorAdd'));
    } finally {
      setSubmitting(false);
    }
  }

  async function reply(parentId: number, content: string): Promise<boolean> {
    if (!user) {
      router.push(loginHref(pathname));
      return false;
    }
    setError(null);
    try {
      const created = await socialApi.addComment(postId, content, parentId);
      setComments((prev) => upsertReply(prev, parentId, created));
      return true;
    } catch {
      setError(t('comments.errorReply'));
      return false;
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
      setComments((prev) => applyCommentDeletion(prev, id));
    } catch {
      setError(t('comments.errorDelete'));
    }
  }

  return (
    <section id="comments" className="space-y-4">
      <h2 className="border-b border-outline-variant pb-sm font-headline-md text-headline-md text-on-surface">
        {t('comments.title')}
      </h2>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => isSubmitEnter(e, submitting) && addTopComment()}
          placeholder={user ? t('comments.placeholder') : t('comments.loginToComment')}
          disabled={submitting}
          className="flex-1 rounded-full"
        />
        <Button onClick={addTopComment} disabled={submitting}>
          {t('comments.send')}
        </Button>
      </div>
      {error && <p className="text-body-sm text-error">{error}</p>}

      {loading ? (
        <p className="text-body-sm text-on-surface-variant">{t('comments.loading')}</p>
      ) : loadError ? (
        <p className="text-body-sm text-error">{t('comments.loadError')}</p>
      ) : comments.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">{t('comments.empty')}</p>
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
          {nextCursor && (
            <button
              onClick={() => void loadMoreComments()}
              disabled={loadingMoreComments}
              className="flex items-center gap-xs text-label-caps text-tertiary hover:underline disabled:opacity-60"
            >
              <Icon name="expand_more" className="text-[14px]" />
              {loadingMoreComments ? t('comments.loadingMore') : t('comments.loadMoreComments')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
