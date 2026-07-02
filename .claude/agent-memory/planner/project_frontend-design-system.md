---
name: project-frontend-design-system
description: How the shopee.review frontend design system is structured — tokens, primitives, build/lint commands
metadata:
  type: project
---

Frontend (`apps/frontend`) is Next.js 15 App Router + TS + Tailwind, design tokens from the Stitch "Shopee Social Review Hub" system declared 1:1 in `apps/frontend/tailwind.config.ts` (colors, spacing `xs/sm/md/lg/xl/gutter`, fontSize tokens `body-sm/body-md/headline-md/display-lg/display-lg-mobile/price-lg/label-caps`).

Icons: Material Symbols via `<Icon name=... fill=... />` from `components/ui/icon.tsx`. Class merge helper `cn()` (clsx + tailwind-merge) at `lib/cn.ts`.

Shared UI primitives in `components/ui/`: button, input, textarea, avatar, badge, card, category-pills, skeleton, icon.

**Why:** As of 2026-06-24 the primitives existed but were largely unused — most components reimplemented button/input styles inline with hardcoded hex (`#f9bc00` rating, `#f91880` like), `amber-*` banners, and arbitrary `shadow-[...]`/`text-[Npx]`. A cleanup plan lives at `plans/260624-1329-frontend-design-system-cleanup/`.

**How to apply:** Build/compile check = `pnpm --filter frontend build` or `next build` (script: `next build`). Lint = `next lint || tsc -p tsconfig.json --noEmit`. Keep files <200 lines. Stateful toggle buttons (follow, like-pill) intentionally keep bespoke styling rather than using the generic `<Button>`.
