import { PostCard } from './post-card';
import { PostFeedCard } from './post-feed-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Post } from '@/types';

// Grid layout — used on profile pages (square grid)
export function PostGrid({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
        Chưa có bài review nào.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

// Feed layout — single column social media style
export function PostFeed({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
        Chưa có bài review nào.
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-outline-variant border-x border-outline-variant sm:rounded-xl sm:border">
      {posts.map((post) => (
        <PostFeedCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export function PostGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PostFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y divide-outline-variant border-x border-outline-variant sm:rounded-xl sm:border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-container-lowest p-md">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <div className="ml-12 mt-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="aspect-[2/1] rounded-xl" />
            <div className="flex gap-6 pt-2">
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
