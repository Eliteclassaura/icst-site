import type { Payload } from 'payload'
import { confirmStepUp, loadMfaUser, stepUpSecondsLeft } from '../auth/mfa/service'
import { readEmailConfig, recipientKey } from './config'
import { failureCode, gateRecipient, recipientRef } from './gate'
import { checkProfileShape, invalidateProfiles, openProfile, passwordContext, PRESET_DEFAULTS, MAIL_PRESETS, SENDING_USES, type MailPreset } from './profiles'
import { seal, settingsKeyConfigured } from './settings-key'
import { verifySmtp, sendWith, type MailMessage } from './transport'
import type { SmtpSettings } from './config'
import { bucketFor, count, retryAfter } from '../crm/intake/native/limits'
import { recordEmailEvent } from '../crm/notify'
import type { Outcome } from '../crm/workspace/mutations'
import type { CrmSession } from '../crm/workspace/session'

/**
 * Patch C: the sending-profile settings (CRM → Settings → Sending profiles). Admins only.
 *
 * Every change, connection check and test send needs a step-up: a fresh app code entered in this session within the
 * last 5 minutes (auth/mfa/service.ts). Profiles are written as trusted server code (the collection has no API write
 * access), after these checks, and audited by the CRM audit adapter. The password is sealed with H2O_SETTINGS_KEY and
 * never returned. Connection checks go only to hosts the network guard allows (email/net-guard.ts).
 *
 * Outcomes carry person-readable messages and codes — never a host, user name, password or SMTP response text.
 */
type Doc = Record<string, unknown>
const SLUG = 'crm-sending-profiles' as never
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const MIN = 60_000
const CHECK_RULE = { bucket: 'mail-check' as const, windowMs: 10 * MIN, max: 10, env: 'H2O_SMTP_LIMIT_CHECK_10M' }
const TEST_RULE = { bucket: 'mail-test' as const, windowMs: 10 * MIN, max: 3, env: 'H2O_SMTP_LIMIT_TEST_10M' }

export type SendingDeps = {
  verify?: (s: SmtpSettings) => Promise<void>
  send?: (s: SmtpSettings, m: MailMessage) => Promise<void>
  resolve?: (host: string) => Promise<Array<{ address: string }>>
  now?: Date
}

const NOT_ADMIN = fail('FORBIDDEN', 'Sending profiles are for admins.')

/** Step-up: either the code given now, or one confirmed in this session within the last 5 minutes. */
export async function stepUp(s: CrmSession, sid: string | null, code: string | undefined, now = new Date()): Promise<Outcome | null> {
  if (!sid) return fail('STEP_UP_REQUIRED', 'Your sign-in has expired. Sign in again.')
  const u = await loadMfaUser(s.payload, s.user.id)
  if (!u) return fail('STEP_UP_REQUIRED', 'Your sign-in has expired. Sign in again.')
  if (code && code.trim()) {
    const out = await confirmStepUp(s.payload, u, sid, code.trim(), now)
    return out.ok ? null : fail(`STEP_UP_${out.code}`, out.message)
  }
  if (stepUpSecondsLeft(u, sid, now) > 0) return null
  return fail('STEP_UP_REQUIRED', 'Confirm with a code from your authenticator app first (valid for 5 minutes).')
}

/** Confirm a step-up on its own (the "Confirm" form at the top of the settings page). */
export async function confirmSettingsStepUp(s: CrmSession, sid: string | null, code: string | undefined): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  if (!code?.trim()) return fail('STEP_UP_CODE_REQUIRED', 'Enter the 6-digit code from your authenticator app.')
  const denied = await stepUp(s, sid, code)
  return denied ?? { ok: true, message: 'Confirmed for 5 minutes.' }
}

export type ProfileInput = {
  id?: string
  name?: string
  preset?: string
  use?: string
  host?: string
  port?: string
  tls_servername?: string
  username?: string
  password?: string
  from_address?: string
  from_name?: string
}

const CONNECTION_KEYS = ['host', 'port', 'tls_servername', 'username'] as const

