import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError, postsApi } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { CommentsSection } from '@/components/social/comments-section';
import { ReactionButton } from '@/components/social/reaction-button';
import { BookmarkButton } from '@/components/social/bookmark-button';
import { ShareButton } from '@/components/social/share-button';
import { FollowButton } from '@/components/social/follow-button';
import { ReportButton } from '@/components/moderation/report-button';
import { clickRedirectUrl, resolveAssetUrl, SITE_NAME } from '@/lib/constants';
import { formatNumber, formatPrice } from '@/lib/format';
import { TimeAgo } from '@/components/ui/time-ago';
import type { Post } from '@/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}): Promise<Metadata> {
  const { username, postId } = await params;
  const t = await getTranslations('post');
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return { title: t('defaultTitle') };
  try {
    const post = await postsApi.get(id, true);
    const description = post.content?.slice(0, 160) ?? post.title;
    // Relative asset URLs (local /uploads) are resolved to absolute against
    // metadataBase by Next; R2 URLs are already absolute. Both yield valid,
    // crawlable OG/Twitter image URLs.
    const image = post.images?.[0] ? resolveAssetUrl(post.images[0]) : undefined;
    const canonical = `/${username}/${post.id}`;
    return {
      title: `${post.title} - ${post.user.displayName}`,
      description,
      alternates: { canonical },
      openGraph: {
        title: post.title,
        description,
        url: canonical,
        type: 'article',
        images: image ? [image] : [],
        authors: [post.user.displayName],
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title: post.title,
        description,
        images: image ? [image] : [],
      },
    };
  } catch {
    return { title: t('defaultTitle') };
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}) {
  const { postId } = await params;
  const t = await getTranslations('post');

  // A non-numeric id (junk URL, crawler) would reach the backend as NaN and 400,
  // surfacing as a 500 error page. Treat it as not-found instead.
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let post: Post;
  try {
    post = await postsApi.get(id, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const related = await postsApi.trending(true).catch(() => [] as Post[]);
  const images = (post.images ?? []).map(resolveAssetUrl).filter(Boolean) as string[];
  const meta = post.productMeta ?? {};
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': 'Product', name: post.title },
    author: { '@type': 'Person', name: post.user.displayName },
    datePublished: post.createdAt,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
  // Escape `<` so user-controlled fields (e.g. post.title) can't break out of
  // the <script> tag via `</script>`. \u003c is valid inside JSON string values.
  const jsonLdSafe = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <div className="mx-auto flex w-full max-w-container-max gap-lg px-0 py-lg sm:px-4 lg:px-lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe }} />

      <div className="flex w-full flex-1 flex-col gap-lg lg:max-w-[700px]">
        {/* Review card */}
        <article className="flex flex-col gap-md border-y border-outline-variant bg-surface p-md shadow-sm sm:rounded-xl sm:border lg:p-lg">
          {/* Author header */}
          <header className="flex items-center justify-between">
            <Link href={`/${post.user.username}`} className="flex items-center gap-md">
              <Avatar src={post.user.avatarUrl} name={post.user.displayName} size={48} />
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{post.user.displayName}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  @{post.user.username} • <TimeAgo date={post.createdAt} />
                </p>
              </div>
            </Link>
            <FollowButton username={post.user.username} />
          </header>

          {/* Image gallery */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-sm overflow-hidden rounded-xl">
              <div className="relative col-span-2 h-80 bg-surface-container-low">
                <Image
                  src={images[0]}
                  alt={post.title}
                  fill
                  priority
                  sizes="(max-width:700px) 100vw, 700px"
                  className="object-cover"
                />
              </div>
              {images.slice(1, 3).map((src, i) => (
                <div key={i} className="relative h-40 bg-surface-container-low">
                  <Image
                    src={src}
                    alt={post.title}
                    fill
                    sizes="(max-width:700px) 50vw, 350px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-surface">{post.title}</h1>

          {/* Review text */}
          {post.content && (
            <div className="flex flex-col gap-sm whitespace-pre-wrap font-body-md text-body-md text-on-surface">
              {post.content}
            </div>
          )}

          {/* Embedded product card */}
          <div className="mt-sm flex flex-col items-center gap-md rounded-xl border border-outline-variant bg-surface-container-low p-md sm:flex-row">
            {images[0] && (
              <Image
                src={images[0]}
                alt=""
                width={96}
                height={96}
                className="h-24 w-24 rounded-lg bg-surface object-cover"
              />
            )}
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-headline-md text-body-md text-on-surface">{post.title}</h3>
              {meta.rating != null && (
                <div className="mt-xs flex items-center justify-center gap-xs sm:justify-start">
                  <Icon name="star" fill className="text-sm text-primary" />
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    ({Number(meta.rating).toFixed(1)})
                  </span>
                </div>
              )}
              {meta.salePrice != null ? (
                <p className="mt-sm font-price-lg text-price-lg text-primary">
                  {formatPrice(meta.salePrice)}
                  {meta.originalPrice && meta.originalPrice > meta.salePrice ? (
                    <span className="ml-2 font-normal text-body-sm text-on-surface-variant line-through">
                      {formatPrice(meta.originalPrice)}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {(meta.shopName || meta.soldCount) && (
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {meta.shopName ? meta.shopName : ''}
                  {meta.soldCount ? ` • ${t('sold', { count: formatNumber(meta.soldCount) })}` : ''}
                </p>
              )}
            </div>
            <a
              href={clickRedirectUrl(post.id)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex w-full items-center justify-center gap-xs rounded-lg bg-primary px-lg py-sm font-headline-md text-body-md text-on-primary transition-colors hover:bg-primary-container sm:w-auto"
            >
              <Icon name="shopping_cart" className="text-sm" />
              {t('buyNow')}
            </a>
          </div>

          {/* Interaction bar */}
          <div className="mt-sm flex items-center gap-lg border-t border-outline-variant pt-md text-on-surface-variant">
            <ReactionButton postId={post.id} initialCount={post.likeCount} variant="icon" />
            <Link href="#comments" className="flex items-center gap-xs transition-colors hover:text-tertiary">
              <Icon name="chat_bubble" className="text-lg" />
              <span className="font-body-sm text-body-sm">{formatNumber(post.commentCount)}</span>
            </Link>
            <span className="flex items-center gap-xs">
              <Icon name="ads_click" className="text-lg" />
              <span className="font-body-sm text-body-sm">{formatNumber(post.clickCount)}</span>
            </span>
            <BookmarkButton postId={post.id} />
            <ShareButton postId={post.id} username={post.user.username} initialCount={post.shareCount ?? 0} />
            <div className="ml-auto">
              <ReportButton targetType="POST" targetId={post.id} label={t('report')} />
            </div>
          </div>
        </article>

        {/* Comments */}
        <section className="border-y border-outline-variant bg-surface p-md shadow-sm sm:rounded-xl sm:border lg:p-lg">
          <CommentsSection postId={post.id} />
        </section>
      </div>

      {/* Related products */}
      <aside className="hidden w-80 shrink-0 lg:block">
        <div className="sticky top-6 rounded-xl border border-outline-variant bg-surface p-md shadow-sm">
          <h3 className="mb-md font-headline-md text-headline-md text-on-surface">{t('relatedTitle')}</h3>
          <div className="flex flex-col gap-md">
            {related
              .filter((p) => p.id !== post.id)
              .slice(0, 5)
              .map((p) => {
                const img = resolveAssetUrl(p.images?.[0]);
                return (
                  <Link key={p.id} href={`/${p.user.username}/${p.id}`} className="group flex items-center gap-md">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-lg border border-outline-variant bg-surface-container object-cover"
                      />
                    ) : (
                      <span className="h-16 w-16 rounded-lg border border-outline-variant bg-surface-container" />
                    )}
                    <div className="min-w-0">
                      <h4 className="font-headline-md text-body-sm text-on-surface line-clamp-2 transition-colors group-hover:text-primary">
                        {p.title}
                      </h4>
                      {p.productMeta?.salePrice != null && (
                        <p className="mt-xs font-price-lg text-body-sm text-on-surface">
                          {formatPrice(p.productMeta.salePrice)}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      </aside>
    </div>
  );
}
