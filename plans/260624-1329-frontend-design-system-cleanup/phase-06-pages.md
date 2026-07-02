# Phase 06 — Pages

## Overview
- **Priority:** P2
- **Status:** completed
- **Description:** Adopt `Button`/`Input` and tokenize typography/shadows across auth pages, settings, search, dashboard.
- **Depends on:** Phases 01 + 02.
- **File ownership:** app page files listed below.

## Related Code Files
**Modify:**
- `apps/frontend/src/app/auth/login/page.tsx`
- `apps/frontend/src/app/auth/register/page.tsx`
- `apps/frontend/src/app/auth/verify/page.tsx`
- `apps/frontend/src/app/auth/callback/page.tsx`
- `apps/frontend/src/app/settings/page.tsx`
- `apps/frontend/src/app/search/page.tsx`
- `apps/frontend/src/app/dashboard/page.tsx`

**Verify/optional (only if same patterns present):**
- `apps/frontend/src/app/error.tsx`, `not-found.tsx`, `feed/page.tsx`, `category/[slug]/page.tsx`, `[username]/page.tsx`, `[username]/[postId]/page.tsx`

## Specific Changes

### auth/login/page.tsx (83 lines)
- Card `shadow-[0_4px_12px_rgba(0,0,0,0.04)]` → `shadow-card`.
- 2 `<input>` (email, password) → `<Input>` (default h-11 px-4 text-body-sm matches).
- Submit `<button>` (`h-11 w-full rounded-full bg-primary text-sm ...`) → `<Button fullWidth size="lg">`.
- Google `<button>` (`h-11 w-full ... border ... text-sm`) → `<Button variant="outline" fullWidth size="lg">` (keep inner icon + gap).
- Typography: `text-sm`→`text-body-sm` (error, footer link text), divider `text-xs`→`text-label-caps`.

### auth/register/page.tsx
- Same as login: `shadow-[...]`→`shadow-card`; `<input>`→`<Input>`; submit/google `<button>`→`<Button>`; tokenize `text-sm`/`text-xs`.

### auth/verify/page.tsx & auth/callback/page.tsx
- Tokenize `text-sm`/`text-xs`/`text-2xl` (status messages, headings → `text-headline-md`/`text-body-sm`). Convert any action `<button>`/`<Link>` styled as primary → `<Button>` / `buttonClasses()`. Read first; smaller files.

### settings/page.tsx (113 lines)
- Avatar upload `<label>` (`rounded-full border ... px-4 py-2 text-sm`) → cannot be `<Button>` (it's a label wrapping file input). Use `buttonClasses({ variant:'outline', size:'sm' })` on the `<label>` className. Keep hidden `<input type="file">`.
- 2 text `<input>` + 1 affiliate `<input>` → `<Input>`. Bio `<textarea>` → `<Textarea>`.
- Save `<button>` (`h-11 w-full rounded-full bg-primary text-sm ...`) → `<Button fullWidth size="lg">`.
- Labels `text-sm font-medium`→`text-body-sm font-medium`; helper/caption `text-xs`→`text-label-caps`; messages `text-sm`→`text-body-sm`.

### search/page.tsx (117 lines)
- Search `<input>` is `h-12 rounded-full pl-12 pr-5` (pill search, taller than Input default). Keep as custom OR `<Input className="h-12 rounded-full pl-12 pr-5" />`. Decision: use `<Input>` with overrides (twMerge handles h-12/rounded-full). Tokenize `text-sm`→`text-body-sm`.
- Result text `text-sm`/`text-xs`→`text-body-sm`/`text-label-caps`.

### dashboard/page.tsx (93 lines)
- Mostly data display. `text-sm`→`text-body-sm` (table, loading), `text-xs`→`text-label-caps` (stat labels). Table `text-sm` → `text-body-sm`.
- Check for any styled buttons → `<Button>`.

## Todo List
- [ ] login: shadow, Input ×2, Button ×2, typography
- [ ] register: shadow, Input, Button, typography
- [ ] verify + callback: typography + any buttons
- [ ] settings: label buttonClasses, Input ×3, Textarea, Button, typography
- [ ] search: Input override, typography
- [ ] dashboard: typography, buttons
- [ ] Verify error/not-found/feed/category/[username] pages for same patterns
- [ ] Run `next build`

## Success Criteria
- No `shadow-[...]` literals remain in auth pages.
- All standard form inputs use `<Input>`/`<Textarea>`; primary/outline actions use `<Button>` (file-input labels use `buttonClasses()`).
- Raw `text-sm`/`text-xs`/`text-2xl` replaced with tokens.

## Risk Assessment
- File-input `<label>` cannot be `<Button>` — use `buttonClasses()` on label (documented).
- Search pill (`h-12`) and other size overrides rely on twMerge resolving conflicts — verify visually.
- Auth pages may share a layout/card wrapper; if a card pattern repeats 3+ times consider extracting `AuthCard`, but only if it stays DRY without over-engineering (judge during impl).

## Next Steps
- Final phase. After this, run full `next build` + lint, then spot-check each page.

## Unresolved Questions
- Is `Card` component (`components/ui/card.tsx`) usable for the auth/settings card wrappers? Check during impl — if it fits, prefer it over inline card divs.
