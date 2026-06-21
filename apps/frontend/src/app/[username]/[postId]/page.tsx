import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, postsApi } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { ImageCarousel } from '@/components/post/image-carousel';
import { CommentsSection } from '@/components/social/comments-section';
import { LikeButton } from '@/components/social/like-button';
import { clickRedirectUrl, resolveAssetUrl, SITE_NAME } from '@/lib/constants';
import { formatNumber, formatPrice, timeAgo } from '@/lib/format';
import type { Post } from '@/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  try {
    const post = await postsApi.get(Number(postId), true);
    return {
      title: `${post.title} - ${post.user.displayName}`,
      description: post.content?.slice(0, 160) ?? post.title,
      openGraph: {
        title: post.title,
        description: post.content?.slice(0, 160) ?? post.title,
        images: post.images?.[0] ? [resolveAssetUrl(post.images[0])!] : [],
        type: 'article',
      },
    };
  } catch {
    return { title: 'Bài review' };
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}) {
  const { postId } = await params;

  let post: Post;
  try {
    post = await postsApi.get(Number(postId), true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const meta = post.productMeta ?? {};
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': 'Product', name: post.title },
    author: { '@type': 'Person', name: post.user.displayName },
    datePublished: post.createdAt,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <ImageCarousel images={post.images ?? []} alt={post.title} />

      <Link href={`/${post.user.username}`} className="flex items-center gap-2">
        <Avatar src={post.user.avatarUrl} name={post.user.displayName} size={40} />
        <div>
          <p className="font-semibold">{post.user.displayName}</p>
          <p className="text-xs text-slate-400">@{post.user.username} · {timeAgo(post.createdAt)}</p>
        </div>
      </Link>

      <h1 className="text-2xl font-bold">{post.title}</h1>

      {meta.salePrice != null && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-red-600">{formatPrice(meta.salePrice)}</span>
          {meta.originalPrice && meta.originalPrice > meta.salePrice ? (
            <span className="text-slate-400 line-through">{formatPrice(meta.originalPrice)}</span>
          ) : null}
          {meta.discountPercent ? (
            <span className="text-sm font-semibold text-red-500">-{meta.discountPercent}%</span>
          ) : null}
        </div>
      )}

      {(meta.shopName || meta.soldCount) && (
        <p className="text-sm text-slate-500">
          {meta.shopName ? `Shop: ${meta.shopName}` : ''}
          {meta.soldCount ? ` · Đã bán ${formatNumber(meta.soldCount)}` : ''}
        </p>
      )}

      <a
        href={clickRedirectUrl(post.id)}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-orange-500 text-base font-semibold text-white hover:bg-orange-600"
      >
        🛒 Mua ngay trên Shopee →
      </a>

      {post.content && (
        <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
          {post.content}
        </div>
      )}

      <div className="flex items-center gap-3 border-y border-slate-200 py-3">
        <LikeButton postId={post.id} initialCount={post.likeCount} />
        <span className="text-sm text-slate-500">{formatNumber(post.commentCount)} bình luận</span>
      </div>

      <CommentsSection postId={post.id} />
    </article>
  );
}
