-- Normalize existing user emails to lowercase + trimmed, matching the
-- application-level normalization now applied on every register/login/OAuth/
-- reset/resend-verification lookup and write. The existing unique index on
-- "email" is kept as-is; it is now effectively case-insensitive because no
-- code path writes a non-normalized value anymore.
--
-- Fails loudly instead of silently merging two accounts if lowercasing would
-- collide two existing emails (e.g. "User@x.com" and "user@x.com" both
-- already present) — that needs a manual decision, not a migration default.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT lower(trim("email")) AS normalized
    FROM "users"
    GROUP BY normalized
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'normalize_user_emails: % email(s) collide after lowercasing — resolve duplicates in "users" manually before re-running this migration',
      dup_count;
  END IF;
END $$;

UPDATE "users"
SET "email" = lower(trim("email"))
WHERE "email" <> lower(trim("email"));
