import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/icon';
import { resolveAssetUrl } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { Post } from '@/types';

interface Props {
  trending?: Post[];
  className?: string;
}

// Desktop right rail: search + trending products + who-to-follow, matching the Stitch design.
export function RightSidebar({ trending = [], className }: Props) {
  const common = useTranslations('common');
  const products = trending.slice(0, 5);

  // derive a few suggested authors from the trending list (unique by username)
  const seen = new Set<string>();
  const suggestions = trending
    .filter((p) => {
      if (seen.has(p.user.username)) return false;
      seen.add(p.user.username);
      return true;
    })
    .slice(0, 3);

  return (
    <aside className={`sticky top-0 hidden max-h-screen w-80 shrink-0 flex-col gap-lg overflow-y-auto py-lg pr-lg xl:flex ${className ?? ''}`}>
      {/* Search */}
      <form action="/search" className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        <input
          name="q"
          placeholder={`${common('search')} shopee.review...`}
          className="w-full rounded-full border border-transparent bg-surface-container py-3 pl-12 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all focus:border-primary focus:bg-surface focus:ring-1 focus:ring-primary"
        />
      </form>

      {/* Trending products */}
      {products.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">{common('trendingProducts')}</h3>
          <div className="flex flex-col gap-4">
            {products.map((p) => {
              const img = resolveAssetUrl(p.images?.[0]);
              return (
                <Link key={p.id} href={`/${p.user.username}/${p.id}`} className="group flex items-center gap-3">
                  {img ? (
                    <Image
                      src={img}
                      alt=""
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded border border-outline-variant bg-white object-cover"
                    />
                  ) : (
                    <span className="h-12 w-12 rounded border border-outline-variant bg-surface-container" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="font-headline-md text-[13px] font-semibold text-on-surface line-clamp-1 transition-colors group-hover:text-primary">
                      {p.title}
                    </h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {common('likesCount', { count: formatNumber(p.likeCount) })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          <Link href="/search" className="mt-4 block font-body-sm text-body-sm text-primary hover:underline">
            {common('more')}
          </Link>
        </div>
      )}

      {/* Who to follow */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">{common('suggestedFollows')}</h3>
          <div className="flex flex-col gap-4">
            {suggestions.map((p) => (
              <div key={p.user.username} className="flex items-center justify-between gap-2">
                <Link href={`/${p.user.username}`} className="flex min-w-0 items-center gap-2">
                  {resolveAssetUrl(p.user.avatarUrl) ? (
                    <Image
                      src={resolveAssetUrl(p.user.avatarUrl) ?? ''}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container font-semibold text-on-surface-variant">
                      {p.user.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-headline-md text-[14px] font-semibold text-on-surface hover:underline">
                      {p.user.displayName}
                    </p>
                    <p className="truncate font-body-sm text-[12px] text-on-surface-variant">@{p.user.username}</p>
                  </div>
                </Link>
                <Link
                  href={`/${p.user.username}`}
                  className="shrink-0 rounded-full bg-inverse-surface px-4 py-1 font-headline-md text-[13px] font-bold text-inverse-on-surface transition-colors hover:opacity-90"
                >
                  {common('follow')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-2">
        <span className="font-body-sm text-body-sm text-outline">{common('terms')}</span>
        <span className="font-body-sm text-body-sm text-outline">{common('privacy')}</span>
        <span className="font-body-sm text-body-sm text-outline">© 2026 shopee.review</span>
      </div>
    </aside>
  );
}
