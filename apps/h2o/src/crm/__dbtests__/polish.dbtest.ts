import { sql } from '@payloadcms/db-postgres'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { submitReply } from '../intake/native/handlers'
import { issueFormToken } from '../intake/native/token'
import * as m from '../workspace/mutations'
import { loadDashboard, loadInbox, loadMyWork, parseInboxParams } from '../workspace/queries'
import { crmSessionFor } from '../workspace/session'
import { payload, resetCrm, user } from './harness'
import { SEED_TEMPLATES, SUPERSEDED_SEED_HASHES, templateHash } from '../../email/templates'
import { ensureTemplates, saveTemplate, setTemplateApproved, templateByCode } from '../settings/templates'

/**
 * CRM polish R1 against the isolated synthetic database: the reply-due countdown on inquiry rows, the inbox's
 * reply / this-week filters, and the My Work dashboard (each tile counts exactly the rows its link shows).
 * Everything synthetic: example.test addresses, documentation IPs.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const H = 3600_000
let n = 0

async function submit(source: 'NATIVE_FORM' | 'NATIVE_CHAT', at: Date, answers: Record<string, string>) {
  const p = await payload()
  n++
  const body = {
    submissionId: `0194${n.toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`,
    source,
    registryVersion: fixtureRegistry().registryVersion,
    locale: 'en',
    answers,
    context: { page_path: '/', cta_placement: 'launcher', context_type: 'page' },
    attribution: { landing_page: '/' },
    antiAbuse: { formToken: issueFormToken(new Date(at.getTime() - 30_000)).formToken, hp: '' },
  }
  const req = new Request('http://localhost:3210/api/rfq/submit/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': `192.0.2.${(n % 200) + 20}` },
    body: JSON.stringify(body),
  })
  const r = await submitReply(p, req, at)
  expect(r.status).toBe(200)
  const rfq = (await p.find({ collection: 'crm-rfqs', where: { 'submitted.email': { equals: answers.email } }, ...sys })).docs[0] as unknown as Doc
  const task = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfq.id } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
  return { rfq, task }
}
const parts = (tag: string, country: string) => ({ purpose: 'parts', parts_part: 'Fan blades', name: `Pat ${tag}`, company: `${tag} Works (synthetic)`, email: `pat.${tag}.${Date.now()}@example.test`, country })
const setDue = async (taskId: unknown, due: Date) =>
  (await payload()).update({ collection: 'crm-tasks', id: String(taskId), data: { due_at: due.toISOString() } as never, ...sys, context: { crmServer: {} } })

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  await resetCrm()
})

describe('reply due on inquiry rows', () => {
  it('open → countdown; overdue; done → Replied; the reply filter returns exactly those rows', async () => {
    const admin = await user('platform-admin')
    const A = crmSessionFor(await payload(), admin.user)!
    const now = new Date()
    const fresh = await submit('NATIVE_CHAT', new Date(now.getTime() - 10 * 60_000), parts('fresh', 'TH'))
    const late = await submit('NATIVE_FORM', new Date(now.getTime() - 50 * H), parts('late', 'MX'))
    await setDue(late.task.id, new Date(now.getTime() - 3 * H))
    const done = await submit('NATIVE_FORM', new Date(now.getTime() - 2 * H), parts('done', 'DE'))
    // OPP-2: "Replied" needs a reply on record. "Record my reply" (L06) completes the task and leaves that evidence.
    expect((await m.recordReply(A, { rfqId: String(done.rfq.id), summary: 'Answered from my mailbox (synthetic)' })).ok).toBe(true)
    // A task that was only ticked off is not "Replied".
    const ticked = await submit('NATIVE_FORM', new Date(now.getTime() - 2 * H), parts('ticked', 'FR'))
    expect((await m.completeTask(A, { taskId: ticked.task.id })).ok).toBe(true)

    const rows = (await loadInbox(A, parseInboxParams({}), now)).rows
    const row = (id: unknown) => rows.find((r) => r.id === String(id))!
    expect(row(fresh.rfq.id).reply).toMatchObject({ state: 'OPEN' })
    expect(['ok', 'soon']).toContain(row(fresh.rfq.id).reply.tone)
    expect(row(late.rfq.id).reply).toMatchObject({ state: 'OPEN', tone: 'overdue' })
    expect(row(done.rfq.id).reply).toMatchObject({ state: 'DONE', tone: 'done' })
    expect(row(ticked.rfq.id).reply).toMatchObject({ state: 'DONE', tone: 'none', replyRecorded: false })
    expect(row(fresh.rfq.id).nextAction?.kind).toBe('RFQ_FIRST_RESPONSE')
    expect(row(fresh.rfq.id).sourceSystem).toBe('NATIVE_CHAT')

    // An open first-response task wins over a newer closed one on the same inquiry (e.g. a reopened inquiry's history).
    await (await payload()).create({
      collection: 'crm-tasks',
      data: { title: 'First response (closed copy, synthetic)', kind: 'RFQ_FIRST_RESPONSE', priority: 'HIGH', status: 'CANCELLED', rfq: String(fresh.rfq.id) } as never,
      ...sys,
      context: { crmServer: { source: 'SYSTEM_RULE', source_rule: 'polish-test', idempotency_key: `polish-closed-${String(fresh.rfq.id)}` } },
    })
    const again = (await loadInbox(A, parseInboxParams({}), now)).rows.find((r) => r.id === String(fresh.rfq.id))!
    expect(again.reply.state).toBe('OPEN')

    const overdue = await loadInbox(A, parseInboxParams({ reply: 'overdue' }), now)
    expect(overdue.rows.map((r) => r.id)).toEqual([String(late.rfq.id)])
    // A done first reply is never "overdue", whatever its due date.
    await setDue(done.task.id, new Date(now.getTime() - 5 * H))
    expect((await loadInbox(A, parseInboxParams({ reply: 'overdue' }), now)).total).toBe(1)
  })
})

describe('My Work dashboard', () => {
  it('every tile counts exactly the inbox rows its link shows; Mine adds owner = me; this week by type and country', async () => {
    const admin = await user('platform-admin')
    const sales = await user('sales')
    const p = await payload()
    const A = crmSessionFor(p, admin.user)!
    const S = crmSessionFor(p, sales.user)!
    const now = new Date()
    const a = await submit('NATIVE_FORM', new Date(now.getTime() - 5 * 60_000), parts('a', 'TH'))
    const b = await submit('NATIVE_FORM', new Date(now.getTime() - 50 * H), parts('b', 'US'))
    await setDue(b.task.id, new Date(now.getTime() - 2 * H))
    const c = await submit('NATIVE_CHAT', new Date(now.getTime() - 26 * H), { purpose: 'repair', service_issue: 'Vibration (synthetic).', name: 'Cy Synthetic', company: 'C Works (synthetic)', email: `cy.${Date.now()}@example.test`, country: 'TH' })
    await setDue(c.task.id, new Date(now.getTime() - 1 * H))
    const fresh = async (id: unknown) => String(((await p.findByID({ collection: 'crm-rfqs', id: String(id), ...sys })) as unknown as Doc).updatedAt)
    await m.assignRfq(A, { rfqId: c.rfq.id, assigneeId: sales.user.id, expectedUpdatedAt: await fresh(c.rfq.id) })

    for (const [sess, scope] of [
      [A, 'team'],
      [S, 'mine'],
    ] as const) {
      const d = await loadDashboard(sess, scope, now)
      for (const t of d.tiles) {
        const q = Object.fromEntries(new URLSearchParams(t.href.split('?')[1] ?? ''))
        const inbox = await loadInbox(sess, parseInboxParams(q), now)
        expect(t.count, `${scope} ${t.key}`).toBe(inbox.total)
      }
      const overdue = d.tiles.find((t) => t.key === 'reply_overdue')!
      expect(overdue.count).toBe(scope === 'team' ? 2 : 1) // Mine: only the sales user's inquiry
      expect(overdue.scope).toBe(scope === 'team' ? 'Team' : 'Mine')
      expect(d.tiles.find((t) => t.key === 'new_today')!.scope).toBe('Team')
    }

    const d = await loadDashboard(A, 'team', now)
    expect(d.week.status).toBe('ok')
    if (d.week.status !== 'ok') return
    const total = d.week.data.byType.reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(d.week.data.total)
    for (const r of d.week.data.byType) {
      const q = Object.fromEntries(new URLSearchParams(r.href.split('?')[1] ?? ''))
      if (r.key !== 'OTHER') expect((await loadInbox(A, parseInboxParams(q), now)).total, r.key).toBe(r.count)
    }
    for (const r of d.week.data.byCountry) {
      const q = Object.fromEntries(new URLSearchParams(r.href.split('?')[1] ?? ''))
      expect((await loadInbox(A, parseInboxParams(q), now)).total, r.key).toBe(r.count)
    }
    // The existing My Work loader is unchanged by the dashboard (still loads every module).
    const w = await loadMyWork(A, 'team', now)
    expect(w.unassigned.status).toBe('ok')
    expect(d.openFollowUps.status).toBe('ok')
    if (d.openFollowUps.status === 'ok') expect(d.openFollowUps.data.overdue).toBeGreaterThanOrEqual(2)
    expect(a.rfq.source_system).toBe('NATIVE_FORM')
  })
})

describe('owner rule 2026-10-06: no phone, no address — stored templates', () => {
  // The T2 seed as it was before the rule: a "call me at {{office_phone}}" line and a phone line in the signature.
  const OLD_SIGNATURE = '{{sales_rep_name}}\n{{sales_rep_title}}\nIndustrial Cooling Solutions (ICS)\n{{office_phone}}'
  const oldT2 = () => {
    const t = SEED_TEMPLATES.find((x) => x.code === 'T2')!
    const body = t.body
      .replace('Just reply to this email. Attachments are welcome.', "Just reply to this email. Attachments are welcome. If it's easier to talk it through, call me at {{office_phone}}.")
      .replace('{{email_signature}}', OLD_SIGNATURE)
    return { subject: t.subject, body, purpose: t.purpose }
  }
  it('an unedited, unapproved earlier seed is replaced; an edited or approved one is left alone', async () => {
    const p = await payload()
    expect(SUPERSEDED_SEED_HASHES.T2).toContain(templateHash(oldT2())) // the reconstruction is exactly the earlier seed
    // Rows stored before the rule (the collection now refuses {{office_phone}} on any write, and templates can't be
    // deleted through Payload): created with today's valid text, then set to the earlier wording in the table.
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    await drizzle.execute(sql`DELETE FROM crm_email_templates WHERE code IN ('T2', 'T3', 'T4')`)
    const old = oldT2()
    const mk = async (code: string, body: string, approved = false) => {
      const t = SEED_TEMPLATES.find((x) => x.code === 'T2')!
      await p.create({ collection: 'crm-email-templates' as never, data: { code, name: code, locale: 'en', version: 1, subject: t.subject, body: t.body, purpose: t.purpose, approved: false } as never, ...sys, context: { crmServer: {} } })
      const hash = templateHash({ subject: t.subject, body, purpose: t.purpose })
      await drizzle.execute(sql`UPDATE crm_email_templates SET body = ${body}, approved = ${approved}, approved_hash = ${approved ? hash : null} WHERE code = ${code}`)
    }
    await mk('T2', old.body) // unedited earlier seed
    await mk('T3', `${old.body}\nEdited by an admin.`) // edited: not ours to change
    await mk('T4', old.body, true) // approved: never touched
    await ensureTemplates(p)
    const get = async (code: string) => (await p.find({ collection: 'crm-email-templates' as never, where: { code: { equals: code } } as never, ...sys })).docs[0] as unknown as Doc
    const t2 = await get('T2')
    expect(t2.body).toBe(SEED_TEMPLATES.find((x) => x.code === 'T2')!.body)
    expect(String(t2.body)).not.toMatch(/office_phone/)
    // T-R1: the seed is owner-approved (2026-10-06), so the re-seeded copy is approved for exactly the new wording.
    expect(t2).toMatchObject({ approved: true, approved_hash: templateHash(SEED_TEMPLATES.find((x) => x.code === 'T2')!) })
    expect(String((await get('T3')).body)).toContain('Edited by an admin.')
    expect(String((await get('T4')).body)).toContain('{{office_phone}}')
    // An approved T2 that is exactly the earlier seed is still never replaced (only an admin changes approved wording).
    await drizzle.execute(sql`DELETE FROM crm_email_templates WHERE code = 'T2'`)
    await mk('T2', old.body, true)
    await ensureTemplates(p)
    const approvedT2 = await get('T2')
    expect(approvedT2.approved).toBe(true)
    expect(String(approvedT2.body)).toContain('{{office_phone}}')
  })
})

describe('T-R1: T2–T6 approved seeds and the industrial-scope guard', () => {
  it('an unapproved, unedited R1.1 T6 or current-seed T3 becomes the approved seed; an edited one stays unapproved', async () => {
    const p = await payload()
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    await drizzle.execute(sql`DELETE FROM crm_email_templates WHERE code IN ('T3', 'T4', 'T6')`)
    const seed = (code: string) => SEED_TEMPLATES.find((x) => x.code === code)!
    const r11T6 = seed('T6').body.replace(
      'industrial cooling tower parts, maintenance and repairs, dry soda blasting or new towers in the future.',
      'cooling tower parts, repairs or new towers in the future.',
    )
    expect(SUPERSEDED_SEED_HASHES.T6).toContain(templateHash({ subject: seed('T6').subject, body: r11T6, purpose: 'TRANSACTIONAL' }))
    const put = async (code: string, body: string) => {
      const t = seed(code)
      await p.create({ collection: 'crm-email-templates' as never, data: { code, name: code, locale: 'en', version: 1, subject: t.subject, body: t.body, purpose: t.purpose, approved: false } as never, ...sys, context: { crmServer: {} } })
      await drizzle.execute(sql`UPDATE crm_email_templates SET body = ${body}, approved = false, approved_hash = NULL WHERE code = ${code}`)
    }
    await put('T6', r11T6) // the R1.1 wording, never approved
    await put('T3', seed('T3').body) // the current wording, never approved
    await put('T4', `${seed('T4').body}\nEdited by an admin.`) // edited
    await ensureTemplates(p)
    const get = async (code: string) => (await p.find({ collection: 'crm-email-templates' as never, where: { code: { equals: code } } as never, ...sys })).docs[0] as unknown as Doc
    const t6 = await get('T6')
    expect(t6).toMatchObject({ approved: true, approved_hash: templateHash(seed('T6')) })
    expect(String(t6.body)).toContain('industrial cooling tower parts, maintenance and repairs, dry soda blasting or new towers in the future. Just reply to this email.')
    expect(await get('T3')).toMatchObject({ approved: true, approved_hash: templateHash(seed('T3')) })
    const t4 = await get('T4')
    expect(t4.approved).not.toBe(true)
    expect(String(t4.body)).toContain('Edited by an admin.')
    // An admin's withdrawal stands: re-seeding never re-approves a template whose approval was withdrawn.
    const admin = await user('platform-admin')
    expect(await setTemplateApproved(crmSessionFor(p, admin.user)!, String(t6.id), false)).toMatchObject({ ok: true })
    await ensureTemplates(p)
    await ensureTemplates(p)
    expect(await get('T6')).toMatchObject({ approved: false, approved_hash: 'WITHDRAWN' })
    expect(await setTemplateApproved(crmSessionFor(p, admin.user)!, String(t6.id), true)).toMatchObject({ ok: true })
    expect(await get('T6')).toMatchObject({ approved: true, approved_hash: templateHash(seed('T6')) })
  })
  it('approval refuses out-of-scope wording on every template kind (transactional and sequence), naming the term', async () => {
    const admin = await user('platform-admin')
    const p = await payload()
    const A = crmSessionFor(p, admin.user)!
    await ensureTemplates(p)
    const t3 = (await templateByCode(p, 'T3'))!
    expect(await saveTemplate(A, { id: String(t3.id), name: 'T3', subject: String(t3.subject), body: `${String(t3.body)}\nWe also service HVAC rooftop units.`, purpose: 'TRANSACTIONAL' })).toMatchObject({ ok: true })
    const refused = await setTemplateApproved(A, String(t3.id), true)
    expect(refused).toMatchObject({ ok: false, code: 'TEMPLATE_OUT_OF_SCOPE' })
    expect((refused as { message: string }).message).toMatch(/“HVAC”.*“rooftop unit”/)
    expect((await templateByCode(p, 'T3'))!.approved).not.toBe(true)
    const e11 = (await templateByCode(p, 'E11_QUAL_1'))!
    expect(await saveTemplate(A, { id: String(e11.id), name: 'E11', subject: String(e11.subject), body: `${String(e11.body)}\nSmall cooling towers for your home too.`, purpose: 'SEQUENCE' })).toMatchObject({ ok: true })
    const refusedSeq = await setTemplateApproved(A, String(e11.id), true)
    expect(refusedSeq).toMatchObject({ ok: false, code: 'TEMPLATE_OUT_OF_SCOPE' })
    expect((refusedSeq as { message: string }).message).toMatch(/“residential \/ home”.*“small cooling tower”/)
    // In scope again → approvable.
    expect(await saveTemplate(A, { id: String(t3.id), name: 'T3', subject: String(t3.subject), body: SEED_TEMPLATES.find((x) => x.code === 'T3')!.body, purpose: 'TRANSACTIONAL' })).toMatchObject({ ok: true })
    expect(await setTemplateApproved(A, String(t3.id), true)).toMatchObject({ ok: true })
  })
})
