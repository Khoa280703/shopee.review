import './instrument';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { RedisIoAdapter } from './social/redis-io.adapter';

async function bootstrap() {
  // bufferLogs so startup logs flow through Pino once it's resolved.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5166')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.some((o) => origin.startsWith(o))) {
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
