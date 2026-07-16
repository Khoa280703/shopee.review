'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { buttonClasses } from '@/components/ui/button-classes';
import { clickRedirectUrl, resolveAssetUrl } from '@/lib/constants';
import { formatNumber, formatPrice } from '@/lib/format';
import { TimeAgo } from '@/components/ui/time-ago';
import type { Post } from '@/types';

export function PostCard({ post }: { post: Post }) {
  const t = useTranslations('post');
  const cover = resolveAssetUrl(post.images?.[0]);
  const meta = post.productMeta ?? {};
  const sale = meta.salePrice ?? null;
  const original = meta.originalPrice ?? null;
  const discount = meta.discountPercent ?? null;
  const detailHref = `/${post.user.username}/${post.id}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card transition hover:shadow-card-hover">
      <Link href={detailHref} className="relative block aspect-square overflow-hidden bg-surface-container">
        {cover ? (
          <Image
            src={cover}
            alt={post.title}
            fill
            sizes="(max-width:700px) 50vw, 350px"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-on-surface-variant">{t('noImage')}</div>
        )}
        {discount ? (
          <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-label-caps font-bold text-on-primary">
            -{discount}%
          </span>
        ) : null}
        {meta.rating != null ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-label-caps font-semibold text-white">
            <Icon name="star" fill className="text-[14px] text-rating" />
            {Number(meta.rating).toFixed(1)}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={`/${post.user.username}`}
          className="flex items-center gap-2 text-label-caps text-on-surface-variant hover:text-on-surface"
        >
          <Avatar src={post.user.avatarUrl} name={post.user.displayName} size={20} />
          <span className="truncate">@{post.user.username}</span>
          <span className="text-outline-variant">·</span>
          <TimeAgo date={post.createdAt} />
        </Link>

        <Link
          href={detailHref}
          className="line-clamp-2 font-headline-md text-body-sm font-semibold text-on-surface hover:text-primary"
        >
          {post.title}
        </Link>

        {sale ? (
          <div className="flex items-baseline gap-2">
            <span className="font-price-lg text-body-md text-primary">{formatPrice(sale)}</span>
            {original && original > sale ? (
              <span className="text-label-caps text-on-surface-variant line-through">{formatPrice(original)}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center gap-3 pt-1 text-label-caps text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <Icon name="favorite" className="text-[14px]" /> {formatNumber(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="chat_bubble" className="text-[14px]" /> {formatNumber(post.commentCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="ads_click" className="text-[14px]" /> {formatNumber(post.clickCount)}
          </span>
        </div>

        {sale ? (
          <a
            href={clickRedirectUrl(post.id)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={buttonClasses({ className: 'mt-1 h-9 gap-1 rounded-lg shadow-sm' })}
          >
            <Icon name="shopping_bag" className="text-[16px]" />
            {t('buyNow')}
          </a>
        ) : null}
      </div>
    </article>
  );
}
