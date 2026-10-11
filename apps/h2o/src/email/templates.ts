import { createHash } from 'node:crypto'

/**
 * Patch C: email templates — merge fields, choices, lint and rendering. Pure; no database.
 *
 *   {{field}}             a merge field from MERGE_FIELDS (unknown names are refused when the template is saved)
 *   {{choice:a|b}}        the sender picks one option when the email is written (e.g. "call" or "site visit")
 *
 * Rules (roadmap Patch C, OGCS prelaunch copy §7):
 *   - plain text only; the HTML part is generated from it (escaped paragraphs);
 *   - a required merge field with no value FAILS CLOSED: nothing is rendered, so nothing is sent;
 *   - a template is used only when approved, and approval is tied to the exact text (any edit needs approval again);
 *   - MARKETING templates must carry the {{unsubscribe_url}} slot (for the Revenue Engine); TRANSACTIONAL ones
 *     must not (an inquiry reply has no unsubscribe link).
 */

/** SEQUENCE (Revenue Engine slice 1): sent by a sequence; the engine adds the unsubscribe footer itself (no postal address: owner rule 2026-10-06). */
export const TEMPLATE_PURPOSES = ['TRANSACTIONAL', 'MARKETING', 'SEQUENCE'] as const
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number]

const PLAIN_NAME_FIELD = /^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u
export type PersonalizationLevel = 'LEVEL_1_SAFE' | 'LEVEL_2_CONTEXTUAL' | 'LEVEL_3_DEEP'
type FieldDef = {
  label: string
  required: boolean
  fallback?: string
  hint: string
  pattern?: RegExp
  multiline?: true
  /** Content/evidence classification; this registry does not resolve facts or grant approval. */
  personalizationLevel?: PersonalizationLevel
}
// E1 contextual facts/approved phrases remain plain text. The renderer cleans/bounds them as before;
// the registry only declares names, and an absent value still fails closed. Resolvers/storage are later work.
const E1_TEXT_VALUE = /\S/u
export const MERGE_FIELDS: Record<string, FieldDef> = {
  rfq_number: { label: 'RFQ number', required: true, hint: 'The inquiry’s reference, e.g. RFQ-20261005-ABCD1234.' },
  // Only a plausible name is echoed (letters, spaces, apostrophes, periods, hyphens); anything else greets neutrally.
  customer_first_name: {
    label: 'Customer first name',
    required: false,
    fallback: 'there',
    hint: 'From the contact (else the form). Empty or not a plain name: “there”.',
    pattern: PLAIN_NAME_FIELD,
  },
  // T1 (owner-approved 2026-10-05): "Hi <first name>," for a plausible name, otherwise "Hello,".
  greeting: { label: 'Greeting', required: true, hint: '“Hi <first name>,” — or “Hello,” when there is no plain first name.' },
  // Revenue Engine slice 1 (E1.1 R2 copy uses these names).
  first_name: {
    label: 'First name',
    required: false,
    fallback: 'there',
    hint: 'The contact’s first name (else the form’s). Empty or not a plain name: “there”.',
    pattern: PLAIN_NAME_FIELD,
  },
  rfq_reference: { label: 'RFQ reference', required: true, hint: 'The inquiry’s RFQ number (E1.1 name for rfq_number).' },
  sequence_signature: {
    label: 'Sequence signature',
    required: true,
    hint: 'Revenue Engine settings: the signer (“ICS Sales Team”) and the sales address, one per line. Never a phone number or postal address (owner rule 2026-10-06).',
    multiline: true,
  },
  missing_information_list: {
    label: 'Missing items',
    required: true,
    hint: 'ICS_MISSING_INFORMATION: the items a person picked from the fixed list when enrolling, joined in a sentence.',
  },
  // WP2 / 1.2e: all 17 previously undefined E1 names, without adding CRM resolvers or changing accepted copy.
  quote_reference: {
    label: 'Quote reference', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_2_CONTEXTUAL',
    hint: 'The current quote/proposal reference on the enrolled deal or its quote record. No quote: hold; never invent a reference.',
  },
  opportunity_reference: {
    label: 'Opportunity reference', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_2_CONTEXTUAL',
    hint: 'The enrolled deal/opportunity reference. Missing reference: hold.',
  },
  verified_account_name: {
    label: 'Verified account name', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_2_CONTEXTUAL',
    hint: 'The account linked to the enrolled contact/deal. Free-text company guesses are not verification. Missing linked account: hold.',
  },
  verified_account_or_site_label: {
    label: 'Verified account or site label', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_2_CONTEXTUAL',
    hint: 'The linked account name or verified site label for this enrollment. Missing linkage or label: hold.',
  },
  safe_salutation: {
    label: 'Safe salutation', required: false, fallback: 'Hello', pattern: PLAIN_NAME_FIELD, personalizationLevel: 'LEVEL_1_SAFE',
    hint: 'A plain first-name salutation; otherwise the neutral fallback “Hello”. The original E1 wording stays unchanged; CRM resolution is separate work.',
  },
  verified_asset_label: {
    label: 'Verified asset label', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-verified tower/cell/unit label for the enrolled asset, with source, verifier and date. Missing evidence: hold.',
  },
  verified_scope_label: {
    label: 'Verified scope label', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-verified one-line RFQ/quote scope for this enrollment, with source, verifier and date. Missing evidence: hold.',
  },
  verified_open_technical_item: {
    label: 'Verified open technical item', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-verified unanswered technical item in this RFQ/project, with evidence. Missing item or evidence: hold.',
  },
  verified_question: {
    label: 'Verified customer question', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'The customer question staff confirmed for this RFQ/quote/project, with source evidence. Missing evidence: hold.',
  },
  verified_next_review_date: {
    label: 'Verified next review date', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'The staff-confirmed next review date on the enrolled deal, formatted by the CRM. Do not infer a review date; missing evidence: hold.',
  },
  verified_open_revision_item: {
    label: 'Verified open revision item', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-verified open revision item for the current quote/scope, with source evidence. Missing evidence: hold.',
  },
  verified_site_name: {
    label: 'Verified site name', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'The verified site linked to this account/enrollment, or a staff-confirmed site fact with evidence. Missing verification: hold.',
  },
  verified_service_window_phrase: {
    label: 'Verified service window', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-verified outage/service-window phrase with source evidence. Never infer due/overdue service; missing evidence: hold.',
  },
  verified_part_request_label: {
    label: 'Verified part request label', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'The part request staff confirmed for this enrollment, with source evidence. Do not infer part fit or need; missing evidence: hold.',
  },
  approved_upgrade_objective: {
    label: 'Approved upgrade objective', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A short upgrade objective explicitly approved by staff for this asset/project. Level 3 approval is required; no approved phrase: hold.',
  },
  approved_condition_or_request_summary: {
    label: 'Approved condition or request summary', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-written and approved condition/request summary for this asset. Level 3 approval is required; no approved phrase: hold.',
  },
  approved_missing_part_identification_request: {
    label: 'Approved part identification request', required: true, pattern: E1_TEXT_VALUE, personalizationLevel: 'LEVEL_3_DEEP',
    hint: 'A staff-approved part-identification request from the approved list or reviewed text. Level 3 approval is required; no approved phrase: hold.',
  },
  company: { label: 'Company', required: true, hint: 'The linked account’s name, else the company as the customer gave it.' },
  sales_rep_name: { label: 'Your name', required: true, hint: 'The signed-in person’s name.' },
  sales_rep_title: { label: 'Your job title', required: true, hint: 'Set it in your account (Job title).' },
  // Owner rule 2026-10-06: no phone number and no postal address in any email. The {{office_phone}} field is gone, so no
  // template can ask for one; the reply signature is the team's, from the Revenue Engine settings.
  email_signature: {
    label: 'Signature',
    required: true,
    hint: 'The team signature: “ICS Sales Team” and the sales address, one per line (Revenue Engine settings).',
    multiline: true,
  },
  response_sentence: {
    label: 'Response-time sentence',
    required: true,
    hint: 'T1: “A member of our team will review it and respond within one business day.” (the configured promise).',
  },
  unsubscribe_url: { label: 'Unsubscribe link', required: true, hint: 'Marketing templates only; filled in by the Revenue Engine.' },
}

