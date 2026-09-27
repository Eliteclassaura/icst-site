import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { isUuidV7 } from '../ids'
import { evaluateSend, type LedgerRow } from '../suppression'
import { roleSpecificPersonalizationAllowed } from '../collections/buying-group'
import { relId } from '../guards'
import { as, auditFor, payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
const srv = { overrideAccess: true as const, depth: 0 }

async function fixtureWorld() {
  const acct = (name: string, domains: Array<{ domain: string; domain_status: string }> = []) =>
    p.create({ collection: 'crm-accounts', data: { canonical_name: name, domains } as never, ...as(sales) })
  const a = await acct('Northwind Thermal (synthetic)', [
    { domain: 'northwind.example.com', domain_status: 'VERIFIED_OWNED' },
  ])
  const b = await acct('Contoso Cooling (synthetic)')
  const siteA1 = await p.create({
    collection: 'crm-sites',
    data: { account: a.id, site_name: 'Plant A1 (synthetic)' } as never,
    ...as(sales),
  })
  const siteA2 = await p.create({
    collection: 'crm-sites',
    data: { account: a.id, site_name: 'Plant A2 (synthetic)' } as never,
    ...as(sales),
  })
  const siteB1 = await p.create({
    collection: 'crm-sites',
    data: { account: b.id, site_name: 'Plant B1 (synthetic)' } as never,
    ...as(sales),
  })
  const t1 = await p.create({
    collection: 'crm-assets',
    data: { site: siteA1.id, asset_name: 'Tower 1' } as never,
    ...as(sales),
  })
  const t2 = await p.create({
    collection: 'crm-assets',
    data: { site: siteA1.id, asset_name: 'Tower 2' } as never,
    ...as(sales),
  })
  const tB = await p.create({
    collection: 'crm-assets',
    data: { site: siteB1.id, asset_name: 'Tower B' } as never,
    ...as(sales),
  })
  const cA = await p.create({
    collection: 'crm-contacts',
    data: {
      email: 'Jordan.Example@Northwind.example.com',
      first_name: 'Jordan',
      last_name: 'Example',
      account: a.id,
      account_link_confidence: 'VERIFIED',
    } as never,
    ...as(sales),
  })
  const cB = await p.create({
    collection: 'crm-contacts',
    data: {
      email: 'casey@contoso.example.com',
      first_name: 'Casey',
      last_name: 'Example',
      account: b.id,
      account_link_confidence: 'HIGH_CONFIDENCE',
    } as never,
    ...as(sales),
  })
  return { a, b, siteA1, siteA2, siteB1, t1, t2, tB, cA, cB }
}
let w: Awaited<ReturnType<typeof fixtureWorld>>

beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
})
beforeEach(async () => {
  await resetCrm()
  w = await fixtureWorld()
})

const opp = (data: Doc, u: TestUser = sales) =>
  p.create({
    collection: 'crm-opportunities',
    data: { name: 'Synthetic pursuit', owner: u.id, ...data } as never,
    ...as(u),
  })

