import { notFound } from 'next/navigation';
import { categoriesApi, postsApi } from '@/lib/api';
import { CategoryPills } from '@/components/ui/category-pills';
import { LoadMorePosts } from '@/components/post/load-more-posts';
import type { Category, CursorPage, Post } from '@/types';

export const revalidate = 30;

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
      initial = await postsApi.list({ categoryId: category.id, limit: 20 }, true);
    } catch {
      initial = { data: [], nextCursor: null };
    }
  }

  return (
    <div className="space-y-6">
      <CategoryPills categories={categories} activeSlug={slug} />
      <h1 className="text-xl font-bold">
        {category?.icon} {category?.name ?? slug}
      </h1>
      <LoadMorePosts initial={initial} source={{ type: 'posts', categoryId: category?.id }} />
    </div>
  );
}
