import { readFileSync } from 'node:fs'
import path from 'node:path'
import { publicMountGate, RFQ_FALLBACK_PATH } from '../site/gate'

/**
 * Runtime RFQ configuration check (Payload content mode).
 *
 * The static release bakes the approved Typeform configuration in at build time
 * (`release/public-build-config.mjs`: approved values, conflicting environment refused). The Payload runtime
 * renders the same adapter per request from `H2O_TYPEFORM_FORM_ID` / `H2O_TYPEFORM_ORIGIN`. Nothing here
 * supplies a value: the runtime environment must set them, and they must equal the approved release
 * configuration. Unset or different values make the instance not ready, instead of silently serving every
 * page with the `/contact-us/` fallback in place of the approved quote controls.
 */
export function rfqConfigState(env: Record<string, string | undefined> = process.env, root = process.cwd()): 'ok' | 'fail' {
  try {
    const approved = JSON.parse(readFileSync(path.join(root, 'release/public-build-config.json'), 'utf8')) as Record<string, string>
    // Resolved through the reviewed public-release gate (the only authorized importer of the adapter config).
    const gate = publicMountGate(RFQ_FALLBACK_PATH, 'rfq_page', { env })
    if (!gate.mounted) return 'fail'
    return gate.formUrl === `${approved.H2O_TYPEFORM_ORIGIN}/to/${approved.H2O_TYPEFORM_FORM_ID}` && gate.origin === approved.H2O_TYPEFORM_ORIGIN ? 'ok' : 'fail'
  } catch {
    return 'fail'
  }
}
