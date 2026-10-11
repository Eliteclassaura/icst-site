/**
 * AEO-1 (CT 2026-10-09): /llms.txt, the plain-text map of the site for AI assistants.
 *
 * The page list is an editorial choice (the pages a buyer or an assistant should know first); what is SAID about each page is not: the
 * title and the one-line description are the page's own served title and meta description from the release data, and a page that is not
 * PUBLIC, exported and indexable in the published ledger is left out. The URLs always name the production host, on staging too.
 */
export const LLMS_ORIGIN = 'https://h2ocooling.com'
export const LLMS_NAME = 'Industrial Cooling Solutions (ICS)'
export const LLMS_SUMMARY =
  'ICS engineers and builds industrial cooling towers and supplies cooling tower fans, replacement parts and maintenance, repair and upgrade services. Offices in the USA, Thailand and Japan serve customers across Southeast Asia and beyond.'

export type LlmsSection = { heading: string; paths: readonly string[] }
export const LLMS_SECTIONS: readonly LlmsSection[] = [
  { heading: 'Company and contact', paths: ['/about-ics-industrial-cooling-solutions/', '/contact-us/'] },
  { heading: 'Services', paths: ['/cooling-tower-maintenance-repair-upgrade/', '/thermal-upgrade/', '/cooling-tower-replacement/'] },
  {
    heading: 'Parts',
    paths: ['/cooling-tower-parts-online/', '/fans/', '/fill-media/', '/gear-box/', '/motors/', '/nozzles/', '/drive-shafts-assembles/'],
  },
  { heading: 'Projects, articles and resources', paths: ['/all-projects/', '/tech-articles/', '/resources/'] },
  {
    heading: 'Locations',
    paths: ['/cooling-tower-construction-repair-in-united-states/', '/cooling-tower-thailand/', '/cooling-tower-japan/', '/cooling-tower-malaysia/', '/cooling-tower-singapore/'],
  },
]
export const LLMS_PATHS: readonly string[] = LLMS_SECTIONS.flatMap((s) => s.paths)

export type LlmsPage = { path: string; title: string; description: string }

/** The page title without its site suffix, one line. */
const cleanTitle = (title: string): string => title.replace(/\s+/g, ' ').replace(/\s*[|–-]\s*(?:ICS|Industrial Cooling Solutions(?: \(ICS\))?)\s*$/i, '').trim()
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** The llms.txt text for the given pages (a page without a title is left out). Sections with no page are left out. */
export function buildLlmsTxt(pages: ReadonlyArray<LlmsPage>): string {
  const byPath = new Map(pages.map((p) => [p.path, p]))
  const out: string[] = [`# ${LLMS_NAME}`, '', `> ${LLMS_SUMMARY}`, '', `Website: ${LLMS_ORIGIN}/`, '']
  for (const section of LLMS_SECTIONS) {
    const lines = section.paths.flatMap((path) => {
      const page = byPath.get(path)
      const title = page ? cleanTitle(page.title) : ''
      if (!page || !title) return []
      const description = oneLine(page.description)
      return [`- [${title}](${LLMS_ORIGIN}${path})${description ? `: ${description}` : ''}`]
    })
    if (lines.length) out.push(`## ${section.heading}`, '', ...lines, '')
  }
  return out.join('\n')
}
