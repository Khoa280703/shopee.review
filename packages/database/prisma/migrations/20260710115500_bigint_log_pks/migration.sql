-- Widen high-growth log PKs from int4 (exhausts ~2.1B) to BIGINT. Cheap now while
-- the tables are small; a painful rewrite once they hold hundreds of millions.
-- No inbound FKs reference these ids, so this is a pure column-type widening.
ALTER TABLE "click_logs" ALTER COLUMN "id" SET DATA TYPE BIGINT;
ALTER TABLE "notifications" ALTER COLUMN "id" SET DATA TYPE BIGINT;
