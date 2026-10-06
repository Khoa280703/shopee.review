'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  adminApi,
  type AdminReport,
  type DeletedComment,
  type DeletedPost,
  type LockedUser,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/providers/toast-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeAgo } from '@/components/ui/time-ago';
import { cn } from '@/lib/cn';

type Tab = 'reports' | 'deleted' | 'locked';

function ReportsTab({ busy, setBusy }: { busy: boolean; setBusy: (v: boolean) => void }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const toast = useToast();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    adminApi
      .listReports('PENDING')
      .then(setReports)
      .catch(() => toast(common('retry'), 'error'));
  }, [toast, common]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, confirmMessage?: string) {
    // Native confirm is intentional (M4): admin-only internal tool, no
    // existing modal/dialog component in the design system, and this is
    // exactly what it's for — a synchronous yes/no gate before an
    // irreversible-feeling action (delete/suspend/ban).
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await fn();
      load();
    } catch {
      toast(common('retry'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
        {t('noReports')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((r) => {
        const reason = reasons[r.id] ?? '';
        const setReason = (v: string) => setReasons((prev) => ({ ...prev, [r.id]: v }));
        return (
          <div key={r.id} className="rounded-xl border border-outline-variant bg-surface p-md">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-body-sm text-on-surface">
              <span className="rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error">{r.reason}</span>
              <span className="font-semibold">{r.targetType} #{r.targetId}</span>
              <span className="text-on-surface-variant">{t('reportedBy', { username: r.reporter.username })}</span>
              <span className="text-outline">· <TimeAgo date={r.createdAt} /></span>
            </div>
            {r.detail && <p className="mb-3 text-body-sm text-on-surface-variant">&quot;{r.detail}&quot;</p>}
            {(r.targetType === 'POST' || r.targetType === 'COMMENT') && (
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('reasonPlaceholder')}
                className="mb-2 h-9"
              />
            )}
            <div className="flex flex-wrap gap-2">
              {r.targetType === 'POST' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => adminApi.deletePost(r.targetId, reason || undefined), t('confirmDeletePost'))}
                >
                  {t('deletePost')}
                </Button>
              )}
              {r.targetType === 'COMMENT' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => adminApi.deleteComment(r.targetId, reason || undefined), t('confirmDeleteComment'))}
                >
                  {t('deleteComment')}
                </Button>
              )}
              {r.targetType === 'USER' && (
                <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.suspendUser(r.targetId), t('confirmSuspendUser'))}>
                    {t('suspendUser')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.banUser(r.targetId), t('confirmBanUser'))}>
                    {t('banUser')}
                  </Button>
                </>
              )}
              <Button size="sm" disabled={busy} onClick={() => act(() => adminApi.resolveReport(r.id, 'RESOLVED'))}>
                {t('resolve')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.resolveReport(r.id, 'DISMISSED'))}>
                {t('dismiss')}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function actorLabel(
  by: { username: string; displayName: string } | null,
  t: ReturnType<typeof useTranslations>,
): string {
  return t('deletedBy', { actor: by ? `@${by.username}` : t('deletedBySelf') });
}

