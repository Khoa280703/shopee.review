-- Verified ("blue tick") flag on users.
ALTER TABLE "users" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

-- Trigram search index so user search is index-backed instead of a sequential
-- ILIKE scan. Expression index (matches the `username || ' ' || display_name`
-- predicate in UsersService.searchUsers); Prisma cannot model expression indexes
-- so it is invisible to the migrate-diff drift gate.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS users_search_trgm_idx
  ON "users"
  USING GIN (("username" || ' ' || "display_name") gin_trgm_ops);

-- Make NEW_POST fanout idempotent: a follower gets at most one NEW_POST
-- notification per post, so a retried/duplicated fanout job (createMany
-- skipDuplicates -> ON CONFLICT DO NOTHING) inserts nothing the second time.
-- Partial unique index (WHERE type = ...) is not modelable in the Prisma schema,
-- so it too is invisible to the drift gate.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_new_post_uniq
  ON "notifications" ("recipient_id", "actor_id", "post_id")
  WHERE "type" = 'NEW_POST';