/** Create or update a profile. A blank password keeps the stored one. Connection changes clear the last check. */
export async function saveProfile(s: CrmSession, sid: string | null, input: ProfileInput, deps: SendingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const denied = await stepUp(s, sid, undefined, deps.now)
  if (denied) return denied
  const preset = (MAIL_PRESETS as readonly string[]).includes(input.preset ?? '') ? (input.preset as MailPreset) : 'CUSTOM'
  const d = PRESET_DEFAULTS[preset]
  const clean = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '')
  const data: Doc = {
    name: clean(input.name).replace(/\s+/g, ' ').slice(0, 80),
    preset,
    use: (SENDING_USES as readonly string[]).includes(input.use ?? '') ? input.use : 'TRANSACTIONAL',
    host: (clean(input.host) || d.host).toLowerCase(),
    port: Number(clean(input.port) || d.port),
    tls_servername: (clean(input.tls_servername) || d.servername || clean(input.host)).toLowerCase(),
    username: clean(input.username),
    from_address: clean(input.from_address),
    from_name: clean(input.from_name).slice(0, 80),
  }
  // Google shows app passwords in groups of four ("abcd efgh …"); the spaces are not part of it.
  const typed = typeof input.password === 'string' ? input.password : ''
  const password = preset === 'GMAIL' ? typed.replace(/\s+/g, '') : typed
  if (password && !settingsKeyConfigured())
    return fail('SETTINGS_KEY_MISSING', 'Passwords can’t be stored until H2O_SETTINGS_KEY is set on the server.')
  if (password.length > 256 || /[\r\n]/.test(password)) return fail('PROFILE_PASSWORD_INVALID', 'That password can’t be used.')

  let existing: Doc | null = null
  if (input.id) {
    existing = (await s.payload.findByID({ collection: SLUG, id: input.id, ...sys }).catch(() => null)) as Doc | null
    if (!existing) return fail('NOT_FOUND', 'That profile no longer exists.')
  } else if (!password) return fail('PROFILE_PASSWORD_REQUIRED', 'Enter the password (for Gmail, an app password).')

  const problem = checkProfileShape({ ...(existing ?? {}), ...data, active: existing?.active === true, password_set: existing?.password_set === true || Boolean(password) })
  if (problem) return fail(problem.code, problem.message)

  const changedConnection = !existing || Boolean(password) || CONNECTION_KEYS.some((k) => String(existing![k] ?? '') !== String(data[k] ?? ''))
  const checkReset = changedConnection ? { last_check_state: null, last_check_code: null, last_check_at: null } : {}
  let id: string
  if (existing) {
    id = String(existing.id)
    await s.payload.update({ collection: SLUG, id, data: { ...data, ...checkReset } as never, ...sys })
  } else {
    const created = (await s.payload.create({ collection: SLUG, data: { ...data, active: false, password_set: false } as never, ...sys })) as unknown as Doc
    id = String(created.id)
  }
  // Sealed with the record id as context, so the value only opens for this profile.
  if (password) await s.payload.update({ collection: SLUG, id, data: { password_sealed: seal(password, passwordContext(id)), password_set: true, ...checkReset } as never, ...sys })
  invalidateProfiles()
  return { ok: true, message: existing ? 'Profile saved.' : 'Profile added. Check the connection, then turn it on.', id }
}

async function load(s: CrmSession, id: string | undefined): Promise<Doc | null> {
  if (!id) return null
  return (await s.payload.findByID({ collection: SLUG, id, ...sys, showHiddenFields: true }).catch(() => null)) as Doc | null
}

/** Turn a profile on (it replaces the other profile for the same use) or off. On requires a passing check. */
export async function setProfileActive(s: CrmSession, sid: string | null, id: string | undefined, on: boolean, deps: SendingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const denied = await stepUp(s, sid, undefined, deps.now)
  if (denied) return denied
  const doc = await load(s, id)
  if (!doc) return fail('NOT_FOUND', 'That profile no longer exists.')
  if (on && doc.last_check_state !== 'OK') return fail('PROFILE_NOT_CHECKED', 'Check the connection first. A profile is turned on only after a successful check.')
  if (on) {
    const others = await s.payload.find({ collection: SLUG, where: { and: [{ use: { equals: doc.use } }, { active: { equals: true } }, { id: { not_equals: doc.id } }] } as never, limit: 10, ...sys })
    for (const o of others.docs as unknown as Doc[]) await s.payload.update({ collection: SLUG, id: String(o.id), data: { active: false } as never, ...sys })
  }
  await s.payload.update({ collection: SLUG, id: String(doc.id), data: { active: on } as never, ...sys })
  invalidateProfiles()
  return { ok: true, message: on ? 'Profile turned on. New email is sent through it.' : 'Profile turned off. Email uses the server’s default settings, if any.' }
}

export async function deleteProfile(s: CrmSession, sid: string | null, id: string | undefined, deps: SendingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const denied = await stepUp(s, sid, undefined, deps.now)
  if (denied) return denied
  const doc = await load(s, id)
  if (!doc) return fail('NOT_FOUND', 'That profile no longer exists.')
  if (doc.active === true) return fail('PROFILE_ACTIVE', 'Turn the profile off before deleting it.')
  await s.payload.delete({ collection: SLUG, id: String(doc.id), ...sys })
  invalidateProfiles()
  return { ok: true, message: 'Profile deleted.' }
}

