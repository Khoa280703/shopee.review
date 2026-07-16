-- Replace the single-column posts(user_id) index with a composite
-- (user_id, id DESC) so the personalized feed semi-join and profile post
-- listings are served index-only (newest-first), while plain user_id filters
-- still use the leftmost prefix.
DROP INDEX IF EXISTS "posts_user_id_idx";
CREATE INDEX "posts_user_id_id_idx" ON "posts" ("user_id", "id" DESC);
