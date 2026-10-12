import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isTextEntryTarget, shouldHandleShortcut, type ShortcutTarget } from '../workspace/keyboard'
import { interestOf, isCustomerUrgent, RFQ_STATUS_LABEL } from '../workspace/labels'
import { validateManualInquiry } from '../workspace/manualInquiry'
import {
  businessMsBetween,
  BUSINESS_DAY_MS,
  endOfBusinessDay,
  isAgedUnassigned,
  startOfBusinessDay,
} from '../workspace/time'
import { email, isoDate, isUuid, line, phone, relationshipId, text } from '../workspace/validate'
import { evidenceBadgeEnabled } from '../workspace/ui/Shell'

/**
 * CRM UI-1 workspace — unit and static tests (no database).
 * The database-backed behaviour (access, assignment, lifecycle, races) is in `__dbtests__/workspace.dbtest.ts`.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(DIR, '..', '..')
const CRM_APP = path.join(SRC, 'app', '(crm)')
const WORKSPACE = path.join(SRC, 'crm', 'workspace')
const read = (f: string) => readFileSync(f, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : /\.(ts|tsx|css)$/.test(e.name) ? [full] : []
  })
const appFiles = walk(CRM_APP)
const wsFiles = walk(WORKSPACE)
const rel = (f: string) => path.relative(SRC, f)
/** Source without comments: design notes may name what UI-1 excludes; rendered code may not. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ───────────────────────────────────────────── keyboard (amendment C) ──
const el = (over: Partial<ShortcutTarget> & { role?: string; inside?: boolean }): ShortcutTarget => ({
  tagName: 'DIV',
  isContentEditable: false,
  getAttribute: (n) => (n === 'role' ? (over.role ?? null) : null),
  closest: () => (over.inside ? {} : null),
  ...over,
})
const key = (k: string, target: ShortcutTarget | null, extra: Record<string, unknown> = {}) => ({ key: k, target, ...extra })

describe('keyboard shortcuts never fire while typing (amendment C)', () => {
  it.each([
    ['input text', el({ tagName: 'INPUT', type: 'text' })],
    ['input search', el({ tagName: 'INPUT', type: 'search' })],
    ['input email', el({ tagName: 'INPUT', type: 'email' })],
    ['input number', el({ tagName: 'INPUT', type: 'number' })],
    ['input date', el({ tagName: 'INPUT', type: 'date' })],
    ['input (no type)', el({ tagName: 'INPUT', type: undefined })],
    ['textarea', el({ tagName: 'TEXTAREA' })],
    ['select', el({ tagName: 'SELECT' })],
    ['contenteditable', el({ isContentEditable: true })],
    ['role=textbox', el({ role: 'textbox' })],
    ['role=searchbox', el({ role: 'searchbox' })],
    ['role=combobox', el({ role: 'combobox' })],
    ['inside an editor', el({ inside: true })],
  ])('%s is text entry; j/k/a/r/n/t// do not fire', (_n, target) => {
    expect(isTextEntryTarget(target)).toBe(true)
    for (const k of ['j', 'k', 'a', 'r', 'n', 't', '/']) expect(shouldHandleShortcut(key(k, target))).toBe(false)
  })
  it('buttons, checkboxes and plain regions are not text entry', () => {
    expect(isTextEntryTarget(el({ tagName: 'BUTTON' }))).toBe(false)
    expect(isTextEntryTarget(el({ tagName: 'INPUT', type: 'checkbox' }))).toBe(false)
    expect(shouldHandleShortcut(key('j', el({})))).toBe(true)
  })
  it('refuses modifiers, IME composition, named keys, handled events and focus outside the scope', () => {
    const t = el({})
    expect(shouldHandleShortcut(key('k', t, { metaKey: true }))).toBe(false)
    expect(shouldHandleShortcut(key('k', t, { ctrlKey: true }))).toBe(false)
    expect(shouldHandleShortcut(key('k', t, { altKey: true }))).toBe(false)
    expect(shouldHandleShortcut(key('j', t, { isComposing: true }))).toBe(false)
    expect(shouldHandleShortcut(key('j', t, { defaultPrevented: true }))).toBe(false)
    expect(shouldHandleShortcut(key('Enter', t))).toBe(false)
    expect(shouldHandleShortcut(key('j', t), { contains: () => false })).toBe(false)
    expect(shouldHandleShortcut(key('j', t), { contains: () => true })).toBe(true)
  })
})

// ───────────────────────────────────── business time (America/Denver) ──
describe('unassigned aging: one business day, America/Denver, Monday–Friday', () => {
  it('local midnight is correct in winter (MST, UTC−7) and summer (MDT, UTC−6)', () => {
    expect(startOfBusinessDay(new Date('2026-01-14T15:00:00Z')).toISOString()).toBe('2026-01-14T07:00:00.000Z')
    expect(startOfBusinessDay(new Date('2026-07-14T15:00:00Z')).toISOString()).toBe('2026-07-14T06:00:00.000Z')
    expect(endOfBusinessDay(new Date('2026-07-14T15:00:00Z')).toISOString()).toBe('2026-07-15T05:59:59.999Z')
  })
  it('DST days are 23 h / 25 h long', () => {
    const spring = new Date('2026-03-08T18:00:00Z') // Sunday of the spring change
    expect(endOfBusinessDay(spring).getTime() + 1 - startOfBusinessDay(spring).getTime()).toBe(23 * 3600e3)
    const fall = new Date('2026-11-01T18:00:00Z')
    expect(endOfBusinessDay(fall).getTime() + 1 - startOfBusinessDay(fall).getTime()).toBe(25 * 3600e3)
  })
  it('weekends do not count', () => {
    // Friday 16:00 MDT → Monday 16:00 MDT = 24 business hours exactly (Fri 8h + Mon 16h).
    const fri = new Date('2026-09-25T22:00:00Z')
    const mon = new Date('2026-09-28T22:00:00Z')
    expect(businessMsBetween(fri, mon)).toBe(BUSINESS_DAY_MS)
    expect(isAgedUnassigned(fri, mon)).toBe(false)
    expect(isAgedUnassigned(fri, new Date(mon.getTime() + 60_000))).toBe(true)
    // Saturday → Sunday: nothing.
    expect(businessMsBetween(new Date('2026-09-26T16:00:00Z'), new Date('2026-09-27T23:00:00Z'))).toBe(0)
  })
  it('weekday aging crosses one full business day', () => {
    const tue = new Date('2026-09-22T15:00:00Z')
    expect(isAgedUnassigned(tue, new Date('2026-09-23T14:59:00Z'))).toBe(false)
    expect(isAgedUnassigned(tue, new Date('2026-09-23T15:01:00Z'))).toBe(true)
    expect(businessMsBetween(tue, tue)).toBe(0)
    expect(businessMsBetween(tue, new Date(tue.getTime() - 1))).toBe(0)
  })
})

// ─────────────────────────────────────────────────────── validation ──
describe('input validation', () => {
  it('relationship ids must be UUIDs; empty means none; anything else is refused', () => {
    expect(isUuid('0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true)
    expect(relationshipId('')).toEqual({ ok: true, id: null })
    expect(relationshipId(null)).toEqual({ ok: true, id: null })
    for (const bad of ['1', "1' OR 1=1", '../x', { id: 'x' }, 42, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5'])
      expect(relationshipId(bad).ok).toBe(false)
  })
  it('text and line trim, bound length and drop control characters', () => {
    expect(text('  hi  ', 10)).toBe('hi')
    expect(text('', 10)).toBeNull()
    expect(text('x'.repeat(50), 10)).toHaveLength(10)
    expect(line('a\nb', 10)).not.toContain('\n')
  })
  it('phone and email', () => {
    expect(phone('+1 (555) 0101').ok).toBe(true)
    expect(phone('555-0101 ext 12').ok).toBe(true)
    expect(phone('12').ok).toBe(false)
    expect(phone('').ok).toBe(true)
    expect(email('pat@example.test').ok).toBe(true)
    expect(email('not an email').ok).toBe(false)
    expect(isoDate('2026-10-01')).toBe('2026-10-01')
    expect(isoDate('soon')).toBeNull()
  })
  it('manual inquiry needs a message and a way to identify the customer', () => {
    const r = validateManualInquiry({ token: 'x' })
    expect(Object.keys(r.fields).length).toBeGreaterThan(0)
  })
})

describe('labels', () => {
  it('interest: customer selection first, then first item, then staff motion, never invented', () => {
    expect(interestOf({ otherAnswers: { interest: 'Gearboxes' }, firstItemTitle: 'Fan', motion: 'PARTS' })).toEqual({ text: 'Gearboxes', origin: 'CUSTOMER' })
    expect(interestOf({ firstItemTitle: 'Fan hub', motion: 'PARTS' }).origin).toBe('ITEM')
    expect(interestOf({ motion: 'PARTS' }).origin).toBe('STAFF')
    expect(interestOf({}).origin).toBe('NONE')
  })
  it('urgency is the customer’s own answer only', () => {
    expect(isCustomerUrgent({ urgency: 'Yes' })).toBe(true)
    expect(isCustomerUrgent({ urgency: 'No' })).toBe(false)
    expect(isCustomerUrgent(null)).toBe(false)
  })
  it('terminal statuses are neutral, not alarming', () => {
    for (const s of ['CLOSED', 'REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING']) expect(RFQ_STATUS_LABEL[s]?.tone).toBe('terminal')
  })
})

// ─────────────────────────────────────────── evidence badge (amendment D) ──
describe('SYNTHETIC DATA badge is evidence-only (amendment D)', () => {
  it('off unless the evidence flag is set to exactly SYNTHETIC', () => {
    expect(evidenceBadgeEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(evidenceBadgeEnabled({ H2O_CRM_EVIDENCE_BADGE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(evidenceBadgeEnabled({ H2O_CRM_EVIDENCE_BADGE: 'SYNTHETIC' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
  it('the badge text appears only in Shell, behind the flag', () => {
    const hits = [...appFiles, ...wsFiles].filter((f) => read(f).includes('SYNTHETIC DATA'))
    expect(hits.map(rel)).toEqual([rel(path.join(WORKSPACE, 'ui', 'Shell.tsx'))])
    expect(read(path.join(WORKSPACE, 'ui', 'Shell.tsx'))).toMatch(/evidenceBadgeEnabled\(\) \? <span className="c-evidence">SYNTHETIC DATA/)
  })
})

// ───────────────────────────────────────────────────────── static ──
describe('static: authorization cannot be bypassed by direct URL or action POST', () => {
  const pages = appFiles.filter((f) => f.endsWith('page.tsx'))
  it('every CRM page except the no-access page requires a CRM session', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8)
    for (const f of pages) {
      if (f.includes(`${path.sep}denied${path.sep}`)) {
        expect(read(f)).not.toMatch(/payload|queries/)
        continue
      }
      // Patch L2: the two-factor page serves a password-only session, which it authenticates itself; it reads no CRM data.
      if (f.includes(`${path.sep}mfa${path.sep}`)) {
        expect(read(f)).toMatch(/await pendingSession\(/)
        expect(read(f)).not.toMatch(/workspace\/queries|crm-rfqs|crm-contacts/)
        continue
      }
      expect(read(f), rel(f)).toMatch(/await requireCrmSession\(/)
    }
  })
  it('the workspace layout gates before streaming, with a shape-checked return path', () => {
    const gate = read(path.join(CRM_APP, 'crm', 'layout.tsx'))
    expect(gate).toMatch(/await currentSession\(\)/)
    expect(gate).toMatch(/if \(!signedIn\) redirect\(/)
    expect(gate).toMatch(/SAFE_PATH\.test\(raw\)/)
    expect(read(path.join(SRC, 'proxy.ts'))).toMatch(/requestHeaders\.set\('x-crm-path', req\.nextUrl\.pathname\)/)
  })
  it('every server action re-authenticates', () => {
    const src = read(path.join(CRM_APP, 'crm', 'actions.ts'))
    expect(src.startsWith("'use server'")).toBe(true)
    const bodies = src.split(/\nexport async function /).slice(1)
    expect(bodies.length).toBeGreaterThanOrEqual(20)
    for (const b of bodies) expect(b, b.slice(0, 40)).toMatch(/\brun\(|\brunBulk\(|actionSession\(\)/)
  })
  it('the CRM layout is noindex; the only route handlers are the admin-only, same-origin import and export, and the two-factor exit', () => {
    const layout = read(path.join(CRM_APP, 'layout.tsx'))
    expect(layout).toMatch(/robots: \{ index: false, follow: false, nocache: true, googleBot: \{ index: false, follow: false \} \}/)
    // Wave 1 W1-3/W1-4: a 5 MB upload and a streamed download need route handlers (server actions cannot carry them).
    const routes = appFiles.filter((f) => /route\.(ts|tsx)$/.test(f)).map(rel).sort()
    // Patch L2 adds the two-factor exit: it sets only the routing cookie, and only for a session that passed two-factor.
    // CRM-ATTACH-1 (owner-approved, 2026-10-09): the attachment upload and download routes, for every CRM user; the
    // record-visibility rule and the audit are in the attachments service (see attachments.dbtest.ts).
    expect(routes).toEqual([
      'app/(crm)/crm/attachments/[id]/route.ts',
      'app/(crm)/crm/attachments/upload/route.ts',
      'app/(crm)/crm/export/route.ts',
      'app/(crm)/crm/import/run/route.ts',
      'app/(crm)/crm/mfa/done/route.ts',
    ])
    const done = read(path.join(SRC, 'app/(crm)/crm/mfa/done/route.ts'))
    expect(done).toMatch(/await pendingSession\(payload, request\.headers\)/)
    expect(done.indexOf('if (!pending.verified)')).toBeLessThan(done.indexOf("headers.set('set-cookie'"))
    for (const r of routes.filter((x) => x.includes('/attachments/'))) {
      const t = read(path.join(SRC, r))
      expect(t, r).toMatch(/sessionFromRequest\(request\)/)
      expect(t, r).toMatch(/sameOriginOnly\(request/)
      expect(t, r).not.toMatch(/isAdmin/)
    }
    for (const r of routes.filter((x) => !x.includes('/mfa/') && !x.includes('/attachments/'))) {
      const t = read(path.join(SRC, r))
      expect(t, r).toMatch(/payload\.auth\(\{ headers: request\.headers \}\)/)
      expect(t, r).toMatch(/!s\.isAdmin/)
      expect(t, r).toMatch(/sec-fetch-site/)
    }
  })
  it('workspace writes run as the user; overrideAccess is limited to documented trusted reads', () => {
    const allowed: Record<string, number> = { 'queries.ts': 1, 'manualInquiry.ts': 2 }
    for (const f of wsFiles.filter((x) => x.endsWith('.ts'))) {
      const n = (read(f).match(/overrideAccess: true/g) ?? []).length
      expect(n, rel(f)).toBe(allowed[path.basename(f)] ?? 0)
    }
  })
  it('raw identifiers are admin-only in the detail view', () => {
    const detail = read(path.join(CRM_APP, 'crm', '_components', 'RfqDetail.tsx'))
    const i = detail.indexOf('rfq.submission_key')
    expect(i).toBeGreaterThan(0)
    expect(detail.slice(Math.max(0, i - 400), i)).toContain('s.isAdmin ? (')
    expect(detail.indexOf('content_fingerprint')).toBeGreaterThan(i)
  })
})

describe('static: UI-1 scope', () => {
  const ui = [...appFiles, ...wsFiles].filter((f) => f.endsWith('.tsx'))
  it('no Kanban, Undo, SLA or breach language in the UI (Undo exists only for import batches)', () => {
    const importUi = /ImportUndo\.tsx$|ImportWizard\.tsx$|[\\/]import[\\/]page\.tsx$/
    for (const f of ui) expect(code(f), rel(f)).not.toMatch(importUi.test(f) ? /\bkanban\b|\bSLA\b|\bbreach/i : /\bkanban\b|\bundo\b|\bSLA\b|\bbreach/i)
  })
  it('no network client, mail transport or AI call in workspace or CRM routes (the import wizard posts to its own endpoint)', () => {
    for (const f of [...appFiles, ...wsFiles].filter((x) => !x.endsWith('.css'))) {
      const t = read(f)
      expect(t, rel(f)).not.toMatch(/nodemailer|sendEmail|smtp|anthropic|openai/i)
      if (!/AttachmentUploader\.tsx$/.test(f)) expect(t, rel(f)).not.toMatch(/XMLHttpRequest/)
      if (/ImportWizard\.tsx$/.test(f)) {
        // Exactly one same-origin call, to the import route.
        expect(t.match(/\bfetch\(/g)).toHaveLength(1)
        expect(t).toMatch(/fetch\('\/crm\/import\/run\/', \{ method: 'POST'/)
        expect(t).toMatch(/credentials: 'same-origin'/)
      } else if (/ExportDialog\.tsx$/.test(f)) {
        // CSV-FIX-1 (review R2-09): exactly one same-origin GET of the export route, so the dialog can report
        // requested against exported rows.
        expect(t.match(/\bfetch\(/g)).toHaveLength(1)
        expect(t).toMatch(/const href = `\/crm\/export\/\?/)
        expect(t).toMatch(/fetch\(href, \{ credentials: 'same-origin' \}\)/)
      } else if (/AttachmentUploader\.tsx$/.test(f)) {
        // CRM-ATTACH-1: the upload uses XMLHttpRequest, once, for progress; it posts to the attachments route only.
        expect(t.match(/new XMLHttpRequest\(\)/g)).toHaveLength(1)
        expect(t).toMatch(/xhr\.open\('POST', '\/crm\/attachments\/upload\/'\)/)
        expect(t, rel(f)).not.toMatch(/\bfetch\(/)
      } else expect(t, rel(f)).not.toMatch(/\bfetch\(/)
    }
  })
  it('file input only in the admin import wizard and the attachment uploader (CRM-ATTACH-1); no conversion flow', () => {
    for (const f of ui) {
      expect(read(f), rel(f)).not.toMatch(/Convert to/i)
      if (!/ImportWizard\.tsx$|AttachmentUploader\.tsx$/.test(f)) expect(read(f), rel(f)).not.toMatch(/type="file"/i)
    }
  })
  it('no email address other than reserved example domains', () => {
    for (const f of [...appFiles, ...wsFiles]) {
      const hits = read(f).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
      for (const h of hits) expect(h, rel(f)).toMatch(/@example\.(test|com)$/)
    }
  })
  it('CRM CSS uses tokens, not raw hex colours in rules', () => {
    const css = read(path.join(WORKSPACE, 'ui', 'crm.css'))
    const rules = css.split('\n').filter((l) => !/^\s*--/.test(l))
    for (const l of rules) expect(l).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// ───────────────────────────────────────── CSP for the workspace ──
describe('the workspace gets its own nonce policy; the public policy is unchanged', () => {
  it('CRM paths: per-request nonce + strict-dynamic, no Typeform, no framing, noindex, no-store', async () => {
    const { NextRequest } = await import('next/server')
    const { proxy, crmPolicy } = await import('../../proxy')
    const a = proxy(new NextRequest('http://localhost/crm/rfqs/'))
    const b = proxy(new NextRequest('http://localhost/crm/'))
    const csp = a.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    expect(csp).toBe(crmPolicy(nonce!))
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toContain('typeform')
    expect(csp).toContain("frame-src 'none'")
    expect(b.headers.get('content-security-policy')).not.toBe(csp) // fresh nonce per request
    expect(a.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(a.headers.get('cache-control')).toBe('private, no-store')
  })
  it('public paths keep the hash-based policy (no nonce), as before', async () => {
    const { NextRequest } = await import('next/server')
    const { proxy, policyFor } = await import('../../proxy')
    const { scriptHashesFor } = await import('../../site/csp-hashes')
    for (const p of ['/', '/crm-lookalike/', '/contact-us/']) {
      const csp = proxy(new NextRequest(`http://localhost${p}`)).headers.get('content-security-policy') ?? ''
      expect(csp).not.toContain('nonce-')
      expect(csp).toBe(policyFor(scriptHashesFor(p)).policy)
    }
  })
})
