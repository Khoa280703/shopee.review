# Research Report: Production Optimization for Next.js 15 + NestJS Social Media Platform

**Date**: 2026-06-25
**Focus**: Frontend & Infrastructure Best Practices
**Server Specs**: 32 cores, 256GB RAM (single powerful server)

---

## 1. TanStack Query (React Query) v5 in Next.js 15 App Router

### Server-Side Prefetch with HydrationBoundary + Dehydrate

**Pattern**: Three-step process:
1. Prefetch data on server via `prefetchQuery()` in Server Component
2. Dehydrate cache to JSON via `dehydrate(queryClient)` 
3. Wrap subtree in `<HydrationBoundary state={dehydratedState}>` to rehydrate on client

**Key Benefits**:
- Eliminates waterfall requests; data already in client cache on first paint
- Server Component can prefetch in layout.tsx or nested components
- Multiple HydrationBoundary zones per page (each with own cache slice) are supported
- As of v5.40.0+: pending queries can be dehydrated without blocking Suspense boundaries

**Code Pattern**:
```typescript
// In Server Component (layout.tsx or page.tsx)
const queryClient = new QueryClient()
await queryClient.prefetchQuery({
  queryKey: ['posts'],
  queryFn: () => fetchPosts()
})

const dehydrated = dehydrate(queryClient)
// Pass to HydrationBoundary wrapper
```

**Critical Insight**: Don't await all prefetches to avoid blocking initial HTML. Use early-kick patterns for streaming.

---

### Client-Side Infinite Scroll with useInfiniteQuery

**Implementation Stack**:
- `useInfiniteQuery` hook (manages pagination state)
- Intersection Observer (react-intersection-observer) for scroll detection
- `getNextPageParam` to determine if more pages exist

**Key Hook Features**:
- `isFetchingNextPage`: tracks if next chunk loading
- `hasNextPage`: boolean indicates more data available
- `fetchNextPage()`: fetches next batch
- Manages multiplage caching automatically

**Optimal Integration**: Use Server Actions with Next.js 15 for data fetching, wrap in useInfiniteQuery for client-side pagination state.

**Trade-off**: useInfiniteQuery requires client-side hydration; balance server prefetch of first page with client-side pagination.

---

### Optimistic Updates for Like, Follow, Comment

**Two Approaches**:

**1. UI-Based (Simple)** - No cache rollback needed:
```typescript
const { mutate } = useMutation({
  mutationFn: likePost,
  onMutate: (newLike) => setOptimisticLikes(prev => prev + 1)
})
// If mutation fails, refetch to correct state
```

**2. Cache-Based (Robust)** - Use `onMutate` with rollback:
```typescript
const { mutate } = useMutation({
  mutationFn: likePost,
  onMutate: async (newLike) => {
    // Save old cache state
    const previousData = queryClient.getQueryData(['post', id])
    // Optimistically update cache
    queryClient.setQueryData(['post', id], old => ({
      ...old, likes: old.likes + 1
    }))
    // Return rollback function
    return previousData
  },
  onError: (err, vars, rollback) => {
    queryClient.setQueryData(['post', id], rollback)
  }
})
```

**Production Recommendation**: Use cache-based for posts/feed queries (affects multiple places), UI-based for isolated actions (button state).

**Fallback**: If mutation fails, onError can trigger refetch to sync with server truth.

---

### staleTime Strategy for Social Media Feed

**Key Tension**: Freshness vs performance on high-traffic feed.

**Recommended Strategy**:
- **Feed list (infinite scroll)**: `staleTime: 1min`, `gcTime: 5min`
  - Users see fresh content regularly but don't refetch aggressively
  - Cached for 5 min if not garbage-collected
- **Individual post detail**: `staleTime: 5min`, `gcTime: 15min`
  - Post content changes less frequently than feed order
- **User profile**: `staleTime: 10min`, `gcTime: 30min`
  - Profile data is relatively stable

**Semantic Detail**: staleTime=0 marks data stale but doesn't garbage-collect; refetch happens in background, stale data served until ready.

