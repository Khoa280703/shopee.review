-- Per-login session rows for "active sessions" list + per-device revoke.
CREATE TABLE "sessions" (
  "id"         TEXT NOT NULL,
  "user_id"    INTEGER NOT NULL,
  "user_agent" VARCHAR(400),
  "ip"         VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
