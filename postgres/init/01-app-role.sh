#!/bin/sh
# Runs exactly once: docker-entrypoint-initdb.d scripts only fire against a
# brand-new (empty) Postgres data directory, as the bootstrap superuser named
# by POSTGRES_USER (here: shopee_review). On an already-initialized volume
# (e.g. the live server today) this file is never re-executed — rotating an
# existing database to this setup is a manual runbook, see
# docs/deployment-guide.md "Postgres role rotation".
#
# Goal (DB audit H2): the app should never hold Postgres SUPERUSER. Postgres
# hard-blocks stripping SUPERUSER from the bootstrap role itself ("ERROR:
# permission denied to alter role / DETAIL: The bootstrap user must have the
# SUPERUSER attribute" — verified empirically), so a single-role design (just
# ALTER ROLE the bootstrap user) is impossible. Instead: keep the bootstrap
# role (shopee_review) a superuser but NEVER use it again after this script —
# no service in docker-compose.yml connects as it — and create a second role,
# shopee_review_app, that owns the database and is NOT a superuser. Since
# Postgres 15, a fresh database's `public` schema is owned by the pseudo-role
# pg_database_owner, which always resolves to the database's current owner —
# so making shopee_review_app the database owner is enough for it to also run
# `prisma migrate deploy` (CREATE TABLE, CREATE EXTENSION IF NOT EXISTS
# pg_trgm — trusted since PG13 — etc.) without any further GRANTs.
set -e

# $POSTGRES_PASSWORD is interpolated unquoted into a single-quoted SQL literal
# below (the heredoc delimiter EOSQL is itself unquoted, so the shell expands
# it before psql ever sees it). That's only safe because every password this
# project generates is hex (`openssl rand -hex 32`, docs/.env.example) —
# `[0-9a-f]` contains no `'`, `\`, or shell-special characters, so it can
# never break out of the SQL string or the heredoc. A base64 password (the
# old guidance, and the actual cause of pre-deploy review C4 elsewhere) could
# contain `/`, `+`, or `=` — none of those are a problem for THIS script
# specifically, but they do break the postgresql:// URLs built from the same
# password (DATABASE_URL/DIRECT_URL), which is why hex is the one password
# format used everywhere in this project now.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- pg_stat_statements needs CREATE EXTENSION while still superuser; the
  -- module itself is preloaded via the db service's command (shared_preload_libraries).
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

  CREATE ROLE shopee_review_app LOGIN PASSWORD '$POSTGRES_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ALTER DATABASE "$POSTGRES_DB" OWNER TO shopee_review_app;
EOSQL
