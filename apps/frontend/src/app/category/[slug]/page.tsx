import { notFound } from 'next/navigation';
import { categoriesApi, postsApi } from '@/lib/api';
import { CategoryPills } from '@/components/ui/category-pills';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import type { Category, CursorPage, Post } from '@/types';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let categories: Category[] = [];
  try {
    categories = await categoriesApi.list(true);
  } catch {
    categories = [];
  }
  const category = categories.find((c) => c.slug === slug);
  if (categories.length > 0 && !category) notFound();

  let initial: CursorPage<Post> = { data: [], nextCursor: null };
  if (category) {
    try {
      initial = await postsApi.explore(0, category.id, true);
    } catch {
      initial = { data: [], nextCursor: null };
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-0 py-md sm:px-4 lg:px-lg">
      <div className="px-4 sm:px-0">
        <div className="mb-4">
          <CategoryPills categories={categories} activeSlug={slug} />
        </div>
        <h1 className="mb-4 font-headline-md text-headline-md font-bold text-on-surface">
          {category?.icon} {category?.name ?? slug}
        </h1>
      </div>
      <LoadMorePosts initial={initial} source={{ type: 'explore', categoryId: category?.id }} variant="feed" />
    </div>
  );
}
