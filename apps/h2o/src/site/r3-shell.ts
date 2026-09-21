/**
 * H2O R3 — the global shell's link sets, derived from accepted route authority.
 *
 * R2.2's navigation module resolves the accepted NAVIGATION_CONTRACT and suppresses any label whose
 * target is not renderable. That behaviour is preserved and still governs `renderableHeaderItems`,
 * `renderableOrientationItems` and `renderableFooterGroups`.
 *
 * What this module adds is the R3 requirement that the four commercial pathways and the company
 * pages be reachable from the chrome. It does that by intersecting a desired shell structure with
 * `cohort()` — the accepted 29-route table — so a label renders only when the route it points at
 * actually exists in the accepted cohort. Nothing is invented: a pathway whose route is not in the
 * cohort is reported as an unmet pathway for the parity ledger and renders nothing at all.
 *
 * The contract names several routes the accepted cohort does not contain — `/services/`,
 * `/projects/`, `/cooling-tower/`, `/cooling-tower-maintenance-repair-upgrade/`, the `/regions/*`,
 * `/applications/*` and `/product-category/*` families. Those are recorded as IA debt, not rendered
 * as dead links.
 */
import { cohort } from './cohort'

export type ShellLink = { href: string; label: string }

export type ShellGroup = { items: ShellLink[]; title: string }

/** Every canonical path the accepted cohort actually serves. */
export const cohortPaths = (): Set<string> => new Set(cohort().map((page) => page.canonicalPath))

const keep = (paths: Set<string>, links: ShellLink[]): ShellLink[] =>
  links.filter((link) => paths.has(link.href))

/**
 * The desired shell. Each entry is a wish; only those whose route exists in the accepted cohort
 * survive `keep()`. `unmet()` reports the rest so the parity ledger can carry them as debt.
 */
const DESIRED_PRIMARY: ShellLink[] = [
  { href: '/cooling-tower-thermal-upgrade/', label: 'Thermal upgrade' },
  { href: '/cooling-tower-parts-online/', label: 'Parts' },
  { href: '/resources/', label: 'Technical library' },
  { href: '/tech-articles/', label: 'Articles' },
  { href: '/about-ics-industrial-cooling-solutions/', label: 'About' },
  { href: '/contact-us/', label: 'Contact' },
]

const DESIRED_FOOTER: ShellGroup[] = [
  {
    items: [
      { href: '/cooling-tower-thermal-upgrade/', label: 'Thermal upgrade' },
      { href: '/cooling-tower-maintenance/', label: 'Cooling tower maintenance' },
      { href: '/cooling-tower-inspection-checklist/', label: 'Inspection checklist' },
      { href: '/cooling-tower-fill-media-replacement/', label: 'Fill media replacement' },
      { href: '/cooling-tower-fan-blade-pitch-adjustment/', label: 'Fan blade pitch adjustment' },
    ],
    title: 'Capability',
  },
  {
    items: [
      { href: '/cooling-tower-parts-online/', label: 'Cooling tower parts' },
      { href: '/frp-fan-blades-guide/', label: 'FRP fan blades' },
      { href: '/cooling-tower-design-parameters/', label: 'Design parameters' },
      { href: '/cooling-tower-piping-design/', label: 'Piping design' },
    ],
    title: 'Parts & engineering',
  },
  {
    items: [
      { href: '/resources/', label: 'Technical library' },
      { href: '/tech-articles/', label: 'Technical articles' },
      { href: '/cooling-tower-performance-testing/', label: 'Performance testing' },
      { href: '/power-plant-cooling-towers/', label: 'Power plant cooling towers' },
      { href: '/crossflow-vs-counterflow-cooling-tower-2/', label: 'Crossflow vs counterflow' },
    ],
    title: 'Technical library',
  },
  {
    items: [
      { href: '/about-ics-industrial-cooling-solutions/', label: 'About ICS' },
      { href: '/contact-us/', label: 'Request a quote' },
    ],
    title: 'Company',
  },
]

export const shellPrimary = (): ShellLink[] => keep(cohortPaths(), DESIRED_PRIMARY)

export const shellFooter = (): ShellGroup[] => {
  const paths = cohortPaths()
  return DESIRED_FOOTER.map((group) => ({ items: keep(paths, group.items), title: group.title })).filter(
    (group) => group.items.length > 0,
  )
}

/**
 * The four commercial pathways R3 is asked to make unmistakable, and whether the accepted cohort
 * can serve each one. A pathway with no route is not rendered as a link anywhere in the chrome.
 */
export const COMMERCIAL_PATHWAYS: Array<{ contractTarget: string; label: string }> = [
  { contractTarget: '/cooling-tower/', label: 'New cooling tower construction' },
  { contractTarget: '/cooling-tower-maintenance-repair-upgrade/', label: 'Repair & maintenance' },
  { contractTarget: '/cooling-tower-thermal-upgrade/', label: 'Thermal / structural upgrades' },
  { contractTarget: '/cooling-tower-parts-online/', label: 'Replacement parts' },
]

/** Desired shell destinations the accepted cohort cannot serve. Reported, never rendered. */
export const unmet = (): string[] => {
  const paths = cohortPaths()
  const wanted = [
    ...DESIRED_PRIMARY.map((l) => l.href),
    ...DESIRED_FOOTER.flatMap((g) => g.items.map((l) => l.href)),
    ...COMMERCIAL_PATHWAYS.map((p) => p.contractTarget),
  ]
  return [...new Set(wanted)].filter((href) => !paths.has(href)).sort()
}
