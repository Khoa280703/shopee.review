FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
# NEXT_PUBLIC_* are inlined at build time. The API base is NOT baked: the browser
# uses a relative /api (same-origin via nginx), which removes the whole class of
# "image built for the wrong host/port" bugs. Only the Sentry DSN is build-time.
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG API_INTERNAL_URL=http://localhost:3066/api
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY tsconfig.base.json ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/database ./packages/database
COPY apps/frontend ./apps/frontend
RUN pnpm --filter @app/database build
RUN pnpm --filter @app/frontend build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system app && useradd --system --gid app --home /app --no-create-home app
# --chown on each COPY (not a trailing `RUN chown -R`): a post-hoc chown over
# an already-copied tree makes BuildKit materialize a second full copy of
# everything in a new layer, needlessly doubling the image.
COPY --chown=app:app --from=builder /app/apps/frontend/.next/standalone ./
COPY --chown=app:app --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --chown=app:app --from=builder /app/apps/frontend/public ./apps/frontend/public
USER app
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
