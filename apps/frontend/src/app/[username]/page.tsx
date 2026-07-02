import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { usersApi } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import { UserProfileHeader } from '@/components/user/user-profile-header';
import { ProfileTabs, type ProfileTab } from '@/components/user/profile-tabs';
import type { CursorPage, Post, UserProfile } from '@/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const profile = await usersApi.profile(username, true);
    return {
      title: `${profile.displayName} (@${profile.username})`,
      description: profile.bio ?? `Các bài review của ${profile.displayName} trên shopee.review`,
    };
  } catch {
    return { title: username };
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;
  const activeTab: ProfileTab = tab === 'products' ? 'products' : 'posts';

  let profile: UserProfile;
  try {
    profile = await usersApi.profile(username, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  let initial: CursorPage<Post> = { data: [], nextCursor: null };
  if (activeTab === 'posts') {
    try {
      initial = await usersApi.posts(username, undefined, true);
    } catch {
      initial = { data: [], nextCursor: null };
    }
  } else if (activeTab === 'products') {
    try {
      initial = await usersApi.posts(username, undefined, true, true);
    } catch {
      initial = { data: [], nextCursor: null };
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-lg px-0 py-lg sm:px-4">
      <UserProfileHeader profile={profile} />

      <Suspense>
        <ProfileTabs active={activeTab} />
      </Suspense>

      <div className="px-4 sm:px-0">
        {activeTab === 'posts' && (
          <LoadMorePosts initial={initial} source={{ type: 'user', username }} variant="feed" />
        )}
        {activeTab === 'products' && (
          initial.data.length === 0 ? (
            <div className="py-16 text-center font-body-md text-body-md text-on-surface-variant">
              Chưa có sản phẩm nào được review.
            </div>
          ) : (
            <LoadMorePosts
              initial={initial}
              source={{ type: 'user', username, hasProduct: true }}
              variant="grid"
            />
          )
        )}
      </div>
    </div>
  );
}
