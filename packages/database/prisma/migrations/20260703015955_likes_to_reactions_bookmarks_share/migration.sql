-- Rename likes → reactions WITHOUT data loss (hand-written; the auto-generated
-- diff would DROP the table). Existing likes become LIKE reactions.

-- 1. Reaction type enum (must exist before ADD COLUMN references it).
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY');

-- 2. Rename the table (keeps all rows).
ALTER TABLE "likes" RENAME TO "reactions";

-- 3. RENAME TO does not rename PK/FK/index — do it so Prisma sees no drift.
ALTER TABLE "reactions" RENAME CONSTRAINT "likes_pkey" TO "reactions_pkey";
ALTER TABLE "reactions" RENAME CONSTRAINT "likes_user_id_fkey" TO "reactions_user_id_fkey";
ALTER TABLE "reactions" RENAME CONSTRAINT "likes_post_id_fkey" TO "reactions_post_id_fkey";

-- 4. Add the reaction type; existing rows backfill to LIKE via the default.
ALTER TABLE "reactions" ADD COLUMN "type" "ReactionType" NOT NULL DEFAULT 'LIKE';

-- 5. Replace the old single-column index with the (post_id, type) index.
DROP INDEX IF EXISTS "likes_post_id_idx";
CREATE INDEX "reactions_post_id_type_idx" ON "reactions"("post_id", "type");

-- 6. Post share counter.
ALTER TABLE "posts" ADD COLUMN "share_count" INTEGER NOT NULL DEFAULT 0;

-- 7. Bookmarks (new).
CREATE TABLE "bookmarks" (
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("user_id","post_id")
);
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks"("user_id", "created_at" DESC);
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
