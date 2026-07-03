'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { FollowButton } from '@/components/social/follow-button';
import { BlockButton } from '@/components/moderation/block-button';
import { ReportButton } from '@/components/moderation/report-button';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatNumber } from '@/lib/format';
import type { UserProfile } from '@/types';

export function UserProfileHeader({ profile }: { profile: UserProfile }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(profile.isFollowing);
  const isSelf = user?.username === profile.username;

  useEffect(() => {
    if (user && !isSelf) {
      usersApi
        .profile(profile.username)
        .then((p) => setFollowing(p.isFollowing))
        .catch(() => undefined);
    }
  }, [user, isSelf, profile.username]);

  const action = isSelf ? (
    <Link
      href="/settings"
      className="rounded-full border border-outline-variant bg-surface-container px-lg py-2 text-center font-headline-md text-headline-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
    >
      Chỉnh sửa
    </Link>
  ) : (
    <div className="flex items-center gap-2">
      <FollowButton username={profile.username} initialFollowing={following} />
      <BlockButton username={profile.username} />
      <ReportButton targetType="USER" targetId={profile.id} />
    </div>
  );

  return (
    <>
      {/* Mobile compact header (no cover) */}
      <section className="bg-surface px-4 pb-md pt-lg sm:rounded-xl sm:border sm:border-outline-variant lg:hidden">
        <div className="mb-md flex items-center justify-between">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size={96}
            className="h-24 w-24 border-4 border-surface shadow-sm"
          />
          <div className="flex gap-lg pr-2 text-center">
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md font-bold text-on-surface">
                {formatNumber(profile.totalPosts)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Bài</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md font-bold text-on-surface">
                {formatNumber(profile.followersCount)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Theo dõi</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md font-bold text-on-surface">
                {formatNumber(profile.followingCount)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Đang theo</span>
            </div>
          </div>
        </div>
        <div className="mb-md">
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">{profile.displayName}</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">@{profile.username}</p>
          {profile.bio && <p className="mt-sm font-body-md text-body-md text-on-surface">{profile.bio}</p>}
        </div>
        <div className="grid grid-cols-1">{action}</div>
      </section>

      {/* Desktop header (cover + overlapping avatar) */}
      <div className="hidden overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card lg:block">
        <div className="relative h-48 w-full bg-gradient-to-br from-primary-fixed via-secondary-container to-primary-container">
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
        <div className="relative flex flex-col gap-md px-lg pb-lg pt-16">
          <div className="absolute -top-16 left-lg rounded-full bg-surface-container-lowest p-1 shadow-sm">
            <Avatar src={profile.avatarUrl} name={profile.displayName} size={112} className="h-28 w-28" />
          </div>

          <div className="flex w-full items-start justify-between">
            <div>
              <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-surface">{profile.displayName}</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">@{profile.username}</p>
            </div>
            {action}
          </div>

          {profile.bio && (
            <p className="max-w-2xl font-body-md text-body-md leading-relaxed text-on-surface">{profile.bio}</p>
          )}

          <div className="flex gap-lg pt-sm">
            <span className="flex items-baseline gap-xs">
              <span className="font-headline-md text-headline-md text-on-surface">
                {formatNumber(profile.totalPosts)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Bài review</span>
            </span>
            <span className="flex items-baseline gap-xs">
              <span className="font-headline-md text-headline-md text-on-surface">
                {formatNumber(profile.followersCount)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Người theo dõi</span>
            </span>
            <span className="flex items-baseline gap-xs">
              <span className="font-headline-md text-headline-md text-on-surface">
                {formatNumber(profile.followingCount)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Đang theo dõi</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
