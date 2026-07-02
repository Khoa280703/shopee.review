---
title: "Phase 8 — Prometheus + Grafana + Loki + Pino Logging"
phase: 8
group: E
priority: P3
status: completed
effort: 8h
depends_on: []
blocks: []
created: 2026-06-25
status_note: "completed — prom-client /metrics (http histogram+counter via interceptor, default process metrics, ws + queue-depth gauges via 10s collector), nestjs-pino JSON logging, and monitoring/ stack (Prometheus+alerts, Loki, Promtail, Grafana provisioned). Verified live: /metrics serves custom + default metrics, ws gauge set by collector."
---

# Phase 8 — Monitoring & Observability

## Context Links
- Research: `research/researcher-02-frontend-infra.md` (Section 4: Prometheus/Grafana/Loki, NestJS metrics, alert rules, structured logging)

## Overview
- **Priority:** P3 (run last; independent, non-blocking)
- **Status:** pending
- Expose NestJS metrics to Prometheus, visualize in Grafana, ship structured Pino logs to Loki. Separate, optional `monitoring/docker-compose.yml` so it never blocks the main app.

## Key Insights
- Metrics module via `@willsoto/nestjs-prometheus` exposes `/metrics` (guard to internal/network only).
- Key metrics: HTTP request rate + duration histogram, DB query duration, queue depth gauges (BullMQ, Phase 2), WebSocket connection count (Phase 3).
- Replace `console.log` with `nestjs-pino` (JSON to stdout); Promtail/Loki scrapes container stdout.
- Monitoring stack lives in its own compose file — bring up/down independently.

## Requirements
**Functional**
- `/metrics` endpoint scraped by Prometheus.
- Grafana dashboards for NestJS HTTP, PostgreSQL, BullMQ queue depth.
- Logs queryable in Grafana via Loki.

**Non-functional**
- `/metrics` not publicly exposed (internal network / guard / Nginx deny).
- Stack fits comfortably (<4GB RAM); retention 30d.

## Architecture
```
NestJS /metrics  <--scrape-- Prometheus --datasource--> Grafana
NestJS stdout(JSON Pino) --> Promtail --> Loki --datasource--> Grafana
Prometheus --> Alertmanager (rules: error rate, slow queries, queue backlog)
```

## Related Code Files
**Create**
- `apps/backend/src/metrics/metrics.module.ts` — PrometheusModule.register + registerMetrics.
- `apps/backend/src/metrics/metrics.providers.ts` — counters/histograms/gauges.
- `apps/backend/src/metrics/http-metrics.interceptor.ts` — record request duration/count.
- `monitoring/docker-compose.yml` — prometheus, grafana, loki, promtail, alertmanager.
- `monitoring/prometheus.yml`, `monitoring/alertmanager.yml`, `monitoring/loki-config.yml`, `monitoring/promtail-config.yml`.
- `monitoring/grafana/dashboards/*.json` — NestJS + PostgreSQL + BullMQ dashboards.

**Modify**
- `apps/backend/src/app.module.ts` — import MetricsModule + LoggerModule (coordinate with P1/P2/P3 which also edit app.module/main; sequence; small additive imports).
- `apps/backend/src/main.ts` — use Pino logger (`app.useLogger`), bufferLogs.
- Inject queue-depth gauge updater (read BullMQ counts) + WS connection gauge in PostsGateway (Phase 3).

## Implementation Steps
1. Backend install: `@willsoto/nestjs-prometheus prom-client nestjs-pino pino-http`.
2. `metrics.providers.ts`: define `http_request_duration_seconds` (histogram), `http_requests_total` (counter), `database_query_duration_seconds`, `queue_depth_jobs` (gauge, label queue_name), `websocket_connections` (gauge).
3. `metrics.module.ts`: `PrometheusModule.register({ defaultLabels:{app:'shopee-review-api'}, defaultMetrics:{enabled:true} })` + `registerMetrics([...])`.
4. `http-metrics.interceptor.ts`: time each request, record method/route/status; register globally.
5. Guard `/metrics`: restrict by internal IP / guard / Nginx `deny`/allow (coordinate Phase 7).
6. Pino: set up `LoggerModule.forRoot` (nestjs-pino) JSON to stdout; `app.useLogger(app.get(Logger))`, `bufferLogs:true`; replace stray `console.log`.
7. Queue depth: small scheduled task (or processor hook) reads BullMQ `getJobCounts()` → set `queue_depth_jobs` per queue.
8. WS gauge: increment on `handleConnection`, decrement on `handleDisconnect` in PostsGateway.
9. `monitoring/docker-compose.yml`: prometheus (scrape backend `/metrics`), grafana (admin pwd env), loki, promtail (scrape docker logs), alertmanager.
10. `prometheus.yml`: scrape job for backend; `alertmanager.yml` + alert rules (HighErrorRate, SlowDatabaseQueries, QueueBacklog, LowDiskSpace).
11. Provision Grafana datasources (Prometheus + Loki) + import dashboards JSON.
12. Bring up `docker compose -f monitoring/docker-compose.yml up -d`; verify targets UP, dashboards populate, logs flow.

## Todo List
- [ ] Install prometheus/pino deps
- [ ] metrics.providers.ts (5 core metrics)
- [ ] metrics.module.ts
- [ ] http-metrics.interceptor.ts (global)
- [ ] guard /metrics endpoint
- [ ] nestjs-pino JSON logging
- [ ] queue depth gauge updater
- [ ] WS connection gauge (PostsGateway)
- [ ] monitoring/docker-compose.yml (5 services)
- [ ] prometheus.yml + alert rules + alertmanager.yml
- [ ] loki + promtail config
- [ ] Grafana datasources + dashboards JSON
- [ ] Verify targets UP + logs + dashboards

## Success Criteria
- Prometheus target for backend = UP; `/metrics` returns app + default metrics.
- Grafana shows HTTP rate/latency, DB query duration, queue depth, WS connections.
- Loki shows structured JSON logs; can filter by level=error.
- Alerts fire on simulated high error rate / queue backlog.

## Risk Assessment
- **Shared files (app.module.ts, main.ts)** with P1/P2/P3 → additive imports; run P8 last to minimize conflict.
- **`/metrics` exposure** → guard + Nginx deny external.
- **Pino replacing Nest logger** → ensure log format still readable in dev (pino-pretty dev only).
- **Monitoring optional** → keep separate compose so failure never blocks app.

## Security Considerations
- `/metrics` internal-only; Grafana behind admin password (and Nginx if exposed).
- No secrets/PII in logs (scrub tokens, emails).

## Next Steps
- Final phase. After this, full production-optimization stack complete.
