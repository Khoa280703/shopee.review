'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, type AdminReport } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { TimeAgo } from '@/components/ui/time-ago';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.listReports('PENDING').then(setReports).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user?.isAdmin) {
      router.replace('/');
      return;
    }
    load();
  }, [user, loading, router, load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user?.isAdmin) {
    return <div className="py-16 text-center text-on-surface-variant">Đang tải...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-lg">
      <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">
        Quản trị · Báo cáo chờ xử lý
      </h1>
      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
          Không có báo cáo nào.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-outline-variant bg-surface p-md">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-body-sm text-on-surface">
                <span className="rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error">{r.reason}</span>
                <span className="font-semibold">{r.targetType} #{r.targetId}</span>
                <span className="text-on-surface-variant">bởi @{r.reporter.username}</span>
                <span className="text-outline">· <TimeAgo date={r.createdAt} /></span>
              </div>
              {r.detail && <p className="mb-3 text-body-sm text-on-surface-variant">“{r.detail}”</p>}
              <div className="flex flex-wrap gap-2">
                {r.targetType === 'POST' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.deletePost(r.targetId))}>
                    Xoá bài
                  </Button>
                )}
                {r.targetType === 'COMMENT' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.deleteComment(r.targetId))}>
                    Xoá bình luận
                  </Button>
                )}
                {r.targetType === 'USER' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.banUser(r.targetId))}>
                    Khoá tài khoản
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => act(() => adminApi.resolveReport(r.id, 'RESOLVED'))}>
                  Đã xử lý
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => adminApi.resolveReport(r.id, 'DISMISSED'))}>
                  Bỏ qua
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