export type Token = { kind: 'text'; value: string } | { kind: 'field'; name: string } | { kind: 'choice'; options: string[] }

const TAG = /\{\{\s*([^{}]*?)\s*\}\}/g

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of src.matchAll(TAG)) {
    if (m.index! > last) out.push({ kind: 'text', value: src.slice(last, m.index) })
    const inner = m[1]!
    if (inner.startsWith('choice:')) {
      const options = inner
        .slice(7)
        .split('|')
        .map((o) => o.trim())
        .filter(Boolean)
      out.push({ kind: 'choice', options })
    } else out.push({ kind: 'field', name: inner })
    last = m.index! + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', value: src.slice(last) })
  return out
}

export type TemplateText = { subject: string; body: string; purpose: string }
export const SUBJECT_MAX = 200
export const BODY_MAX = 20_000

/** Problems that stop a template from being saved (codes + messages; never the text itself). */
export function lintTemplate(t: TemplateText): Array<{ code: string; message: string }> {
  const problems: Array<{ code: string; message: string }> = []
  if (!(TEMPLATE_PURPOSES as readonly string[]).includes(t.purpose)) problems.push({ code: 'TEMPLATE_PURPOSE_INVALID', message: 'Choose transactional or marketing.' })
  if (!t.subject.trim()) problems.push({ code: 'TEMPLATE_SUBJECT_REQUIRED', message: 'Write a subject.' })
  if (t.subject.length > SUBJECT_MAX || /[\r\n]/.test(t.subject)) problems.push({ code: 'TEMPLATE_SUBJECT_INVALID', message: `The subject is one line of up to ${SUBJECT_MAX} characters.` })
  if (!t.body.trim()) problems.push({ code: 'TEMPLATE_BODY_REQUIRED', message: 'Write the message.' })
  if (t.body.length > BODY_MAX) problems.push({ code: 'TEMPLATE_BODY_TOO_LONG', message: `Keep the message under ${BODY_MAX} characters.` })
  const all = [...tokenize(t.subject), ...tokenize(t.body)]
  const unknown = [...new Set(all.filter((x): x is Extract<Token, { kind: 'field' }> => x.kind === 'field' && !(x.name in MERGE_FIELDS)).map((x) => x.name))]
  if (unknown.length) problems.push({ code: 'TEMPLATE_UNKNOWN_FIELD', message: `Unknown merge field${unknown.length > 1 ? 's' : ''}: ${unknown.map((u) => `{{${u.slice(0, 40)}}}`).join(', ')}.` })
  if (all.some((x) => x.kind === 'choice' && x.options.length < 2)) problems.push({ code: 'TEMPLATE_CHOICE_INVALID', message: 'A choice needs at least two options: {{choice:first|second}}.' })
  if (/[{}]{2}/.test(t.subject.replace(TAG, '') + t.body.replace(TAG, ''))) problems.push({ code: 'TEMPLATE_BRACES', message: 'Unmatched {{ or }}.' })
  const hasUnsub = all.some((x) => x.kind === 'field' && x.name === 'unsubscribe_url')
  if (t.purpose === 'MARKETING' && !hasUnsub) problems.push({ code: 'TEMPLATE_UNSUBSCRIBE_REQUIRED', message: 'A marketing template must include the {{unsubscribe_url}} slot.' })
  if (t.purpose !== 'MARKETING' && hasUnsub) problems.push({ code: 'TEMPLATE_UNSUBSCRIBE_NOT_ALLOWED', message: 'Only marketing templates carry the unsubscribe slot (sequences get theirs from the engine).' })
  return problems
}

