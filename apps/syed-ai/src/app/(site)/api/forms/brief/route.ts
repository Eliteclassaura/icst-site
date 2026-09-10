import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { clientIp as trustedClientIp, processBrief } from '@factory/agency-core/intake'
import { turnstileReadiness } from '@factory/agency-core/cms'

export const dynamic = 'force-dynamic'

/**
 * POST /api/forms/brief (C6). Accepts a native form post or a fetch with `Accept: application/json`.
 * Native posts get a 303 to /thanks/?s=<id> (masked confirmation, noindex); fetch gets JSON.
 * Everything that matters happens in `processBrief`; this file only adapts HTTP.
 */
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json')
  const body = await readBody(req)
  const ip = trustedClientIp(req.headers)

  const [formConfig, integrations] = await Promise.all([
    payload.findGlobal({ slug: 'form-config', overrideAccess: true }),
    payload.findGlobal({ slug: 'integrations', overrideAccess: true }),
  ])
  const selects = (formConfig.selects ?? []).map((s) => ({
    name: s.key,
    options: (s.options ?? []).map((o) => o.value),
  }))
  const readiness = turnstileReadiness({
    siteKey: integrations.turnstile?.siteKey ?? undefined,
    secret: process.env.TURNSTILE_SECRET,
    nodeEnv: process.env.NODE_ENV,
    // Staging/CI may run a production build without Turnstile by saying so explicitly; the C9 launch gate
    // refuses production-launch mode unless this is unset or 'true' (ADR-023, R38).
    requiredInProduction: process.env.TURNSTILE_REQUIRED !== 'false',
  })
  if (!readiness.ok) {
    // Half-configured pair or production without Turnstile: fail closed (R38, ADR-023).
    return respond(req, wantsJson, {
      ok: false,
      status: 503,
      code: `turnstile-${readiness.reason}`,
      message: 'This form is temporarily unavailable.',
    })
  }

  const result = await processBrief({
    payload,
    body,
    ip,
    userAgent: req.headers.get('user-agent'),
    selects,
    formKey: 'brief',
    turnstile: { required: readiness.enabled, verify: readiness.enabled ? verifyTurnstile : undefined },
  })
  return respond(req, wantsJson, result)
}

type Result = Awaited<ReturnType<typeof processBrief>>

function respond(req: NextRequest, wantsJson: boolean, r: Result) {
  const noStore = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  if (!r.ok) {
    if (wantsJson)
      return NextResponse.json(
        { ok: false, code: r.code, message: r.message, suggestion: r.suggestion },
        { status: r.status, headers: noStore },
      )
    return NextResponse.redirect(new URL(`/thanks/?e=${encodeURIComponent(r.code)}`, req.url), {
      status: 303,
      headers: noStore,
    })
  }
  if (r.silent) {
    // Honeypot, spam, duplicate: indistinguishable from success on purpose.
    if (wantsJson)
      return NextResponse.json({ ok: true, message: 'Thanks — your brief is in.' }, { headers: noStore })
    return NextResponse.redirect(new URL('/thanks/', req.url), { status: 303, headers: noStore })
  }
  if (wantsJson)
    return NextResponse.json(
      {
        ok: true,
        message: `Thanks${r.firstName ? `, ${r.firstName}` : ''} — your brief is in. A reply goes to ${r.maskedEmail} within two working days.`,
      },
      { headers: noStore },
    )
  return NextResponse.redirect(new URL(`/thanks/?s=${encodeURIComponent(r.submissionId)}`, req.url), {
    status: 303,
    headers: noStore,
  })
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return (await req.json().catch(() => ({}))) as Record<string, unknown>
  const fd = await req.formData().catch(() => null)
  if (!fd) return {}
  const out: Record<string, unknown> = {}
  const utm: Record<string, string> = {}
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string') continue
    const m = k.match(/^utm\[(utm_[a-z]+)\]$/)
    if (m) utm[m[1]!] = v
    else out[k] = v
  }
  if (Object.keys(utm).length) out.utm = utm
  return out
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  }).catch(() => null)
  if (!res?.ok) return false
  const j = (await res.json().catch(() => ({}))) as { success?: boolean }
  return Boolean(j.success)
}
