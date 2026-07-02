# Phase 6 — Infra: R2 Config + Sentry

## Context Links
- `apps/backend/src/uploads/r2-upload.service.ts` (already env-driven, degrades gracefully)
- `apps/frontend/next.config.ts` (R2 remotePatterns present)
- `.env` (R2_* keys present but values to confirm)

## Overview
- **Priority:** P2
- **Status:** completed
- R2 upload code is COMPLETE and correct — it just needs valid env credentials (ops task). Sentry is genuinely missing — add error tracking to backend + frontend.

## Key Insights
- Audit's "R2 not configured / fails silently" is inaccurate at the code level: `r2-upload.service.ts` returns a clear 500 ("Dịch vụ upload chưa được cấu hình") and logs a warning when creds absent. The only gap is **operational**: populate `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- Note: service reads `CLOUDFLARE_ACCOUNT_ID` but `.env` snapshot only showed `R2_*` keys — verify `CLOUDFLARE_ACCOUNT_ID` exists; without it the S3 client is null. This is the most likely real cause of "uploads fail".
- Sentry: use `@sentry/nestjs` (backend) + `@sentry/nextjs` (frontend). Both gate on `SENTRY_DSN` env — no-op when unset so local dev is unaffected.

## Requirements
- Functional: with valid R2 env, uploads succeed and URLs resolve under a configured remotePattern. With Sentry DSN set, unhandled exceptions report to Sentry with request context.
- Non-functional: zero behavior change when SENTRY_DSN / R2 creds absent.

## Architecture

### R2 (config + doc, minimal code)
1. Write `docs/deployment-guide.md` section: how to create R2 bucket, API token (Object R/W), public dev URL or custom domain, and which env vars map where.
2. Verify `CLOUDFLARE_ACCOUNT_ID` is in `.env` + `.env.example`. Add if missing.
3. Confirm `R2_PUBLIC_URL` host matches a `next.config.ts` remotePattern; if custom domain, add pattern (ties to Phase 2).
4. Optional hardening: add a `/api/health/uploads` check or startup log asserting R2 readiness in production (KISS: the existing warn log suffices; skip unless needed).

### Sentry backend (`@sentry/nestjs`)
- Create `apps/backend/src/instrument.ts` calling `Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: !!process.env.SENTRY_DSN, tracesSampleRate: 0.1 })`; import FIRST in `main.ts`.
- Add `SentryGlobalFilter` AFTER the Phase-1 PrismaExceptionFilter (order: Prisma-specific first, Sentry catch-all last) OR capture inside the Prisma filter's `default` branch. KISS: register `SentryModule.forRoot()` + let Sentry's filter handle uncaught; Prisma filter still shapes known errors.

### Sentry frontend (`@sentry/nextjs`)
- Run `npx @sentry/wizard` OR manually add `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` + wrap `next.config.ts` with `withSentryConfig`. Gate on `NEXT_PUBLIC_SENTRY_DSN`.
- Ensure `instrumentation.ts` registers server/edge init (Next 15 convention).

## Related Code Files
- Modify: `.env`, `.env.example` (CLOUDFLARE_ACCOUNT_ID, SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN)
- Modify: `docs/deployment-guide.md` (R2 setup steps)
- Create: `apps/backend/src/instrument.ts`
- Modify: `apps/backend/src/main.ts` (import instrument first, Sentry filter)
- Modify: `apps/backend/package.json`, `apps/frontend/package.json`
- Create: frontend `sentry.*.config.ts` + `instrumentation.ts`
- Modify: `apps/frontend/next.config.ts` (withSentryConfig)

## Implementation Steps
1. Verify/add `CLOUDFLARE_ACCOUNT_ID`; document R2 setup in deployment-guide.
2. Backend: install `@sentry/nestjs`; add instrument.ts; wire main.ts + module.
3. Frontend: install `@sentry/nextjs`; add config files + withSentryConfig.
4. Confirm both no-op without DSN (build + run locally).
5. `pnpm --filter @app/backend build && pnpm --filter frontend build`.

## Todo List
- [ ] Verify CLOUDFLARE_ACCOUNT_ID present
- [ ] R2 setup docs in deployment-guide
- [ ] @sentry/nestjs init + filter order
- [ ] @sentry/nextjs config + withSentryConfig
- [ ] No-op-without-DSN verified
- [ ] Both builds pass

## Success Criteria
- With R2 creds, `POST /api/uploads` returns a working public URL rendering via Next `<Image>`.
- A thrown test error in prod-like build appears in Sentry with stack + request tags.
- Local dev (no DSN) runs identically to before.

## Risk Assessment
- Committing secrets: NEVER commit real R2 keys / DSN. Only `.env.example` placeholders. (.env is gitignored — confirm.)
- Sentry init order: must import instrument before AppModule or traces miss early spans.
- withSentryConfig + `output: 'standalone'` interplay — verify build artifact still standalone.

## Security Considerations
- Scrub PII in Sentry (`beforeSend`): strip cookies/auth headers. Set `sendDefaultPii: false`.
- R2 token scoped to single bucket, Object Read/Write only — least privilege.

## Next Steps
- Independent of other phases. Do last (touches build config + secrets).
