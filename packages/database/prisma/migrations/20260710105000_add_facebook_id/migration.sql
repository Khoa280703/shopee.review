-- AlterTable: add optional Facebook OAuth identifier (mirrors google_id).
ALTER TABLE "users" ADD COLUMN "facebook_id" TEXT;

-- CreateIndex: unique so one Facebook account maps to one user.
CREATE UNIQUE INDEX "users_facebook_id_key" ON "users"("facebook_id");
