#!/usr/bin/env node
/**
 * CRM GO-LIVE — PASS 2: hosted synthetic intake proof on STAGING (Control Tower 2026-10-02).
 *
 * Run by Commander, after the go-live patch is deployed and the catalog seed applied, with ingest enabled
 * ONLY for the duration of this run. Never against production. Never with a real Typeform submission.
 *
 *   node ops/crm-golive/pass2-synthetic-intake.mjs            # deliveries + checks (ingest must be ON)
 *   node ops/crm-golive/pass2-synthetic-intake.mjs --verify-off  # after ingest is set back to 0: expects 404
 *
 * Environment (values come from the protected secrets location; this script never prints them):
 *   H2O_PASS2_BASE_URL         staging origin, e.g. https://<validation-app-host>   (required; refuses h2ocooling.com)
 *   H2O_PASS2_SIGNING_SECRET   the staging-only test secret = the app's H2O_CRM_TYPEFORM_WEBHOOK_SECRET (required)
 *   H2O_PASS2_ADMIN_EMAIL      synthetic Admin user (Pass 3 user) for read-back           (required for checks)
 *   H2O_PASS2_ADMIN_PASSWORD   its password                                               (required for checks)
 *   H2O_PASS2_FORM_ID          default F22cAgx3 (the app's H2O_TYPEFORM_FORM_ID; the app's field map must be
 *                              F22CAGX3_RECOMMENDED_FIELD_MAP — the refs below)
 *   H2O_PASS2_PRODUCT_SLUG     a seeded catalog product slug, default baldor-motor
 *   H2O_PASS2_CATEGORY_PAGE    a parts family page for the category-card placement, default /fans/
 *   H2O_PASS2_RUN_ID           optional; default derived from the clock. Marks every record of this run.
 *
 * Every delivery is SYNTHETIC: addresses on RFC 2606 example domains, company "… (SYNTHETIC PASS2 <run>)",
 * message prefixed "SYNTHETIC PASS2 <run>". Records stay in the validation database, flagged by that marker;
 * removing them is the separately authorised cutover condition 4. The script writes exactly one record outside
 * intake: a synthetic do-not-contact suppression for the synthetic suppressed-contact case (S8).
 *
 * Output: a JSON report on stdout (PASS/HOLD per check, counts, RFQ numbers). No secret, no password, no token.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { completeMfa } from '../mfa/sign-in.mjs'

const env = process.env
const BASE = (env.H2O_PASS2_BASE_URL ?? '').replace(/\/+$/, '')
const SECRET = env.H2O_PASS2_SIGNING_SECRET ?? ''
const FORM = env.H2O_PASS2_FORM_ID ?? 'F22cAgx3'
const SLUG = env.H2O_PASS2_PRODUCT_SLUG ?? 'baldor-motor'
const CATEGORY_PAGE = env.H2O_PASS2_CATEGORY_PAGE ?? '/fans/'
const RUN = (env.H2O_PASS2_RUN_ID ?? new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12)).replace(/[^A-Za-z0-9]/g, '')
const MARK = `SYNTHETIC PASS2 ${RUN}`
const INTAKE = `${BASE}/api/crm/intake/typeform/`
const fail = (m) => {
  process.stderr.write(`${m}\n`)
  process.exit(2)
}
if (!/^https?:\/\//.test(BASE)) fail('H2O_PASS2_BASE_URL is required')
if (/h2ocooling\.com/i.test(BASE)) fail('refusing: this script never runs against the production host')

/** F22cAgx3 refs (CRM-2 TYPEFORM_FIELD_LEDGER; = F22CAGX3_RECOMMENDED_FIELD_MAP in src/crm/intake/typeform/config.ts). */
const REF = {
  email: 'b6ece272-ea30-4057-a574-03c8d882297b',
  first: '2a84669b-f0a9-4f64-8eb5-2819e7f8c763',
  last: '1ed32286-7b31-43b2-b1ca-0a99401d8aa5',
  company: '384b27476ca4d24a',
  interest: '9216a914-ff0a-4936-b6c0-a579038177f4',
  part: '612225a8-b3ab-4cd2-af2d-a76a23d8cfc8',
  partDetails: '8f243989-0e8f-4d2e-b1e7-97490ab85b2f',
  urgency: '0b22caef-5cb3-4db3-a00b-455a77824316',
  phone: 'b79f1743-d223-4960-809b-feafba7b4480',
  country: 'b543840d-da8f-46ea-9b0a-4f59d3c06307',
  message: '55e58066-d55c-4a2c-a749-8a63cebf542c',
}
const id = (p) => `${p}${RUN}${randomBytes(4).toString('hex')}`
function delivery({ email, first, last, hidden = {}, interest = 'Cooling Tower Parts', urgent = 'No', token, eventId }) {
  // Each scenario gets its own synthetic name (derived from its address) so unrelated deliveries never look
  // like the same person: only S9 deliberately reuses an address with a different name.
  const local = email.split('@')[0].split('.')[1] ?? 'case'
  first ??= local.charAt(0).toUpperCase() + local.slice(1)
  last ??= `Synthetic${RUN}`
  const a = (ref, type, value) => ({ type, [type === 'phone_number' ? 'phone_number' : type]: value, field: { id: `id_${ref.slice(0, 8)}`, ref, type } })
  return {
    event_id: eventId ?? id('evtp2'),
    event_type: 'form_response',
    form_response: {
      form_id: FORM,
      token: token ?? id('tokp2'),
      landed_at: new Date(Date.now() - 300_000).toISOString(),
      submitted_at: new Date().toISOString(),
      hidden,
      definition: { id: FORM, title: 'SYNTHETIC PASS2', fields: [] },
      answers: [
        a(REF.email, 'email', email),
        a(REF.first, 'text', first),
        a(REF.last, 'text', last),
        a(REF.company, 'text', `Northwind Thermal (${MARK})`),
        { type: 'choice', choice: { label: interest }, field: { id: 'id_int', ref: REF.interest, type: 'multiple_choice' } },
        { type: 'choice', choice: { label: urgent }, field: { id: 'id_urg', ref: REF.urgency, type: 'multiple_choice' } },
        a(REF.phone, 'phone_number', '+1 555 0142'),
        a(REF.country, 'text', 'United States'),
        a(REF.message, 'text', `${MARK}: synthetic request, please ignore.`),
      ],
    },
  }
}
const sign = (raw, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('base64')}`
async function post(raw, { signature, contentType = 'application/json' } = {}) {
  const headers = { 'content-type': contentType }
  if (signature) headers['typeform-signature'] = signature
  const r = await fetch(INTAKE, { method: 'POST', headers, body: raw, redirect: 'manual' })
  let body = {}
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, outcome: body.outcome ?? null, rfq: body.rfq_number ?? null, keys: Object.keys(body).sort(), cache: r.headers.get('cache-control') }
}
const deliver = (obj) => {
  const raw = JSON.stringify(obj)
  return post(raw, { signature: sign(raw) })
}

const checks = []
const check = (id, title, pass, detail = {}) => checks.push({ id, title, result: pass ? 'PASS' : 'HOLD', ...detail })

async function verifyOff() {
  const raw = JSON.stringify(delivery({ email: `off.${RUN}@example.test` }))
  const r = await post(raw, { signature: SECRET ? sign(raw) : 'sha256=AAAA' })
  check('OFF', 'ingest set back to 0: intake answers 404 and stores nothing', r.status === 404, { status: r.status })
}

let session = null
async function api(path, init = {}) {
  const r = await fetch(`${BASE}/api/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(session ? { authorization: `JWT ${session}` } : {}), ...(init.headers ?? {}) } })
  let body = {}
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, body }
}
const q = (where) => new URLSearchParams(Object.entries(where)).toString()

