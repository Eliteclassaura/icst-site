/**
 * Native RFQ, server side: whether this deployment shows the native intake, and the launcher's strings.
 *
 * The gate is the contract's own switch (`H2O_NATIVE_INTAKE=on|off`, §4.2): off by default, so Typeform stays the launch
 * fallback until the native path passes its tests and CT turns it on. The launcher renders before the registry is fetched
 * (contract §2: lazily, on first open), so its three strings come from the server-side registry by the same keys.
 */
import { fixtureRegistry } from './registry'
import type { LauncherStrings } from './NativeRfq'

export const nativeIntakeOn = (env: Record<string, string | undefined> = process.env): boolean => env.H2O_NATIVE_INTAKE === 'on'

export function launcherStrings(): LauncherStrings {
  const reg = fixtureRegistry()
  return { label: reg.strings['launcher.label'] ?? '', aria: reg.strings['launcher.aria'] ?? '', tooltip: reg.strings['launcher.tooltip'] ?? '' }
}
