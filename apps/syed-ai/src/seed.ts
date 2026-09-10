import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import config from './payload.config'
import * as fixtures from '@factory/agency-core/blocks/fixtures'
import { applyBrand } from '@factory/design-bundle/brand'
import { fixtureBrand } from './lib/fixture-brand'
import { validate } from '@factory/seo-contracts'

// Local/CI bootstrap only: first platform admin + a home page + one queued mock job.
// Production admins are created by invitation from an existing admin, never by seed.
const payload = await getPayload({ config })
const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.test'
const password = process.env.SEED_ADMIN_PASSWORD || 'change-me-locally'
if (process.env.NODE_ENV === 'production' && !process.env.SEED_ALLOW_PRODUCTION) {
  payload.logger.error('seed refused in production (set SEED_ALLOW_PRODUCTION=1 for a first-run bootstrap)')
  process.exit(2)
}
const users = await payload.find({
  collection: 'users',
  where: { email: { equals: email } },
  limit: 1,
  overrideAccess: true,
})
if (!users.docs.length) {
  await payload.create({
    collection: 'users',
    data: { email, password, name: 'Platform admin', roles: ['platform-admin'] },
    overrideAccess: true,
  })
  payload.logger.info('seeded platform-admin user')
}
// ── Site chrome globals (from the legacy site, via the registry fixtures — one source of copy) ──
// Fixtures are brand-neutral (ADR-026 §3): the client's identity is injected here, so the seeded
// chrome is this site's, while the shared fixtures name nobody.
const fx = {
  header: applyBrand(fixtures.header.default, fixtureBrand),
  footer: applyBrand(fixtures.footer.default, fixtureBrand),
  form: applyBrand(fixtures.briefForm.default, fixtureBrand),
}
await payload.updateGlobal({
  slug: 'brand-settings',
  overrideAccess: true,
  data: {
    brandName: 'syed.ai',
    wordmark: {
      text: fx.header.brand.name,
      accentSuffix: fx.header.brand.accent,
      subline: fx.header.brand.role,
    },
  },
})
await payload.updateGlobal({
  slug: 'site-settings',
  overrideAccess: true,
  // siteUrl is the canonical production origin; staging/dev set NEXT_PUBLIC_SERVER_URL and the graph is rewritten to it.
  data: { siteName: 'syed.ai', siteUrl: 'https://syed.ai' },
})
await payload.updateGlobal({
  slug: 'header',
  overrideAccess: true,
  data: {
    primary: fx.header.links.map((l) => ({ label: l.label, href: l.href })),
    ctaLabel: fx.header.cta?.label,
    ctaHref: fx.header.cta?.href,
  },
})
await payload.updateGlobal({
  slug: 'footer',
  overrideAccess: true,
  data: {
    columns: fx.footer.columns.map((c) => ({
      heading: c.heading,
      links: c.links.map((l) => ({ label: l.label, href: l.href, external: l.external ?? false })),
    })),
  },
})
await payload.updateGlobal({
  slug: 'form-config',
  overrideAccess: true,
  data: {
    selects: fx.form.selects.map((sel) => ({
      key: sel.name,
      label: sel.label,
      options: sel.options.map((o) => ({ label: o, value: o, default: o === sel.defaultValue })),
    })),
  },
})
// Brief form document (C6): the route resolves `forms.key = 'brief'`; fields mirror the block and send.php.
{
  const existingForm = await payload.find({
    collection: 'forms',
    where: { key: { equals: 'brief' } },
    limit: 1,
    overrideAccess: true,
  })
  const formData = {
    name: 'Brief',
    key: 'brief',
    fields: [
      { name: 'name', label: 'Your name', type: 'text' as const, required: true, maxLength: 120 },
      { name: 'email', label: 'Email', type: 'email' as const, required: true, maxLength: 254 },
      { name: 'company', label: 'Company', type: 'text' as const, required: false, maxLength: 160 },
      { name: 'site', label: 'Website', type: 'text' as const, required: false, maxLength: 200 },
      ...fx.form.selects.map((sel) => ({
        name: sel.name,
        label: sel.label,
        type: 'select' as const,
        required: false,
        options: sel.options.map((o) => ({ label: o, value: o })),
        defaultValue: sel.defaultValue,
      })),
      {
        name: 'brief',
        label: 'What is the gap?',
        type: 'textarea' as const,
        required: true,
        maxLength: 4000,
      },
    ],
    submitLabel: fx.form.submitLabel,
    successMessage: 'Thanks — your brief is in. A reply comes from a real person within two working days.',
    roadmapOptIn: { enabled: Boolean(fx.form.optIn), defaultChecked: false, label: fx.form.optIn?.label },
    turnstile: true,
  }
  if (existingForm.docs[0])
    await payload.update({
      collection: 'forms',
      id: existingForm.docs[0].id,
      data: formData,
      overrideAccess: true,
    })
  else await payload.create({ collection: 'forms', data: formData, overrideAccess: true })
}
// Lead score rules (deterministic; components stored on the lead). Idempotent by name.
for (const r of [
  { name: 'Revenue: $1M+', factor: 'budget', field: 'revenue', match: '$1M+', points: 25 },
  { name: 'Revenue: $250K – $1M', factor: 'budget', field: 'revenue', match: '$250K – $1M', points: 15 },
  { name: 'Budget: $25,000+', factor: 'budget', field: 'budget', match: '$25,000+', points: 20 },
  {
    name: 'Budget: $10,000 – $25,000',
    factor: 'budget',
    field: 'budget',
    match: '$10,000 – $25,000',
    points: 12,
  },
  { name: 'Budget: under $5,000', factor: 'negative', field: 'budget', match: 'Under $5,000', points: -10 },
  {
    name: 'Timeline: starting now',
    factor: 'timeline',
    field: 'timeline',
    match: 'Starting now',
    points: 20,
  },
  {
    name: 'Timeline: next 30 days',
    factor: 'timeline',
    field: 'timeline',
    match: 'Next 30 days',
    points: 12,
  },
  {
    name: 'Timeline: just researching',
    factor: 'negative',
    field: 'timeline',
    match: 'Just researching',
    points: -10,
  },
  { name: 'Has website', factor: 'engagement', field: 'site', match: '/\\./', points: 8 },
  { name: 'Company named', factor: 'engagement', field: 'company', match: '/.{2,}/', points: 5 },
  { name: 'Detailed brief', factor: 'engagement', field: 'brief', match: '/.{200,}/s', points: 8 },
  { name: 'Wants the plan', factor: 'engagement', field: 'roadmap', match: '1', points: 5 },
]) {
  const found = await payload.find({
    collection: 'lead-score-rules',
    where: { name: { equals: r.name } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    ...r,
    factor: r.factor as 'service-fit' | 'budget' | 'timeline' | 'engagement' | 'negative',
    active: true,
    verification: { status: 'verified' as const },
  }
  if (found.docs[0])
    await payload.update({ collection: 'lead-score-rules', id: found.docs[0].id, data, overrideAccess: true })
  else await payload.create({ collection: 'lead-score-rules', data, overrideAccess: true })
}
// Offices → contact-legal (footer). Facts are owner-verified in the ledger; seed marks them as such.
const officeIds: string[] = []
for (const o of fx.footer.offices ?? []) {
  const found = await payload.find({
    collection: 'offices',
    where: { name: { equals: o.city } },
    limit: 1,
    overrideAccess: true,
  })
  const [country, footerRole] = o.region.split(' · ')
  const data = {
    name: o.city,
    slug: o.city
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, ''),
    address: { locality: o.city.split(',')[0]!, country: country! },
    footerRole,
    hoursDisplay: o.hours,
    _status: 'published' as const,
    verification: { status: 'verified' as const, note: 'legacy footer, owner-verified 2026-09-03' },
  }
  const doc = found.docs[0]
    ? await payload.update({ collection: 'offices', id: found.docs[0].id, data, overrideAccess: true })
    : await payload.create({ collection: 'offices', data, overrideAccess: true })
  officeIds.push(doc.id)
}
await payload.updateGlobal({
  slug: 'contact-legal',
  overrideAccess: true,
  data: { legalName: fx.footer.copyrightHolder, offices: officeIds },
})
payload.logger.info('seeded chrome globals')

// ── Pages and media from the blueprint (C5): parsed from the legacy archive by tools/legacy-extract ──
type Blueprint = {
  files: { robotsTxt: string; llmsTxt: string }
  seoDefaults: { twitterSite: string; titleTemplate: string; robotsDirectives: string }
  schemaEntities: Array<{
    name: string
    schemaId: string
    type: string
    data: Record<string, unknown>
    emitOn: 'all' | 'home' | 'none'
  }>
  media: Array<{
    file: string
    alt: string
    width: number
    height: number
    rights: 'owned'
    credit: string
    decorative?: boolean
  }>
  pages: Array<{
    path: string
    slug: string
    parent?: string
    pageType: string
    title: string
    seo: {
      title: string
      description: string
      canonical?: string
      robots?: string
      og?: Record<string, string>
      twitter?: Record<string, string>
      schemaExtra?: Record<string, unknown>
    }
    layout: Array<Record<string, unknown> & { blockType: string }>
    legacyJsonLd?: unknown[]
    verification: { status: 'verified' | 'unverified'; note: string }
    decision_ref?: { run_id: string; source_url: string; action: string } | null
    migration?: {
      sourceUrl: string
      sourceId?: string
      sourceSystem?: 'wordpress' | 'static-html' | 'copy-deck' | 'other'
      originalTitle?: string
      originalMetaDescription?: string
      originalH1?: string
      originalWordCount?: number
      contentHash?: string
      decisionsVersion?: string
    } | null
  }>
  redirects: Array<{
    from: string
    to?: string | null
    status: 301 | 308 | 410
    reason?: string
    source?: string
  }>
}
const bpPath = fileURLToPath(new URL('../content/syed-ai.blueprint.json', import.meta.url))
const rawBlueprint = JSON.parse(readFileSync(bpPath, 'utf8')) as unknown
// Blueprint v2 is validated before any write (ADR-028 §8); a bad file exits non-zero with JSON-pointer paths.
const checked = validate('factory.seo/blueprint', rawBlueprint)
if (!checked.ok) {
  for (const i of checked.issues) console.error(`blueprint ${i.path}: ${i.message}`)
  console.error(`blueprint invalid — ${checked.issues.length} issue(s); nothing seeded`)
  process.exit(1)
}
const blueprint = rawBlueprint as Blueprint
payload.logger.info(`blueprint v${checked.value.version} validated`)

// Redirects (ADR-028 §6–7): blueprint rows are migration facts, seeded as active with source 'migration'.
// Human-created and automation rows are left alone (upsert by `from`, only migration-sourced rows are overwritten).
for (const r of blueprint.redirects) {
  const existing = await payload.find({
    collection: 'redirects',
    where: { from: { equals: r.from } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    from: r.from,
    to: r.to ?? undefined,
    statusCode: String(r.status) as '301' | '308' | '410',
    status: 'active' as const,
    source: 'migration' as const,
    reason: r.reason ?? 'blueprint redirect',
  }
  const doc = existing.docs[0]
  if (!doc) await payload.create({ collection: 'redirects', data, overrideAccess: true })
  else if (doc.source === 'migration')
    await payload.update({ collection: 'redirects', id: doc.id, data, overrideAccess: true })
}
payload.logger.info(`redirects seeded: ${blueprint.redirects.length}`)

// Media: uploaded once by filename; rights come from the ledger (owned — owner statement 2026-09-04).
const mediaIds = new Map<string, string>()
for (const m of blueprint.media) {
  // Payload converts uploads to webp and de-duplicates filenames, so the stable key is the legacy source path.
  const sourceKey = `legacy archive assets/img/${m.file}`
  const found = await payload.find({
    collection: 'media',
    where: { source: { equals: sourceKey } },
    limit: 50,
    overrideAccess: true,
  })
  if (found.docs[0]) {
    mediaIds.set(m.file, found.docs[0].id)
    for (const dup of found.docs.slice(1))
      await payload.delete({ collection: 'media', id: dup.id, overrideAccess: true })
    continue
  }
  const doc = await payload.create({
    collection: 'media',
    filePath: fileURLToPath(new URL(`../content/media/${m.file}`, import.meta.url)),
    data: {
      alt: m.alt,
      decorative: Boolean(m.decorative),
      rights: m.rights,
      credit: m.credit,
      source: sourceKey,
    },
    overrideAccess: true,
  })
  mediaIds.set(m.file, doc.id)
}
payload.logger.info(`media ready: ${mediaIds.size}`)

// Site-wide JSON-LD entities (Organization, Person, WebSite, offices, Blog) carried from the legacy graph.
const entityIds: string[] = []
let organizationEntity: string | undefined
let websiteEntity: string | undefined
for (const e of blueprint.schemaEntities) {
  const found = await payload.find({
    collection: 'schema-entities',
    where: { schemaId: { equals: e.schemaId } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    name: e.name,
    schemaId: e.schemaId,
    type: e.type,
    data: e.data,
    emitOn: e.emitOn,
    verification: { status: 'verified' as const, note: 'legacy JSON-LD; facts in the ledger' },
  }
  const doc = found.docs[0]
    ? await payload.update({
        collection: 'schema-entities',
        id: found.docs[0].id,
        data,
        overrideAccess: true,
      })
    : await payload.create({ collection: 'schema-entities', data, overrideAccess: true })
  entityIds.push(doc.id)
  if (e.schemaId.endsWith('#service')) organizationEntity = doc.id
  if (e.schemaId.endsWith('#website')) websiteEntity = doc.id
}
await payload.updateGlobal({
  slug: 'seo-defaults',
  overrideAccess: true,
  data: {
    titleTemplate: blueprint.seoDefaults.titleTemplate,
    twitterSite: blueprint.seoDefaults.twitterSite,
    robotsDirectives: blueprint.seoDefaults.robotsDirectives,
    robotsTxt: blueprint.files.robotsTxt,
    llmsTxt: blueprint.files.llmsTxt,
    entities: entityIds,
    organizationEntity,
    websiteEntity,
  },
})
payload.logger.info(`schema entities: ${entityIds.length}`)

// Pages: parents first so children can reference them. Layout image refs (filenames) → media ids.
const pageIds = new Map<string, string>()
const ordered = [...blueprint.pages].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)))
for (const pg of ordered) {
  const layout = pg.layout.map((b) => {
    const copy = { ...b } as Record<string, unknown>
    if (typeof copy.image === 'string') copy.image = mediaIds.get(copy.image) ?? null
    if (copy.cta && typeof copy.cta === 'object') {
      const c = copy.cta as { primary?: unknown; secondary?: unknown }
      copy.cta = { primary: c.primary ?? undefined, secondary: c.secondary ?? undefined }
    }
    return copy
  })
  const seo = {
    title: pg.seo.title.slice(0, 70),
    description: pg.seo.description.slice(0, 170),
    ogTitle: pg.seo.og?.['og:title'] !== pg.seo.title ? pg.seo.og?.['og:title'] : undefined,
    ogDescription:
      pg.seo.og?.['og:description'] !== pg.seo.description ? pg.seo.og?.['og:description'] : undefined,
    canonical: null, // self-canonical: the URL is derived from slug + parent, never stored
    schemaExtra: pg.seo.schemaExtra ?? undefined,
    ogImageUrl: pg.seo.og?.['og:image']?.replace(/^https?:\/\/[^/]+/, '') || undefined,
    ogImageAlt: pg.seo.og?.['og:image:alt'] || undefined,
    twitterDescription:
      pg.seo.twitter?.['twitter:description'] !== (pg.seo.og?.['og:description'] ?? pg.seo.description)
        ? pg.seo.twitter?.['twitter:description']
        : undefined,
    twitterImageAlt:
      pg.seo.twitter?.['twitter:image:alt'] !== pg.seo.og?.['og:image:alt']
        ? pg.seo.twitter?.['twitter:image:alt']
        : undefined,
  }
  const data = {
    title: pg.title,
    slug: pg.slug,
    pageType: pg.pageType as 'home',
    parent: pg.parent ? pageIds.get(pg.parent) : undefined,
    _status: 'published' as const,
    verification: pg.verification,
    migration: pg.migration
      ? {
          ...pg.migration,
          importedAt: new Date().toISOString(),
          decisionsVersion: pg.decision_ref?.run_id ?? pg.migration.decisionsVersion,
          decisionAction: (pg.decision_ref?.action as 'PROTECT' | undefined) ?? undefined,
        }
      : undefined,
    seo,
    layout: layout as never,
  }
  const existing = await payload.find({
    collection: 'pages',
    where: { slug: { equals: pg.slug } },
    limit: 1,
    overrideAccess: true,
  })
  const doc = existing.docs[0]
    ? await payload.update({ collection: 'pages', id: existing.docs[0].id, data, overrideAccess: true })
    : await payload.create({ collection: 'pages', data, overrideAccess: true })
  pageIds.set(pg.slug, doc.id)
}
payload.logger.info(`pages seeded from blueprint: ${pageIds.size}`)
await payload.jobs.queue({
  task: 'sendMockEmail',
  input: {
    to: 'owner@example.test',
    subject: 'C3 seed complete',
    body: 'queued from seed',
    idempotencyKey: 'seed-1',
  },
})
payload.logger.info('queued sendMockEmail job')
process.exit(0)
