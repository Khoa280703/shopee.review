import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { REDIS_CLIENT, type AppRedisClient } from './redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  @Get()
  async health() {
    // Real readiness: a failing DB must fail the probe (503) so Docker/Traefik
    // stop routing to a dead instance instead of the previous static {ok:true}.
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ ok: false, db: 'down' });
    }

    // Redis is optional (app functions without it) → report degraded, still 200.
    let redisOk: boolean | undefined;
    if (this.redis) {
      try {
        await this.redis.ping();
        redisOk = true;
      } catch {
        redisOk = false;
      }
    }

    return {
      ok: true,
      service: 'shopee-review-api',
      db: 'up',
      ...(redisOk === undefined ? {} : { redis: redisOk ? 'up' : 'down', degraded: !redisOk }),
    };
  }
}
