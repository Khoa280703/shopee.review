import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { buttonClasses } from '@/components/ui/button-classes';
import { LikeButton } from '@/components/social/like-button';
import { PostActionContent, postActionWrapperClass } from './post-action-button';
import { clickRedirectUrl, resolveAssetUrl } from '@/lib/constants';
import { formatPrice, timeAgo } from '@/lib/format';
import type { Post } from '@/types';

export function PostFeedCard({ post }: { post: Post }) {
  const images = (post.images ?? []).map(resolveAssetUrl).filter(Boolean) as string[];
  const meta = post.productMeta ?? {};
  const sale = meta.salePrice ?? null;
  const original = meta.originalPrice ?? null;
  const discount = meta.discountPercent ?? null;
  const detailHref = `/${post.user.username}/${post.id}`;

  return (
    <article className="bg-surface-container-lowest p-md">
      {/* Author row */}
      <div className="mb-2 flex items-center gap-sm">
        <Link href={`/${post.user.username}`} className="shrink-0">
          <Avatar src={post.user.avatarUrl} name={post.user.displayName} size={40} />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <Link
              href={`/${post.user.username}`}
              className="truncate font-headline-md text-body-sm font-semibold leading-tight text-on-surface hover:underline"
            >
              {post.user.displayName}
            </Link>
            <Icon name="verified" fill className="text-[16px] text-tertiary" />
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
              <span className="hidden sm:inline">@{post.user.username} • </span>
              {timeAgo(post.createdAt)}
            </span>
          </div>
        </div>
        {discount ? (
          <span className="ml-auto shrink-0 rounded-full bg-primary-fixed px-2.5 py-0.5 text-label-caps font-bold text-on-primary-fixed-variant">
            -{discount}%
          </span>
        ) : null}
      </div>

      <div className="lg:ml-12">
        {/* Title + excerpt */}
        <Link href={detailHref} className="block">
          <h2 className="mb-1 font-headline-md text-body-md font-semibold leading-snug text-on-surface line-clamp-2">
            {post.title}
          </h2>
          {post.content ? (
            <p className="mb-3 whitespace-pre-wrap font-body-md text-body-md text-on-surface-variant line-clamp-3">
              {post.content}
            </p>
          ) : null}
        </Link>

        {/* Category chip */}
        {post.category ? (
          <div className="mb-3 flex gap-2">
            <Link
              href={`/category/${post.category.slug}`}
              className="rounded-full bg-surface-container-high px-3 py-1 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest"
            >
              {post.category.name}
            </Link>
          </div>
        ) : null}

        {/* Image grid */}
        {images.length > 0 ? (
          <Link href={detailHref} className="mb-3 block overflow-hidden rounded-xl border border-outline-variant">
            <div className="grid grid-cols-2 gap-1">
              {images.slice(0, 3).map((src, i) => (
                <div
                  key={i}
                  className={
                    i === 2 || (images.length === 1 && i === 0)
                      ? 'relative col-span-2 h-40'
                      : 'relative h-40'
                  }
                >
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
          </Link>
        ) : null}

        {/* Product preview card */}
        {sale !== null || meta.shopName ? (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-bright p-3">
            {images[0] ? (
              <Image
                src={images[0]}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded bg-white object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h4 className="font-headline-md text-body-sm font-semibold text-on-surface line-clamp-1">{post.title}</h4>
              {sale !== null ? (
                <p className="mt-1 font-price-lg text-body-md text-primary">
                  {formatPrice(sale)}
                  {original !== null && original > sale ? (
                    <span className="ml-1 font-normal text-label-caps text-on-surface-variant line-through">
                      {formatPrice(original)}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 truncate font-body-sm text-body-sm text-on-surface-variant">{meta.shopName}</p>
              )}
            </div>
            <a
              href={clickRedirectUrl(post.id)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonClasses({ className: 'h-9 shrink-0 gap-1 rounded-lg shadow-sm' })}
            >
              <Icon name="shopping_bag" className="text-[16px]" />
              Mua ngay
            </a>
          </div>
        ) : null}

        {/* Action bar */}
        <div className="mt-2 flex max-w-md items-center justify-between pr-8 text-on-surface-variant">
          <Link href={`${detailHref}#comments`} className={postActionWrapperClass('tertiary')}>
            <PostActionContent icon="chat_bubble" count={post.commentCount} color="tertiary" />
          </Link>
          <a
            href={clickRedirectUrl(post.id)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={postActionWrapperClass('secondary')}
          >
            <PostActionContent icon="open_in_new" count={post.clickCount} color="secondary" />
          </a>
          <LikeButton postId={post.id} initialCount={post.likeCount} variant="icon" />
          <button className={postActionWrapperClass('primary')}>
            <PostActionContent icon="share" color="primary" />
          </button>
        </div>
      </div>
    </article>
  );
}
