# syntax=docker/dockerfile:1.7
# Build from the REPO ROOT:  docker build -f apps/syed-ai/Dockerfile .
# One image, two entrypoints: web (Next standalone server) and worker (Payload jobs).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

FROM base AS build
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/syed-ai/package.json apps/syed-ai/package.json
COPY packages ./packages
# tools/* are workspace packages too (pnpm-workspace.yaml). @factory/syed-ai depends on
# @factory/design-bundle, and --frozen-lockfile requires every lockfile importer to exist.
COPY tools ./tools
RUN pnpm install --frozen-lockfile --filter @factory/syed-ai...
COPY apps/syed-ai ./apps/syed-ai
# next build needs no database; placeholders satisfy config validation
ENV DATABASE_URI=postgres://build:build@localhost:5432/build PAYLOAD_SECRET=build-time-placeholder
RUN pnpm --filter @factory/syed-ai build
RUN rm -rf /repo/deploy && pnpm --filter @factory/syed-ai deploy --prod --legacy /repo/deploy

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app
COPY --from=build --chown=app:app /repo/apps/syed-ai/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/syed-ai/.next/static ./apps/syed-ai/.next/static
COPY --from=build --chown=app:app /repo/apps/syed-ai/public ./apps/syed-ai/public
COPY --from=build --chown=app:app /repo/deploy/node_modules ./apps/syed-ai/node_modules
# `src` is needed at runtime for the worker (tsx) and the migrations; tests and fixtures are excluded by
# .dockerignore, and CI asserts the image carries no test file, no legacy archive and no .env.
COPY --from=build --chown=app:app /repo/apps/syed-ai/src ./apps/syed-ai/src
COPY --from=build --chown=app:app /repo/apps/syed-ai/tsconfig.json ./apps/syed-ai/tsconfig.json
COPY --from=build --chown=app:app /repo/tsconfig.base.json ./tsconfig.base.json
# pnpm's virtual-store metadata contains unused links to workspace/optional platform entries
# that are not present in the production closure; remove only those known dangling links.
RUN rm -f /app/node_modules/.pnpm/node_modules/@esbuild/linux-arm64 \
  /app/apps/syed-ai/node_modules/.pnpm/node_modules/@factory/syed-ai \
  /app/apps/syed-ai/node_modules/.pnpm/node_modules/@esbuild/linux-arm64
USER app
WORKDIR /app/apps/syed-ai
EXPOSE 3000
# Readiness, not a content query: 200 only when the database and media storage both answer (C8).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Default = web. Worker: ["node","node_modules/tsx/dist/cli.mjs","src/worker.ts"]  Migrate: ["node","node_modules/payload/bin.js","migrate"]
CMD ["node", "server.js"]
