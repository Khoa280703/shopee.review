'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { FollowButton } from '@/components/social/follow-button';
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

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-start">
      <Avatar src={profile.avatarUrl} name={profile.displayName} size={88} />
      <div className="flex-1 text-center sm:text-left">
        <h1 className="text-xl font-bold">{profile.displayName}</h1>
        <p className="text-sm text-slate-400">@{profile.username}</p>
        {profile.bio && <p className="mt-2 text-sm text-slate-600">{profile.bio}</p>}
        <div className="mt-3 flex justify-center gap-4 text-sm sm:justify-start">
          <span>
            <strong>{formatNumber(profile.totalPosts)}</strong> bài
          </span>
          <span>
            <strong>{formatNumber(profile.followersCount)}</strong> người theo dõi
          </span>
          <span>
            <strong>{formatNumber(profile.followingCount)}</strong> đang theo dõi
          </span>
        </div>
      </div>
      <div>
        {isSelf ? (
          <Link
            href="/settings"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50"
          >
            Chỉnh sửa
          </Link>
        ) : (
          <FollowButton username={profile.username} initialFollowing={following} />
        )}
      </div>
    </div>
  );
}
