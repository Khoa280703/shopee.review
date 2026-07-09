-- CreateIndex
CREATE INDEX "posts_like_count_id_idx" ON "posts"("like_count" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_click_count_id_idx" ON "posts"("click_count" DESC, "id" DESC);
