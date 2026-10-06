import type { Payload } from 'payload'
import { DEFAULT_SENDER_NAME, recipientKey, type EmailConfig, type SmtpSettings } from './config'
import { guardHost, normaliseHost, type Resolver } from './net-guard'
import { SettingsKeyError, settingsKeyConfigured, unseal } from './settings-key'

/**
 * Patch C: SMTP sending profiles — presets, validation, and resolving the profile a send uses.
 *
 * Which transport a send uses, per use (TRANSACTIONAL / REVENUE):
 *   1. the active profile for that use (REVENUE falls back to the active TRANSACTIONAL profile);
 *   2. otherwise the environment profile (H2O_SMTP_* — the launch path, Round 7 §3.4);
 *   3. otherwise none: nothing is sent and the row retries (`NO_TRANSPORT`) while an admin fixes it.
 * An active profile that cannot be used (no H2O_SETTINGS_KEY, a password that does not open, a host the guard refuses)
 * fails closed with a code. It never falls back to the environment profile: an admin chose it, and sending from a
 * different identity would be a silent surprise.
 */

export const MAIL_PRESETS = ['GMAIL', 'STALWART', 'CUSTOM'] as const
export type MailPreset = (typeof MAIL_PRESETS)[number]
export const SENDING_USES = ['TRANSACTIONAL', 'REVENUE'] as const
export type SendingUse = (typeof SENDING_USES)[number]

/** Owner decision 2026-10-05: Google Workspace (smtp.gmail.com:587 STARTTLS, app password) and Stalwart. */
export const PRESET_DEFAULTS: Record<MailPreset, { host: string; port: number; servername: string; hint: string }> = {
  GMAIL: {
    host: 'smtp.gmail.com',
    port: 587,
    servername: 'smtp.gmail.com',
    hint: 'Google Workspace: the user name is the full mailbox address; the password is a Google app password (2-Step Verification must be on).',
  },
  STALWART: {
    host: 'stalwart',
    port: 587,
    servername: '',
    hint: 'Stalwart on the internal network: the host must be listed in H2O_SMTP_INTERNAL_HOSTS; the TLS name is the mail host’s certificate name.',
  },
  CUSTOM: { host: '', port: 587, servername: '', hint: 'Other service: any SMTP submission service with STARTTLS (587) or TLS (465) and a password.' },
}

