import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { SocialModule } from '../social/social.module';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsCollectorService } from './metrics-collector.service';
import { metricProviders } from './metrics.providers';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),
    SocialModule,
  ],
  providers: [
    ...metricProviders,
    MetricsCollectorService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class MetricsModule {}
