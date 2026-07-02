---
title: "Phase 6 — Meilisearch Integration (Vietnamese search)"
phase: 6
group: D
priority: P2
status: completed
effort: 10h
depends_on: [2]
blocks: []
created: 2026-06-25
---

# Phase 6 — Meilisearch Integration

## Context Links
- Research: `research/researcher-02-frontend-infra.md` (Section 2: Vietnamese tokenization, NestJS setup, index config, sync via queue)
- Scout: `search/search.service.ts` currently uses PostgreSQL FTS.

## Overview
- **Priority:** P2
- **Status:** completed
- Add Meilisearch as primary search; index posts asynchronously via BullMQ (Phase 2). Keep PostgreSQL FTS as fallback when Meilisearch is unavailable.

## Key Insights
- Meilisearch has NO Vietnamese tokenizer → normalize diacritics (NFD + strip accents) at BOTH index time and query time so "tim kiem" matches "tìm kiếm".
- Indexing MUST be async (BullMQ) — never block create/update/delete HTTP path.
- Searchable=[title, content, username]; filterable=[categoryId, hasProduct]; sortable=[createdAt, likeCount].
- Fallback to PG FTS keeps search resilient if Meili container down.

## Requirements
**Functional**
- Create/update/delete post enqueues a Meilisearch index job.
- `SearchController` queries Meilisearch; on error/unavailable falls back to PG FTS.
- Diacritic-insensitive Vietnamese matching.

**Non-functional**
- Meilisearch container 512MB RAM cap, persistent data volume.
- Index sync lag acceptable up to a few seconds.

## Architecture
```
Post create/update/delete -> enqueue index job (scraper/index queue, Phase 2 infra)
  -> meili.processor -> normalize(doc) -> meili.index('posts').addDocuments/deleteDocument
Search: SearchService.search(q) -> try Meili (normalize q) -> on error PG FTS fallback
```

## Related Code Files
**Modify**
- `docker-compose.yml` — add `meilisearch` service block (P7/P1 also touch this file; append distinct service — sequence after P1).
- `apps/backend/src/search/search.service.ts` — Meili query + PG FTS fallback + normalize helper.
- `apps/backend/src/search/search.module.ts` — provide MeilisearchService + index queue.

**Create**
- `apps/backend/src/search/meilisearch.service.ts` — client wrapper, index settings bootstrap, normalize util.
- `apps/backend/src/queue/queues/index.processor.ts` (or add to existing queue module) — consumes index jobs.
- Hook post mutations to enqueue index jobs (in `posts.service.ts` create/update/delete — coordinate: P2 & P5 also touch posts.service.ts; add only the enqueue calls).

## Implementation Steps
1. Add Meilisearch to `docker-compose.yml`: `image: getmeili/meilisearch:v1.x`, env `MEILI_MASTER_KEY`, `MEILI_MAX_INDEXING_MEMORY=512Mb`, volume `meili-data:/meili_data`, `mem_limit: 512m`.
2. Backend install: `meilisearch`.
3. `meilisearch.service.ts`:
   - On module init, ensure `posts` index settings: searchable `[title, content, username]`, filterable `[categoryId, hasProduct]`, sortable `[createdAt, likeCount]`.
   - `normalizeVi(text)`: `text.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')` (store both original + normalized field, e.g. `_search`).
4. Register an `index-queue` (or reuse Phase 2 queue module) + `index.processor.ts` to add/update/delete docs; normalize on index.
5. In `posts.service.ts`, enqueue index jobs on create/update/delete (lightweight — just job add).
6. Update `search.service.ts`:
   - Primary: `meili.index('posts').search(normalizeVi(q), { filter, sort, limit })`.
   - Wrap in try/catch; on failure call existing PG FTS query (fallback path retained).
7. Add `MEILI_MASTER_KEY`, `MEILI_HOST` to `.env.example` (coordinate with P1 owning .env.example — append keys).
8. Backfill: one-off script/endpoint to index existing posts into Meilisearch.
9. Test: create post → searchable within seconds; query without diacritics matches; stop Meili container → fallback to PG FTS works.

## Todo List
- [ ] Meilisearch service in docker-compose
- [ ] Install meilisearch client
- [ ] meilisearch.service.ts (settings + normalizeVi)
- [ ] index queue + processor
- [ ] enqueue index jobs on post CRUD
- [ ] search.service.ts Meili primary + PG FTS fallback
- [ ] .env keys (MEILI_*)
- [ ] backfill existing posts
- [ ] diacritic + fallback tests

## Success Criteria
- New/updated/deleted posts reflected in Meilisearch within seconds (async).
- Diacritic-insensitive search returns expected results.
- Meili down → search still returns via PG FTS (no 500).
- Index settings applied (searchable/filterable/sortable).

## Risk Assessment
- **Depends on Phase 2** for queue infra → run after P2.
- **docker-compose.yml shared** → append Meili service block only; sequence after P1.
- **posts.service.ts shared (P2/P5)** → add only enqueue calls; coordinate edits.
- **Vietnamese matching gaps** → normalize at both index + query; store dedicated normalized field.

## Security Considerations
- `MEILI_MASTER_KEY` secret in `.env`; Meili not published to host publicly.
- Search input sanitized; filters whitelisted to declared filterable attrs.

## Next Steps
- Independent downstream; pairs with Phase 8 (search latency metric).
