/** CSS-free view of the registry for test runners (Playwright/vitest) and tooling. Kept in sync by a unit test. */
import * as fx from './fixtures/index'

export type BlockManifestEntry = {
  slug: string
  kind: 'layout' | 'chrome'
  interactive: boolean
  fixtures: string[]
}

const entry = (
  slug: string,
  kind: 'layout' | 'chrome',
  f: Record<string, unknown>,
  interactive = false,
): BlockManifestEntry => ({
  slug,
  kind,
  interactive,
  fixtures: Object.keys(f),
})

export const blockManifest: BlockManifestEntry[] = [
  entry('header', 'chrome', fx.header),
  entry('footer', 'chrome', fx.footer),
  entry('hero', 'layout', fx.hero),
  entry('richText', 'layout', fx.richText),
  entry('takeawayList', 'layout', fx.takeawayList),
  entry('evidenceGrid', 'layout', fx.evidenceGrid),
  entry('faq', 'layout', fx.faq),
  entry('glossaryList', 'layout', fx.glossaryList),
  entry('cta', 'layout', fx.cta),
  entry('briefForm', 'layout', fx.briefForm, true),
  entry('dataTable', 'layout', fx.dataTable),
  entry('steps', 'layout', fx.steps),
  entry('relatedLinks', 'layout', fx.relatedLinks),
  entry('breadcrumb', 'layout', fx.breadcrumb),
  entry('subNav', 'layout', fx.subNav),
  entry('offices', 'layout', fx.offices),
  entry('serviceBand', 'layout', fx.serviceBand),
  entry('projectCarousel', 'layout', fx.projectCarousel),
]
