# Phase 2 — Frontend `<img>` → Next `<Image>` Migration

## Context Links
- `apps/frontend/next.config.ts` (remotePatterns already configured)
- 7 files with raw `<img>` (grep `no-img-element`):
  - `src/components/post/post-feed-card.tsx` (image grid L77-90, product thumb L100)
  - `src/components/post/post-card.tsx`
  - `src/components/post/image-carousel.tsx`
  - `src/components/ui/avatar.tsx`
  - `src/components/forms/image-uploader.tsx`
  - `src/components/layout/right-sidebar.tsx`
  - `src/app/[username]/[postId]/page.tsx` (gallery L90-95, product thumb L114, related L188)

## Overview
- **Priority:** P1
- **Status:** completed
- Replace raw `<img>` with `next/image` `<Image>` for lazy loading, WebP/AVIF, responsive srcset. Remove `// eslint-disable-next-line @next/next/no-img-element` comments as each is fixed.

## Key Insights
- next.config remotePatterns ALREADY covers R2 (`**.r2.dev`, `**.r2.cloudflarestorage.com`), Shopee CDN, and local `/uploads/**`. No config change needed unless a new host appears — verify `R2_PUBLIC_URL` host matches a pattern; if it's a custom domain, add it.
- All current usages have FIXED pixel sizes via Tailwind (h-40, h-16, w-16, size={40})—use `fill` + sized parent OR explicit `width`/`height`. Prefer explicit `width`/`height` where dimensions are known (avatars, thumbs); use `fill` for `object-cover` grid/gallery cells that stretch to container.
- `avatar.tsx` is a shared primitive — migrate carefully; it takes a `size` prop already (perfect for `width`/`height`).
- `image-uploader.tsx` previews use `URL.createObjectURL` blob URLs — `<Image>` needs `unoptimized` for blob/data URLs. KISS: keep `<img>` there with eslint-disable (local blob previews don't benefit from optimization). Document this exception.

## Requirements
- Functional: all remote/product/avatar images render via `<Image>` with correct sizing, no layout shift.
- Non-functional: lazy loading default; `sizes` attribute set for `fill` images to avoid over-fetching.

## Architecture

### Migration patterns
- **Fixed-size (avatar, thumbnails):** `<Image src width={N} height={N} alt className />`. Avatar uses its `size` prop.
- **`object-cover` fill cells (grid, gallery, carousel):** parent gets `relative`, child `<Image fill sizes="..." className="object-cover" />`.
- **`priority`:** set on the LCP image — the first gallery image on post detail page (`[postId]/page.tsx` L90). Everything else lazy (default).
- **Blob previews (image-uploader):** keep `<img>`, document why.

### sizes guidance
- Feed grid cells: `sizes="(max-width:700px) 50vw, 350px"`.
- Detail hero: `sizes="(max-width:700px) 100vw, 700px"`.
- Avatars/thumbs: omit (fixed width/height).

## Related Code Files
- Modify: all 6 component files (avatar, post-card, post-feed-card, image-carousel, right-sidebar) + `[postId]/page.tsx`
- Keep w/ documented exception: `image-uploader.tsx`
- Verify only: `next.config.ts`

## Implementation Steps
1. Confirm `R2_PUBLIC_URL` host matches an existing remotePattern; add pattern if custom domain.
2. Migrate `avatar.tsx` (shared, highest blast radius) → test render.
3. Migrate post-card, post-feed-card, image-carousel, right-sidebar.
4. Migrate `[postId]/page.tsx`; set `priority` on hero image.
5. Leave image-uploader blob preview; keep its eslint-disable with a `// blob preview — Image optimization N/A` note.
6. `pnpm --filter frontend build` — must pass with zero `no-img-element` warnings except documented uploader.

## Todo List
- [ ] Verify/extend remotePatterns
- [ ] avatar.tsx
- [ ] post-card.tsx
- [ ] post-feed-card.tsx
- [ ] image-carousel.tsx
- [ ] right-sidebar.tsx
- [ ] [postId]/page.tsx (+ priority hero)
- [ ] image-uploader.tsx exception documented
- [ ] build passes

## Success Criteria
- Network tab shows `/_next/image?...` optimized requests with WebP/AVIF.
- No CLS on feed/detail (sized or fill images).
- Build emits no unexpected `no-img-element` lint errors.

## Risk Assessment
- `fill` without `relative` parent → broken layout. Audit each parent for `position: relative`.
- Missing `sizes` on `fill` → Next warns + over-fetches. Add `sizes` everywhere `fill` used.
- Unconfigured remote host → runtime error. Verify R2 public host first.

## Security Considerations
- Only allow-listed hosts render; do not add wildcard `**` host patterns.

## Next Steps
- Independent of other phases; can parallelize with Phase 3/5/6 after Phase 1.
