-- Two-level moderation (suspend/ban), soft delete for posts/comments, sequence
-- horizon fix for the two log tables, and a round of index hygiene matching
-- the query patterns actually used by the app.

-- ---------------------------------------------------------------------------
-- 1. Sequence horizon fix: the earlier migration (bigint_log_pks) widened the
--    COLUMN to bigint but a PostgreSQL SERIAL's sequence keeps its own
--    "integer" data type independent of the column — ALTER COLUMN TYPE does
--    not touch it. Left as-is, nextval() would still hit the int4 ceiling
--    (~2.1B) on these two highest-insert-rate tables.
-- ---------------------------------------------------------------------------
ALTER SEQUENCE click_logs_id_seq AS bigint;
ALTER SEQUENCE notifications_id_seq AS bigint;

-- ---------------------------------------------------------------------------
-- 2. Level-1 moderation: suspend (locks login only, content stays visible).
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "suspended_at" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 3. Soft delete columns for posts and comments.
-- ---------------------------------------------------------------------------
ALTER TABLE "posts"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_id" INTEGER,
  ADD COLUMN "delete_reason" VARCHAR(500);

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_deleted_by_id_fkey"
  FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_id" INTEGER,
  ADD COLUMN "delete_reason" VARCHAR(500);

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_deleted_by_id_fkey"
  FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Drop redundant/stale indexes (prefixes of a wider composite, or no longer
--    matching the query's actual sort order).
--
--    NOT dropped here (pre-deploy review L4, despite an earlier draft of this
--    migration dropping them): "posts_category_id_idx" and
--    "comments_post_id_idx". Both are plain (non-partial) FK-shaped indexes
--    that a WHERE-filtered FK action still needs — e.g. deleting a Category
--    (ON DELETE SET NULL on posts.category_id) or hard-deleting a Post's
--    cascaded comments checks ALL referencing rows, including soft-deleted
--    ones the partial indexes below (step 6) deliberately exclude. Without
--    the plain index that check falls back to a full table scan. They stay
--    exactly as created by the initial migration; only the new partial
--    indexes below are additive.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "comments_post_id_parent_id_idx";
DROP INDEX IF EXISTS "follows_follower_id_idx";
DROP INDEX IF EXISTS "follows_following_id_idx";
DROP INDEX IF EXISTS "click_logs_post_id_idx";
DROP INDEX IF EXISTS "notifications_recipient_id_read_idx";

-- ---------------------------------------------------------------------------
-- 5. Replacement indexes modeled in schema.prisma (plain composite, Prisma's
--    default naming convention — kept in sync so a future `migrate dev` diffs
--    clean).
-- ---------------------------------------------------------------------------
CREATE INDEX "follows_following_id_follower_id_idx" ON "follows"("following_id", "follower_id");
-- (recipientId, createdAt DESC, id DESC) — NOT (recipientId, id DESC) (M3):
-- upsertDedupedNotification bumps created_at on a repeat LIKE/FOLLOW without
-- changing the row's id, so an id-ordered index left a just-bumped
-- notification stuck at its original position instead of sorting to the top.
CREATE INDEX "notifications_recipient_id_created_at_id_idx"
  ON "notifications"("recipient_id", "created_at" DESC, "id" DESC);

-- ---------------------------------------------------------------------------
-- 6. Partial indexes for the new visible-content filter. Not modelable in
--    schema.prisma (no WHERE support), so — like the trgm/partial-unique
--    indexes added earlier — these exist only here and are invisible to the
--    `prisma migrate diff` drift gate by design (confirmed safe in the
--    database audit for the existing raw indexes of the same kind).
-- ---------------------------------------------------------------------------
CREATE INDEX "posts_category_id_visible_idx"
  ON "posts" ("category_id", "id" DESC)
  WHERE "deleted_at" IS NULL;

CREATE INDEX "comments_visible_post_id_parent_id_id_idx"
  ON "comments" ("post_id", "parent_id", "id")
  WHERE "deleted_at" IS NULL;

-- Unread-count query (`WHERE recipient_id = ? AND NOT read`) only ever touches
-- the (small) unread subset — a partial index keeps it tiny regardless of how
-- large the read/retention-pending backlog grows.
CREATE INDEX "notifications_unread_idx"
  ON "notifications" ("recipient_id")
  WHERE NOT "read";

-- ---------------------------------------------------------------------------
-- 7. Notification spam fix: re-reacting (unlike/relike) or re-following
--    (unfollow/refollow) created a brand new LIKE/FOLLOW row every time. This
--    partial unique index lets the app upsert instead (bump created_at + reset
--    read on conflict) so a recipient gets at most one live LIKE notification
--    per (actor, post) and one live FOLLOW notification per actor.
--    COALESCE(post_id, 0) is required because FOLLOW rows always have a NULL
--    post_id, and Postgres treats two NULLs as distinct for uniqueness.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_like_follow_dedup_idx"
  ON "notifications" ("recipient_id", "actor_id", "type", COALESCE("post_id", 0))
  WHERE "type" IN ('LIKE', 'FOLLOW');

-- ---------------------------------------------------------------------------
-- 8. Recreate the trending MV so soft-deleted posts drop out of trending
--    within one refresh cycle (every 5 min, same staleness already accepted
--    for every other trending number). Banned authors are filtered live at
--    read time instead (posts.service.ts queryTrending joins users), so a ban
--    takes effect immediately rather than waiting for the next MV refresh.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS trending_posts_mv;

CREATE MATERIALIZED VIEW trending_posts_mv AS
SELECT
  p.id,
  p.user_id,
  p.title,
  p.content,
  p.product_url,
  p.affiliate_url,
  p.product_meta,
  p.images,
  p.category_id,
  p.like_count,
  p.comment_count,
  p.click_count,
  p.share_count,
  p.created_at,
  p.updated_at,
  (
    p.click_count * 0.3 + p.like_count * 0.25 + p.comment_count * 0.25 + p.share_count * 0.2
  ) * exp(
    - (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0) / 24.0
  ) AS score
FROM posts p
WHERE p.created_at > NOW() - INTERVAL '30 days'
  AND p.deleted_at IS NULL;

CREATE UNIQUE INDEX trending_posts_mv_id_uidx ON trending_posts_mv (id);
CREATE INDEX trending_posts_mv_score_idx ON trending_posts_mv (score DESC, id DESC);
