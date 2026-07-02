# Phase 03 — Layout Components

## Overview
- **Priority:** P2
- **Status:** completed
- **Description:** Adopt `IconButton`, `buttonClasses()`, and typography/spacing tokens in `sidebar-nav.tsx`, `header.tsx`, `mobile-nav.tsx`.
- **Depends on:** Phase 02.
- **File ownership:** these three files only.

## Related Code Files
**Modify:**
- `apps/frontend/src/components/layout/header.tsx`
- `apps/frontend/src/components/layout/sidebar-nav.tsx`
- `apps/frontend/src/components/layout/mobile-nav.tsx`

## Specific Changes

### header.tsx
- Search `<button>` (`rounded-full p-2 text-on-surface-variant ... hover:bg-surface-container-high`) → `<IconButton icon="search" label="Tìm kiếm" iconClassName="text-[22px]" onClick={...} />`.
- Notifications `<Link>` with same circular pattern: keep `<Link>` (it navigates) but apply the same class string as IconButton's base via `cn('... rounded-full p-2 ...')`. KISS: leave as Link, just reuse the literal class (it already matches). Optional: no change needed if visually identical — focus effort on the `<button>`.
- Login `<Link>` styled as primary button (`bg-primary px-3 py-1.5 text-sm ...`) → `className={buttonClasses({ size: 'sm', className: 'ml-2' })}`. Note `text-sm`→ handled by builder (`text-body-sm`).
- Brand: `text-xl` on site name stays paired with `font-display-lg-mobile` — replace `text-xl` with `text-display-lg-mobile`? It's already `font-display-lg-mobile`; the `text-xl` overrides size. Replace `text-xl` → remove (let `text-display-lg-mobile` from fontSize apply) OR keep intentional smaller header size. Decision: keep `text-xl` here (header brand intentionally smaller than sidebar). Document as accepted.
- Icon glyph sizes (`text-2xl`, `text-[22px]`) left as icon sizing.

### sidebar-nav.tsx
- "Đăng bài" `<button>` (`rounded-full bg-primary py-3 font-headline-md text-headline-md ...`) → keep as `<button>` but use `buttonClasses({ size: 'lg', fullWidth: true, className: 'mt-md' })` + inner `<Icon>` + label. The `font-headline-md text-headline-md` is intentionally larger; if builder's `text-body-sm` is too small, pass `className` override `text-headline-md`. Decision: override to preserve current visual weight.
- Logout `<button>` (circular `rounded-lg p-1.5 ... hover:bg-error-container hover:text-error`) → this is a danger-tinted icon button, not the standard IconButton hover. Keep custom (IconButton hover differs). Replace `text-[18px]` left as icon size.
- Login/Register `<Link>`s in footer: Register → `buttonClasses({ className: 'text-center px-3 py-2.5' })` won't fit (py differs); simplest: Register `buttonClasses({ size: 'sm' })`, Login `buttonClasses({ variant: 'outline', size: 'sm' })`. Adjust to keep full-width: add `fullWidth: true`.
- Typography: footer user block `text-sm`→`text-body-sm`, `text-xs`→`text-label-caps` (username caption).
- Spacing: already uses `gap-md/gap-sm/gap-lg/p-md` well. `gap-3` (line 83) → `gap-md`? gap-3=12px, gap-md=16px — NOT equal. Leave `gap-3`. `gap-2` (footer login col) → `gap-sm` (both 8px ✓).

### mobile-nav.tsx
- The nav items are `<button>` with bespoke active-pill styling — domain-specific, NOT a standard Button. Leave structural styling.
- Typography: `text-[11px]` label → already paired with `font-label-caps text-label-caps` on the span below; the outer `text-[11px]` is redundant. Replace outer `text-[11px]` → `text-label-caps` (12px) OR remove since inner span sets it. Decision: remove redundant `text-[11px]` from outer button, keep inner `font-label-caps text-label-caps`.
- Icon size `text-[24px]` left as icon sizing.

## Todo List
- [ ] header.tsx: search button → IconButton; login link → buttonClasses
- [ ] sidebar-nav.tsx: Đăng bài, login/register links → buttonClasses; tokenize footer text
- [ ] mobile-nav.tsx: remove redundant `text-[11px]`, confirm label tokens
- [ ] Run `next build`
- [ ] Visual spot-check on mobile + desktop breakpoints

## Success Criteria
- No `rounded-full bg-primary px-* py-*` literal primary-button strings remain in these 3 files (except documented intentional overrides).
- Raw `text-sm`/`text-xs`/`text-[11px]` body text replaced with `text-body-sm`/`text-label-caps`.
- Files stay under 200 lines.

## Risk Assessment
- Active-state pill in mobile-nav is fragile — do not refactor its structure, only typography tokens.
- `buttonClasses` `h-` may conflict with existing `py-*` on links; prefer letting builder control height, drop manual `py`.

## Next Steps
- Independent of Phases 04–06.
