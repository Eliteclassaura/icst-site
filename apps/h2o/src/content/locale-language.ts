import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The language of a public page (Locale Part B, OGCS Part A): preserved locale pages carry their own language; every
 * other page is English. A page whose content is in another language than its URL slot (Part A OMIT: the swapped
 * /th/ ↔ /ja/ pair) is declared in the language of its content. Read by the proxy (it passes the value to the layout's
 * `<html lang>` as the `x-h2o-lang` request header), so this module stays free of the Payload access layer.
 */
type LocaleLanguages = { languages: Record<string, string>; contentLanguages?: Record<string, string> }
let data: LocaleLanguages | undefined
const load = (): LocaleLanguages => (data ??= JSON.parse(readFileSync(path.join(process.cwd(), 'content/locale/sitemap-locale.json'), 'utf8')) as LocaleLanguages)
const key = (p: string): string => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}
export const LANGUAGE_HEADER = 'x-h2o-lang'
/** BCP 47 language of the page at `pathname` ('en' unless OGCS Part A preserves it as a locale page). */
export function languageFor(pathname: string): string {
  const k = key(pathname)
  const d = load()
  return d.contentLanguages?.[k] ?? d.languages[k] ?? 'en'
}
