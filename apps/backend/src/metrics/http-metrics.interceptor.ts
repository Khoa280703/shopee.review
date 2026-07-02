import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Histogram } from 'prom-client';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  HTTP_REQUEST_DURATION,
  HTTP_REQUESTS_TOTAL,
} from './metrics.providers';

/**
 * Records per-request latency + count. Uses the matched route pattern
 * (e.g. /posts/:slug) rather than the raw URL to keep label cardinality low.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(HTTP_REQUEST_DURATION)
    private readonly duration: Histogram<string>,
    @InjectMetric(HTTP_REQUESTS_TOTAL)
    private readonly total: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = process.hrtime.bigint();
    const method: string = req.method ?? 'UNKNOWN';

    return next.handle().pipe(
      finalize(() => {
        const route: string =
          req.route?.path ?? req.originalUrl?.split('?')[0] ?? 'unknown';
        const status = String(res.statusCode ?? 0);
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        const labels = { method, route, status };
        this.duration.observe(labels, seconds);
        this.total.inc(labels);
      }),
    );
  }
}
