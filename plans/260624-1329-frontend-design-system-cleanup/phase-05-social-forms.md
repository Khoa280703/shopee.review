# Phase 05 — Social & Forms

## Overview
- **Priority:** P2
- **Status:** completed
- **Description:** Tokenize `like-button.tsx` (#f91880), adopt `Button`/`Input`/`Textarea` in `follow-button.tsx`, `comments-section.tsx`, `post-form.tsx`, `shopee-url-input.tsx`; replace `amber-*` with warning tokens.
- **Depends on:** Phases 01 + 02.
- **File ownership:** social + forms files only.

## Related Code Files
**Modify:**
- `apps/frontend/src/components/social/like-button.tsx`
- `apps/frontend/src/components/social/follow-button.tsx`
- `apps/frontend/src/components/social/comments-section.tsx`
- `apps/frontend/src/components/forms/post-form.tsx`
- `apps/frontend/src/components/forms/shopee-url-input.tsx`
- `apps/frontend/src/components/forms/image-uploader.tsx` (verify typography only)

## Specific Changes

### like-button.tsx
- All `#f91880` → `like` token: `text-[#f91880]`→`text-like`, `hover:text-[#f91880]`→`hover:text-like`, `bg-[#f91880]/10`→`bg-like/10`, `group-hover:bg-[#f91880]/10`→`group-hover:bg-like/10`.
- `text-[13px]` count → `text-body-sm`. `text-[20px]/[18px]` icon glyph left.
- `variant="button"` branch: `rounded-full border px-4 py-2 text-sm` — this is a toggle pill (stateful), not a plain Button. Keep custom but tokenize `text-sm`→`text-body-sm`. The active state uses `border-primary-fixed bg-primary-fixed text-primary` — fine.

### follow-button.tsx
- Stateful toggle (follow/unfollow) with bespoke `bg-inverse-surface` styling — NOT a standard Button variant. Keep custom structure.
- Tokenize: `text-sm font-bold`→`text-body-sm font-bold`. Keep `h-9 rounded-full px-5`.
- Optional: could use `buttonClasses({ size:'sm' })` for the unfollowed state, but the inverse-surface color isn't a variant. KISS: leave, just tokenize text.

### comments-section.tsx (186 lines — watch 200 limit)
- Two inline inputs (reply `h-9`, top-level `h-11`) → replace `<input>` with `<Input className="h-9 flex-1" />` / `<Input className="flex-1" />`. Input default is now `h-11 px-4 text-body-sm` (Phase 02). Reply input needs `h-9 px-3` override.
- Two submit `<button>` (`rounded-full bg-primary px-4/px-5 text-sm ...`) → `<Button size="sm">` / `<Button>`. Reply submit smaller: `<Button size="sm">`.
- Typography: `text-sm`→`text-body-sm` (comment body, author), `text-xs`→`text-label-caps` (timestamp, reply/delete actions). Icon `text-[14px]` left.
- Spacing: `gap-xs` already used ✓.
- **If file exceeds 200 lines after edits**, extract the comment-input form into `comment-input.tsx` and/or a single `CommentItem` component.

### post-form.tsx (179 lines)
- Warning banner: `border-amber-200 bg-amber-50 text-amber-700` → `border-warning-border bg-warning-surface text-warning-on`. Tokenize `text-sm`→`text-body-sm`.
- 3 `<input>` (title, affiliate, select height matches) → `<Input>`; the `<textarea>` → `<Textarea rows={6}>`. The `<select>` keep native but tokenize its className to match Input (`h-11 px-3 text-body-sm`) — no Select primitive exists (YAGNI: don't create one for a single use unless reused).
- 2 action `<button>` (Hủy = outline, Đăng bài = primary full-width) → `<Button variant="outline" type="button">` and `<Button type="submit" fullWidth className="flex-1">`. Note `flex-1` + builder.
- Labels `text-sm font-medium`→`text-body-sm font-medium`; helper `text-xs`→`text-label-caps`.
- `error` `text-sm text-error`→`text-body-sm text-error`.

### shopee-url-input.tsx
- `<input>` → `<Input className="pl-4 pr-11" />` (keep right-padding for spinner). Default h-11 matches.
- Error `text-amber-600`→`text-warning-on`; `text-sm`→`text-body-sm`.
- Uses `lucide-react` icons (Loader2, Search) — leave (separate from Material Symbols `<Icon>`; not in scope to swap icon systems).

### image-uploader.tsx
- Verify only: tokenize any `text-sm`/`text-xs` to `text-body-sm`/`text-label-caps`. Read before editing.

## Todo List
- [ ] like-button.tsx: #f91880 → like token; text-[13px]→body-sm
- [ ] follow-button.tsx: tokenize text
- [ ] comments-section.tsx: Input/Button adoption + typography; modularize if >200 lines
- [ ] post-form.tsx: Input/Textarea/Button adoption; warning tokens; select tokenize
- [ ] shopee-url-input.tsx: Input adoption; warning token
- [ ] image-uploader.tsx: typography verify
- [ ] Run `next build`

## Success Criteria
- No `#f91880` or `amber-*` literals remain in social/forms.
- All plain inputs/textareas/buttons use `<Input>`/`<Textarea>`/`<Button>` (stateful toggle buttons like follow/like-pill excepted, documented).
- comments-section.tsx ≤ 200 lines (modularize if needed).

## Risk Assessment
- `<Input>` default `h-11`; reply input must override `h-9` — verify twMerge height override.
- Native `<select>` can't be `<Input>` — kept native intentionally (don't over-abstract).
- Stateful toggle buttons (follow/like) intentionally NOT converted — converting would lose their bespoke active states.

## Next Steps
- Independent of Phases 03, 04, 06.

## Unresolved Questions
- Should follow/like toggle buttons get dedicated `toggle` Button variants? Deferred (YAGNI) unless more toggles appear.