describe('T5–T9 hierarchy and relationships', () => {
  it('every record gets a server-generated UUIDv7 canonical id; a client-supplied one is ignored', async () => {
    const r = await p.create({
      collection: 'crm-accounts',
      data: {
        canonical_name: 'Fabrikam (synthetic)',
        canonical_id: '00000000-0000-7000-8000-000000000000',
      } as never,
      ...as(sales),
    })
    expect(isUuidV7(r.canonical_id)).toBe(true)
    expect(r.canonical_id).not.toBe('00000000-0000-7000-8000-000000000000')
    await expect(
      p.update({ collection: 'crm-accounts', id: r.id, data: { canonical_id: 'x' } as never, ...srv }),
    ).rejects.toThrow(/CANONICAL_ID_IMMUTABLE/)
  })
  it('account → contacts / sites / opportunities / rfqs resolve through joins', async () => {
    await opp({ account: w.a.id, site: w.siteA1.id, motion: 'REPAIR', assets: [w.t1.id] })
    const acc = (await p.findByID({
      collection: 'crm-accounts',
      id: w.a.id,
      depth: 1,
      ...as(sales),
    })) as unknown as Doc
    expect(((acc.contacts as Doc).docs as unknown[]).length).toBe(1)
    expect(((acc.sites as Doc).docs as unknown[]).length).toBe(2) // an account with multiple plants
    expect(((acc.opportunities as Doc).docs as unknown[]).length).toBe(1)
  })
  it('site → assets: multiple towers at one site', async () => {
    const site = (await p.findByID({
      collection: 'crm-sites',
      id: w.siteA1.id,
      depth: 1,
      ...as(sales),
    })) as unknown as Doc
    expect(((site.assets as Doc).docs as unknown[]).length).toBe(2)
  })
  it('an asset derives its account from its site; a forged account is ignored', async () => {
    const t = await p.create({
      collection: 'crm-assets',
      data: { site: w.siteA1.id, account: w.b.id, asset_name: 'Tower 3' } as never,
      ...as(sales),
    })
    expect(relId(t.account)).toBe(String(w.a.id))
  })
  it('a site cannot be moved to another account', async () => {
    await expect(
      p.update({
        collection: 'crm-sites',
        id: w.siteA1.id,
        data: { account: w.b.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/WRITE_ONCE/)
  })
})

describe('project / opportunity boundary (E1.4)', () => {
  it('a greenfield NEW_TOWER opportunity needs no asset and no site', async () => {
    const o = await opp({
      account: w.a.id,
      motion: 'NEW_TOWER',
      motion_detail: 'NEW_LARGE_MEGA_TOWER',
      project_type: 'NEW_TOWER',
    })
    expect(o.assets ?? []).toEqual([])
    expect(o.site ?? null).toBeNull()
  })
  it('a NEW_TOWER opportunity refuses an existing asset', async () => {
    await expect(
      opp({ account: w.a.id, site: w.siteA1.id, motion: 'NEW_TOWER', assets: [w.t1.id] }),
    ).rejects.toThrow(/NEW_TOWER_HAS_NO_EXISTING_ASSET/)
  })
  it('a rebuild is bound to the existing tower on the same site', async () => {
    const o = await opp({
      account: w.a.id,
      site: w.siteA1.id,
      motion: 'REBUILD_REPLACEMENT',
      project_type: 'MAJOR_REBUILD_REPLACEMENT',
      assets: [w.t1.id, w.t2.id],
    })
    expect((o.assets as unknown[]).length).toBe(2)
  })
  it('Project A evidence cannot be applied to Project B: another site’s tower is refused', async () => {
    await expect(
      opp({ account: w.a.id, site: w.siteA2.id, motion: 'REPAIR', assets: [w.t1.id] }),
    ).rejects.toThrow(/OPPORTUNITY_ASSET_OTHER_SITE/)
    await expect(opp({ account: w.a.id, site: w.siteB1.id, motion: 'REPAIR' })).rejects.toThrow(
      /OPPORTUNITY_SITE_OTHER_ACCOUNT/,
    )
    await expect(
      opp({ account: w.a.id, site: w.siteA1.id, motion: 'REPAIR', assets: [w.tB.id] }),
    ).rejects.toThrow(/OPPORTUNITY_ASSET_OTHER_SITE/)
  })
  it('an opportunity never moves to another account', async () => {
    const o = await opp({ account: w.a.id, motion: 'REPAIR' })
    await expect(
      p.update({
        collection: 'crm-opportunities',
        id: o.id,
        data: { account: w.b.id } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/WRITE_ONCE/)
  })
  it('motion_detail and project_type must agree with the frozen motion', async () => {
    await expect(
      opp({ account: w.a.id, motion: 'REPAIR', motion_detail: 'THERMAL_UPGRADE' }),
    ).rejects.toThrow(/MOTION_DETAIL_MISMATCH/)
    await expect(opp({ account: w.a.id, motion: 'REPAIR', project_type: 'NEW_TOWER' })).rejects.toThrow(
      /PROJECT_TYPE_MOTION_MISMATCH/,
    )
  })
  it('a VERIFIED project state needs project evidence', async () => {
    await expect(
      opp({ account: w.a.id, motion: 'NEW_TOWER', project_state: 'VERIFIED_ACTIVE_CAPITAL_PROJECT' }),
    ).rejects.toThrow(/PROJECT_STATE_WITHOUT_EVIDENCE/)
    const ok = await opp({
      account: w.a.id,
      motion: 'NEW_TOWER',
      project_state: 'VERIFIED_ACTIVE_CAPITAL_PROJECT',
      project_evidence_ref: 'synthetic-doc-1',
    })
    expect(ok.project_state).toBe('VERIFIED_ACTIVE_CAPITAL_PROJECT')
  })
  it('an opportunity requires an owner (E0.1) — none is invented', async () => {
    await expect(
      p.create({
        collection: 'crm-opportunities',
        data: { name: 'x', account: w.a.id, motion: 'PARTS' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow()
  })
})

describe('T19/T20 UNKNOWN economics', () => {
  it('a new opportunity has no amount, no currency, no probability — and says so', async () => {
    const o = (await opp({ account: w.a.id, motion: 'PARTS' })) as unknown as Doc
    expect(o.amount ?? null).toBeNull()
    expect(o.currency ?? null).toBeNull()
    expect(o.probability ?? null).toBeNull()
    expect(o.amount_status).toBe('NOT_ENTERED')
    expect(o.revenue_truth_state).toBe('VALUE_NOT_ENTERED')
    expect(o.amount_display).toBe('Value not entered')
    expect(String(o.amount_display)).not.toMatch(/\$|0/)
    expect(o.expected_decision_date ?? null).toBeNull()
  })
  it('zero without an explicit source zero is refused; explicit zero is distinguishable from unknown', async () => {
    await expect(
      opp({ account: w.a.id, motion: 'PARTS', amount_status: 'KNOWN', amount: 0, currency: 'USD' }),
    ).rejects.toThrow(/ZERO_WITHOUT_EXPLICIT_SOURCE/)
    const z = (await opp({
      account: w.a.id,
      motion: 'PARTS',
      amount_status: 'KNOWN',
      amount: 0,
      currency: 'USD',
      source_record_explicit_zero: true,
    })) as unknown as Doc
    expect(z.amount).toBe(0)
    expect(z.revenue_truth_state).toBe('OPPORTUNITY_VALUE_KNOWN')
    expect(z.amount_display).toBe('USD 0 (explicit zero)')
  })
  it('a known amount needs a currency (unknown currency is not USD); an amount needs KNOWN status', async () => {
    await expect(
      opp({ account: w.a.id, motion: 'PARTS', amount_status: 'KNOWN', amount: 5000 }),
    ).rejects.toThrow(/KNOWN_AMOUNT_WITHOUT_CURRENCY/)
    await expect(opp({ account: w.a.id, motion: 'PARTS', amount: 5000, currency: 'USD' })).rejects.toThrow(
      /AMOUNT_WITHOUT_KNOWN_STATUS/,
    )
  })
  it('sales cannot confirm revenue; confirmed revenue needs WON + KNOWN', async () => {
    const o = await opp({
      account: w.a.id,
      motion: 'PARTS',
      amount_status: 'KNOWN',
      amount: 1200,
      currency: 'JPY',
    })
    const u = await p.update({
      collection: 'crm-opportunities',
      id: o.id,
      data: { revenue_verification_state: 'CONFIRMED' } as never,
      ...as(sales),
    })
    expect(u.revenue_verification_state).toBe('UNVERIFIED') // denied write is discarded, not applied
    await expect(
      p.update({
        collection: 'crm-opportunities',
        id: o.id,
        data: { revenue_verification_state: 'CONFIRMED' } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/CONFIRMED_REVENUE_REQUIRES_WON_AND_KNOWN/)
    const won = await p.update({
      collection: 'crm-opportunities',
      id: o.id,
      data: {
        stage: 'WON',
        stage_change_reason: 'Synthetic PO received',
        revenue_verification_state: 'CONFIRMED',
      } as never,
      ...as(admin),
    })
    expect(won.revenue_truth_state).toBe('WON_REVENUE_CONFIRMED')
  })
})

describe('stages move on evidence, never on time', () => {
  it('changing stage without a reason is refused; with a reason it is recorded and timelined', async () => {
    const o = await opp({ account: w.a.id, motion: 'REPAIR' })
    await expect(
      p.update({
        collection: 'crm-opportunities',
        id: o.id,
        data: { stage: 'QUALIFIED' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/STAGE_CHANGE_REASON_REQUIRED/)
    const u = (await p.update({
      collection: 'crm-opportunities',
      id: o.id,
      data: { stage: 'QUALIFIED', stage_change_reason: 'Site walk confirmed scope' } as never,
      ...as(sales),
    })) as unknown as Doc
    expect((u.last_stage_change as Doc).reason).toBe('Site walk confirmed scope')
    const acts = await p.find({
      collection: 'crm-activities',
      where: { and: [{ opportunity: { equals: o.id } }, { type: { equals: 'OPPORTUNITY_STAGE_CHANGED' } }] },
      ...srv,
    })
    expect(acts.docs).toHaveLength(1)
  })
  it('a REST PATCH that touches only an unrelated field leaves stage and economics intact (partial update)', async () => {
    const o = await opp({
      account: w.a.id,
      site: w.siteA1.id,
      motion: 'REPAIR',
      assets: [w.t1.id],
      amount_status: 'KNOWN',
      amount: 900,
      currency: 'USD',
    })
    const r = await rest.patch(`crm-opportunities/${o.id}`, sales.token, {
      next_step: 'Send synthetic scope',
    })
    expect(r.status).toBe(200)
    const doc = r.body.doc as Doc
    expect(doc.stage).toBe('NEW')
    expect(doc.amount).toBe(900)
    expect(doc.revenue_truth_state).toBe('OPPORTUNITY_VALUE_KNOWN')
  })
})

describe('T21 audit', () => {
  it('opportunity create and stage/owner changes are audited without personal data', async () => {
    const o = await opp({ account: w.a.id, motion: 'REPAIR' })
    await p.update({
      collection: 'crm-opportunities',
      id: o.id,
      data: { stage: 'QUALIFYING', stage_change_reason: 'Synthetic call', owner: admin.id } as never,
      ...as(sales),
    })
    const rows = await auditFor('crm-opportunities', String(o.id))
    expect(rows.map((r) => r.action)).toEqual(['create', 'update'])
    const upd = rows[1]!
    expect(upd.actor).toBe(sales.id)
    const t = (upd.detail as Doc).transitions as Doc
    expect(t.stage).toEqual({ from: 'NEW', to: 'QUALIFYING' })
    expect(t.owner).toEqual({ from: sales.id, to: admin.id })
    expect(upd.summary ?? null).toBeNull()
    expect(upd.actorEmail ?? null).toBeNull()
  })
  it('contact audit entries never contain the email or name', async () => {
    const rows = await auditFor('crm-contacts', String(w.cA.id))
    expect(rows.length).toBeGreaterThan(0)
    const text = JSON.stringify(rows)
    expect(text).not.toMatch(/northwind\.example\.com|Jordan/i)
  })
})

describe('contacts: identity and eligibility', () => {
  it('email match key is lowercase only — no alias folding', async () => {
    const c = (await p.findByID({ collection: 'crm-contacts', id: w.cA.id, ...srv })) as unknown as Doc
    expect(c.email_match_key).toBe('jordan.example@northwind.example.com')
    const plus = (await p.create({
      collection: 'crm-contacts',
      data: { email: 'jordan.example+rfq@northwind.example.com' } as never,
      ...as(sales),
    })) as unknown as Doc
    expect(plus.email_match_key).toBe('jordan.example+rfq@northwind.example.com')
  })
  it('email casing differences are one identity (unique key)', async () => {
    await expect(
      p.create({
        collection: 'crm-contacts',
        data: { email: 'JORDAN.EXAMPLE@NORTHWIND.EXAMPLE.COM' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow()
  })
  it('same name, different people: two contacts coexist', async () => {
    const other = await p.create({
      collection: 'crm-contacts',
      data: {
        email: 'jordan.example@contoso.example.com',
        first_name: 'Jordan',
        last_name: 'Example',
      } as never,
      ...as(sales),
    })
    expect(other.id).not.toBe(w.cA.id)
  })
  it('an account link needs a confidence; a VERIFIED link is protected from non-admin change', async () => {
    await expect(
      p.create({
        collection: 'crm-contacts',
        data: { email: 'x1@northwind.example.com', account: w.a.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/ACCOUNT_LINK_CONFIDENCE_REQUIRED/)
    await expect(
      p.update({
        collection: 'crm-contacts',
        id: w.cA.id,
        data: { account: w.b.id, account_link_confidence: 'LOW_CONFIDENCE' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/VERIFIED_LINK_PROTECTED/)
  })
  it('missing consent is not opt-in; sales cannot mark eligible; admin cannot while jurisdiction is unknown', async () => {
    const c = (await p.findByID({ collection: 'crm-contacts', id: w.cA.id, ...srv })) as unknown as Doc
    expect(c.marketing_eligibility).toBe('UNKNOWN')
    expect(c.jurisdiction).toBe('COUNTRY_UNKNOWN')
    const s = await p.update({
      collection: 'crm-contacts',
      id: w.cA.id,
      data: { marketing_eligibility: 'ELIGIBLE' } as never,
      ...as(sales),
    })
    expect(s.marketing_eligibility).toBe('UNKNOWN')
    await expect(
      p.update({
        collection: 'crm-contacts',
        id: w.cA.id,
        data: { marketing_eligibility: 'ELIGIBLE', relationship_evidence: 'ACTIVE_CUSTOMER' } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/ELIGIBILITY_JURISDICTION_UNRESOLVED/)
  })
  it('the address is write-once', async () => {
    await expect(
      p.update({
        collection: 'crm-contacts',
        id: w.cA.id,
        data: { email: 'other@northwind.example.com' } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/WRITE_ONCE/)
  })
})

describe('T22 suppression is durable', () => {
  const ledger = async (key: string) =>
    (await p.find({ collection: 'crm-suppressions', where: { email_match_key: { equals: key } }, ...srv }))
      .docs as unknown as LedgerRow[]
  it('a suppressed contact is never considered sendable, and eligibility cannot be granted over it', async () => {
    await p.create({
      collection: 'crm-suppressions',
      data: { contact: w.cA.id, reason: 'UNSUBSCRIBED' } as never,
      ...as(sales),
    })
    const rows = await ledger('jordan.example@northwind.example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.scope).toBe('MARKETING_EMAIL')
    const eligible = { marketing_eligibility: 'ELIGIBLE', jurisdiction: 'VERIFIED_US' }
    expect(evaluateSend(rows, eligible, 'SEQUENCE_OUTREACH').allowed).toBe(false)
    expect(evaluateSend(rows, eligible, 'BROADCAST').allowed).toBe(false)
    await expect(
      p.update({
        collection: 'crm-contacts',
        id: w.cA.id,
        data: {
          marketing_eligibility: 'ELIGIBLE',
          relationship_evidence: 'ACTIVE_CUSTOMER',
          jurisdiction: 'VERIFIED_US',
        } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/ELIGIBILITY_BLOCKED_BY_SUPPRESSION/)
  })
  it('the ledger cannot be edited or deleted — by anyone, on any path', async () => {
    const s = await p.create({
      collection: 'crm-suppressions',
      data: { address: 'casey@contoso.example.com', reason: 'COMPLAINT' } as never,
      ...as(sales),
    })
    await expect(
      p.update({
        collection: 'crm-suppressions',
        id: s.id,
        data: { reason: 'MANUAL_SUPPRESSION' } as never,
        ...srv,
      }),
    ).rejects.toThrow(/APPEND_ONLY/)
    await expect(p.delete({ collection: 'crm-suppressions', id: s.id, ...srv })).rejects.toThrow(
      /DELETE_FORBIDDEN/,
    )
    const r = await rest.delete(`crm-suppressions/${s.id}`, admin.token)
    expect(r.status).toBeGreaterThanOrEqual(400)
  })
  it('a hard bounce is never clearable; a complaint clears only with admin + re-consent evidence', async () => {
    const hb = await p.create({
      collection: 'crm-suppressions',
      data: { contact: w.cB.id, reason: 'HARD_BOUNCE' } as never,
      ...as(sales),
    })
    expect(hb.scope).toBe('ALL_EMAIL')
    await expect(
      p.create({
        collection: 'crm-suppressions',
        data: {
          contact: w.cB.id,
          action: 'CLEAR',
          reason: 'HARD_BOUNCE',
          clears: hb.id,
          reason_note: 'x',
        } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/NEVER_CLEARABLE/)
    const cp = await p.create({
      collection: 'crm-suppressions',
      data: { contact: w.cA.id, reason: 'COMPLAINT' } as never,
      ...as(sales),
    })
    await expect(
      p.create({
        collection: 'crm-suppressions',
        data: {
          contact: w.cA.id,
          action: 'CLEAR',
          reason: 'COMPLAINT',
          clears: cp.id,
          reason_note: 'Customer asked',
        } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/CLEAR_PRIVILEGED/)
    await expect(
      p.create({
        collection: 'crm-suppressions',
        data: {
          contact: w.cA.id,
          action: 'CLEAR',
          reason: 'COMPLAINT',
          clears: cp.id,
          reason_note: 'Customer asked',
        } as never,
        ...as(admin),
      }),
    ).rejects.toThrow(/RECONSENT_REQUIRED/)
    await p.create({
      collection: 'crm-suppressions',
      data: {
        contact: w.cA.id,
        action: 'CLEAR',
        reason: 'COMPLAINT',
        clears: cp.id,
        reason_note: 'Re-consented',
        evidence_ref: 'synthetic-consent-record-1',
      } as never,
      ...as(admin),
    })
    const rows = await ledger('jordan.example@northwind.example.com')
    expect(rows).toHaveLength(2) // the APPLY row still exists; the CLEAR is a new row
  })
  it('a hard bounce cannot be recorded as marketing-only', async () => {
    await expect(
      p.create({
        collection: 'crm-suppressions',
        data: { contact: w.cB.id, reason: 'HARD_BOUNCE', scope: 'MARKETING_EMAIL' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/SCOPE_TOO_NARROW/)
  })
  it('suppression is keyed on the address, so it survives the contact being archived', async () => {
    await p.create({
      collection: 'crm-suppressions',
      data: { contact: w.cB.id, reason: 'DO_NOT_CONTACT' } as never,
      ...as(sales),
    })
    await p.update({
      collection: 'crm-contacts',
      id: w.cB.id,
      data: { record_state: 'ARCHIVED' } as never,
      ...as(sales),
    })
    const rows = await ledger('casey@contoso.example.com')
    expect(
      evaluateSend(rows, { marketing_eligibility: 'ELIGIBLE', jurisdiction: 'VERIFIED_US' }, 'PERSONAL')
        .allowed,
    ).toBe(false)
  })
})

describe('buying group (E1.4)', () => {
  it('account employment does not create project membership; unknown role is not verified', async () => {
    const o = await opp({ account: w.a.id, motion: 'NEW_TOWER' })
    const bg = await p.find({
      collection: 'crm-buying-group-members',
      where: { opportunity: { equals: o.id } },
      ...srv,
    })
    expect(bg.docs).toHaveLength(0)
    const m = (await p.create({
      collection: 'crm-buying-group-members',
      data: { opportunity: o.id, contact: w.cA.id } as never,
      ...as(sales),
    })) as unknown as Doc
    expect(m.membership_class).toBe('PROJECT_MEMBERSHIP_UNKNOWN')
    expect(m.role_class).toBe('UNKNOWN')
    expect(roleSpecificPersonalizationAllowed(m, String(o.id))).toBe(false)
    await expect(
      p.update({
        collection: 'crm-buying-group-members',
        id: m.id as string,
        data: { role_verification: 'VERIFIED' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/VERIFIED_WITHOUT_EVIDENCE|UNKNOWN_ROLE_VERIFIED/)
  })
  it('Contact B from another account cannot join on Contact A’s evidence', async () => {
    const o = await opp({ account: w.a.id, motion: 'NEW_TOWER' })
    await expect(
      p.create({
        collection: 'crm-buying-group-members',
        data: { opportunity: o.id, contact: w.cB.id, role_class: 'PROCUREMENT_SOURCING' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/CROSS_ACCOUNT_ROLE/)
    await expect(
      p.create({
        collection: 'crm-buying-group-members',
        data: {
          opportunity: o.id,
          contact: w.cB.id,
          role_class: 'EPC_CONSULTANT_THIRD_PARTY_ENGINEER',
        } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/CROSS_ACCOUNT_EVIDENCE/)
    const ok = await p.create({
      collection: 'crm-buying-group-members',
      data: {
        opportunity: o.id,
        contact: w.cB.id,
        role_class: 'EPC_CONSULTANT_THIRD_PARTY_ENGINEER',
        provenance: { evidence_ref: 'synthetic-epc-letter' },
      } as never,
      ...as(sales),
    })
    expect(ok.cross_account).toBe(true)
  })
  it('a membership is about one person on one project: duplicates and re-pointing are refused', async () => {
    const o = await opp({ account: w.a.id, motion: 'NEW_TOWER' })
    const m = await p.create({
      collection: 'crm-buying-group-members',
      data: { opportunity: o.id, contact: w.cA.id } as never,
      ...as(sales),
    })
    await expect(
      p.create({
        collection: 'crm-buying-group-members',
        data: { opportunity: o.id, contact: w.cA.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow()
    const o2 = await opp({ account: w.a.id, motion: 'REPAIR' })
    await expect(
      p.update({
        collection: 'crm-buying-group-members',
        id: m.id,
        data: { opportunity: o2.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/WRITE_ONCE/)
  })
  it('a fully verified project member passes the role-personalisation gate only for its own project', async () => {
    const o = await opp({ account: w.a.id, motion: 'NEW_TOWER' })
    const m = (await p.create({
      collection: 'crm-buying-group-members',
      data: {
        opportunity: o.id,
        contact: w.cA.id,
        membership_class: 'PROJECT_BUYING_GROUP_MEMBER',
        membership_verification: 'VERIFIED',
        role_class: 'ENGINEERING_TECHNICAL',
        role_verification: 'VERIFIED',
        role_confidence: 'HIGH',
        provenance: { evidence_ref: 'synthetic-kickoff-minutes' },
      } as never,
      ...as(sales),
    })) as unknown as Doc
    expect(roleSpecificPersonalizationAllowed(m, String(o.id))).toBe(true)
    expect(roleSpecificPersonalizationAllowed(m, 'another-project')).toBe(false)
  })
})

describe('assets: evidence discipline (E1.2)', () => {
  it('a technical fact without evidence is refused; UNKNOWN condition needs none', async () => {
    await expect(
      p.create({
        collection: 'crm-assets',
        data: { site: w.siteA1.id, manufacturer: 'Synthetic Maker' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/ASSET_FACT_WITHOUT_EVIDENCE/)
    await expect(
      p.create({
        collection: 'crm-assets',
        data: {
          site: w.siteA1.id,
          condition_state: 'REPLACEMENT_CANDIDATE',
          commissioned_year: 1975,
        } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/ASSET_FACT_WITHOUT_EVIDENCE/)
    const ok = await p.create({
      collection: 'crm-assets',
      data: {
        site: w.siteA1.id,
        manufacturer: 'Synthetic Maker',
        technical_evidence: [{ fact: 'manufacturer', evidence_ref: 'synthetic-nameplate-photo' }],
      } as never,
      ...as(sales),
    })
    expect(ok.condition_state).toBe('UNKNOWN')
  })
  it('an old asset is not made a replacement candidate by anything in the system', async () => {
    const old = await p.create({
      collection: 'crm-assets',
      data: {
        site: w.siteA1.id,
        commissioned_year: 1968,
        technical_evidence: [{ fact: 'commissioned_year', evidence_ref: 'synthetic-drawing' }],
      } as never,
      ...as(sales),
    })
    await p.create({
      collection: 'crm-activities',
      data: {
        type: 'PROJECT_INTERACTION',
        summary: 'Synthetic inspection visit',
        asset: old.id,
        occurred_at: new Date().toISOString(),
      } as never,
      ...as(sales),
    })
    const after = (await p.findByID({ collection: 'crm-assets', id: old.id, ...srv })) as unknown as Doc
    expect(after.condition_state).toBe('UNKNOWN')
  })
})

describe('activities, notes, tasks', () => {
  it('people may log calls; people may not forge system events; the timeline is append-only', async () => {
    const a = await p.create({
      collection: 'crm-activities',
      data: {
        type: 'CALL',
        summary: 'Synthetic call',
        account: w.a.id,
        occurred_at: new Date().toISOString(),
      } as never,
      ...as(sales),
    })
    expect(a.actor_kind).toBe('USER')
    expect(relId(a.actor)).toBe(sales.id)
    await expect(
      p.create({
        collection: 'crm-activities',
        data: { type: 'RFQ_CREATED', summary: 'forged', occurred_at: new Date().toISOString() } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/SYSTEM_ONLY/)
    await expect(
      p.update({ collection: 'crm-activities', id: a.id, data: { summary: 'edited' } as never, ...srv }),
    ).rejects.toThrow(/APPEND_ONLY/)
  })
  it('a task needs a subject, cannot be deleted, and is stamped on completion', async () => {
    await expect(
      p.create({ collection: 'crm-tasks', data: { title: 'Orphan' } as never, ...as(sales) }),
    ).rejects.toThrow(/TASK_WITHOUT_SUBJECT/)
    const t = await p.create({
      collection: 'crm-tasks',
      data: {
        title: 'Call back',
        account: w.a.id,
        source: 'SYSTEM_RULE',
        idempotency_key: 'forged',
      } as never,
      ...as(sales),
    })
    expect(t.source).toBe('MANUAL') // a person cannot claim a system origin
    expect(t.idempotency_key ?? null).toBeNull()
    const done = await p.update({
      collection: 'crm-tasks',
      id: t.id,
      data: { status: 'DONE' } as never,
      ...as(sales),
    })
    expect(relId(done.completed_by)).toBe(sales.id)
    await expect(p.delete({ collection: 'crm-tasks', id: t.id, ...srv })).rejects.toThrow(/DELETE_FORBIDDEN/)
  })
  it('a note is editable by its author and not by another sales user', async () => {
    const sales2 = await userWith('second.sales@example.test', 'sales')
    const n = await p.create({
      collection: 'crm-notes',
      data: { body: 'Synthetic note', account: w.a.id } as never,
      ...as(sales),
    })
    expect(relId(n.author)).toBe(sales.id)
    const mine = await rest.patch(`crm-notes/${n.id}`, sales.token, { body: 'Edited by author' })
    expect(mine.status).toBe(200)
    const theirs = await rest.patch(`crm-notes/${n.id}`, sales2.token, { body: 'Edited by someone else' })
    expect(theirs.status).toBeGreaterThanOrEqual(400)
    const after = (await p.findByID({ collection: 'crm-notes', id: n.id, ...srv })) as unknown as Doc
    expect(after.body).toBe('Edited by author')
    const forged = await rest.patch(`crm-notes/${n.id}`, sales.token, { author: sales2.id })
    expect(forged.status).toBeGreaterThanOrEqual(400)
  })
})
