'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { statsApi, usersApi } from '@/lib/api';
import { ClickChart } from '@/components/analytics/click-chart';
import { useAuth } from '@/lib/auth-context';
import { formatNumber } from '@/lib/format';
import type { ClickChart as ClickChartData, PostStat, UserStats } from '@/types';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [postStats, setPostStats] = useState<PostStat[]>([]);
  const [chart, setChart] = useState<ClickChartData | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
      return;
    }
    if (user) {
      usersApi.stats().then(setStats).catch(() => undefined);
      statsApi.posts().then(setPostStats).catch(() => undefined);
      statsApi.chart('7d').then(setChart).catch(() => undefined);
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="py-16 text-center text-on-surface-variant">Đang tải...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">Thống kê</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Bài đăng" value={stats?.totalPosts ?? 0} />
        <StatCard label="Lượt click" value={stats?.totalClicks ?? 0} />
        <StatCard label="Người theo dõi" value={stats?.followersCount ?? 0} />
      </div>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <h2 className="mb-4 font-headline-md text-headline-md font-semibold text-on-surface">Clicks 7 ngày qua</h2>
        {chart ? <ClickChart chart={chart} /> : <p className="text-body-sm text-on-surface-variant">Đang tải...</p>}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <h2 className="mb-4 font-headline-md text-headline-md font-semibold text-on-surface">Thống kê theo bài</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                <th className="py-2 pr-4">Tiêu đề</th>
                <th className="py-2 px-2 text-right">Clicks</th>
                <th className="py-2 px-2 text-right">Likes</th>
                <th className="py-2 pl-2 text-right">Bình luận</th>
              </tr>
            </thead>
            <tbody>
              {postStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-on-surface-variant">
                    Chưa có bài viết nào.
                  </td>
                </tr>
              ) : (
                postStats.map((p) => (
                  <tr key={p.id} className="border-b border-outline-variant last:border-0">
                    <td className="max-w-xs truncate py-2 pr-4 text-on-surface">{p.title}</td>
                    <td className="py-2 px-2 text-right text-on-surface">{formatNumber(p.clickCount)}</td>
                    <td className="py-2 px-2 text-right text-on-surface">{formatNumber(p.likeCount)}</td>
                    <td className="py-2 pl-2 text-right text-on-surface">{formatNumber(p.commentCount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-center shadow-sm">
      <div className="font-display-lg-mobile text-display-lg-mobile font-bold text-primary">{formatNumber(value)}</div>
      <div className="text-label-caps text-on-surface-variant">{label}</div>
    </div>
  );
}
