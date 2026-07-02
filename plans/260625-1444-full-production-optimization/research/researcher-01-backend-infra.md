# Backend Infrastructure Research: Redis, Queues, WebSockets, DB Pooling, PM2

**Date:** 2025-06-25  
**Topic:** NestJS 10 + PostgreSQL + Next.js 15 Production Optimization  
**Server Spec:** 32 cores, 256GB RAM  
**Status:** Complete

---

## Executive Summary

For a single-machine deployment with 32 cores and 256GB RAM, the stack should emphasize:
- **Redis + BullMQ** for async jobs (email, Shopee scraping) with Bull Dashboard monitoring
- **Socket.io with Redis adapter** for real-time comments across multiple NestJS instances
- **pgBouncer in transaction mode** for efficient PostgreSQL connection pooling
- **PM2 in Docker** (preferably 1 process per container with Kubernetes/Docker Compose scaling) or standalone PM2 cluster mode if not containerized
- **16 NestJS worker instances** to saturate 16+ cores while keeping memory headroom

---

## Topic 1: Redis + BullMQ Queue in NestJS

### 1.1 Redis + @nestjs/cache-manager Integration

**Installation:**
```bash
npm i @nestjs/cache-manager redis cache-manager-ioredis
# or alternative:
npm i @nestjs/cache-manager @keyv/redis
```

**Two approaches exist:**

#### Approach A: cache-manager-ioredis (Recommended)
```typescript
// app.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import redisStore from 'cache-manager-ioredis';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: redisStore,
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        ttl: 300, // 5 min default
      }),
    }),
  ],
})
export class AppModule {}
```

**Usage in services:**
```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

async getCachedData(key: string) {
  const cached = await this.cacheManager.get(key);
  if (cached) return cached;
  
  const data = await this.fetchData();
  await this.cacheManager.set(key, data, 300000); // 5 min TTL
  return data;
}
```

#### Approach B: @keyv/redis with CacheInterceptor
- Auto-caches controller responses based on route/params
- Simpler for HTTP endpoints, not suitable for services
- Less control over cache invalidation

**Recommendation:** Use **Approach A** for fine-grained control over async job results and social data caching.

**Cache invalidation pattern for comments:**
```typescript
// When new comment posted to post {postId}
await this.cacheManager.del(`post:${postId}:comments`);
await this.cacheManager.del(`post:${postId}:comment-count`);
```

---

### 1.2 BullMQ Setup in NestJS

**Installation:**
```bash
npm i @nestjs/bullmq bullmq
```

**Module configuration:**
```typescript
// queue.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'shopee-scrape' },
      { name: 'notification' }
    ),
  ],
})
export class QueueModule {}
```

**Queue producer (service):**
```typescript
@Injectable()
export class CommentService {
  constructor(
    @InjectQueue('notification') private notificationQueue: Queue,
  ) {}

  async createComment(postId: string, userId: string, text: string) {
    // Save to DB
    const comment = await this.db.comment.create({
      data: { postId, userId, text },
    });

    // Queue notification async
    await this.notificationQueue.add('notify-post-author', {
      postId,
      commenterId: userId,
      commentText: text,
    });

    return comment;
  }
}
```

**Queue processor (worker):**
```typescript
// notification.processor.ts
@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  @Process('notify-post-author')
  async handleNotifyPostAuthor(job: Job<{
    postId: string;
    commenterId: string;
    commentText: string;
  }>) {
    try {
      const post = await this.db.post.findUnique({
        where: { id: job.data.postId },
        include: { author: true, comments: true },
      });

      if (!post) return;

      // Send email via Resend
      await this.emailService.sendNewCommentNotification({
        to: post.author.email,
        postTitle: post.title,
        authorName: post.author.name,
        commentText: job.data.commentText,
      });

      return { sent: true };
    } catch (error) {
      // Retry with exponential backoff (default: 5 retries)
      throw error;
    }
  }

  @Process('scrape-shopee')
  async handleScrapShopee(job: Job<{ productUrl: string }>) {
    // Rate-limited Playwright scraper with cache
    const cached = await this.cacheManager.get(`shopee:${productUrl}`);
    if (cached) return cached;

    const browser = await playwright.chromium.launch();
    try {
      const data = await this.shopeeScraperService.scrape(productUrl);
      await this.cacheManager.set(`shopee:${productUrl}`, data, 86400000); // 24h
      return data;
    } finally {
      await browser.close();
    }
  }
}
```