/** The identity of the approved wording: purpose, subject and body exactly. */
export const templateHash = (t: TemplateText): string => createHash('sha256').update(JSON.stringify([t.purpose, t.subject, t.body])).digest('hex')

/** The distinct choices, in order of first appearance. The same options in subject and body are one choice (T5). */
export function choicesOf(t: TemplateText): string[][] {
  const seen = new Map<string, string[]>()
  for (const x of [...tokenize(t.subject), ...tokenize(t.body)]) if (x.kind === 'choice' && !seen.has(x.options.join('|'))) seen.set(x.options.join('|'), x.options)
  return [...seen.values()]
}

export const fieldsOf = (t: TemplateText): string[] =>
  [...new Set([...tokenize(t.subject), ...tokenize(t.body)].filter((x): x is Extract<Token, { kind: 'field' }> => x.kind === 'field').map((x) => x.name))]

export type MergeValues = Partial<Record<keyof typeof MERGE_FIELDS, string | null | undefined>>
export type RenderResult = { ok: true; subject: string; text: string } | { ok: false; code: 'MERGE_FIELD_MISSING' | 'CHOICE_MISSING' | 'TEMPLATE_INVALID'; missing: string[] }

/** One line of a merge value: control characters and line breaks removed, bounded. Values are data, never markup. */
const clean = (v: unknown): string =>
  typeof v === 'string'
    ? [...v]
        .map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? ' ' : c))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
    : ''

