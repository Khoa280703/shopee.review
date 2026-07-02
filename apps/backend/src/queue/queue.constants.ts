export const EMAIL_QUEUE = 'email-queue';
export const SCRAPER_QUEUE = 'scraper-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';
export const INDEX_QUEUE = 'index-queue';

export const EMAIL_JOB = {
  VERIFY: 'verify',
} as const;

export const SCRAPER_JOB = {
  SCRAPE: 'scrape',
} as const;

export const NOTIFICATION_JOB = {
  FANOUT: 'fanout',
} as const;

export const INDEX_JOB = {
  UPSERT: 'upsert',
  DELETE: 'delete',
} as const;

export interface IndexJob {
  postId: number;
}

export interface VerifyEmailJob {
  email: string;
  token: string;
}

export interface ScrapeJob {
  url: string;
}

export interface NotificationFanoutJob {
  actorId: number;
  postId: number;
  type: 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MENTION';
  recipientId: number;
}

/** Queues require Redis. When REDIS_URL is unset, callers fall back to sync. */
export const isQueueEnabled = (): boolean => !!process.env.REDIS_URL;
