# Deployment — Coolify and Cloudflare (C8)

> One deployment, one database, one bucket, one secret set **per client** (ADR-004, ADR-005). Nothing here is shared between clients, and nothing here is triggered from a Claude session: the only thing that can deploy is `.github/workflows/deploy.yml`, running from the repository (ADR-027 §4).

## The image

`apps/syed-ai/Dockerfile` builds **from the repository root** and produces one image with three entrypoints:

| Entrypoint | Command                                            | Runs as      |
| ---------- | -------------------------------------------------- | ------------ |
| web        | `node server.js` (default)                         | `app` (1001) |
| worker     | `node node_modules/tsx/dist/cli.mjs src/worker.ts` | `app` (1001) |
| migrate    | `node node_modules/payload/bin.js migrate`         | `app` (1001) |

```bash
docker build -f apps/syed-ai/Dockerfile -t factory/syed-ai:$(git rev-parse --short HEAD) .
```

CI asserts on every build that the image runs as uid 1001 and contains **no** `.env`, no `legacy-reference/`, no `*.test.ts` / `*.spec.ts`, no `test` / `e2e` / `fixtures` / `test-results` directories and no `handoff/` artefacts. `.dockerignore` is what makes that true; if you add a directory that should never ship, add it there and the assertion covers it for free.

**Deploy order matters:** `migrate` must finish before `web` and `worker` start. Coolify: make migrate a pre-deployment command on the same image, not a parallel service.

## Local and designer environment

`compose.yaml` at the repository root is both the local stack and the designer's environment (ADR-027 §8):

```bash
cp apps/syed-ai/.env.example apps/syed-ai/.env   # then set PAYLOAD_SECRET
export PAYLOAD_SECRET=$(openssl rand -base64 32)
docker compose up                                 # db → migrate → web + worker
docker compose --profile seed up seed             # optional: load syed.ai from its blueprint
```

Site on `http://localhost:3000`, admin on `/admin`. Sources are bind-mounted (`Dockerfile.dev`), so an edit on the host is live. Media lives in a named volume, so a rebuild does not lose uploads. The stack mirrors **staging**, not production: AI off, Turnstile not required, `VERIFICATION_ENFORCEMENT=warn`, dev routes on.

## Health probes

| Endpoint      | Meaning   | Behaviour                                                                                                  |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `/api/live`   | liveness  | 200 while the process serves requests. Checks nothing else, so a database blip never restarts a container. |
| `/api/health` | readiness | 200 only when the database answers a real query **and** media storage is usable; 503 otherwise.            |

Both bodies are a fixed, tiny shape — `{status}` and `{status, checks:{database, storage}}` with `'ok' | 'fail'` — and deliberately carry no hostname, port, path, version or error text. Coolify: point the health check at `/api/health`; the load balancer should drain on 503 rather than restart, and restart only on `/api/live` failure.

## Coolify configuration

1. **Source** — the GitHub repository. Production builds from a **tag**; staging from `main`.
2. **Services** — `web` (public), `worker` (no ingress), `migrate` (pre-deploy, must succeed).
3. **Environment** — from `apps/syed-ai/.env.example`. Secrets live in Coolify's own store, never in the repository or an image. `PAYLOAD_SECRET` is per client and **rotating it invalidates every service-account API key** (R58) — re-issue them and update OGCS afterwards.
4. **Persistence** — managed Postgres 16 (its own instance per client) and S3-compatible object storage for media (`S3_*`). With `S3_BUCKET` unset the app writes to `MEDIA_DIR`, which then needs a real volume.
5. **PR previews** — enable preview deployments; each gets its own ephemeral database and `NEXT_PUBLIC_SERVER_URL`, with `VERIFICATION_ENFORCEMENT=warn`, `TURNSTILE_REQUIRED=false`, `AI_ENABLED=false`, and **`noindex` enforced** (see below). This is the preview URL a design PR shows (ADR-027 §3).
6. **Resources** — the web container is Next standalone plus Payload: 1 GB RAM is comfortable, 512 MB is tight; the worker is smaller. Postgres sizing follows the client's content volume.