**Configuration for Resend + Playwright jobs:**
```typescript
// Email queue - low concurrency (Resend rate limit ~100/min)
BullModule.registerQueue({
  name: 'email',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { age: 3600 }, // 1h
    removeOnFail: { age: 86400 }, // 24h
  },
  settings: {
    maxStalledCount: 2,
    lockDuration: 30000,
    lockRenewTime: 15000,
  },
})

// Shopee scrape queue - higher concurrency (Playwright instances)
BullModule.registerQueue({
  name: 'shopee-scrape',
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
  settings: {
    maxStalledCount: 1,
  },
})
```

**Worker configuration in ecosystem.config.js (see PM2 section):**
- Email processor: 1-2 workers (Resend API limited)
- Shopee scraper: 4-6 workers (Playwright intensive)

---

### 1.3 Redis Configuration for Social Media Workload

**For a 32-core, 256GB server, allocate 64-96GB to Redis:**

```conf
# redis.conf
maxmemory 96gb
maxmemory-policy allkeys-lru  # For pure cache workload
# OR
maxmemory-policy volatile-lru # If mixing cache + persistent queues

# Persistence (for queue durability)
save 900 1        # Snapshot every 15 min if 1+ key changed
save 300 10       # Snapshot every 5 min if 10+ keys changed
appendonly yes    # AOF enabled for durability
appendfsync everysec  # Trade-off: fast but some loss on crash

# Performance tuning
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Memory optimization
hash-max-listpack-entries 512
hash-max-listpack-value 64
list-max-listpack-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-listpack-entries 128
zset-max-listpack-value 64

# Clients
maxclients 10000

# Slowlog
slowlog-log-slower-than 10000  # Log queries slower than 10ms
slowlog-max-len 128
```

**Recommended maxmemory-policy:**
- **allkeys-lru**: Best for pure caching (comments, posts, user sessions)
- **volatile-lru**: If queues must survive crashes (combine with TTL on cache keys)

**Docker Compose:**
```yaml
redis:
  image: redis:7.2-alpine
  command: redis-server --maxmemory 96gb --maxmemory-policy allkeys-lru --appendonly yes
  ports:
    - "6379:6379"
  volumes:
    - redis-data:/data
  ulimits:
    nofile: 262144
  environment:
    - TZ=UTC

volumes:
  redis-data:
```

---

### 1.4 Bull Dashboard Setup

**Installation:**
```bash
npm i @bull-board/nestjs @bull-board/api @bull-board/express
```

**Integration:**
```typescript
// queue.module.ts
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'email',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'shopee-scrape',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'notification',
      adapter: BullMQAdapter,
    }),
  ],
})
export class QueueModule {}
```

**Secure with auth middleware in main.ts:**
```typescript
app.use('/admin/queues', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token === process.env.ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
});
```

**Access:** `http://localhost:3000/admin/queues` (shows all queue stats, job history, retry buttons)

---

## Topic 2: Socket.io in NestJS for Live Comments

### 2.1 @nestjs/websockets Gateway Setup

**Installation:**
```bash
npm i @nestjs/websockets @nestjs/platform-socket.io socket.io
```

