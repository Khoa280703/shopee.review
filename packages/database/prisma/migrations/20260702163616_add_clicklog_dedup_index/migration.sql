-- CreateIndex
CREATE INDEX "click_logs_post_id_ip_created_at_idx" ON "click_logs"("post_id", "ip", "created_at");
