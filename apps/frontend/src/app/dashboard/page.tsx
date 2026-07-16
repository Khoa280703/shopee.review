'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { statsApi, usersApi } from '@/lib/api';
import { ClickChart } from '@/components/analytics/click-chart';
import { useAuth } from '@/lib/auth-context';
import { formatNumber } from '@/lib/format';
import type { ClickChart as ClickChartData, PostStat, UserStats } from '@/types';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const nav = useTranslations('nav');
  const common = useTranslations('common');
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
    return <div className="py-16 text-center text-on-surface-variant">{common('loading')}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">{nav('dashboard')}</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('posts')} value={stats?.totalPosts ?? 0} />
        <StatCard label={t('clicks')} value={stats?.totalClicks ?? 0} />
        <StatCard label={t('followers')} value={stats?.followersCount ?? 0} />
      </div>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <h2 className="mb-4 font-headline-md text-headline-md font-semibold text-on-surface">{t('clicksLast7Days')}</h2>
        {chart ? <ClickChart chart={chart} /> : <p className="text-body-sm text-on-surface-variant">{common('loading')}</p>}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <h2 className="mb-4 font-headline-md text-headline-md font-semibold text-on-surface">{t('postStats')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                <th className="py-2 pr-4">{t('colTitle')}</th>
                <th className="py-2 px-2 text-right">{t('colClicks')}</th>
                <th className="py-2 px-2 text-right">{t('colLikes')}</th>
                <th className="py-2 pl-2 text-right">{t('colComments')}</th>
              </tr>
            </thead>
            <tbody>
              {postStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-on-surface-variant">
                    {t('noPosts')}
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