**Basic gateway:**
```typescript
// comments.gateway.ts
import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/comments',
  cors: { 
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
})
export class CommentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly commentService: CommentService) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.validateSocket(client);
      client.data.userId = user.id;
      console.log(`User ${user.id} connected: ${client.id}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Validate JWT from handshake
  private async validateSocket(socket: Socket): Promise<User> {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error('No token provided');
    
    const payload = await this.jwtService.verifyAsync(token);
    return await this.usersService.findById(payload.sub);
  }

  // User joins post room when viewing post/{postId}
  @SubscribeMessage('join-post')
  async handleJoinPost(
    client: Socket,
    payload: { postId: string }
  ) {
    const room = `post:${payload.postId}`;
    client.join(room);
    
    // Notify others in room
    this.server.to(room).emit('user-joined', {
      userId: client.data.userId,
      timestamp: new Date(),
    });

    return { success: true, room };
  }

  // User leaves post when navigating away
  @SubscribeMessage('leave-post')
  async handleLeavePost(
    client: Socket,
    payload: { postId: string }
  ) {
    client.leave(`post:${payload.postId}`);
    return { success: true };
  }
}
```

### 2.2 Room-Based Broadcasting for Comments

**Emit from CommentService (not just gateway):**
```typescript
// comments.service.ts
@Injectable()
export class CommentService {
  constructor(
    private readonly commentsGateway: CommentsGateway,
  ) {}

  async createComment(postId: string, userId: string, text: string) {
    const comment = await this.db.comment.create({
      data: { postId, userId, text },
      include: { author: true },
    });

    // Broadcast to all users in post:postId room
    this.commentsGateway.server
      .to(`post:${postId}`)
      .emit('new-comment', {
        id: comment.id,
        postId: comment.postId,
        author: {
          id: comment.author.id,
          name: comment.author.name,
          avatar: comment.author.avatar,
        },
        text: comment.text,
        createdAt: comment.createdAt,
      });

    // Invalidate cache
    await this.cacheManager.del(`post:${postId}:comments`);

    return comment;
  }

  async deleteComment(commentId: string) {
    const comment = await this.db.comment.findUnique({
      where: { id: commentId },
    });

    await this.db.comment.delete({ where: { id: commentId } });

    // Broadcast to post room
    this.commentsGateway.server
      .to(`post:${comment.postId}`)
      .emit('comment-deleted', { commentId });

    await this.cacheManager.del(`post:${comment.postId}:comments`);
  }
}
```

### 2.3 Redis Adapter for Multi-Process Socket.io

**Installation:**
```bash
npm i @socket.io/redis-adapter redis
```

**Configure in main.ts:**
```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

