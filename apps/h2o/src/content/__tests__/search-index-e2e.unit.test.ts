import { gunzipSync } from 'node:zlib'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSearchCandidate } from '../search-index'

/**
 * SEARCH-CLEAN-1, end to end: a snapshot with a page whose title and body carry WPBakery shortcodes and entities is built into a
 * real Pagefind index, and no `[vc_` or `&#` survives in any fragment (the text the results and snippets are drawn from).
 */
describe('the built search index has no shortcodes or entities', () => {
  it('a Dyna-Fab 10′ page (vc shortcodes in the body, an entity in the title) is clean in every fragment', async () => {
    const snap = mkdtempSync(path.join(tmpdir(), 'search-snap-'))
    const root = mkdtempSync(path.join(tmpdir(), 'search-root-'))
    mkdirSync(path.join(snap, 'documents'), { recursive: true })
    writeFileSync(path.join(snap, 'manifest.json'), JSON.stringify({ id: 'snap-test' }))
    writeFileSync(
      path.join(snap, 'ledger.json'),
      JSON.stringify({ routes: [{ path: '/product/dyna-fab-10/', routeId: 'dyna-fab-10', family: 'editorial', state: 'PUBLIC', searchable: true }] }),
    )
    writeFileSync(
      path.join(snap, 'documents', 'dyna-fab-10.json'),
      JSON.stringify({
        title: 'Dyna-Fab 10&#8242; fan &amp; motor',
        seo: { title: 'Dyna-Fab 10&#8242; &#8211; fans' },
        lead: 'A direct-drive fan for towers. [/vc_column_text][/vc_tta_section][vc_tta_section title="specifications" tab_id="1-2"][vc_column_text]Airflow 10&#215; m³/s.[/vc_column_text][/vc_tta_section]',
        sections: [],
      }),
    )
    const build = await buildSearchCandidate(snap, root)
    expect(build.records).toBe(1)
    const frags = readdirSync(path.join(build.dir, 'pagefind', 'fragment'))
    expect(frags.length).toBeGreaterThan(0)
    for (const f of frags) {
      const text = gunzipSync(readFileSync(path.join(build.dir, 'pagefind', 'fragment', f))).toString('utf8')
      expect(text).not.toMatch(/\[\/?vc_/)
      expect(text).not.toMatch(/&#\d+;|&#x[0-9a-f]+;|&amp;/i)
      expect(text).toContain('Dyna-Fab 10′')
    }
  })
})