/**
 * Render subject and body. `choices[i]` is the option picked for the i-th distinct choice (`choicesOf`); it must be
 * one of that choice's options. Any required field without a value, or a missing choice, renders nothing.
 */
export function renderTemplate(t: TemplateText, values: MergeValues, choices: string[] = []): RenderResult {
  if (lintTemplate(t).length) return { ok: false, code: 'TEMPLATE_INVALID', missing: [] }
  const missing = new Set<string>()
  const missingChoices = new Set<string>()
  const order = choicesOf(t).map((o) => o.join('|'))
  const run = (src: string) => {
    const tokens = tokenize(src)
    const parts = tokens.map((x) => {
      if (x.kind === 'text') return x.value
      if (x.kind === 'choice') {
        const i = order.indexOf(x.options.join('|'))
        const picked = choices[i]
        if (!picked || !x.options.includes(picked)) {
          missingChoices.add(String(i))
          return ''
        }
        return picked
      }
      const def = MERGE_FIELDS[x.name]
      // Defensive: lint (above) already refuses unknown fields; a retired field is never rendered.
      if (!def) {
        missing.add(x.name)
        return ''
      }
      const raw = values[x.name as keyof MergeValues]
      // A multi-line value (the signature) keeps up to 6 lines; each line is cleaned like any value.
      const v = def.multiline && typeof raw === 'string' ? raw.split(/\r?\n/).map(clean).filter(Boolean).slice(0, 6).join('\n') : clean(raw)
      if (v && (!def.pattern || def.pattern.test(v))) return v
      if (def.fallback !== undefined) return def.fallback
      missing.add(x.name)
      return ''
    })
    return parts.join('')
  }
  const subject = run(t.subject)
  const text = run(t.body)
  if (missing.size) return { ok: false, code: 'MERGE_FIELD_MISSING', missing: [...missing] }
  if (missingChoices.size) return { ok: false, code: 'CHOICE_MISSING', missing: [...missingChoices] }
  return { ok: true, subject: subject.replace(/\s+/g, ' ').trim(), text: text.replace(/\r\n?/g, '\n').trim() + '\n' }
}

/** The T1 greeting: only a plausible first name is echoed; anything else greets neutrally. */
export const greetingFor = (firstName: unknown): string => {
  const n = clean(firstName).slice(0, 40)
  return PLAIN_NAME_FIELD.test(n) ? `Hi ${n},` : 'Hello,'
}

/** T1's response-time sentence from the configured promise (owner decision 2026-10-05). */
export const responseSentence = (promise: string | null | undefined): string =>
  promise ? `A member of our team will review it and respond ${clean(promise)}.` : 'A member of our team will review it and contact you.'