class RedisIoAdapter extends IoAdapter {
  private adapterInstance: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterInstance = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterInstance);
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(3000);
}
```

**Effect:** All 16 NestJS instances can reach all connected clients across the cluster.

### 2.4 JWT Auth in WebSocket Handshake

**Already shown in gateway validation above, but explicit pattern:**

```typescript
// Client side (Next.js)
const socket = io('http://api.example.com/comments', {
  auth: {
    token: localStorage.getItem('jwt'),
  },
  transports: ['websocket'], // Avoid polling if behind load balancer
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// Server side (custom middleware in gateway)
@WebSocketGateway()
export class CommentsGateway {
  private async validateSocket(socket: Socket) {
    const token = socket.handshake.auth.token;
    const decoded = await this.jwtService.verifyAsync(token, {
      secret: process.env.JWT_SECRET,
    });
    return decoded;
  }
}
```

---

### 2.5 Next.js 15 App Router Socket.io Client Pattern

**Installation:**
```bash
npm i socket.io-client
```

**Create a context for socket persistence across routes:**
```typescript
// lib/socket-context.tsx
'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Only initialize on client side
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('jwt');
    if (!token) return;

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const socket = useContext(SocketContext);
  if (!socket) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return socket;
}
```

**Wrap root layout:**
```typescript
// app/layout.tsx
import { SocketProvider } from '@/lib/socket-context';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
```

**Use in page components:**
```typescript
// app/[username]/[postId]/page.tsx
'use client';
import { useSocket } from '@/lib/socket-context';
import { useEffect, useState } from 'react';

export default function PostPage({ params }: { params: { postId: string } }) {
  const socket = useSocket();
  const [comments, setComments] = useState([]);

  useEffect(() => {
    if (!socket) return;

    // Join post room
    socket.emit('join-post', { postId: params.postId });

    // Listen for new comments
    socket.on('new-comment', (comment) => {
      setComments((prev) => [comment, ...prev]);
    });

    socket.on('comment-deleted', ({ commentId }) => {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    });

    return () => {
      socket.emit('leave-post', { postId: params.postId });
      socket.off('new-comment');
      socket.off('comment-deleted');
    };
  }, [socket, params.postId]);

  return (
    <div>
      {/* Post content and comments */}
    </div>
  );
}
```

**Key SSR considerations:**
- Socket initialization happens **only in useEffect** (browser only)
- SocketProvider wraps at root layout (persists across route changes)
- No WebSocket calls at module level or in server components

---

## Topic 3: pgBouncer Connection Pooling

### 3.1 pgBouncer Modes & Prisma Compatibility

| Mode | Behavior | Prisma Compatible | Notes |
|------|----------|-------------------|-------|
| **transaction** | Connection released after each transaction | ✅ Yes | **Recommended** — efficient reuse, prepared statements via `max_prepared_statements` |
| **session** | Connection tied to client session | ⚠️ Partial | High connection overhead; no real benefit for app servers |
| **statement** | Connection released after each query | ❌ No | Incompatible with Prisma (breaks multi-statement transactions) |

**For Prisma + NestJS with 16 instances: Use TRANSACTION mode.**

### 3.2 Pool Size Calculation

**Formula:**
```
default_pool_size = (DB_CONNECTIONS - reserved) / max_client_connections
```

For a single 32-core machine:
- 16 NestJS instances × 10 concurrent requests/instance = 160 max concurrent
- PostgreSQL max_connections: 200 (default on most hosts)
- Reserved for maintenance: 20
- Available: 180

**Recommended pgBouncer pool config:**
```ini
default_pool_size = 10        # 180 / 18 instances (includes scraper)
min_pool_size = 5
reserve_pool_size = 2
reserve_pool_timeout = 3

# Per-process limits for safety
max_client_conn = 100
max_db_conn = 160
```

With 10-size pools per instance:
- 16 NestJS workers × 10 = 160 connections (within limit)
- 1-2 scraper workers × 10 = 10-20 connections
- Total: ~180 connections (optimal)

### 3.3 Docker Compose Setup

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: shopee_review
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: shopee_review
    ports:
      - "5433:5432"  # Internal only
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shopee_review"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: pgbouncer:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASES_HOST: postgres
      DATABASES_PORT: 5432
      DATABASES_USER: shopee_review
      DATABASES_PASSWORD: ${DB_PASSWORD}
      DATABASES_DBNAME: shopee_review
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_DEFAULT_POOL_SIZE: 10
      PGBOUNCER_MIN_POOL_SIZE: 5
      PGBOUNCER_MAX_CLIENT_CONN: 100
    ports:
      - "6432:6432"
    volumes:
      - ./pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    healthcheck:
      test: ["CMD", "psql", "-U", "shopee_review", "-d", "shopee_review", "-c", "SELECT 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:

networks:
  default:
    name: shopee-network
```

**pgbouncer.ini:**
```ini
[databases]
shopee_review = host=postgres port=5432 user=shopee_review password=ENV_DB_PASSWORD

[pgbouncer]
pool_mode = transaction
default_pool_size = 10
min_pool_size = 5
reserve_pool_size = 2
reserve_pool_timeout = 3
max_client_conn = 100
max_db_conn = 160
max_idle_time = 600
server_lifetime = 3600
server_idle_timeout = 600
query_timeout = 0

# Prepared statement support
max_prepared_statements = 100
pkt_buf = 4096

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
verbose = 1

# Health checks
server_check_query = select 1
server_check_delay = 30

# Admin/monitoring
admin_users = postgres
stats_users = postgres
```

### 3.4 Prisma Configuration

**With pgBouncer in transaction mode:**

```env
# .env
DATABASE_URL="postgresql://shopee_review:password@pgbouncer:6432/shopee_review?schema=public&pgbouncer=true"
```

**prisma/schema.prisma:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Connection pool size per instance
// pgBouncer handles the pooling; Prisma's pool is minimal
client {
  binaryTargets = ["native", "linux-musl"]
  // pgBouncer abstracts away connection management
}
```

**NestJS Prisma service:**
```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**Key Prisma + pgBouncer notes:**
- pgBouncer=true in URL enables special handling for prepared statements
- Prisma's internal pool is set to 2-5 (pgBouncer handles the real pooling)
- Connection reuse is automatic; no code changes needed

---

## Topic 4: PM2 Cluster Mode for NestJS

### 4.1 Ecosystem Configuration for 16 Instances

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      // Main NestJS API
      name: 'shopee-api',
      script: 'dist/main.js',
      instances: 16,
      exec_mode: 'cluster',
      max_memory_restart: '800M', // Per instance

      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // File watching (disable in production)
      watch: process.env.NODE_ENV === 'development',
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'dist', 'logs'],

      // Logging
      output: 'logs/out.log',
      error: 'logs/err.log',
      merge_logs: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Restart policies
      max_restarts: 10,
      min_uptime: 30000, // Min 30s uptime before counting as restart
      autorestart: true,

      // Advanced
      cron_restart: '0 0 * * *', // Daily restart at midnight
    },

    {
      // Email queue processor (separate workers)
      name: 'shopee-email-worker',
      script: 'dist/workers/email.worker.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        WORKER_NAME: 'email',
      },
    },

    {
      // Shopee scraper queue processor
      name: 'shopee-scraper-worker',
      script: 'dist/workers/scraper.worker.js',
      instances: 4,
      exec_mode: 'cluster',
      max_memory_restart: '1G', // Playwright needs more RAM
      env: {
        NODE_ENV: 'production',
        WORKER_NAME: 'scraper',
        WORKERS_CONCURRENCY: 2, // 2 concurrent Playwright instances per worker
      },
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      key: '/path/to/ssh/key',
      ref: 'origin/main',
      repo: 'git@github.com:user/repo.git',
      path: '/var/www/shopee-api',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
    },
  },
};
```

### 4.2 Zero-Downtime Reload

**Graceful shutdown handling in NestJS:**
```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received: shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received: shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  const port = process.env.PORT || 3001;
  const server = await app.listen(port);

  // Emit PM2 ready signal
  if (process.send) {
    process.send('ready');
  }
}
```

**Reload command (zero downtime):**
```bash
# Reload one instance at a time, no downtime
pm2 reload shopee-api

