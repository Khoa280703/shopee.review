FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/database ./packages/database
COPY apps/backend ./apps/backend
RUN pnpm --filter @app/database build
RUN pnpm --filter @app/backend build

# Separate branch off `deps` (NOT `builder`) so pruning devDependencies here
# never touches the node_modules the build stage needs (tsc, @nestjs/cli, ...).
FROM deps AS prod-deps
# CI=true: pnpm's interactive "remove modules dir?" confirmation needs either a
# TTY or this env var; a Docker build has neither by default.
RUN CI=true pnpm prune --prod
# `prisma` (the CLI, not @prisma/client) is deliberately a devDependency of
# @app/database — correct for local/dev tooling — but this image's CMD still
# needs it at runtime to run `prisma migrate deploy` on boot. Re-add just that
# one package (pinned to the lockfile-resolved version) after the prod prune;
# `--prod` keeps the reinstall in the same prod-only mode the prune left
# node_modules in (otherwise pnpm refuses: "modules directory was installed
# with optionalDependencies, dependencies. Current install wants ... devDependencies").
RUN CI=true pnpm add --filter @app/database --save-prod --prod prisma@6.19.3
# `prisma generate`'s output (`.prisma/client`, the actual generated query
# engine glue `@prisma/client`'s `default.js` requires at runtime) is NOT a
# file tracked by `pnpm install` at all — it's written by this separate
# generate step into the pnpm content-addressable store next to `@prisma/
# client` itself. `builder` (below) runs it, but that happens in a sibling
# stage branched from `deps` — its filesystem changes never reach `prod-deps`
# (also branched from `deps`), so without regenerating it here too, the final
# image would ship `@prisma/client`'s code but not its generated client,
# crashing on boot ("Cannot find module '.prisma/client/default'" — reproduced
# in the pre-deploy rehearsal boot test). Regenerating directly in THIS stage
# (rather than copying the artifact across stages by its pnpm-hashed path,
# which would silently break the moment a dependency version bump changes
# that hash) keeps this self-contained and robust to lockfile changes.
COPY packages/database/prisma ./packages/database/prisma
RUN cd packages/database && node_modules/.bin/prisma generate
# `@sentry/nestjs` IS a regular (prod) dependency of @app/backend, but `pnpm
# prune --prod` removes it anyway — reproduced and confirmed in the pre-deploy
# rehearsal boot test (backend crashed: "Cannot find module '@sentry/nestjs'",
# required by instrument.ts, main.ts's first import). Root cause: this
# package's own package.json lists @nestjs/common/@nestjs/core under BOTH
# `peerDependencies` AND `devDependencies` (a common pattern for packages that
# test against their peer) — pnpm's prune graph walk appears to treat the
# whole peer-resolved node as dev-only reachable and drops its node_modules
# symlink (the package itself stays in the content-addressable store;
# only the symlink pnpm would normally recreate goes missing). Re-adding it
# here, exactly like the prisma re-add above, regenerates that symlink.
RUN CI=true pnpm add --filter @app/backend --save-prod --prod @sentry/nestjs@10.60.0

FROM base AS runner
# Fixed, user-independent browser install path: the default location is under
# the installing user's home dir, which would make the browser invisible to
# the non-root runtime user created below.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Pinned to the exact `playwright` version pnpm-lock.yaml resolves (M6): `pnpm
# dlx playwright@latest` would fetch whatever is newest on npm at build time,
# which can diverge from the `playwright` package actually bundled into
# apps/backend/dist (version skew between the installed driver and the
# downloaded browser build has broken `chromium.launch()` before).
RUN pnpm dlx playwright@1.60.0 install chromium --with-deps \
    && chmod -R a+rX /ms-playwright \
    && groupadd --system app && useradd --system --gid app --home /app --no-create-home app
ENV NODE_ENV=production
WORKDIR /app
# --chown on each COPY (not a trailing `RUN chown -R`): a post-hoc chown over
# an already-copied tree makes BuildKit materialize a second full copy of
# everything in a new layer (doubled this image by ~500MB in testing).
# Use the pruned (prod-only) node_modules — devDependencies (@nestjs/cli,
# typescript, vitest, ...) never ship in the runtime image. Copying only
# specific subpaths (dist/package.json/prisma) from `builder` for
# packages/database — NOT the whole directory — matters here: `builder` still
# has its own unpruned node_modules (typescript, tsx, the prisma devDependency)
# under packages/database/node_modules, and a whole-directory COPY would land
# after (and silently clobber) the prod-deps node_modules copied just above,
# reintroducing the exact devDependencies this prune step exists to drop.
COPY --chown=app:app --from=prod-deps /app/node_modules ./node_modules
COPY --chown=app:app --from=prod-deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --chown=app:app --from=prod-deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --chown=app:app --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --chown=app:app --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --chown=app:app --from=builder /app/packages/database/dist ./packages/database/dist
COPY --chown=app:app --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --chown=app:app --from=builder /app/packages/database/prisma ./packages/database/prisma
USER app
EXPOSE 3066
# `exec node` so node becomes PID 1 and receives SIGTERM directly (the shell does
# not forward signals) — required for enableShutdownHooks to run on deploy/stop.
# `prisma` is invoked via its binary directly (packages/database/node_modules/
# .bin/prisma), NOT `pnpm exec prisma` (C1): pnpm exec re-resolves the package
# manager through corepack on every invocation, which tries to write its shim/
# cache under the invoking user's home — root's `/root/.cache` at build time,
# but this CMD runs as the non-root `app` user (home `/app`, no corepack cache
# ever populated there), so `pnpm exec` failed with EACCES in a boot-test
# (corepack attempting to download/verify pnpm into an unwritable path). The
# prisma CLI binary itself has no such dependency.
CMD ["sh", "-c", "cd packages/database && node_modules/.bin/prisma migrate deploy && cd /app && exec node apps/backend/dist/main.js"]
