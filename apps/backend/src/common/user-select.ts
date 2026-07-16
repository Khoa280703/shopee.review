import { Prisma } from '@app/database';

/**
 * The public shape of a user shown as a content author (post/comment author,
 * notification actor, follow lists). Centralized so the `verified` badge and any
 * future public field appear consistently everywhere an author is rendered.
 */
export const PUBLIC_AUTHOR_SELECT = {
  username: true,
  displayName: true,
  avatarUrl: true,
  verified: true,
} satisfies Prisma.UserSelect;
