import { categoriesApi, postsApi } from '@/lib/api';
import { CategoryPills } from '@/components/ui/category-pills';
import { CreatePostPrompt } from '@/components/post/create-post-prompt';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import { RightSidebar } from '@/components/layout/right-sidebar';
import type { Category, CursorPage, Post } from '@/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let categories: Category[] = [];
  let initial: CursorPage<Post> = { data: [], nextCursor: null };
  let trending: Post[] = [];
  let loadFailed = false;

  try {
    [categories, initial, trending] = await Promise.all([
      categoriesApi.list(true),
      postsApi.explore(0, undefined, true),
      postsApi.trending(true).catch(() => []),
    ]);
  } catch (err) {
    // Distinguish a fetch FAILURE (backend down / network) from a genuinely
    // empty feed — otherwise an error looks identical to "no posts yet".
    loadFailed = true;
    console.error('[HomePage] feed load failed:', err);
  }

  return (
    <div className="mx-auto flex w-full max-w-container-max">
      <section className="mx-auto w-full max-w-[640px] flex-1 px-0 py-md sm:px-4 lg:px-lg">
        <div className="px-4 sm:px-0">
          <CreatePostPrompt />
          {categories.length > 0 && (
            <div className="mb-md">
              <CategoryPills categories={categories} />
            </div>
          )}
        </div>
        {loadFailed ? (
          <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
            Không tải được bảng tin. Vui lòng thử lại sau.
          </div>
        ) : (
          <LoadMorePosts initial={initial} source={{ type: 'explore' }} variant="feed" />
        )}
      </section>
      <RightSidebar trending={trending} />
    </div>
  );
}