// Owner rule 2026-10-06: "ICS Sales Team" + the sales address only; no phone number, no postal address.
const SIGNATURE = '{{email_signature}}'
const E11_SIGNATURE = '{{sequence_signature}}'
const FOOTER = 'You’re receiving this email because you sent a request through h2ocooling.com.'

/**
 * T1–T6, English, from the CT-accepted OGCS prelaunch copy R1 §7 (sender and reply addresses are headers, not text).
 * T1 is seeded approved: the owner approved its wording on 2026-10-05 (as returned with Patch L, without the OGCS
 * footer line). T2–T6 are seeded approved too: the owner approved their wording on 2026-10-06 (T-R1, with the T6
 * industrial-scope line), on the condition that every template stays industrial cooling (see `scope-guard.ts`).
 */
/**
 * Earlier seed wordings, by code: the Round 9 T2–T6 (with an {{office_phone}} line; owner rule 2026-10-06) and the R1.1
 * T6 (before its T-R1 industrial-scope closing line). A stored template still exactly equal to an earlier seed (never
 * edited, never approved) is replaced with the current seed, approved when the seed is; an edited or approved one is
 * left alone for an admin.
 */
export const SUPERSEDED_SEED_HASHES: Readonly<Record<string, readonly string[]>> = {
  T2: ['8bab7df48e8322a56e3453c4c860d6c4aed1c315b531ce7589139b18469103a1'],
  T3: ['70bebcfaffd1c5de92b259794ebe56218c4dfeeabcb3784fe141cc69a880b0bb'],
  T4: ['e96e73a47fc81c2851597b090ff1d51e83543a2c481062cfb0e077594a1fca1a'],
  T5: ['396950a8f996c1a06ce8ae8ee45bf12ecbf8599ec5b2ecb3c588f987abd8ac85'],
  // T-R1 (2026-10-06): the R1.1 T6, before its industrial-scope closing line.
  T6: ['99b02cb25a44a5ff2aa6a63be9bfc0ffdef6fbdf6f0134c0c9c500a7c48f93ee', '75b7e9c3f8ea90a4f723405cb111c48fe1ad96f0ce772c779b9d540ed7499e72'],
}