**Next.js Integration**: Use `experimental.staleTimes` in next.config.js for router-level cache, separate from TanStack staleTime (two-knob approach).

**For 32-core server**: Can handle aggressive staleTime (5-10 min) for feed without overload.

---

### Avoiding "use client" Sprawl

**Problem**: Server Components provide better DX, but client-side data fetching requires `use client`.

**Best Practice**:
- Keep Server Components for layout/list containers
- Use HydrationBoundary at high level to wrap entire interactive subtree
- Wrap only the minimal client boundary around useInfiniteQuery/mutations
- Leaf components (PostCard, etc.) can be Server Components accepting data as props

**Pattern**:
```typescript
// app/feed/page.tsx (Server Component)
export default async function FeedPage() {
  const initialData = await prefetchFeed()
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FeedClient /> {/* Single "use client" boundary */}
    </HydrationBoundary>
  )
}

// components/feed-client.tsx ("use client")
export function FeedClient() {
  const { data, fetchNextPage } = useInfiniteQuery(...)
  return data.pages.map(page => 
    page.posts.map(post => <PostCard post={post} />) // Can be Server Component
  )
}
```

---

## 2. Meilisearch for Vietnamese Search

### Language Support & Tokenization

**Critical Finding**: Meilisearch **lacks dedicated Vietnamese pipeline** (unlike Chinese, Japanese, Thai, Khmer).

**Current State**:
- Uses default Latin pipeline for Vietnamese (whitespace-delimited tokenization)
- Since Vietnamese uses spaces between words, basic search works
- **However**: No Vietnamese-specific diacritical normalization or stemming (tones: á, à, ả, ã, ạ all treated separately)

**Implication**: Search for "tìm kiếm" won't automatically match "tim kiem" (without diacritics). Users must type exact diacritics or platform must pre-normalize on index time.

