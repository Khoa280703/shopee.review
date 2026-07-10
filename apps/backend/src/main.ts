import './instrument';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { parseAllowedOrigins } from './common/shopee-url';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { RedisIoAdapter } from './social/redis-io.adapter';

// Postgres BIGINT columns (click_logs.id, notifications.id) surface as JS bigint,
// which JSON.stringify refuses to serialize (throws). Serialize as a Number —
// exact for values well under 2^53, far beyond any realistic row id — so the API
// contract keeps ids as JSON numbers after the int4→bigint migration.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  // bufferLogs so startup logs flow through Pino once it's resolved.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Production chain is Traefik → nginx → backend (2 private-network hops), but
  // the dev path (nginx published on :8081) is 1 hop. A fixed hop count would be
  // wrong for one of them, so trust every proxy on loopback/private ranges and
  // take the left-most non-trusted XFF entry as the real client. Without this,
  // req.ip = a proxy IP and per-IP throttling + click dedup collapse to one bucket.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  // Multi-instance Socket.io broadcasting when Redis is available; default
  // in-memory adapter otherwise (single instance / host dev).
  if (process.env.REDIS_URL) {
    const redisAdapter = new RedisIoAdapter(app);
    await redisAdapter.connectToRedis(process.env.REDIS_URL);
    app.useWebSocketAdapter(redisAdapter);
  }
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'r/:postId', method: RequestMethod.GET },
      // Bull Board mounts its own router; keep it off the /api prefix so its
      // basePath matches the mount point (auth handled in QueueModule).
      { path: 'admin/queues', method: RequestMethod.ALL },
      // Expose Prometheus scrape target at /metrics (no /api prefix).
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.use(cookieParser());
  const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);
  app.enableCors({
    origin: (origin, cb) => {
      // Exact match only — startsWith allowed https://shopee.review.evil.com.
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  await app.listen(Number(process.env.PORT) || 3066);
}

void bootstrap();
