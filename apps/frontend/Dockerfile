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
# NEXT_PUBLIC_* must be present at build time (inlined into the client bundle).
ARG NEXT_PUBLIC_API_URL=http://localhost/api
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG API_INTERNAL_URL=http://localhost:3066/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
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
COPY --from=builder /app/apps/frontend/.next/standalone ./
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