# Or with specific ecosystem
pm2 reload ecosystem.config.js --env production
```

**How it works:**
1. PM2 sends SIGTERM to worker 1
2. Worker 1 finishes in-flight requests and exits (max 30s timeout)
3. PM2 starts new worker 1
4. Process repeats for workers 2-16 while others handle traffic
5. **Result:** Zero requests dropped during reload

---

### 4.3 PM2 in Docker vs Standalone

**Option A: PM2 in Docker (Recommended if not using Kubernetes)**

Use pm2-runtime (optimized for containers):

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .

RUN npm ci --omit=dev
RUN npm run build
RUN npm install -g pm2

EXPOSE 3001

CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
```

**Docker Compose:**
```yaml
api:
  build: .
  instances: 3          # Run 3 containers
  ports:
    - "3001:3001"
  environment:
    - NODE_ENV=production
    - REDIS_HOST=redis
    - DATABASE_URL=postgresql://...
  depends_on:
    - postgres
    - redis
  restart: unless-stopped
```

This gives you:
- 3 containers × 16 instances = 48 NestJS processes (overkill for single machine)
- Better: 1 container with 16 instances in ecosystem.config.js

**Option B: Standalone PM2 (Single VM, not containerized)**

```bash
pm2 start ecosystem.config.js --env production
pm2 startup
pm2 save
```

This gives you:
- 16 NestJS instances on 16+ cores
- Email workers (2 instances)
- Scraper workers (4 instances)
- PM2 Monitor/Plus for metrics
- Process restarts on crash

---

### 4.4 Memory/CPU Limits Per Instance

**Allocate for 16 NestJS instances on 32-core, 256GB server:**

```javascript
// Per-instance memory budget
Total RAM: 256GB
- Redis: 96GB
- PostgreSQL: 40GB
- OS/system: 20GB
- Available for NestJS: ~100GB

Per instance: 100GB / 16 = 6.25GB

// Conservative allocation
max_memory_restart: '800M'  // Restart if exceeds 800MB per instance
```

