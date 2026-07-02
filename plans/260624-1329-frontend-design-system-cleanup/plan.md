---
title: "Frontend Design System Cleanup"
description: "Add missing tokens, extract shared primitives, enforce Button/Input usage, standardize typography & spacing across the frontend."
status: completed
priority: P2
effort: 9h
branch: master
tags: [frontend, design-system, refactor, tailwind, tokens]
created: 2026-06-24
---

# Frontend Design System Cleanup

Refactor the Next.js frontend to fully adopt the Stitch design system: add missing color/shadow tokens, extract repeated inline patterns into shared UI primitives, enforce `<Button>` / `<Input>` everywhere, and standardize typography + spacing tokens.

## Principles
- YAGNI / KISS / DRY. No behavioral changes — pure presentation refactor.
- Keep each file under 200 lines (modularize if exceeded).
- After every phase: run `pnpm --filter frontend build` (or `next build`) to verify no compile errors.
- No new "enhanced" duplicate files — edit existing files in place.

## Key Insight (read before starting)
The existing `Button`, `Input`, `Textarea` primitives themselves use raw utilities (`text-sm`, `h-10`/`h-11` inconsistency, no token alignment) and lack the variants the codebase needs (link-style, `font-bold` follow, full-width submit). **Phase 02 normalizes the primitives first**, otherwise enforcing them in later phases would just propagate non-token values.

## Token Decisions (apply consistently)
- `text-sm` / `text-[13px]` / `text-[14px]` / `text-[15px]` → `text-body-sm` (14px)
- `text-base` / `text-[16px]` → `text-body-md` (16px)
- `text-xs` / `text-[11px]` / `text-[12px]` → `text-label-caps` (12px) for labels/chips, else keep visual size via `text-body-sm` when it's body copy — judge per case, documented in phase files.
- `text-xl` / `text-2xl` (headings) → `text-headline-md` (20px) or `text-display-lg-mobile` (24px)
- `text-[18px]` / `text-[20px]` / `text-[22px]` / `text-[24px]` icon sizes → keep as-is (icon glyph sizing is not a typography token; acceptable arbitrary value). Optionally centralize via IconButton `size` prop.
- `gap-1`→`gap-xs`(4px... note: gap-1=4px=xs ✓), `gap-2`→`gap-sm`(8px ✓), `gap-3`→`gap-md`(16px? gap-3=12px ≠ 16px) — only map where pixel value matches a token; otherwise leave. See phase files for exact mappings.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 01 | Tailwind tokens (colors + shadows) | completed | [phase-01-tailwind-tokens.md](phase-01-tailwind-tokens.md) |
| 02 | UI primitives (normalize Button/Input/Textarea, new IconButton) | completed | [phase-02-new-ui-primitives.md](phase-02-new-ui-primitives.md) |
| 03 | Layout components (sidebar-nav, header, mobile-nav) | completed | [phase-03-layout-components.md](phase-03-layout-components.md) |
| 04 | Post components (post-feed-card, post-card, post-grid) | completed | [phase-04-post-components.md](phase-04-post-components.md) |
| 05 | Social & forms (follow, like, comments, post-form, shopee-url-input) | completed | [phase-05-social-forms.md](phase-05-social-forms.md) |
| 06 | Pages (auth, settings, search, dashboard) | completed | [phase-06-pages.md](phase-06-pages.md) |

## Dependencies
- Phase 01 → 02 (primitives use new tokens).
- Phase 02 → 03,04,05,06 (all consume `Button`/`Input`/`IconButton`).
- Phases 03–06 are independent of each other (can parallelize, but no shared-file conflicts: each owns distinct files).

## Out of Scope
- Icon glyph pixel sizes (`text-[20px]` on `<Icon>`) — not a typography token, left unless IconButton centralizes.
- Backend, no logic/state changes.
