# Phase 01 — Tailwind Tokens (colors + shadows)

## Overview
- **Priority:** P1 (blocks all other phases)
- **Status:** completed
- **Description:** Add the missing design tokens to `tailwind.config.ts` so later phases reference token names instead of hardcoded hex / arbitrary shadows.

## Key Insights
- Hardcoded values found by audit:
  - `#f9bc00` star/rating color → `post-card.tsx`
  - `#f91880` like/heart color → `like-button.tsx`
  - `amber-50/200/600/700` warning banners → `post-form.tsx`, `shopee-url-input.tsx`
  - `shadow-[0_4px_12px_rgba(0,0,0,0.04)]` + hover `shadow-[0_8px_24px_rgba(0,0,0,0.08)]` → 7 files (post-card, post-feed-card, user-profile-header, create-post-prompt, auth login/register pages, `[username]/page.tsx`)
- `amber-*` is default Tailwind palette (still resolves), but audit wants semantic tokens. Add `warning` scale.

## Related Code Files
**Modify:**
- `apps/frontend/tailwind.config.ts`

## Implementation Steps
1. In `theme.extend.colors`, add:
   ```ts
   rating: '#f9bc00',          // star / review rating
   like: '#f91880',            // heart / like active
   'warning-surface': '#fffbeb',   // ~ amber-50
   'warning-border': '#fde68a',    // ~ amber-200
   'warning-on': '#b45309',        // ~ amber-700 (text)
   ```
2. In `theme.extend`, add a `boxShadow` block (does not exist yet):
   ```ts
   boxShadow: {
     card: '0 4px 12px rgba(0,0,0,0.04)',
     'card-hover': '0 8px 24px rgba(0,0,0,0.08)',
   },
   ```
   This enables `shadow-card` / `shadow-card-hover` utilities.
3. Do NOT remove the `brand` legacy alias.

## Todo List
- [ ] Add `rating`, `like`, `warning-surface`, `warning-border`, `warning-on` colors
- [ ] Add `boxShadow.card` and `boxShadow.card-hover`
- [ ] Run `next build` — confirm config parses, no type error on `Config`

## Success Criteria
- `bg-rating`, `text-rating`, `text-like`, `bg-like/10`, `bg-warning-surface`, `border-warning-border`, `text-warning-on`, `shadow-card`, `shadow-card-hover` all compile.
- No visual change yet (tokens unused until later phases).

## Risk Assessment
- Low. Pure additive config change. `like/10` opacity util works because Tailwind generates opacity variants for custom colors defined as hex strings.

## Next Steps
- Unblocks Phases 03–06 which consume these tokens.