**CPU affinity (pin instances to cores):**

```bash
# Install nodecore for affinity
npm i nodecore

# In PM2 config:
# exec_mode: 'cluster',
# exec_args: '--cpu-affinity=16',  # Use 16 CPU cores
```

**Monitor resource usage:**
```bash
pm2 monit                    # Real-time monitoring
pm2 logs shopee-api          # Stream logs
pm2 show shopee-api          # Instance details
```

---

## Implementation Checklist

- [ ] **Redis Setup**
  - [ ] Deploy Redis with 96GB maxmemory, allkeys-lru policy
  - [ ] Enable persistence (AOF + snapshots)
  - [ ] Configure slowlog monitoring
  - [ ] Set up Redis CLI monitoring tools

- [ ] **BullMQ Queues**
  - [ ] Register email queue (2 processors)
  - [ ] Register scraper queue (4 processors)
  - [ ] Register notification queue (1 processor)
  - [ ] Implement Resend email processor with retries
  - [ ] Implement Playwright scraper with caching
  - [ ] Deploy Bull Dashboard on `/admin/queues`

- [ ] **Socket.io Setup**
  - [ ] Create CommentsGateway with Redis adapter
  - [ ] Implement JWT validation in handshake
  - [ ] Configure room-based broadcasting
  - [ ] Create SocketProvider in Next.js
  - [ ] Test Socket.io with 50+ concurrent users
  - [ ] Verify Redis adapter pub/sub working

- [ ] **pgBouncer Deployment**
  - [ ] Deploy pgBouncer in transaction mode
  - [ ] Configure pool_size=10, min=5
  - [ ] Update Prisma DATABASE_URL with pgbouncer=true
  - [ ] Run load tests to verify connection reuse
  - [ ] Monitor pgBouncer stats with `SHOW STATS`

- [ ] **PM2 Cluster Setup**
  - [ ] Create ecosystem.config.js with 16 instances
  - [ ] Implement graceful shutdown in NestJS
  - [ ] Test zero-downtime reload
  - [ ] Configure memory limits (800M per instance)
  - [ ] Set up PM2 monitoring/logging
  - [ ] Deploy with pm2-runtime or standalone

---

## Unresolved Questions

1. **Shopee scraping rate limits:** How many concurrent Playwright instances before Shopee blocks? Suggest starting with 4 workers, 2 concurrency each = 8 parallel browsers, monitor for 403/429 errors.

2. **Socket.io scaling beyond 1000 users:** Redis adapter handles multi-process, but at 5000+ concurrent users on 16 cores, may need load-balanced API layer. Suggest monitoring Socket.io connections per instance.

3. **Backup strategy for Redis queues:** Currently, jobs are durable (AOF enabled), but no replication. For 99.9% SLA, consider Redis Sentinel or migration to Redis Enterprise.

4. **PM2 vs Kubernetes:** Single-machine PM2 is fine now, but growth path to Kubernetes requires rethinking deployment. Suggest documenting migration steps when needed.

---

## Sources

