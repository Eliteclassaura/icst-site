# C0 compatibility spike

Throwaway proof that the Release 1 stack works together. Not the product; nothing here is reused verbatim, but every finding is recorded in `docs/versions.md` and ADR-017.

What it proves: Next 16.3.4 + Payload 3.88.0 + Postgres 16 + S3 storage; migrations (`push: false`); SSR page from the database; admin + REST login; jobs queue executed by a separate worker with idempotent outbox writes; trailing-slash canonical URLs enforced in `src/proxy.ts` without breaking `/api` or `/admin`; production standalone build; non-root web/worker/migrate entrypoints from one image.

## Run locally

```bash
cp .env.example .env            # fill DATABASE_URI, PAYLOAD_SECRET; leave S3_BUCKET empty for local disk
pnpm install
pnpm migrate && pnpm seed        # creates admin@example.test / change-me-locally and a "home" page, queues one job
pnpm worker --once               # processes the queued job → outbox row
pnpm build && node .next/standalone/server.js   # http://localhost:3000/home/ and /admin
```

Or with containers: `docker compose up --build` (Postgres, MinIO, migrate, web, worker).

Storage test: set `S3_BUCKET` and run `npx tsx src/upload-test.ts`.