/** Sender domains a profile may send as (owner decision 2026-10-05: h2ocooling.org and h2ocooling.com). */
export const senderDomains = (env: Record<string, string | undefined> = process.env): string[] =>
  (env.H2O_EMAIL_SENDER_DOMAINS ?? 'h2ocooling.org,h2ocooling.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)

const HEADER_SAFE = /^[^\r\n"<>\\]*$/
const TLS_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export type ShapeProblem = { code: string; message: string }

/** Pure: is this profile well-formed? (The host's addresses are checked separately, when connecting.) */
export function checkProfileShape(p: Record<string, unknown>, env: Record<string, string | undefined> = process.env): ShapeProblem | null {
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '')
  if (!s('name')) return { code: 'PROFILE_NAME_REQUIRED', message: 'Name the profile.' }
  if (!(MAIL_PRESETS as readonly string[]).includes(s('preset'))) return { code: 'PROFILE_PRESET_INVALID', message: 'Choose a provider.' }
  if (!(SENDING_USES as readonly string[]).includes(s('use'))) return { code: 'PROFILE_USE_INVALID', message: 'Choose what the profile sends.' }
  if (!normaliseHost(p.host, env))
    return { code: 'PROFILE_HOST_INVALID', message: 'Enter the mail server’s host name (an internal name must be listed in H2O_SMTP_INTERNAL_HOSTS).' }
  if (![587, 465].includes(Number(p.port))) return { code: 'PROFILE_PORT_INVALID', message: 'Use port 587 (STARTTLS) or 465 (TLS). Other ports are not allowed.' }
  if (!TLS_NAME.test(s('tls_servername').toLowerCase())) return { code: 'PROFILE_TLS_NAME_INVALID', message: 'Enter the certificate name the server presents (e.g. smtp.gmail.com).' }
  const user = s('username')
  if (!user || user.length > 254 || /[\r\n]/.test(user)) return { code: 'PROFILE_USER_INVALID', message: 'Enter the user name for the mailbox.' }
  const from = recipientKey(s('from_address'))
  if (!from) return { code: 'PROFILE_FROM_INVALID', message: 'Enter the sender address.' }
  const domain = from.slice(from.lastIndexOf('@') + 1)
  if (!senderDomains(env).includes(domain))
    return { code: 'PROFILE_FROM_DOMAIN_NOT_ALLOWED', message: `The sender must be an address at ${senderDomains(env).join(' or ')}.` }
  if (s('from_name').length > 80 || !HEADER_SAFE.test(s('from_name'))) return { code: 'PROFILE_FROM_NAME_INVALID', message: 'Use a plain sender name (no quotes or angle brackets).' }
  if (p.active === true && p.password_set !== true) return { code: 'PROFILE_PASSWORD_REQUIRED', message: 'Store a password before turning the profile on.' }
  return null
}

export const passwordContext = (id: string | number) => `smtp-password:${String(id)}`

export type Resolved =
  | { ok: true; source: 'profile' | 'env'; profileId: string | null; smtp: SmtpSettings; fromAddress: string; fromName: string }
  | { ok: false; source: 'profile' | 'none'; profileId: string | null; code: string }

type Doc = Record<string, unknown>
const CACHE_MS = 30_000
const cache = new Map<string, { at: number; value: Resolved }>()
/** Settings pages call this after any change, so the next send uses the new profile at once. */
export const invalidateProfiles = () => cache.clear()

async function activeProfile(payload: Payload, use: SendingUse): Promise<Doc | null> {
  const res = await payload.find({
    collection: 'crm-sending-profiles' as never,
    where: { and: [{ use: { equals: use } }, { active: { equals: true } }] } as never,
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return (res.docs[0] as unknown as Doc | undefined) ?? null
}

/** Open a stored profile into connection settings (host pinned to the checked address). */
export async function openProfile(doc: Doc, opts: { resolve?: Resolver; env?: Record<string, string | undefined> } = {}): Promise<Resolved> {
  const id = String(doc.id)
  if (!settingsKeyConfigured(opts.env)) return { ok: false, source: 'profile', profileId: id, code: 'SETTINGS_KEY_MISSING' }
  let pass: string | null
  try {
    pass = unseal(doc.password_sealed, passwordContext(id))
  } catch (err) {
    if (err instanceof SettingsKeyError) return { ok: false, source: 'profile', profileId: id, code: err.code }
    throw err
  }
  if (!pass) return { ok: false, source: 'profile', profileId: id, code: 'PROFILE_PASSWORD_UNREADABLE' }
  const problem = checkProfileShape(doc, opts.env)
  if (problem) return { ok: false, source: 'profile', profileId: id, code: problem.code }
  const guard = await guardHost(doc.host, opts)
  if (!guard.ok) return { ok: false, source: 'profile', profileId: id, code: guard.code }
  return {
    ok: true,
    source: 'profile',
    profileId: id,
    smtp: { host: guard.address, port: Number(doc.port), user: String(doc.username).trim(), pass, servername: String(doc.tls_servername).trim().toLowerCase() },
    fromAddress: String(doc.from_address).trim(),
    fromName: typeof doc.from_name === 'string' && doc.from_name.trim() ? doc.from_name.trim() : DEFAULT_SENDER_NAME,
  }
}

/** The transport settings and sender for one use (see the order above). Cached for 30 seconds. */
export async function resolveSending(
  payload: Payload,
  cfg: EmailConfig,
  use: SendingUse = 'TRANSACTIONAL',
  now = Date.now(),
  opts: { resolve?: Resolver } = {},
): Promise<Resolved> {
  const hit = cache.get(use)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  let doc = await activeProfile(payload, use)
  if (!doc && use === 'REVENUE') doc = await activeProfile(payload, 'TRANSACTIONAL')
  const value: Resolved = doc
    ? await openProfile(doc, opts)
    : cfg.smtp
      ? { ok: true, source: 'env', profileId: null, smtp: cfg.smtp, fromAddress: cfg.fromAddress, fromName: cfg.fromName }
      : { ok: false, source: 'none', profileId: null, code: 'NO_TRANSPORT' }
  cache.set(use, { at: now, value })
  return value
}

/** The config a send uses: the environment's mode, allowlist and alerts, with the resolved transport and sender. */
export function withSending(cfg: EmailConfig, r: Resolved): EmailConfig {
  if (!r.ok) return { ...cfg, smtp: null }
  return { ...cfg, smtp: r.smtp, fromAddress: r.fromAddress, fromName: r.fromName }
}

/** Readiness: off is ready; a requested mode with no usable transport is not. Codes only. */
export async function emailReadiness(payload: Payload, cfg: EmailConfig): Promise<'ok' | 'off' | 'fail'> {
  if (cfg.errors.length > 0) return 'fail'
  if (cfg.mode === 'off') return 'off'
  try {
    return (await resolveSending(payload, cfg, 'TRANSACTIONAL')).ok ? 'ok' : 'fail'
  } catch {
    return 'fail'
  }
}