**Mitigation Strategy**:
1. Index normalization: On post create/update, normalize Vietnamese to NFD (decomposed form), then strip accents during indexing
2. Query-time normalization: Apply same normalization to search queries
3. Use Charabia library (Meilisearch's tokenizer) for any custom pre-processing

**Tokenizer**: Uses `charabia` library (Rust-based, shipped with Meilisearch).

---

### NestJS Integration & Setup

**Package Options**:
- `nestjs-meili`: Type-safe, decorator-based (@InjectMeiliSearch)
- `nestjs-meilisearch`: v3.0.0, simpler integration
- Direct `meilisearch` npm package (official client)

**Module Registration**:
```typescript
import { MeilisearchModule } from 'nestjs-meilisearch';

@Module({
  imports: [
    MeilisearchModule.forRoot({
      host: 'http://meilisearch:7700', // Docker service name
      apiKey: process.env.MEILI_MASTER_KEY
    })
  ]
})
export class AppModule {}
```

**Docker Setup** (docker-compose):
```yaml
meilisearch:
  image: getmeili/meilisearch:latest
  ports:
    - "7700:7700"
  environment:
    MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
  volumes:
    - meilisearch-data:/meili_data
```

---

### Index Configuration: Posts Example

**Index Settings**:
```typescript
await client.index('posts').updateSettings({
  searchableAttributes: ['title', 'content', 'category', 'username'],
  filterableAttributes: ['categoryId', 'userId', 'createdAt', 'status'],
  sortableAttributes: ['createdAt', '_score', 'likes'],
  pagination: { maxTotalHits: 10000 }
})
```

**Document Structure**:
```typescript
{
  id: string,
  title: string,
  content: string,
  userId: string,
  username: string,
  categoryId: string,
  categoryName: string,
  createdAt: number, // Unix timestamp for sorting
  updatedAt: number,
  likes: number,
  commentCount: number,
  imageUrls: string[],
  status: 'draft' | 'published' | 'archived'
}
```

---

### Faceted Search & Filtering

**Pattern**:
```typescript
// Client-side search
const results = await client.index('posts').search('tìm kiếm', {
  facets: ['categoryId', 'userId'],
  filter: [['userId = 123', 'categoryId = 456']],
  sort: ['createdAt:desc']
})

// Response includes facetDistribution & facetStats
// facetDistribution: { categoryId: { '1': 45, '2': 32 } }
// facetStats: { likes: { min: 0, max: 500 } }
```

**Constraint**: Filterable/facetable attributes must be declared in index settings before search-time.

**UI Pattern**: Display facet counts to user, update filter on selection, re-search.

---

### Sync Strategy: Index on Create/Update/Delete

**Options**:

**1. Synchronous (Simplest)** - Call index API immediately in mutation endpoint:
```typescript
@Post('posts')
async createPost(body: CreatePostDto) {
  const post = await this.postsService.create(body)
  
  // Sync to Meilisearch (queue is handled by Meilisearch)
  await this.meili.index('posts').addDocuments([{
    id: post.id,
    title: post.title,
    content: post.content,
    // ... other fields
  }])
  
  return post
}
```

**2. Event-Driven (Scalable)** - Use NestJS events or Bull queue:
```typescript
// In posts.service.ts
@EventEmitter()
private eventEmitter: EventEmitter2

async create(body: CreatePostDto) {
  const post = await this.db.posts.create(body)
  this.eventEmitter.emit('post.created', post) // Async
  return post
}

@OnEvent('post.created')
async indexPost(post: Post) {
  await this.meili.index('posts').addDocuments([post])
}
```

**3. Background Queue (Recommended)** - Bull + Redis for decoupled sync:
```typescript
// Queue processor
@Process()
async indexPostJob(job: Job<Post>) {
  await this.meili.index('posts').addDocuments([job.data])
}

// Trigger from controller
@Post('posts')
async createPost(body: CreatePostDto) {
  const post = await this.postsService.create(body)
  await this.indexQueue.add(post) // Async queue
  return post
}
```

**Production Recommendation**: Event-driven + Bull queue for decoupling. Sync can lag 1-5 seconds (acceptable for UGC platform).

**Meilisearch Async Queue**: All index operations are queued server-side and processed one-at-a-time per index, so rapid creates won't block.

---

## 3. Nginx as Reverse Proxy: Next.js + NestJS

### WebSocket Proxy Configuration

**Critical Headers** (must be included):
```nginx
location /api/ws {
  proxy_pass http://nestjs-backend:3000;
  
  # WebSocket upgrade headers
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  # Extended timeouts (default 60s kills idle connections)
  proxy_read_timeout 86400s;
  proxy_send_timeout 86400s;
  
  # Disable buffering for real-time
  proxy_buffering off;
}
```

**Stateful Concern**: WebSocket requires sticky sessions. With single server, no issue. If load balancing, use `ip_hash` directive.

---

### Rate Limiting: Per IP, Per Endpoint

**Zone Definition**:
```nginx
# Rate limit zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=2r/s;
limit_req_zone $binary_remote_addr zone=ws_limit:10m rate=100r/s; # Loose for bursts

# Connection limits
limit_conn_zone $binary_remote_addr zone=ws_conn:10m;
```

**Application**:
```nginx
# API endpoints: 10 req/s with burst
location ~ ^/api/ {
  limit_req zone=api_limit burst=20 nodelay;
  proxy_pass http://nestjs-backend:3000;
}

# Auth: stricter, 5 req/s
location ~ ^/api/auth/ {
  limit_req zone=auth_limit burst=5 nodelay;
  proxy_pass http://nestjs-backend:3000;
}

# Upload: 2 req/s max
location ~ ^/api/upload/ {
  limit_req zone=upload_limit burst=2 nodelay;
  proxy_pass http://nestjs-backend:3000;
}

# WebSocket: 100 new conn/s, max 10 concurrent
location /api/ws {
  limit_req zone=ws_limit burst=100 nodelay;
  limit_conn ws_conn 10;
  proxy_pass http://nestjs-backend:3000;
  # ... other WS config
}

# Static: no rate limit
location ~ \.(js|css|jpg|png|svg)$ {
  limit_req off;
  proxy_pass http://nextjs-frontend:3000;
  expires 1d;
}
```

**Burst Behavior**: `burst=20 nodelay` allows 20 requests to queue; `nodelay` processes them immediately rather than spreading across time.

---

### Caching Strategy: Nginx vs App Layer

**Caching Pyramid**:
```
Nginx (Reverse Proxy Cache)
  ↓ (microcache: 1-5s for hot endpoints)
App Cache (TanStack Query, Redis)
  ↓
Database
```

**Nginx Caching** (Static Responses):
```nginx
# Cache GET responses for 5 seconds (microcache)
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m;

location ~ ^/api/feed {
  proxy_cache api_cache;
  proxy_cache_valid 200 5s;
  proxy_cache_key "$scheme$request_method$host$request_uri$cookie_user_id";
  add_header X-Cache-Status $upstream_cache_status;
  proxy_pass http://nestjs-backend:3000;
}
```

**What to Cache at Nginx**: GET /api/feed, GET /api/posts/:id, GET /api/users/:id (idempotent, non-sensitive)

**What NOT to Cache**: POST/PUT/DELETE, /api/auth, WebSocket, personalized data.

**App-Level Cache**: Use TanStack Query + Redis for stateful mutations, user-specific data.

**Single Server Benefit**: No need distributed cache (Redis) if Nginx microcache + app memory suffice. For your specs, in-memory caching OK for <100k users.

---

### SSL Termination & Security Headers

**SSL Config**:
```nginx
server {
  listen 443 ssl http2;
  server_name yourdomain.com;
  
  ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_session_timeout 1d;
  ssl_session_cache shared:SSL:50m;
  
  # OCSP stapling
  ssl_stapling on;
  ssl_stapling_verify on;
}

server {
  listen 80;
  server_name yourdomain.com;
  return 301 https://$server_name$request_uri;
}
```

**Security Headers**:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

**Certbot Renewal** (Let's Encrypt):
```bash
certbot certonly --nginx -d yourdomain.com
# Auto-renewal via systemd timer (default)
```

---

### Compression: Gzip + Brotli

**Configuration**:
```nginx
# Gzip (built-in)
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript;
gzip_comp_level 6;

# Brotli (requires compilation/module)
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/json application/javascript;
```

**Priority**: Brotli if supported (modern browsers), fallback to gzip.

**Compression Gain**: HTML/CSS/JS reduced by 40-50% (Brotli) vs 30-40% (gzip).

**For 32-core server**: Enable both; compression CPU negligible at these specs.

---

## 4. Prometheus + Grafana + Loki Monitoring Stack

### Docker Compose Setup

**Full Stack** (docker-compose.yml):
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yml
      - loki-data:/loki

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log
      - ./promtail-config.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml

volumes:
  prometheus-data:
  grafana-data:
  loki-data:
```

**Size**: All fits on <4GB RAM for single server. Scale-up as needed.

---

### NestJS Integration: prom-client + PrometheusModule

**Package**: `@willsoto/nestjs-prometheus` (wraps prom-client).

**Setup**:
```typescript
// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      defaultLabels: {
        app: 'shopee-review-api',
        env: process.env.NODE_ENV,
      },
      defaultMetrics: { enabled: true }, // Includes Node.js default metrics
    }),
  ],
})
export class AppModule {}
```

**Auto-Exposes**: `/metrics` endpoint in Prometheus format.

---

### Custom Metrics for Social Media

**Key Metrics to Track**:

```typescript
// In posts.service.ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class PostsService {
  constructor(
    @InjectMetric('posts_created_total')
    private postsCreated: Counter<string>,
    
    @InjectMetric('post_creation_duration_seconds')
    private postCreationDuration: Histogram<string>,
    
    @InjectMetric('active_posts_gauge')
    private activePostsGauge: Gauge<string>,
  ) {}

  async createPost(dto: CreatePostDto) {
    const timer = this.postCreationDuration.startTimer()
    try {
      const post = await this.db.posts.create(dto)
      this.postsCreated.inc({ category: dto.category })
      this.activePostsGauge.set(await this.db.posts.count())
      return post
    } finally {
      timer()
    }
  }
}
```

**Register Custom Metrics**:
```typescript
// metrics.provider.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.registerMetrics([
      {
        name: 'posts_created_total',
        help: 'Total posts created',
        type: 'counter',
        labelNames: ['category'],
      },
      {
        name: 'post_creation_duration_seconds',
        help: 'Duration of post creation in seconds',
        type: 'histogram',
        buckets: [0.1, 0.5, 1, 2, 5],
      },
      {
        name: 'active_posts_gauge',
        help: 'Current number of active posts',
        type: 'gauge',
      },
      {
        name: 'database_query_duration_seconds',
        help: 'Database query execution time',
        type: 'histogram',
        labelNames: ['operation', 'table'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1],
      },
      {
        name: 'websocket_connections',
        help: 'Active WebSocket connections',
        type: 'gauge',
      },
      {
        name: 'http_request_duration_seconds',
        help: 'HTTP request latency',
        type: 'histogram',
        labelNames: ['method', 'endpoint', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      },
      {
        name: 'queue_depth_jobs',
        help: 'Jobs waiting in queue',
        type: 'gauge',
        labelNames: ['queue_name'],
      },
    ]),
  ],
})
export class MetricsModule {}
```

---

### Key Metrics for Social Media Platform

**Request/Response**:
- `http_request_duration_seconds` (histogram) - latency by endpoint
- `http_requests_total` (counter) - req/s, status codes
- `http_requests_in_flight` (gauge) - concurrent requests

**Database**:
- `database_query_duration_seconds` (histogram) - by table/operation
- `database_connection_pool_available` (gauge) - connection pool health

**Cache/Search**:
- `meilisearch_index_operations_seconds` (histogram) - indexing latency
- `meilisearch_search_results_count` (histogram) - search result sizes

**Queue**:
- `queue_depth_jobs` (gauge) - pending jobs by queue
- `queue_processing_duration_seconds` (histogram) - job latency

**WebSocket**:
- `websocket_connections` (gauge) - active connections
- `websocket_messages_total` (counter) - messages/sec

**Application**:
- `posts_created_total` (counter) - daily active posts
- `likes_total` (counter) - engagement metric
- `user_registrations_total` (counter) - growth metric

---

### Alertmanager Rules (Example)

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - localhost:9093

rule_files:
  - /etc/prometheus/alert.rules.yml

# alert.rules.yml
groups:
  - name: social_media_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"

      - alert: SlowDatabaseQueries
        expr: histogram_quantile(0.99, database_query_duration_seconds) > 1.0
        for: 5m
        annotations:
          summary: "Database queries slower than 1s (p99)"

      - alert: QueueBacklog
        expr: queue_depth_jobs > 1000
        for: 10m
        annotations:
          summary: "Queue has >1000 pending jobs"

      - alert: LowDiskSpace
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
        annotations:
          summary: "Less than 10% disk space available"
```