### Redis + Cache Manager
- [Integrating Redis with Cache Manager in Your NestJS Application](https://blog.poespas.me/posts/2024/05/27/nestjs-integrate-redis-with-cache-manager/)
- [How to Use Redis with NestJS: A Simple Guide to Caching](https://medium.com/@dipghoshraj/how-to-use-redis-with-nestjs-a-simple-guide-to-caching-b9408d96243e)
- [GitHub - railsstudent/nestjs-10-ioredis](https://github.com/railsstudent/nestjs-10-ioredis)

### BullMQ & NestJS Queues
- [NestJs | BullMQ Documentation](https://docs.bullmq.io/guide/nestjs)
- [Mastering BullMQ in NestJS: A Step-by-Step Introduction](https://blog.nashtechglobal.com/mastering-bullmq-in-nestjs-a-step-by-step-introduction-part-1/)
- [Using BullMQ with NestJS for Background Job Processing](https://medium.com/mahabub-r.medium.com/using-bullmq-with-nestjs-for-background-job-processing-320ab938048a)

### Redis Configuration & Memory
- [Key eviction - Redis Docs](https://redis.io/docs/latest/develop/reference/eviction/)
- [Memory management best practices | Google Cloud Memorystore](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices)
- [How to Configure Redis maxmemory and Eviction Policy](https://oneuptime.com/blog/post/2026-03-31-redis-maxmemory-eviction-policy/view)

### Bull Dashboard
- [Mastering BullMQ in NestJS: Bull Board Setup and Best Practices](https://blog.nashtechglobal.com/mastering-bullmq-in-nestjs-bull-board-setup-and-best-practices-part-2/)
- [@bull-board/nestjs NPM](https://www.npmjs.com/package/@bull-board/nestjs)

### Socket.io + WebSockets
- [How to Build NestJS WebSocket Gateway with Redis Adapter](https://oneuptime.com/blog/post/2026-03-31-redis-nestjs-websocket-gateway-adapter/view)
- [Building a Production-Ready Real-Time Notification System in NestJS](https://medium.com/@marufpulok98/building-a-production-ready-real-time-notification-system-in-nestjs-websockets-redis-offline-6cc2f1bd0b05)
- [Clustering and scaling Socket.io server using Node.js, Nest.js and Redis](https://medium.com/@mohsenmahoski/clustering-and-scaling-socket-io-server-using-node-js-nest-js-and-redis-43e8e67847b7)

### Socket.io Authentication
- [Secure WebSocket Communication with JWT Authentication in NestJS](https://node.kumarchaudhary.com.np/securing-socketio-in-nestjs-with-jwt-and-passport-a-comprehensive-guide)
- [The Best Way to Authenticate WebSockets in NestJS](https://preetmishra.com/blog/the-best-way-to-authenticate-websockets-in-nestjs)
- [WebSocket Authentication in NestJS: Handling JWT and Guards](https://dev.to/mouloud_hasrane_c99b0f49a/websocket-authentication-in-nestjs-handling-jwt-and-guards-4j27)

### Socket.io + Next.js
- [How to use with Next.js | Socket.IO](https://socket.io/how-to/use-with-nextjs)
- [Integrating Socket.IO with the App Router](https://github.com/vercel/next.js/discussions/50097)
- [WebSockets with Next.js: SSR, App Router, and Vercel](https://websocket.org/guides/frameworks/nextjs/)

### pgBouncer & Prisma
- [PgBouncer: Database Connection Pooling That Actually Scales](https://dev.to/whoffagents/pgbouncer-database-connection-pooling-that-actually-scales-4ek4)
- [Connection pooling in Prisma Postgres](https://www.prisma.io/docs/postgres/database/connection-pooling)
- [Configure Prisma Client with PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [PgBouncer Connection Pooling: Transaction vs Session Mode Guide](https://qisthi.dev/blog/pgbouncer-connection-pooling-modes/)

### PM2 Cluster Mode
- [PM2 Ecosystem Setup Guide for Node.js/NestJS](https://medium.com/@zulfikarditya/pm2-ecosystem-setup-guide-for-node-js-nestjs-45b0eee8629a)
- [PM2 - Cluster Mode Documentation](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [How to Use PM2 Clusters with NodeJS for Zero Downtime Deployment](https://ryanschiang.com/pm2-cluster-zero-downtime)
- [Zero-downtime Node.js deploys with PM2 cluster mode](https://lumadock.com/tutorials/zero-downtime-nodejs-deploys-pm2)

### PM2 + Docker
- [PM2 vs Docker: From local development to enterprise scale on azure](https://ralfmajumdar.com/2025/09/pm2-docker-azure-container-strategy/)
- [Docker Integration - PM2.io](https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/)
- [PM2 vs Node Cluster vs Docker — What Actually Matters in Production](https://dev.to/prateekbka/pm2-vs-node-cluster-vs-docker-what-actually-matters-in-production-12pp)
- [PM2 and Docker - Choosing the Right Process Manager for Node.js in Production](https://leapcell.io/blog/pm2-and-docker-choosing-the-right-process-manager-for-node-js-in-production)
