import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const HTTP_REQUEST_DURATION = 'http_request_duration_seconds';
export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const QUEUE_DEPTH = 'queue_depth_jobs';
export const WEBSOCKET_CONNECTIONS = 'websocket_connections';

export const metricProviders = [
  makeHistogramProvider({
    name: HTTP_REQUEST_DURATION,
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  }),
  makeCounterProvider({
    name: HTTP_REQUESTS_TOTAL,
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
  }),
  makeGaugeProvider({
    name: QUEUE_DEPTH,
    help: 'Pending + active jobs per queue',
    labelNames: ['queue'],
  }),
  makeGaugeProvider({
    name: WEBSOCKET_CONNECTIONS,
    help: 'Current Socket.io connections',
  }),
];
