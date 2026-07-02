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

FROM base AS runner
RUN pnpm dlx playwright install chromium --with-deps
ENV NODE_ENV=production
WORKDIR /app
# Use builder's node_modules: includes prisma generate output + workspace symlinks
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/packages/database ./packages/database
RUN mkdir -p /app/uploads
EXPOSE 3066
CMD ["sh", "-c", "cd packages/database && pnpm exec prisma migrate deploy && cd /app && node apps/backend/dist/main.js"]
