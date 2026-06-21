import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { usersApi } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import { UserProfileHeader } from '@/components/user/user-profile-header';
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
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let profile: UserProfile;
  try {
    profile = await usersApi.profile(username, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  let initial: CursorPage<Post> = { data: [], nextCursor: null };
  try {
    initial = await usersApi.posts(username, undefined, true);
  } catch {
    initial = { data: [], nextCursor: null };
  }

  return (
    <div className="space-y-6 py-2">
      <UserProfileHeader profile={profile} />
      <LoadMorePosts initial={initial} source={{ type: 'user', username }} />
    </div>
  );
}
