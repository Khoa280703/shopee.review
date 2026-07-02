# Phase 04 — Post Components

## Overview
- **Priority:** P2
- **Status:** completed
- **Description:** Replace hardcoded colors/shadows, extract the repeated action-button (icon+count) into `PostActionButton`, and tokenize typography in post components.
- **Depends on:** Phases 01 (tokens) + 02 (primitives).
- **File ownership:** post component files + one new component.

## Related Code Files
**Modify:**
- `apps/frontend/src/components/post/post-card.tsx`
- `apps/frontend/src/components/post/post-feed-card.tsx`
- `apps/frontend/src/components/post/post-grid.tsx` (verify; mostly layout)
- `apps/frontend/src/components/post/create-post-prompt.tsx` (shadow token)

**Create:**
- `apps/frontend/src/components/post/post-action-button.tsx` (icon+count action used 4x in post-feed-card)

## Specific Changes

### post-action-button.tsx (NEW)
Extracts the repeated action-bar pattern in `post-feed-card.tsx` (comment / open_in_new / share, each: group, circular hover, icon, count). LikeButton variant="icon" already follows this shape — keep LikeButton separate (it has state) but make it visually match.
```tsx
import { Icon } from '@/components/ui/icon';
interface Props {
  icon: string;
  count?: number;
  label: string;
  hoverColor: 'tertiary' | 'secondary' | 'primary' | 'like';
  // renders <button> or wrap externally with Link/a
}
```
Render the `group flex items-center gap-1 ... hover:text-{color}` + inner `rounded-full p-2 group-hover:bg-{color}/10` + `text-body-sm` count. Use a static class map for hoverColor (Tailwind can't do dynamic class names):
```ts
const hover = {
  tertiary: 'hover:text-tertiary group-hover:bg-tertiary/10',
  secondary: 'hover:text-secondary group-hover:bg-secondary/10',
  primary: 'hover:text-primary group-hover:bg-primary/10',
  like: 'hover:text-like group-hover:bg-like/10',
}[hoverColor];
```
Since two of the three are links (`<Link>`/`<a>`), keep the visual as a composable: export the inner content as `PostActionButton` rendering only the icon+count span, and let callers wrap with their element. KISS: render a `<span>`-based content block; callers keep their `<Link>`/`<a>`/`<button>` wrappers and apply the `group ...` class.

### post-card.tsx
- `text-[#f9bc00]` (rating star) → `text-rating`.
- `shadow-[0_4px_12px_rgba(0,0,0,0.04)]` → `shadow-card`; hover `shadow-[0_8px_24px_rgba(0,0,0,0.08)]` → `shadow-card-hover`.
- "Mua ngay" `<a>` (`bg-primary ... hover:bg-primary-container`) → `className={buttonClasses({ className: 'mt-1 h-9 rounded-lg' })}` (note: rounded-lg override since builder uses rounded-full; keep current pill? current is `rounded-lg`. Pass override). Keep icon child.
- Typography: `text-xs` (author row, meta counts, price strikethrough, discount badge) → `text-label-caps` for badge/caption; `text-sm` title → `text-body-sm`; `text-base` price → `text-body-md`. Icon glyph `text-[14px]/[16px]` left.
- Discount badge `text-xs font-bold` → `text-label-caps` (already 12px, label-caps is 600 weight; keep `font-bold` if -X% needs heavier — acceptable).

### post-feed-card.tsx
- `shadow-[...]` ×2 → `shadow-card` / `shadow-card-hover`.
- Action bar (comment link, open_in_new link, share button) → use `PostActionButton` content; LikeButton already there.
- Mixed `text-[15px]/[16px]/[14px]/[13px]/[12px]` → map: 15/16→ keep `font-headline-md` pair but replace arbitrary with `text-headline-md` where heading, `text-body-md` for content, `text-body-sm` (14/13), `text-label-caps` (12). Specifically:
  - line ~28 author name `text-[15px]` → `text-body-sm` (keep font-semibold)
  - line ~49 title `text-[16px]` → `text-body-md`
  - line ~101 product title `text-[14px]` → `text-body-sm`
  - line ~103 price `text-[16px]` → `text-body-md`
  - line ~106 strikethrough `text-[12px]` → `text-label-caps`
  - line ~119 Mua ngay `text-[14px]` → `text-body-sm`
  - line ~136/147 counts `text-[13px]` → `text-body-sm`
- "Mua ngay" inner `<a>` (`bg-primary ... hover:bg-primary-container`) → `buttonClasses({ className: 'h-9 rounded-lg gap-1' })` override.
- Spacing: `gap-sm`, `p-md` good. `gap-1`→`gap-xs` (4px ✓) where it's a true 4px gap; `gap-2`/`gap-3` leave (8 ok→gap-sm; 12 no token). Map `gap-2`→`gap-sm`.
- Category chip already uses `font-label-caps text-label-caps` ✓.

### post-grid.tsx
- Verify: likely pure grid layout (`grid gap-*`). Map `gap-3`/`gap-4` only if matching token. Probably no change. Read before editing.

### create-post-prompt.tsx
- `shadow-[...]` → `shadow-card`. Tokenize any `text-sm`/`text-xs`.

## Todo List
- [ ] Create post-action-button.tsx
- [ ] post-card.tsx: rating color, shadows, Mua ngay button, typography
- [ ] post-feed-card.tsx: shadows, action bar, Mua ngay, typography, spacing
- [ ] post-grid.tsx: verify spacing tokens
- [ ] create-post-prompt.tsx: shadow + typography
- [ ] Run `next build`

## Success Criteria
- No `#f9bc00` or `shadow-[...]` literals remain in post components.
- Action-bar icon+count pattern sourced from one component (DRY).
- Arbitrary `text-[Npx]` body sizes replaced with tokens (icon glyph sizes excepted).

## Risk Assessment
- Tailwind dynamic class names: hoverColor map MUST be static literals (done above) or JIT purges them.
- `buttonClasses` enforces `rounded-full`; "Mua ngay" buttons are `rounded-lg` — must override via className, verify twMerge wins (it does — last class wins for same property).

## Next Steps
- Independent of Phases 03, 05, 06.
