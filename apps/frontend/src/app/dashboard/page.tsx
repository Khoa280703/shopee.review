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
    return <div className="py-16 text-center text-slate-500">Đang tải...</div>;
  }

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-2xl font-bold">📊 Thống kê</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Bài đăng" value={stats?.totalPosts ?? 0} />
        <StatCard label="Lượt click" value={stats?.totalClicks ?? 0} />
        <StatCard label="Người theo dõi" value={stats?.followersCount ?? 0} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold">📈 Clicks 7 ngày qua</h2>
        {chart ? <ClickChart chart={chart} /> : <p className="text-sm text-slate-400">Đang tải...</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold">📝 Thống kê theo bài</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">Tiêu đề</th>
                <th className="py-2 px-2 text-right">Clicks</th>
                <th className="py-2 px-2 text-right">Likes</th>
                <th className="py-2 pl-2 text-right">Bình luận</th>
              </tr>
            </thead>
            <tbody>
              {postStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Chưa có bài viết nào.
                  </td>
                </tr>
              ) : (
                postStats.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="max-w-xs truncate py-2 pr-4">{p.title}</td>
                    <td className="py-2 px-2 text-right">{formatNumber(p.clickCount)}</td>
                    <td className="py-2 px-2 text-right">{formatNumber(p.likeCount)}</td>
                    <td className="py-2 pl-2 text-right">{formatNumber(p.commentCount)}</td>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      <div className="text-2xl font-bold text-orange-500">{formatNumber(value)}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
