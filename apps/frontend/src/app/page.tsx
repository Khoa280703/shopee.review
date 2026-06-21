import Link from 'next/link';
import { categoriesApi, postsApi } from '@/lib/api';
import { CategoryPills } from '@/components/ui/category-pills';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import { PostCard } from '@/components/post/post-card';
import type { Category, CursorPage, Post } from '@/types';

export const revalidate = 30;

export default async function HomePage() {
  let categories: Category[] = [];
  let trending: Post[] = [];
  let initial: CursorPage<Post> = { data: [], nextCursor: null };

  try {
    [categories, trending, initial] = await Promise.all([
      categoriesApi.list(true),
      postsApi.trending(true),
      postsApi.list({ limit: 20 }, true),
    ]);
  } catch {
    // backend may be unavailable during build; render empty state
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
        <h1 className="text-2xl font-bold">Review thật, mua sắm thông minh</h1>
        <p className="mt-1 text-sm text-orange-50">
          Khám phá đánh giá sản phẩm Shopee từ cộng đồng — và kiếm thu nhập từ bài review của bạn.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50"
        >
          Đăng bài review →
        </Link>
      </section>

      {categories.length > 0 && <CategoryPills categories={categories} />}

      {trending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">🔥 Đang thịnh hành</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {trending.slice(0, 4).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mới nhất</h2>
        <LoadMorePosts initial={initial} source={{ type: 'posts' }} />
      </section>
    </div>
  );
}
