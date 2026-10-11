/**
 * STAGING-AUDIT-FIXES: the targeted production step for the staging-audit redirects, SEO titles/metas and the Brentwood H1 (see staging-audit-redirects-step-2.data.json).
 * Same engine, flags, order, refusals and exit codes as cf3-prod-step-1.mjs (read its header):
 *
 *   H2O_STEP_BASE_URL=https://... H2O_STEP_ADMIN_EMAIL=... H2O_STEP_ADMIN_PASSWORD=... [H2O_STEP_ADMIN_TOTP_SECRET=...] \\
 *     node ops/prod-step/staging-audit-redirects-step-2.mjs --dry-run | --apply
 *
 * Expected on a database that matches the base: 45 changes = 18 SEO field updates (12 titles, 6 descriptions) + 1 page-element edit (Brentwood H1) + 20 redirect records + 6 route
 * withdrawals (/cooling-tower-singapore/ and, REDIRECTS-2, /cooling-tower-resources/tools/, /cooling-tower-brochures/, /dry-soda-blasting/,
 * /cooling-tower-parts-2/, /cooling-tower-usa/), 0 unchanged, 0 refused; after --apply the rerun prints 0 changes, 45 unchanged.
 */
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {main} from './cf3-prod-step-1.mjs'

const HERE=path.dirname(new URL(import.meta.url).pathname)
export const DATA2=JSON.parse(readFileSync(path.join(HERE,'staging-audit-redirects-step-2.data.json'),'utf8'))
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))await main(DATA2)