---

### Loki + Structured Logging Integration

**Setup**: Use Winston (NestJS logger) + HTTP transport to Loki.

```typescript
// logger.service.ts
import * as winston from 'winston'
import * as Transport from 'winston-loki'

@Injectable()
export class LoggerService {
  private logger: winston.Logger

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console(),
        new Transport({
          host: 'http://loki:3100',
          labels: { app: 'shopee-review', env: process.env.NODE_ENV },
          json: true,
        }),
      ],
    })
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context })
  }

  error(message: string, stack?: string) {
    this.logger.error(message, { stack })
  }
}
```

**Loki Query** (in Grafana):
```logql
{app="shopee-review"} 
  | json 
  | level="error" 
  | __error__!=""
```

**Benefit**: Full-text search logs + Prometheus metrics in one dashboard.

---

## 5. PostgreSQL Materialized Views for Trending/Explore

### CREATE MATERIALIZED VIEW with Score Formula

**Example**: Trending posts based on recent engagement.

```sql
CREATE MATERIALIZED VIEW trending_posts_mv AS
SELECT 
  p.id,
  p.title,
  p.content,
  p.user_id,
  u.username,
  p.category_id,
  p.created_at,
  COALESCE(l.like_count, 0) as likes,
  COALESCE(c.comment_count, 0) as comments,
  
  -- Trending score formula
  (
    COALESCE(l.like_count, 0) * 1 +
    COALESCE(c.comment_count, 0) * 2 +
    COALESCE(s.share_count, 0) * 3 -
    EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 / 2 -- Decay by 2 points per hour
  ) as trending_score
  
FROM posts p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN (
  SELECT post_id, COUNT(*) as like_count 
  FROM likes 
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY post_id
) l ON p.id = l.post_id
LEFT JOIN (
  SELECT post_id, COUNT(*) as comment_count 
  FROM comments 
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY post_id
) c ON p.id = c.post_id
LEFT JOIN (
  SELECT post_id, COUNT(*) as share_count 
  FROM shares 
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY post_id
) s ON p.id = s.post_id

WHERE p.status = 'published'
  AND p.created_at > NOW() - INTERVAL '30 days';

-- Create UNIQUE index (required for CONCURRENT refresh)
CREATE UNIQUE INDEX ON trending_posts_mv (id);
```

