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

/** SEQUENCE (Revenue Engine slice 1): sent by a sequence; the engine adds the unsubscribe and address footer itself. */
export const TEMPLATE_PURPOSES = ['TRANSACTIONAL', 'MARKETING', 'SEQUENCE'] as const
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number]

const PLAIN_NAME_FIELD = /^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u
type FieldDef = { label: string; required: boolean; fallback?: string; hint: string; pattern?: RegExp; multiline?: true }
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
    hint: 'Revenue Engine settings: the signer (“ICS Sales Team”), the RFQ office’s phone and the sales address, one per line.',
    multiline: true,
  },
  missing_information_list: {
    label: 'Missing items',
    required: true,
    hint: 'ICS_MISSING_INFORMATION: the items a person picked from the fixed list when enrolling, joined in a sentence.',
  },
  company: { label: 'Company', required: true, hint: 'The linked account’s name, else the company as the customer gave it.' },
  sales_rep_name: { label: 'Your name', required: true, hint: 'The signed-in person’s name.' },
  sales_rep_title: { label: 'Your job title', required: true, hint: 'Set it in your account (Job title).' },
  office_phone: { label: 'Office phone', required: true, hint: 'Your office’s number (CRM office settings).' },
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
      const def = MERGE_FIELDS[x.name]!
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

const SIGNATURE = '{{sales_rep_name}}\n{{sales_rep_title}}\nIndustrial Cooling Solutions (ICS)\n{{office_phone}}'
const E11_SIGNATURE = '{{sequence_signature}}'
const FOOTER = 'You’re receiving this email because you sent a request through h2ocooling.com.'

/**
 * T1–T6, English, from the CT-accepted OGCS prelaunch copy R1 §7 (sender and reply addresses are headers, not text).
 * T1 is seeded approved: the owner approved its wording on 2026-10-05 (as returned with Patch L, without the OGCS
 * footer line). T2–T6 are seeded unapproved until the owner reviews them in the templates UI.
 */
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
    subject: 'A few details to scope RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Thank you for your request for {{company}}. To scope it accurately, could you send whatever you have of the following?

- Tower type (crossflow, counterflow, other) and manufacturer
- Number of cells
- Model and serial number, or a photo of the nameplate
- Photos of the area or parts concerned
- A short description of the problem or the work you need

Just reply to this email. Attachments are welcome. If it's easier to talk it through, call me at {{office_phone}}.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T3',
    name: 'Quote sent / proposal follow-up',
    purpose: 'TRANSACTIONAL',
    subject: 'Your ICS proposal: RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Please find our proposal for RFQ {{rfq_number}} {{choice:attached|sent separately today}}.

It sets out the scope as we understand it, along with our assumptions. If anything doesn't match your requirements, let me know and we'll revise it.

I'm happy to walk through it on a call. Reply to this email or call me at {{office_phone}}.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  {
    code: 'T4',
    name: 'Follow-up, no response (5–7 days after the quote)',
    purpose: 'TRANSACTIONAL',
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
    subject: 'Update on RFQ {{rfq_number}}',
    body: `Hi {{customer_first_name}},

Thank you for considering ICS for this request. After reviewing RFQ {{rfq_number}}, we don't believe we're the right fit for this particular scope, and we'd rather tell you now than slow your project down.

We'd be glad to help with cooling tower parts, repairs or new towers in the future. Just reply to this email or call {{office_phone}}.

Best regards,
${SIGNATURE}

${FOOTER}`,
  },
  // ── Revenue Engine slice 1: E1.1 R2 email steps (subject variant A, body A), verbatim from the accepted package
  // (`sequence_steps.json`), except the signature: "- Rhonda" → {{sequence_signature}} (owner decision 2026-10-05: "ICS Sales
  // Team", the RFQ office's phone and the sales address — composed from the Revenue Engine settings, so it can change
  // without a code change). Seeded approved: the E1.1 R2 copy is owner-accepted and the signature is the owner's.
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
