import Link from 'next/link';
import { Heart, MessageCircle, MousePointerClick } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { clickRedirectUrl, resolveAssetUrl } from '@/lib/constants';
import { formatNumber, formatPrice, timeAgo } from '@/lib/format';
import type { Post } from '@/types';

export function PostCard({ post }: { post: Post }) {
  const cover = resolveAssetUrl(post.images?.[0]);
  const meta = post.productMeta ?? {};
  const sale = meta.salePrice ?? null;
  const original = meta.originalPrice ?? null;
  const discount = meta.discountPercent ?? null;
  const detailHref = `/${post.user.username}/${post.id}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:shadow-md">
      <Link href={detailHref} className="relative block aspect-square overflow-hidden bg-slate-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={post.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">Không có ảnh</div>
        )}
        {discount ? (
          <span className="absolute left-2 top-2 rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            -{discount}%
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={`/${post.user.username}`}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-orange-600"
        >
          <Avatar src={post.user.avatarUrl} name={post.user.displayName} size={20} />
          <span className="truncate">@{post.user.username}</span>
          <span className="text-slate-300">·</span>
          <span>{timeAgo(post.createdAt)}</span>
        </Link>

        <Link href={detailHref} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-orange-600">
          {post.title}
        </Link>

        {sale ? (
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-red-600">{formatPrice(sale)}</span>
            {original && original > sale ? (
              <span className="text-xs text-slate-400 line-through">{formatPrice(original)}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Heart size={14} /> {formatNumber(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={14} /> {formatNumber(post.commentCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MousePointerClick size={14} /> {formatNumber(post.clickCount)}
          </span>
        </div>

        <a
          href={clickRedirectUrl(post.id)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-orange-500 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Mua ngay →
        </a>
      </div>
    </article>
  );
}