async function limited(s: CrmSession, rule: typeof CHECK_RULE | typeof TEST_RULE, now: Date): Promise<Outcome | null> {
  const bucket = bucketFor(rule.bucket, s.userId)
  const wait = await retryAfter(s.payload, bucket, [rule], now)
  if (wait > 0) return fail('RATE_LIMITED', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`)
  await count(s.payload, bucket, now)
  return null
}

const CHECK_MESSAGE: Record<string, string> = {
  SETTINGS_KEY_MISSING: 'H2O_SETTINGS_KEY is not set on the server, so the stored password can’t be used.',
  PROFILE_PASSWORD_UNREADABLE: 'The stored password can’t be opened (the settings key changed). Enter the password again.',
  HOST_NOT_ALLOWED: 'That host isn’t allowed.',
  HOST_NOT_FOUND: 'That host name doesn’t resolve.',
  HOST_PRIVATE_ADDRESS: 'That host points to a private address. Internal mail servers must be listed in H2O_SMTP_INTERNAL_HOSTS.',
  // nodemailer error codes (email/gate.ts failureCode)
  EAUTH: 'The server refused the user name or password. For Gmail, use an app password.',
  ETLS: 'The secure connection failed (certificate name or TLS).',
  ESOCKET: 'The secure connection failed (certificate name or TLS).',
  ECONNECTION: 'Couldn’t connect to the server.',
  EDNS: 'That host name doesn’t resolve.',
  ETIMEDOUT: 'The server didn’t answer in time.',
}
const checkMessage = (code: string) =>
  CHECK_MESSAGE[code] ?? (/^SMTP_53[45]/.test(code) ? CHECK_MESSAGE.EAUTH! : `The check failed (${code}).`)

/** Connect, STARTTLS/TLS with a verified certificate, and authenticate — nothing is sent. Records the result. */
export async function checkProfile(s: CrmSession, sid: string | null, id: string | undefined, deps: SendingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const now = deps.now ?? new Date()
  const denied = await stepUp(s, sid, undefined, now)
  if (denied) return denied
  const doc = await load(s, id)
  if (!doc) return fail('NOT_FOUND', 'That profile no longer exists.')
  const blocked = await limited(s, CHECK_RULE, now)
  if (blocked) return blocked
  const opened = await openProfile(doc, { resolve: deps.resolve })
  let code: string | null = opened.ok ? null : opened.code
  if (opened.ok) {
    try {
      await (deps.verify ?? verifySmtp)(opened.smtp)
    } catch (err) {
      code = failureCode(err).code
    }
  }
  await s.payload.update({
    collection: SLUG,
    id: String(doc.id),
    data: { last_check_state: code ? 'FAILED' : 'OK', last_check_code: code, last_check_at: now.toISOString() } as never,
    ...sys,
  })
  invalidateProfiles()
  return code ? fail(code, checkMessage(code)) : { ok: true, message: 'Connection and sign-in work.' }
}

/** Send one short test message to the signed-in admin's own address, through the gate (mode and allowlist). */
export async function testSendProfile(s: CrmSession, sid: string | null, id: string | undefined, deps: SendingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const now = deps.now ?? new Date()
  const denied = await stepUp(s, sid, undefined, now)
  if (denied) return denied
  const doc = await load(s, id)
  if (!doc) return fail('NOT_FOUND', 'That profile no longer exists.')
  const to = recipientKey(s.user.email)
  if (!to) return fail('NO_ADDRESS', 'Your account has no usable email address.')
  const cfg = readEmailConfig()
  const gate = gateRecipient(cfg, to)
  if (gate !== 'SEND')
    return fail(
      'MODE_BLOCKS_TEST',
      cfg.mode === 'off' ? 'Email is off on this server (H2O_EMAIL_MODE), so nothing can be sent.' : 'Your address isn’t on the allowlist (H2O_EMAIL_ALLOWLIST).',
    )
  const blocked = await limited(s, TEST_RULE, now)
  if (blocked) return blocked
  const opened = await openProfile(doc, { resolve: deps.resolve })
  if (!opened.ok) return fail(opened.code, checkMessage(opened.code))
  const ref = recipientRef(to)
  try {
    await (deps.send ?? sendWith)(opened.smtp, {
      from: `"${opened.fromName.replace(/["\\\r\n]/g, '')}" <${opened.fromAddress}>`,
      to,
      subject: 'Test message from the H2O CRM',
      text: `This is a test of the sending profile “${String(doc.name).replace(/[\r\n]/g, ' ')}”. If you can read it, the profile works.\n\nSent at your request from CRM → Settings → Sending profiles.\n`,
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    })
  } catch (err) {
    const { code } = failureCode(err)
    await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_FAILED', kind: 'PROFILE_TEST', code, recipient_ref: ref })
    return fail(code, checkMessage(code))
  }
  await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_SENT', kind: 'PROFILE_TEST', recipient_ref: ref })
  return { ok: true, message: 'Test message sent to your address.' }
}

/** For the settings page: profiles without any secret. */
export async function listProfiles(payload: Payload): Promise<Doc[]> {
  const res = await payload.find({ collection: SLUG, sort: 'name', limit: 50, depth: 0, overrideAccess: true })
  return (res.docs as unknown as Doc[]).map(({ password_sealed: _omit, ...rest }) => rest)
}
