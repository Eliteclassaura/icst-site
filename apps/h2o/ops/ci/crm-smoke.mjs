#!/usr/bin/env node
/**
 * 1.3c-9: the signed-in CRM smoke for after every deploy (docs: RELEASE_1.3c/POST_DEPLOY_MIGRATION_GATE.md, section 2).
 *
 * Why it exists: each CRM list section is loaded behind `safe()`, which turns a database error into "Couldn't load ..." with HTTP 200,
 * so a status check alone passes while the page is broken (the 1.3b deploy with unmigrated columns). This signs in once, requests every
 * list loader's page, and fails on a non-200, a redirect (a lost session or the two-factor page), or any of the failure phrases.
 *
 *   node ops/ci/crm-smoke.mjs <base-url>
 *
 * Credentials come from the ENVIRONMENT only and are never printed, logged or put in a URL:
 *   H2O_SMOKE_EMAIL, H2O_SMOKE_PASSWORD, H2O_SMOKE_TOTP_SECRET   sign in (the two POSTs below), then GET only
 *   H2O_SMOKE_TOKEN (+ H2O_SMOKE_MFA_COOKIE)                     an existing session: GET only, no POST at all
 * Use a dedicated admin account (the funnel report is admin-only), and sign out afterwards (the session is a login like any other).
 *
 * What it sends: POST /api/users/login/ and POST /api/mfa/verify (authentication only, in the sign-in mode), then GET requests for the
 * paths in PATHS and the first detail link of each list. No form is submitted, nothing is written by the pages. What it prints: a path,
 * the HTTP status and PASS or FAIL with the reason (never a response body, a cookie, a token or a name).
 * Exit code: 0 all passed, 1 at least one failed, 2 usage or sign-in problem.
 */
import { fileURLToPath } from 'node:url'
import { totpCode } from '../mfa/totp.mjs'

export const FAILURE_PHRASES = ['couldn’t load', "couldn't load", 'couldn&#x27;t load', 'couldn&#39;t load']

/** The list loaders, signed in as an admin. `detail` names a list whose first row's detail page is requested too. */
export const PATHS = [
  { path: '/crm/', note: 'My Work, mine' },
  { path: '/crm/?scope=team', note: 'My Work, team (nine sections)' },
  { path: '/crm/next-actions/' },
  { path: '/crm/follow-ups/' },
  { path: '/crm/rfqs/', detail: 'rfqs' },
  { path: '/crm/rfqs/?view=unassigned' },
  { path: '/crm/contacts/', detail: 'contacts' },
  { path: '/crm/contacts/?state=archived' },
  { path: '/crm/contacts/?country=US' },
  { path: '/crm/accounts/', detail: 'accounts' },
  { path: '/crm/accounts/?state=archived' },
  { path: '/crm/accounts/?country=US' },
  { path: '/crm/deals/', detail: 'deals' },
  { path: '/crm/pipeline/' },
  { path: '/crm/search/?q=test' },
  { path: '/crm/email-review/' },
  { path: '/crm/email-revenue/' },
  { path: '/crm/email-revenue/sequences/' },
  { path: '/crm/email-revenue/library/' },
  { path: '/crm/settings/intake-funnel/', note: 'admin only; needs crm_intake_funnel_daily' },
  { path: '/crm/settings/people/' },
  { path: '/crm/settings/sending/' },
  { path: '/crm/settings/templates/' },
]

const DETAIL_LINK = (kind) => new RegExp(`href="(/crm/${kind}/[A-Za-z0-9_-]+/)"`, 'g')

const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
function takeCookies(res, jar) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const line of list) {
    const [pair] = line.split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim()
  }
}

