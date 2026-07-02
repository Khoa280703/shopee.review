-- Trending feed precomputed as a materialized view, refreshed every 5 minutes.
-- Refresh is driven by the NestJS scheduler (TrendingRefreshService) using
-- REFRESH MATERIALIZED VIEW CONCURRENTLY so reads are never blocked.
--
-- Production alternative (no app scheduler): install pg_cron in the Postgres
-- image, add `shared_preload_libraries='pg_cron'`, then:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('refresh_trending', '*/5 * * * *',
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv');

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
  p.created_at,
  p.updated_at,
  (
    p.click_count * 0.4 + p.like_count * 0.3 + p.comment_count * 0.3
  ) * exp(
    - (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0) / 24.0
  ) AS score
FROM posts p
WHERE p.created_at > NOW() - INTERVAL '30 days';

-- Unique index is REQUIRED for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX trending_posts_mv_id_uidx ON trending_posts_mv (id);

-- Sort index for keyset ordering by score.
CREATE INDEX trending_posts_mv_score_idx ON trending_posts_mv (score DESC, id DESC);