function DeletedTab({ busy, setBusy }: { busy: boolean; setBusy: (v: boolean) => void }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const toast = useToast();
  const [posts, setPosts] = useState<DeletedPost[]>([]);
  const [postsCursor, setPostsCursor] = useState<number | null>(null);
  const [comments, setComments] = useState<DeletedComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .listDeletedPosts()
      .then((p) => {
        setPosts(p.data);
        setPostsCursor(p.nextCursor);
      })
      .catch(() => toast(common('retry'), 'error'));
    adminApi
      .listDeletedComments()
      .then((p) => {
        setComments(p.data);
        setCommentsCursor(p.nextCursor);
      })
      .catch(() => toast(common('retry'), 'error'));
  }, [toast, common]);

  useEffect(() => {
    load();
  }, [load]);

  async function restorePost(id: number) {
    setBusy(true);
    try {
      await adminApi.restorePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast(common('retry'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function restoreComment(id: number) {
    setBusy(true);
    try {
      await adminApi.restoreComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast(common('retry'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadMorePosts() {
    if (!postsCursor) return;
    const page = await adminApi.listDeletedPosts(postsCursor);
    setPosts((prev) => [...prev, ...page.data]);
    setPostsCursor(page.nextCursor);
  }

  async function loadMoreComments() {
    if (!commentsCursor) return;
    const page = await adminApi.listDeletedComments(commentsCursor);
    setComments((prev) => [...prev, ...page.data]);
    setCommentsCursor(page.nextCursor);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 font-headline-md text-headline-md font-semibold text-on-surface">
          {t('deletedPostsTitle')}
        </h2>
        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant py-10 text-center text-on-surface-variant">
            {t('noDeletedPosts')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-outline-variant bg-surface p-md">
                <p className="font-headline-md text-body-sm font-semibold text-on-surface">
                  #{p.id} {p.title}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  @{p.user.username} · <TimeAgo date={p.deletedAt} /> · {actorLabel(p.deletedBy, t)}
                </p>
                {p.deleteReason && (
                  <p className="mt-1 text-body-sm text-on-surface-variant">{t('deletedReason', { reason: p.deleteReason })}</p>
                )}
                <Button size="sm" variant="outline" disabled={busy} className="mt-2" onClick={() => restorePost(p.id)}>
                  {t('restore')}
                </Button>
              </div>
            ))}
            {postsCursor && (
              <button
                onClick={() => void loadMorePosts()}
                className="rounded-full border border-outline-variant py-sm text-label-caps text-on-surface hover:bg-surface-container"
              >
                {common('more')}
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-headline-md text-headline-md font-semibold text-on-surface">
          {t('deletedCommentsTitle')}
        </h2>
        {comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant py-10 text-center text-on-surface-variant">
            {t('noDeletedComments')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-outline-variant bg-surface p-md">
                <p className="line-clamp-2 text-body-sm text-on-surface">{c.content}</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  @{c.user.username} · post #{c.postId} · <TimeAgo date={c.deletedAt} /> · {actorLabel(c.deletedBy, t)}
                </p>
                {c.deleteReason && (
                  <p className="mt-1 text-body-sm text-on-surface-variant">{t('deletedReason', { reason: c.deleteReason })}</p>
                )}
                <Button size="sm" variant="outline" disabled={busy} className="mt-2" onClick={() => restoreComment(c.id)}>
                  {t('restore')}
                </Button>
              </div>
            ))}
            {commentsCursor && (
              <button
                onClick={() => void loadMoreComments()}
                className="rounded-full border border-outline-variant py-sm text-label-caps text-on-surface hover:bg-surface-container"
              >
                {common('more')}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function LockedTab({ busy, setBusy }: { busy: boolean; setBusy: (v: boolean) => void }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const toast = useToast();
  const [users, setUsers] = useState<LockedUser[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .listLockedUsers()
      .then((p) => {
        setUsers(p.data);
        setCursor(p.nextCursor);
      })
      .catch(() => toast(common('retry'), 'error'));
  }, [toast, common]);

  useEffect(() => {
    load();
  }, [load]);

  async function unlock(user: LockedUser, confirmMessage: string, fn: () => Promise<unknown>) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await fn();
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      toast(common('retry'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    const page = await adminApi.listLockedUsers(cursor);
    setUsers((prev) => [...prev, ...page.data]);
    setCursor(page.nextCursor);
  }

  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
        {t('noLockedUsers')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface p-md">
          <Avatar src={u.avatarUrl} name={u.displayName} size={40} />
          <div className="flex-1">
            <p className="font-headline-md text-body-sm font-semibold text-on-surface">
              {u.displayName} <span className="font-normal text-on-surface-variant">@{u.username}</span>
            </p>
            <p className="text-body-sm text-on-surface-variant">
              {u.bannedAt && (
                <>
                  <span className="rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error">{t('lockedBanned')}</span>{' '}
                  {t('lockedSince', { date: new Date(u.bannedAt).toLocaleDateString() })}
                </>
              )}
              {!u.bannedAt && u.suspendedAt && (
                <>
                  <span className="rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error">{t('lockedSuspended')}</span>{' '}
                  {t('lockedSince', { date: new Date(u.suspendedAt).toLocaleDateString() })}
                </>
              )}
            </p>
          </div>
          {u.bannedAt && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => unlock(u, t('confirmUnbanUser'), () => adminApi.unbanUser(u.id))}
            >
              {t('unbanUser')}
            </Button>
          )}
          {!u.bannedAt && u.suspendedAt && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => unlock(u, t('confirmUnsuspendUser'), () => adminApi.unsuspendUser(u.id))}
            >
              {t('unsuspendUser')}
            </Button>
          )}
        </div>
      ))}
      {cursor && (
        <button
          onClick={() => void loadMore()}
          className="rounded-full border border-outline-variant py-sm text-label-caps text-on-surface hover:bg-surface-container"
        >
          {common('more')}
        </button>
      )}
    </div>
  );
}

export default function AdminPage() {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('reports');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user?.isAdmin) router.replace('/');
  }, [user, loading, router]);

  if (loading || !user?.isAdmin) {
    return <div className="py-16 text-center text-on-surface-variant">{common('loading')}</div>;
  }

  const tabClass = (active: boolean) =>
    cn(
      'border-b-2 px-4 py-2 text-body-sm font-semibold transition-colors',
      active ? 'border-primary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface',
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-lg">
      <h1 className="mb-4 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">
        {t('title')}
      </h1>
      <div className="mb-6 flex border-b border-outline-variant">
        <button type="button" onClick={() => setTab('reports')} className={tabClass(tab === 'reports')}>
          {t('tabReports')}
        </button>
        <button type="button" onClick={() => setTab('deleted')} className={tabClass(tab === 'deleted')}>
          {t('tabDeleted')}
        </button>
        <button type="button" onClick={() => setTab('locked')} className={tabClass(tab === 'locked')}>
          {t('tabLocked')}
        </button>
      </div>
      {tab === 'reports' && <ReportsTab busy={busy} setBusy={setBusy} />}
      {tab === 'deleted' && <DeletedTab busy={busy} setBusy={setBusy} />}
      {tab === 'locked' && <LockedTab busy={busy} setBusy={setBusy} />}
    </div>
  );
}