/** Sign in with the environment's credentials, or take an existing session. Returns the cookie jar; throws a short message (never a secret). */
export async function signIn(base, env = process.env, fetchImpl = fetch) {
  const jar = {}
  if (env.H2O_SMOKE_TOKEN) {
    jar['payload-token'] = env.H2O_SMOKE_TOKEN
    if (env.H2O_SMOKE_MFA_COOKIE) jar['h2o-mfa'] = env.H2O_SMOKE_MFA_COOKIE
    return jar
  }
  const { H2O_SMOKE_EMAIL: email, H2O_SMOKE_PASSWORD: password, H2O_SMOKE_TOTP_SECRET: secret } = env
  if (!email || !password || !secret) throw new Error('set H2O_SMOKE_EMAIL, H2O_SMOKE_PASSWORD and H2O_SMOKE_TOTP_SECRET (or H2O_SMOKE_TOKEN) in the environment')
  const login = await fetchImpl(new URL('/api/users/login/', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), redirect: 'manual' })
  if (login.status !== 200) throw new Error(`sign-in refused (${login.status})`)
  const body = await login.json().catch(() => null)
  takeCookies(login, jar)
  const token = body?.token ?? jar['payload-token']
  if (!token) throw new Error('sign-in gave no session')
  jar['payload-token'] = token
  const verify = await fetchImpl(new URL('/api/mfa/verify/', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `JWT ${token}`, cookie: cookieHeader(jar) },
    body: JSON.stringify({ code: totpCode(secret) }),
    redirect: 'manual',
  })
  if (verify.status !== 200) throw new Error(`two-factor verification failed (${verify.status})`)
  takeCookies(verify, jar)
  return jar
}

export function judge(status, body, location) {
  const problems = []
  if (status >= 300 && status < 400) problems.push(`redirect (${(location ?? '').includes('/mfa') ? 'two-factor page' : (location ?? '').includes('login') ? 'sign-in page' : 'elsewhere'})`)
  else if (status !== 200) problems.push(`status ${status}`)
  const lower = body.toLowerCase()
  for (const p of FAILURE_PHRASES) if (lower.includes(p)) {
    problems.push('a part of the page could not load')
    break
  }
  return problems
}

/** Request every page; returns [{ path, status, pass, problems }]. */
export async function runSmoke(base, jar, fetchImpl = fetch, paths = PATHS) {
  const results = []
  const get = async (path) => {
    const res = await fetchImpl(new URL(path, base), { redirect: 'manual', headers: { cookie: cookieHeader(jar), 'user-agent': 'h2o-crm-smoke/1' } })
    const body = res.status >= 300 && res.status < 400 ? '' : await res.text()
    return { status: res.status, body, location: res.headers.get('location') }
  }
  for (const p of paths) {
    let r
    try {
      r = await get(p.path)
    } catch {
      results.push({ path: p.path, status: 0, pass: false, problems: ['request failed'] })
      continue
    }
    const problems = judge(r.status, r.body, r.location)
    results.push({ path: p.path, status: r.status, pass: problems.length === 0, problems })
    if (p.detail && r.status === 200) {
      const first = [...r.body.matchAll(DETAIL_LINK(p.detail))].map((m) => m[1]).find((h) => !h.endsWith('/new/'))
      if (!first) {
        results.push({ path: `/crm/${p.detail}/<first row>`, status: 0, pass: true, problems: [], skipped: 'no rows to open' })
        continue
      }
      try {
        const d = await get(first)
        const dp = judge(d.status, d.body, d.location)
        results.push({ path: `/crm/${p.detail}/<first row>`, status: d.status, pass: dp.length === 0, problems: dp })
      } catch {
        results.push({ path: `/crm/${p.detail}/<first row>`, status: 0, pass: false, problems: ['request failed'] })
      }
    }
  }
  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2]
  if (!base) {
    console.error('usage: crm-smoke.mjs <base-url>   (credentials from the environment: see the header of this file)')
    process.exit(2)
  }
  let jar
  try {
    jar = await signIn(base)
  } catch (e) {
    console.error(`SIGN-IN FAILED: ${e instanceof Error ? e.message : 'unknown'}`)
    process.exit(2)
  }
  const results = await runSmoke(base, jar)
  for (const r of results) console.log(`${r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.status || '---'}  ${r.path}${r.pass ? (r.skipped ? `  (${r.skipped})` : '') : `  (${r.problems.join('; ')})`}`)
  const failed = results.filter((r) => !r.pass).length
  console.log(`${results.length - failed}/${results.length} CRM smoke checks passed${failed ? ` - ${failed} FAILED` : ''}`)
  process.exit(failed ? 1 : 0)
}
