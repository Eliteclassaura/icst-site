import { stepUp } from '../../email/sending-settings'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { invalidateErsSettings } from './settings'

/**
 * ENGINE-SCOPE-1a (Auditor F3) — the engine switch. Turning the engine ON is a send-starting change, so it needs admin AND
 * step-up (a code given now, or one confirmed in this session within five minutes), like the other send-starting
 * settings. Turning it OFF is never gated: stopping must always be easy. Runs as the signed-in admin, so the audit row
 * names who and shows `enabled` from → to. Turning it on does not bypass any other gate; the activation gates still apply.
 */
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export async function setEngineSwitch(s: CrmSession, sid: string | null, input: { on: boolean; code?: string }): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin switches the Revenue Engine.')
  if (input.on) {
    const denied = await stepUp(s, sid, input.code)
    if (denied) return denied
  }
  await s.payload.updateGlobal({
    slug: 'crm-ers-settings' as never,
    data: { enabled: input.on } as never,
    depth: 0,
    overrideAccess: false,
    user: s.user as never,
    // B1: the global refuses enabled false → true unless this flag is set, and only this function sets it (after stepUp()).
    context: { crmServer: { engineOnStepUp: input.on } },
  })
  invalidateErsSettings()
  return {
    ok: true,
    message: input.on
      ? 'Revenue Engine on. Sequences run when reply detection is live and their own state allows.'
      : 'Revenue Engine off. Nothing runs and nothing is sent.',
  }
}