export const SEED_TEMPLATES: Array<{ code: string; name: string; purpose: TemplatePurpose; subject: string; body: string; approved?: boolean }> = [
  {
    // Owner-approved 2026-10-05 (recorded by Control Tower) exactly as returned with Patch L: seeded approved.
    code: 'T1',
    name: 'Customer acknowledgement (automatic on intake)',
    purpose: 'TRANSACTIONAL',
    approved: true,
    subject: 'We received your request: RFQ {{rfq_number}}',
    body: `{{greeting}}

Thank you for contacting Industrial Cooling Solutions. We've received your request and logged it as RFQ {{rfq_number}}.

{{response_sentence}}

If you have drawings, nameplate photos or earlier inspection reports, reply to this email and attach them. They help us scope your request accurately.

The ICS team
Industrial Cooling Solutions (ICS)`,
  },
  {
    code: 'T2',
    name: 'Request for more information',
    purpose: 'TRANSACTIONAL',
    approved: true, // owner-approved 2026-10-06 (T-R1)
    subject: 'A few details to scope RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Thank you for your request for {{company}}. To scope it accurately, could you send whatever you have of the following?

- Tower type (crossflow, counterflow, other) and manufacturer
- Number of cells
- Model and serial number, or a photo of the nameplate
- Photos of the area or parts concerned
- A short description of the problem or the work you need

Just reply to this email. Attachments are welcome.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T3',
    name: 'Quote sent / proposal follow-up',
    purpose: 'TRANSACTIONAL',
    approved: true, // owner-approved 2026-10-06 (T-R1)
    subject: 'Your ICS proposal: RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Please find our proposal for RFQ {{rfq_number}} {{choice:attached|sent separately today}}.

It sets out the scope as we understand it, along with our assumptions. If anything doesn't match your requirements, let me know and we'll revise it.

I'm happy to walk through it on a call. Just reply to this email.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T4',
    name: 'Follow-up, no response (5–7 days after the quote)',
    purpose: 'TRANSACTIONAL',
    approved: true, // owner-approved 2026-10-06 (T-R1)
    subject: 'Following up on RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

I'm following up on the proposal we sent for RFQ {{rfq_number}}. Do you have any questions, or would changes to the scope help?

If your plans have changed or the project is on hold, just let me know and I'll update our records.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T5',
    name: 'Site visit / call scheduling',
    purpose: 'TRANSACTIONAL',
    approved: true, // owner-approved 2026-10-06 (T-R1)
    subject: 'Scheduling a {{choice:call|site visit}} for RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

To move RFQ {{rfq_number}} forward, I'd like to set up a {{choice:call|site visit}} with your team at {{company}}.

Could you reply with two or three times that suit you, and the best person to contact? For a site visit, please also mention any site access or safety requirements we should plan for.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T6',
    name: 'Closing, not a fit',
    purpose: 'TRANSACTIONAL',
    approved: true, // owner-approved 2026-10-06 (T-R1)
    subject: 'Update on RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Thank you for considering ICS for this request. After reviewing RFQ {{rfq_number}}, we don't believe we're the right fit for this particular scope, and we'd rather tell you now than slow your project down.

We'd be glad to help with industrial cooling tower parts, maintenance and repairs, dry soda blasting or new towers in the future. Just reply to this email.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  // ── Revenue Engine slice 1: E1.1 R2 email steps (subject variant A, body A), verbatim from the accepted package
  // (`sequence_steps.json`), except the signature: "- Rhonda" → {{sequence_signature}} ("ICS Sales Team" and the sales
  // address, composed from the Revenue Engine settings; owner decisions 2026-10-05 and 2026-10-06: no phone number, no
  // postal address). Seeded approved: the E1.1 R2 copy is owner-accepted and the signature is the owner's.
  {
    code: 'E11_QUAL_1',
    name: 'E1.1 Qualification follow-up — step 1 (QUALIFY_COMMERCIAL_MOTION)',
    purpose: 'SEQUENCE',
    approved: true,
    subject: 'One RFQ question',
    body: `Hi {{first_name}}, I am reviewing {{rfq_reference}} and want to make sure we route it correctly. Can you confirm whether the request is for a new tower, rebuild/replacement, repair, upgrade, maintenance/inspection, or parts? If that is already clear in the submitted documents, no need to repeat it; we will use the verified project information already on file.

${E11_SIGNATURE}`,
  },
  {
    code: 'E11_QUAL_2',
    name: 'E1.1 Qualification follow-up — step 2 (QUALIFICATION_REMINDER)',
    purpose: 'SEQUENCE',
    approved: true,
    subject: 'RFQ routing follow-up',
    body: `Hi {{first_name}}, the routing question on {{rfq_reference}} is still open on our side. If the scope is already clear in the documents, no action is needed. Otherwise, a short reply with the project type is enough and we will update the RFQ.

${E11_SIGNATURE}`,
  },
  {
    code: 'E11_MISS_1',
    name: 'E1.1 Missing information — step 1 (REQUEST_MISSING_INFO)',
    purpose: 'SEQUENCE',
    approved: true,
    subject: 'A few RFQ details',
    body: `Hi {{first_name}}, we are reviewing {{rfq_reference}}. The only items still needed on our side are {{missing_information_list}}. We are not asking you to resend anything already provided. If those items are available, reply with them or attach the current specification or drawings and we can continue the review.

${E11_SIGNATURE}`,
  },
  {
    code: 'E11_MISS_2',
    name: 'E1.1 Missing information — step 2 (MISSING_INFO_REMINDER)',
    purpose: 'SEQUENCE',
    approved: true,
    subject: 'RFQ details still open',
    body: `Hi {{first_name}}, a quick note on {{rfq_reference}}: we are still missing {{missing_information_list}}. If the project timing has changed or those details are not available yet, a short reply with the current status is enough and we will update our side.

${E11_SIGNATURE}`,
  },
]
