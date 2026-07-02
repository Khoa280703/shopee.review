import * as Sentry from '@sentry/nestjs';

// Must be imported before AppModule so instrumentation patches early spans.
// No-op when SENTRY_DSN is unset, so local dev is unaffected.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) {
    // Scrub potentially sensitive request data.
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
});