## Cloudflare

**DNS and TLS.** Proxied (orange cloud), Full (strict). `SITE_HOST` set to the canonical apex so the proxy 308s `www` and `http` to it.

**Trusted proxy — set this or rate limits do not work.** `TRUSTED_PROXY=cloudflare` makes the app key rate limits on `cf-connecting-ip` and **ignore** `x-forwarded-for`. Unset, the app trusts no header at all and throttles every caller in one shared bucket (visible and safe) rather than letting anyone mint a fresh bucket per request by changing a header. Never set `TRUSTED_PROXY=xff` unless a proxy in front of the app _overwrites_ the header.

**Lock the origin to Cloudflare whenever `TRUSTED_PROXY=cloudflare` is set (quote-form audit R1).** If the origin answers anyone directly, a caller can send their own `cf-connecting-ip` and get a fresh rate-limit bucket on every request. Before launch, allow ports 80/443 only from Cloudflare's published IP ranges (or use a Cloudflare Tunnel or Authenticated Origin Pulls). Then check that a direct request to the origin IP is refused.

**Cache rules.** The app is dynamic; Cloudflare should cache assets and nothing else.

| Path                                       | Rule                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `/_next/static/*`, `/fonts/*`, `/assets/*` | Cache everything, edge TTL 1 year (content-hashed)                                                                        |
| `/media/*`                                 | Cache everything, edge TTL 1 month                                                                                        |
| `/api/*`, `/admin/*`, `/thanks/*`          | **Bypass cache** (`no-store` already set by the app)                                                                      |
| everything else (HTML)                     | Bypass, or cache with `Cache-Control` respected — never cache HTML while `?preview` or an admin session cookie is present |

**Rate limiting.** An edge rule on `/api/forms/*` (say 10 requests/minute/IP) sits in front of the app's own Postgres-backed limits — belt and braces, since the edge rule cannot see the app's dedupe window.

**WAF.** Leave the managed ruleset on. Turnstile keys: the **site** key goes in the `integrations` global (public), the **secret** only in `TURNSTILE_SECRET`.

## Staging must never be indexed

`NEXT_PUBLIC_SERVER_URL` on staging and previews must be the staging host, and staging must be access-protected (Cloudflare Access or basic auth at the edge) **and** `noindex`. The C9 gate refuses a launch when a staging environment is indexable (R24); until then this is a checklist item you own.

## Deploy flow (ADR-027)

```
PR ──► CI (all gates) ──► Coolify preview URL ──► approve ──► merge to main
                                                                  │
                                                       staging deploy (automatic)
                                                                  │
                                                    tag vX.Y.Z on main ──► production
                                                       (GitHub Environment approval)
```

`deploy.yml` refuses a production tag that is not an ancestor of `main`, waits for `/api/health` to report `ok`, then writes a `deploy-event` artefact for OGCS (ADR-028 §5). **Rollback** is redeploying the previous tag; design-only releases carry no migrations, which is why a design PR may not touch `migrations/**` (R53).

## Backups

`tools/scripts/backup.sh` — `pg_dump` (custom format) plus the media tree, encrypted with `age` to a public key whose private half is **not on the host**, uploaded to an S3-compatible bucket, then verified by listing what landed. Run it from a scheduled job on the host or a Coolify cron; `--dry-run` shows what would be uploaded without touching the network.

What this skeleton deliberately does **not** yet do, and is a Release 7 item: the **restore drill**. A backup nobody has restored is a hope, not a backup. The drill is: restore the newest dump into a scratch database, run the app against it, confirm the page count and the newest content, then destroy the scratch database — and record the date in the ledger.

## Client-hosted deployments

Same image, the client's own Coolify or VPS. Per-client decisions to record before handover: who holds the secrets, where encrypted backups go, and whether the agency keeps a platform-admin role with an audit trail. See the offboarding section of the client runbook (R40) — offboarding hands over the database dump, the media bucket, the repository access and the secrets, then deletes our copies with proof.
