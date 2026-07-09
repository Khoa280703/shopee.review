import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limiter that EXEMPTS internal server-to-server traffic.
 *
 * Next.js SSR calls the backend directly over the Docker network
 * (API_INTERNAL_URL=http://backend:3066), bypassing nginx — so those requests
 * carry no `X-Forwarded-For`. Without this exemption every SSR request would be
 * keyed to the single frontend-container IP, share one bucket, and 429 the whole
 * site under light load (one home render ≈ 3 backend calls).
 *
 * Real client traffic always arrives through nginx/Traefik, which sets XFF. The
 * backend port is never published to the host, so a request WITHOUT XFF can only
 * originate from a trusted service inside the compose network → safe to skip.
 */
/**
 * True when a request did NOT pass through the reverse proxy (no X-Forwarded-For)
 * → an internal SSR/service call that must be exempt from per-IP throttling.
 */
export function isInternalRequest(headers: Record<string, unknown> | undefined): boolean {
  return headers?.['x-forwarded-for'] === undefined;
}

@Injectable()
export class SmartThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Preserve @SkipThrottle() handling and any base behavior first.
    if (await super.shouldSkip(context)) return true;
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    return isInternalRequest(req?.headers);
  }
}
