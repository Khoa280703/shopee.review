-- Recreate trending_posts_mv to include share_count. The original MV predated the
-- share_count column, so trending posts always reported shareCount=0 AND shares
-- never influenced the ranking. Now shares are projected and weighted in score.
--
-- DROP + CREATE (not ALTER) because a materialized view's column list and query
-- are fixed at creation. Refresh cron (TrendingRefreshService, every 5 min) picks
-- the new definition up automatically; the first refresh repopulates it.

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
WHERE p.created_at > NOW() - INTERVAL '30 days';

-- Unique index is REQUIRED for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX trending_posts_mv_id_uidx ON trending_posts_mv (id);

-- Sort index for keyset ordering by score.
CREATE INDEX trending_posts_mv_score_idx ON trending_posts_mv (score DESC, id DESC);
