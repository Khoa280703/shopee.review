-- CreateIndex
CREATE INDEX "comments_post_id_parent_id_idx" ON "comments"("post_id", "parent_id");

-- CreateIndex
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");
