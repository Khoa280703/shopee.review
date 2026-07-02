-- Password reset flow: token + expiry on users.
ALTER TABLE "users" ADD COLUMN "reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "reset_token_exp" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");
