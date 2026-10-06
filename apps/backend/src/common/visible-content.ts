import { Prisma } from '@app/database';

/**
 * Single source of truth for "is this content visible to the public" across
 * every read path (feed, explore, following, trending, search, post detail,
 * profile, comments). Content is hidden when it was soft-deleted (self or
 * moderation) OR its author is banned (level-2 moderation). A SUSPENDED
 * author's content stays visible — suspension only locks login.
 */
export const VISIBLE_POST_WHERE = {
  deletedAt: null,
  user: { bannedAt: null },
} satisfies Prisma.PostWhereInput;

export const VISIBLE_COMMENT_WHERE = {
  deletedAt: null,
  user: { bannedAt: null },
} satisfies Prisma.CommentWhereInput;

/**
 * Top-level comment listing filter (M2): a deleted parent comment that still
 * has at least one live reply stays in the list as a placeholder ("Bình luận
 * đã bị xoá") instead of disappearing outright — the previous plain
 * `VISIBLE_COMMENT_WHERE` filter hid the whole row, which also hid its
 * undeleted replies nested under it. Scoped to top-level only: a deleted
 * REPLY is still fully hidden wherever a `replies` sub-query filters by
 * `VISIBLE_COMMENT_WHERE` — only a parent can have children worth
 * preserving, so only a parent gets the placeholder treatment.
 */
export const TOP_LEVEL_COMMENT_VISIBLE_OR_PLACEHOLDER = {
  OR: [VISIBLE_COMMENT_WHERE, { deletedAt: { not: null }, replies: { some: VISIBLE_COMMENT_WHERE } }],
} satisfies Prisma.CommentWhereInput;

/**
 * Same predicate for raw SQL queries. Callers must alias the joined tables as
 * `p` (posts) and `u` (users) — matches every raw post query in this codebase.
 */
export const VISIBLE_POST_SQL = Prisma.sql`p.deleted_at IS NULL AND u.banned_at IS NULL`;
