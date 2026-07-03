# syntax=docker/dockerfile:1
# Parameterized image for the Code Dojo monorepo.
# Build one image per runnable package:
#   docker build --build-arg PACKAGE=api -t code-dojo-api .
#   docker build --build-arg PACKAGE=bot -t code-dojo-bot .
ARG NODE_VERSION=20-alpine

# ----- base: pnpm-enabled node -----
FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ----- builder: install, build shared + target, prune to a prod deploy -----
FROM base AS builder
ARG PACKAGE
# Manifests first for layer caching (frozen install needs every workspace's package.json)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/bot/package.json ./packages/bot/
RUN pnpm install --frozen-lockfile
# Sources for shared + the target package only
COPY packages/shared ./packages/shared
COPY packages/${PACKAGE} ./packages/${PACKAGE}
RUN pnpm --filter @code-dojo/shared build \
 && pnpm --filter @code-dojo/${PACKAGE} build \
 && pnpm --filter @code-dojo/${PACKAGE} --prod deploy /out

# ----- runtime: self-contained /out (dist + prod node_modules incl. @code-dojo/shared) -----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /out ./
# The API listens on 3000; the bot has no inbound port. Documented, not required.
EXPOSE 3000
CMD ["node", "dist/index.js"]
