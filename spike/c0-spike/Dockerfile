# syntax=docker/dockerfile:1.7
# One image, two entrypoints: web (Next standalone server) and worker (Payload jobs).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Build needs no database connection; env vars are read at runtime.
ENV DATABASE_URI=postgres://build:build@localhost:5432/build PAYLOAD_SECRET=build-time-placeholder
RUN pnpm build
# Worker bundle: keep only what tsx needs at runtime (config + jobs + migrations).
RUN pnpm prune --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app
# Web: Next standalone output + static assets + public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Worker: source for payload config, jobs, migrations, worker entry (run via tsx)
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/pages?limit=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Default = web. Worker overrides: command: ["node","node_modules/tsx/dist/cli.mjs","src/worker.ts"]
CMD ["node", "server.js"]
