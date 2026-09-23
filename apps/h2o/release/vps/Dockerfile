FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.28.0
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @factory/h2o build && pnpm --filter @factory/h2o qa:public
RUN node apps/h2o/release/vps/generate-nginx.mjs

FROM nginx:stable-alpine
COPY --from=build /repo/apps/h2o/.public-renderer/out /usr/share/nginx/html
COPY --from=build /repo/apps/h2o/release/evidence/vps-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