async function main() {
  if (process.argv.includes('--verify-off')) {
    await verifyOff()
    process.stdout.write(`${JSON.stringify({ summary: { run: RUN, mode: 'VERIFY_OFF' }, checks }, null, 2)}\n`)
    if (checks.some((c) => c.result === 'HOLD')) process.exitCode = 1
    return
  }
  if (SECRET.length < 24) fail('H2O_PASS2_SIGNING_SECRET is required (>= 24 chars)')
  if (!env.H2O_PASS2_ADMIN_EMAIL || !env.H2O_PASS2_ADMIN_PASSWORD) fail('H2O_PASS2_ADMIN_EMAIL / _PASSWORD are required for read-back')
  const login = await api('users/login/', { method: 'POST', body: JSON.stringify({ email: env.H2O_PASS2_ADMIN_EMAIL, password: env.H2O_PASS2_ADMIN_PASSWORD }) })
  if (login.status !== 200 || !login.body.token) fail(`admin login failed (${login.status})`)
  session = String(login.body.token)
  // Patch L2: the session passes two-factor before any read-back.
  try {
    await completeMfa(BASE, session, env.H2O_PASS2_ADMIN_TOTP_SECRET, { envName: 'H2O_PASS2_ADMIN_TOTP_SECRET' })
  } catch (e) {
    fail(String(e.message))
  }

  // Preconditions: the seeded catalog product exists; ingest is on.
  const prod = await api(`products/?${q({ 'where[slug][equals]': SLUG, depth: '0', limit: '1' })}`)
  const product = prod.body.docs?.[0]
  check('P0', `catalog seed present: product "${SLUG}" exists`, Boolean(product), { status: prod.status })
  const productId = product?.source_route_id ? String(product.source_route_id).split('-').at(-1) : '1'
  const productPath = product?.legacy_urls?.[0]?.path ?? `/product/${SLUG}/`

  const results = {}
  const e = (n) => `pass2.${n}.${RUN}@example.test`
  // S1 product RFQ from the product page (genuine product context)
  results.S1 = await deliver(delivery({ email: e('product'), hidden: { page_path: productPath, cta_placement: 'header_action', product_slug: SLUG, product_id: productId } }))
  // S2 editorial RFQ (page path + placement only)
  results.S2 = await deliver(delivery({ email: e('editorial'), interest: 'Cooling Tower Repair Services', hidden: { page_path: '/resources/', cta_placement: 'editorial_inline' } }))
  // S3 category card RFQ (D1 category_and_family)
  results.S3 = await deliver(delivery({ email: e('category'), hidden: { page_path: CATEGORY_PAGE, cta_placement: 'category_and_family', product_slug: SLUG, product_id: productId } }))
  // S4 duplicate replay (same bytes, same event id) of S1's sibling
  const dup = delivery({ email: e('replay'), hidden: { page_path: '/contact-us/', cta_placement: 'header_action' } })
  results.S4a = await deliver(dup)
  results.S4b = await deliver(dup)
  // S5 same response re-sent under a new event id
  results.S5 = await deliver({ ...dup, event_id: id('evtp2b') })
  // S6 bad signature, unsigned, wrong content type, oversized
  const badRaw = JSON.stringify(delivery({ email: e('badsig') }))
  results.S6a = await post(badRaw, { signature: sign(badRaw, `${SECRET}-wrong`) })
  results.S6b = await post(badRaw, {})
  results.S6c = await post(badRaw, { signature: sign(badRaw), contentType: 'text/plain' })
  const big = `{"pad":"${'x'.repeat(300 * 1024)}"}`
  results.S6d = await post(big, { signature: sign(big) })
  // S7 malformed (signed, not JSON)
  const malformed = `{"event_id":"${id('evtbad')}","event_type":"form_response","form_response":`
  results.S7 = await post(malformed, { signature: sign(malformed) })
  // S8 suppressed contact: a synthetic do-not-contact on a synthetic address, then an RFQ from it
  const supp = await api('crm-suppressions/', { method: 'POST', body: JSON.stringify({ address: e('suppressed'), reason: 'COMPLAINT', reason_note: MARK }) })
  results.S8 = await deliver(delivery({ email: e('suppressed'), hidden: { page_path: '/contact-us/', cta_placement: 'rfq_page' } }))
  // S9 ambiguous identity: same address, different name
  results.S9a = await deliver(delivery({ email: e('ambiguous'), first: 'Avery', hidden: { page_path: '/contact-us/', cta_placement: 'rfq_page' } }))
  results.S9b = await deliver(delivery({ email: e('ambiguous'), first: 'Morgan', hidden: { page_path: '/contact-us/', cta_placement: 'rfq_page' } }))
  // S10 product fields on a non-product placement (not genuine) — kept as evidence, no item, review
  results.S10 = await deliver(delivery({ email: e('tampered'), hidden: { page_path: '/resources/', cta_placement: 'editorial_inline', product_slug: SLUG } }))

  const ok = (r, status, outcome) => r.status === status && (!outcome || r.outcome === outcome)
  check('S1', 'product RFQ accepted', ok(results.S1, 200, 'PROCESSED'), { rfq: results.S1.rfq })
  check('S2', 'editorial RFQ accepted', ok(results.S2, 200, 'PROCESSED'), { rfq: results.S2.rfq })
  check('S3', 'category-card RFQ accepted', ok(results.S3, 200, 'PROCESSED'), { rfq: results.S3.rfq })
  check('S4', 'replay (same event) is a no-op', ok(results.S4a, 200, 'PROCESSED') && ok(results.S4b, 200, 'DUPLICATE_DELIVERY_NOOP'))
  check('S5', 'same response under a new event id links to the existing RFQ', ok(results.S5, 200, 'DUPLICATE_SUBMISSION_LINKED'))
  check('S6', 'bad signature 401, unsigned 401, wrong type 415, oversized 413', results.S6a.status === 401 && results.S6b.status === 401 && results.S6c.status === 415 && results.S6d.status === 413, {
    statuses: [results.S6a.status, results.S6b.status, results.S6c.status, results.S6d.status],
  })
  check('S7', 'malformed signed body quarantined (200), no RFQ', ok(results.S7, 200, 'QUARANTINED_MALFORMED') && !results.S7.rfq)
  check('S8', 'suppressed contact: RFQ accepted', supp.status === 201 && ok(results.S8, 200, 'PROCESSED'), { suppressionStatus: supp.status })
  check('S9', 'ambiguous identity: second RFQ goes to review', ok(results.S9a, 200, 'PROCESSED') && ok(results.S9b, 200, 'PROCESSED_WITH_REVIEW'))
  check('S10', 'non-genuine product context goes to review', ok(results.S10, 200, 'PROCESSED_WITH_REVIEW'))
  check('R0', 'every reply is no-store and carries only outcome (+ rfq_number)', Object.values(results).every((r) => r.status >= 400 || (r.cache === 'no-store' && r.keys.every((k) => k === 'outcome' || k === 'rfq_number'))))

  // ── read-back as the synthetic Admin ──
  const rfq = async (n) => (await api(`crm-rfqs/?${q({ 'where[rfq_number][equals]': n, depth: '0', limit: '1' })}`)).body.docs?.[0]
  const items = async (rid) => (await api(`crm-rfq-items/?${q({ 'where[rfq][equals]': rid, depth: '0' })}`)).body.docs ?? []
  const r1 = await rfq(results.S1.rfq)
  const i1 = r1 ? await items(r1.id) : []
  check('C1', 'S1 item links the catalog product by exact slug', i1.length === 1 && String(i1[0].product) === String(product?.id) && i1[0].product_resolution_state === 'RESOLVED_EXACT_SLUG', {
    attribution: r1?.attribution ? { page_path: r1.attribution.page_path, cta_placement: r1.attribution.cta_placement } : null,
  })
  const r3 = await rfq(results.S3.rfq)
  const i3 = r3 ? await items(r3.id) : []
  check('C2', 'S3 (category card) links the same product; page_path is the listing', i3.length === 1 && String(i3[0].product) === String(product?.id) && r3?.attribution?.page_path === CATEGORY_PAGE)
  const r2 = await rfq(results.S2.rfq)
  check('C3', 'S2 editorial: attribution kept, no item', r2?.attribution?.cta_placement === 'editorial_inline' && (await items(r2.id)).length === 0)
  const r10 = await rfq(results.S10.rfq)
  check('C4', 'S10: no item from non-genuine product fields; status Needs review', r10 && (await items(r10.id)).length === 0 && r10.status === 'NEEDS_REVIEW')
  const r9 = await rfq(results.S9b.rfq)
  const rev = (await api(`crm-identity-reviews/?${q({ 'where[rfq][equals]': r9?.id ?? 'none', depth: '0' })}`)).body.docs ?? []
  check('C5', 'S9: second RFQ unlinked from the contact; EMAIL_MATCH_NAME_MISMATCH review open', r9 && !r9.contact && rev.some((x) => x.reason === 'EMAIL_MATCH_NAME_MISMATCH' && x.state === 'OPEN'))
  const r8 = await rfq(results.S8.rfq)
  const suppNow = (await api(`crm-suppressions/?${q({ 'where[email_match_key][equals]': e('suppressed').toLowerCase(), depth: '0' })}`)).body.docs ?? []
  const contact8 = r8?.contact ? (await api(`crm-contacts/${r8.contact}?depth=0`)).body : null
  check('C6', 'S8: suppression still active and unchanged; contact eligibility not granted', suppNow.length === 1 && suppNow[0].action === 'APPLY' && contact8 && contact8.marketing_eligibility !== 'ELIGIBLE')
  const replayed = (await api(`crm-rfqs/?${q({ 'where[submitted.email][equals]': e('replay'), depth: '0' })}`)).body
  check('C7', 'S4/S5: exactly one RFQ for the replayed submission', replayed.totalDocs === 1)
  const synthetic = (await api(`crm-rfqs/?${q({ 'where[submitted.company][like]': MARK, depth: '0', limit: '100' })}`)).body
  check('C8', 'all RFQs of this run are marked SYNTHETIC', synthetic.totalDocs === 8, { count: synthetic.totalDocs })
  const nothingForBad = (await api(`crm-rfqs/?${q({ 'where[submitted.email][equals]': e('badsig'), depth: '0' })}`)).body
  check('C9', 'rejected deliveries stored nothing', nothingForBad.totalDocs === 0)
  check('C10', 'notification state: nothing sent', synthetic.docs?.every((d) => d.notification_state === 'NOT_SENT_DISABLED_IN_CRM1'))

  // ── public leakage (anonymous) ──
  session = null
  const anon = await api('crm-rfqs/?limit=1')
  check('L1', 'anonymous CRM REST read refused', anon.status === 401 || anon.status === 403, { status: anon.status })
  const pages = ['/', '/contact-us/', productPath, CATEGORY_PAGE, '/resources/', '/sitemap.xml', '/robots.txt', '/search/?q=SYNTHETIC']
  const leaks = []
  for (const p of pages) {
    const r = await fetch(`${BASE}${p}`, { redirect: 'follow' })
    const t = await r.text()
    if (t.includes(RUN) || /pass2\.[a-z]+\.[0-9a-f]*@/i.test(t) || t.includes('SYNTHETIC PASS2')) leaks.push(p)
  }
  check('L2', 'no synthetic intake data in public pages, sitemap, robots or search', leaks.length === 0, { pagesChecked: pages.length, leaks })

  const summary = { run: RUN, base: new URL(BASE).host, pass: checks.filter((c) => c.result === 'PASS').length, hold: checks.filter((c) => c.result === 'HOLD').length }
  process.stdout.write(`${JSON.stringify({ summary, checks, rfqNumbers: Object.fromEntries(Object.entries(results).filter(([, r]) => r.rfq).map(([k, r]) => [k, r.rfq])) }, null, 2)}\n`)
  if (summary.hold) process.exitCode = 1
}
main().catch((err) => fail(`pass2 aborted: ${err?.name ?? 'Error'}`))
