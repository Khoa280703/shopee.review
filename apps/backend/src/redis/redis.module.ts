import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

/**
 * Shared Redis client for cache-adjacent primitives: SSE pub/sub fan-out,
 * distributed cron locks, etc. Resolves to `null` when REDIS_URL is unset
 * (host dev / single instance) so consumers degrade gracefully.
 *
 * Note: Socket.io and cache-manager keep their own dedicated clients; this one
 * is for app-level pub/sub + locking.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
export type AppRedisClient = RedisClientType | null;

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async (): Promise<AppRedisClient> => {
    const url = process.env.REDIS_URL;
    if (!url) return null;
    const logger = new Logger('RedisClient');
    const client: RedisClientType = createClient({ url });
    client.on('error', (e) => logger.error(`redis: ${e}`));
    await client.connect();
    logger.log('Shared Redis client connected');
    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisModule {}