**Score Formula Rationale**:
- Like = 1 point
- Comment = 2 points (indicates discussion)
- Share = 3 points (highest engagement)
- Decay = -2 points/hour (newer posts rank higher)
- 7-day engagement window (recency + relevance)

---

### REFRESH MATERIALIZED VIEW CONCURRENTLY

**Without Lock**:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv;
```

**Requirements**:
- Must have UNIQUE index on view (see CREATE UNIQUE INDEX above)
- No expression indexes or WHERE clauses in the unique index
- Column must be NOT NULL or Postgres will treat NULLs as different

**Performance**: If only 100 posts changed since last refresh, CONCURRENT still scans entire query (all 30k posts). Traditional REFRESH might be faster, but locks readers.

**Trade-off**: Choose based on query size and read frequency.

---

### Scheduling Refresh via pg_cron

**Install pg_cron extension**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**Schedule Refresh Every 5 Minutes**:
```sql
SELECT cron.schedule(
  'refresh_trending_posts',
  '*/5 * * * *', -- Every 5 min
  'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv'
);
```

**Alternative**: Every hour:
```sql
SELECT cron.schedule(
  'refresh_trending_posts_hourly',
  '0 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv'
);
```

**Monitor Jobs**:
```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details;
```

---

### Prisma Integration: queryRaw Against Materialized View

**Define Prisma View Model** (schema.prisma):
```prisma
model TrendingPostsMv {
  id           String   @id
  title        String
  content      String
  userId       String
  username     String
  categoryId   String
  createdAt    DateTime
  likes        Int
  comments     Int
  trendingScore Float

  @@map("trending_posts_mv")
}
```

**Query from App**:
```typescript
// posts.service.ts
async getTrendingPosts(limit = 20) {
  const posts = await this.prisma.$queryRaw<TrendingPostsMv[]>`
    SELECT id, title, content, user_id, username, category_id, 
           created_at, likes, comments, trending_score
    FROM trending_posts_mv
    ORDER BY trending_score DESC
    LIMIT ${limit}
  `
  return posts
}
```

**Typed Results**: Prisma v5+ supports `$queryRaw<T>` for type safety.

---

### Index on Materialized View for Query Performance

**Index on trending_score for sorting**:
```sql
CREATE INDEX ON trending_posts_mv (trending_score DESC);
```

**Composite Index** (filter + sort):
```sql
CREATE INDEX ON trending_posts_mv (category_id, trending_score DESC);
```

**Impact**: With index, ORDER BY trending_score DESC on large view is O(log n).

---

### Refresh Frequency Strategy

| View Purpose | Refresh Interval | Reasoning |
|---|---|---|
| Trending/Explore feed | 5 min | Users expect recent trends |
| Category leaderboard | 15 min | Less time-sensitive |
| User stats (profile) | 1 hour | Slowly changing data |
| Archive/historical reports | 1 day | Static aggregations |

**For 32-core server + single instance**: 5-min refresh OK. Monitor query time; if >30s, increase interval or optimize formula.

---

## Key Architectural Decisions for This Server Config

### Single Powerful Server (32 cores, 256GB RAM)

**Advantages**:
- No distributed cache (Redis) needed; in-memory OK
- Simple ops; no inter-service communication latency
- Materialized views refresh locally, no network overhead
- Nginx + app on same box minimal latency

**Constraints**:
- No horizontal scale; optimize vertical (indexing, caching, connection pooling)
- Single failure point; needs backup strategy
- Memory: 256GB supports ~50GB app heap + 30GB cache + 50GB Postgres + 50GB buffer pool

**Configuration Implications**:
- Set Postgres work_mem to 256MB (available per query)
- Nginx worker_processes = 32 (auto)
- Node.js heap = 60-80GB (watch for GC pauses)
- Loki/Prometheus data retention = 30 days (fits in ~100GB local disk)

---

## Summary & Production Checklist

- [x] TanStack Query: HydrationBoundary for feed, useInfiniteQuery for scroll
- [x] Optimistic updates: Cache-based for posts, UI-based for interactions
- [x] staleTime: 1-5 min for feed, 5-10 min for details
- [x] Meilisearch: No Vietnamese tokenizer; normalize at index/query time
- [x] Search sync: Event-driven + Bull queue (async)
- [x] Nginx: SSL, rate limits per endpoint, microcache 1-5s, gzip + brotli
- [x] WebSocket: Upgrade headers, 86400s timeout, sticky sessions
- [x] Monitoring: Prometheus + Grafana for metrics, Loki for logs
- [x] Custom metrics: req/s, DB latency, queue depth, WebSocket connections
- [x] Materialized view: Trending with engagement score + time decay
- [x] Refresh: pg_cron every 5 min, CONCURRENT to avoid locks
- [x] Indexing: Unique index on view ID, separate index on trending_score

---

## Unresolved Questions

1. **Vietnamese tokenization**: Should we pre-normalize Vietnamese text at document indexing time or handle at query time? (Both required for full diacritical matching)
2. **Meilisearch sync error handling**: If queue job fails (network down), should we retry immediately or batch later? (Recommend exponential backoff with Bull)
3. **Materialized view stale reads**: Is acceptable to serve 5-min-old trending data, or must we reduce refresh interval? (User perception vs server load)
4. **Nginx vs app-level caching**: For user profile (semi-personalized), should we cache at Nginx (loses personalization) or app layer only? (App layer recommended)
5. **Postgres WAL archiving**: Should we configure WAL archiving for PITR on single server? (Recommended for data safety)

---

## Sources

- [TanStack Query v5 SSR & HydrationBoundary](https://tanstack.com/query/v5/docs/framework/react/guides/ssr)
- [TanStack Query Prefetching Examples](https://tanstack.com/query/v5/docs/framework/react/examples/nextjs-app-prefetching)
- [TanStack Query Optimistic Updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates)
- [Meilisearch Tokenization Documentation](https://www.meilisearch.com/docs/learn/advanced/tokenization)
- [Meilisearch Faceted Search](https://www.meilisearch.com/docs/learn/filtering_and_sorting/search_with_facet_filters)
- [Nginx WebSocket Reverse Proxy Configuration](https://oneuptime.com/blog/post/2026-01-24-websocket-nginx-reverse-proxy/view)
- [Nginx Rate Limiting Guide](https://www.getpagespeed.com/server-setup/nginx/nginx-rate-limiting)
- [PostgreSQL Materialized Views Documentation](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [PostgreSQL REFRESH MATERIALIZED VIEW CONCURRENTLY](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html)
- [Prometheus + Grafana + Loki Monitoring Stack](https://heroctl.com/en/blog/monitoring-stack-prometheus-grafana-loki)
- [NestJS Prometheus Integration](https://github.com/willsoto/nestjs-prometheus)
- [Nginx Compression & Security Headers](https://www.getpagespeed.com/server-setup/nginx/nginx-reverse-proxy)
