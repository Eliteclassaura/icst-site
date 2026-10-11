import { describe, expect, it } from 'vitest'
import { cleanSearchText, decodeEntities } from '../search-clean'

/**
 * SEARCH-CLEAN-1: real shapes from the QA search run on /search/?q=fan. No `[vc_` and no `&#` may survive a clean title or snippet.
 */
describe('search text is clean', () => {
  it('removes WPBakery shortcodes and keeps the words around them (Dyna-Fab 10′ snippet shape)', () => {
    const raw = 'Dyna-Fab 10′ fan with a direct drive. [/vc_column_text][/vc_tta_section][vc_tta_section title="specifications" tab_id="1700000000-1-2"][vc_column_text]Airflow 10 m³/s.[/vc_column_text][/vc_tta_section]'
    const out = cleanSearchText(raw)
    expect(out).toBe('Dyna-Fab 10′ fan with a direct drive. Airflow 10 m³/s.')
    expect(out).not.toMatch(/\[\/?vc_/)
  })

  it('decodes numeric entities in a title (6&#8242; is 6′ prime)', () => {
    expect(cleanSearchText('Tower 6&#8242; fan set')).toBe('Tower 6′ fan set')
    expect(cleanSearchText('Tower 6&#x2032; fan set')).toBe('Tower 6′ fan set')
  })

  it('decodes named entities: &amp; and &#8211; (en dash) and common punctuation', () => {
    expect(cleanSearchText('Pumps &amp; Motors &#8211; service &mdash; parts &rsquo;s')).toBe('Pumps & Motors – service — parts ’s')
  })

  it('collapses whitespace and trims, including the space a removed shortcode leaves', () => {
    expect(cleanSearchText('  Fan   [gallery ids="1,2"]   motor  \n\t  ')).toBe('Fan motor')
  })

  it('does not decode twice (&amp;#8242; is the text "&#8242;", not a prime), and keeps bracketed numbers', () => {
    expect(decodeEntities('&amp;#8242;')).toBe('&#8242;')
    expect(cleanSearchText('See note [1] and [2].')).toBe('See note [1] and [2].')
  })

  it('leaves no shortcode or numeric entity in any sample of the QA run', () => {
    const samples = [
      'Dyna-Fab 10′ [vc_row][vc_column] fan [/vc_column][/vc_row]',
      'Pumps &amp; fans 6&#8242; &#8211; 2&#215;',
      '[caption id="a"]Photo[/caption] text &#x2014; more',
    ]
    for (const s of samples) {
      const out = cleanSearchText(s)
      expect(out).not.toMatch(/\[vc_/)
      expect(out).not.toMatch(/\[\/vc_/)
      expect(out).not.toMatch(/&#/)
    }
  })
})
