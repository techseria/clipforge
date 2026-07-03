# Multi-stage Dockerfile for @clipforge/api

FROM node:26-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @clipforge/db run generate
RUN pnpm --filter @clipforge/shared run build
RUN pnpm --filter @clipforge/api run build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]