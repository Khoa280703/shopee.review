-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verify_token_exp" TIMESTAMP(3);

-- One-time global session revocation: bump every existing user's token_version
-- so all JWTs issued before this release (which carry no `ver` claim, treated as
-- 0) are invalidated at once. Closes the pre-deploy stolen-token window; users
-- simply log in again. Safe: new signups default to 0 and get a fresh cookie.
UPDATE "users" SET "token_version" = 1;
