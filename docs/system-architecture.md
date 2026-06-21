# System Architecture

## Services

- `frontend`: Next.js 15 app, public pages and `/admin/*`.
- `backend`: NestJS API under `/api/*`.
- `database`: PostgreSQL 16 service, accessed through Prisma.

## Data Flow

Admin flow:

```text
/admin/login -> JWT -> /admin/deals/create -> /api/admin/deals/scrape -> edit -> /api/admin/deals
```

Public flow:

```text
/ -> /api/deals -> /deals/:id -> /api/deals/:id/click -> affiliate URL
```

Image flow:

```text
Admin upload -> /api/admin/uploads/deal-image -> local uploads volume -> /uploads/deals/*
```

## Deployment

Production uses separate Coolify services for PostgreSQL, API, and Web. Traefik routes `/api/*` to backend and the remaining host traffic to frontend.

## Unresolved Questions

- None.
