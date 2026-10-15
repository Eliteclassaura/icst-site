import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DS_BRIDGE_CSS } from '../site/bridge'
import { clientsRoot, loadChrome, loadPage, loadThemeCss, pageName } from '../site/content'

const repo = path.resolve(__dirname, '../../../../..')
const root = path.join(repo, 'clients')

describe('H6 client site content', () => {
  it('finds clients/ above the working directory, or CLIENTS_DIR', () => {
    expect(clientsRoot({} as NodeJS.ProcessEnv, path.join(repo, 'apps/h2o'))).toBe(root)
    expect(clientsRoot({ CLIENTS_DIR: root } as unknown as NodeJS.ProcessEnv)).toBe(root)
    expect(() => clientsRoot({} as NodeJS.ProcessEnv, '/')).toThrow(/clients\//)
  })

  it('maps a path to a page name: home for /, dashes for nesting, nothing for anything that is not a plain slug', () => {
    expect(pageName([])).toBe('home')
    expect(pageName(['about'])).toBe('about')
    expect(pageName(['a', 'b'])).toBe('a-b')
    for (const bad of [['..'], ['a/b'], ['A'], ['a b'], ['%2e%2e'], ['']]) expect(pageName(bad)).toBeNull()
  })

  it('loads the ICST placeholder home, chrome and theme from the client folder', () => {
    const page = loadPage('icst', [], root)!
    expect(page.layout.map((b) => b.blockType)).toEqual(['hero', 'articleBody', 'chipNav', 'productGrid', 'projectCarousel', 'serviceBand', 'takeawayList', 'phoneCta', 'cta'])
    expect(loadPage('icst', ['no-such-page'], root)).toBeNull()
    expect(loadPage('icst', ['..'], root)).toBeNull()
    expect(loadChrome('icst', root).footer.copyrightHolder).toBe('International Cooling Solutions (Thailand) Co., Ltd.')
    expect(loadThemeCss('icst', root)).toContain('--client-accent: rgb(12 86 164)')
  })

  it('a missing chrome or a malformed page fails loudly instead of rendering something else', () => {
    expect(() => loadChrome('no-such-client', root)).toThrow(/missing/)
  })
})

describe('H6 design-system bridge', () => {
  const css = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? css(p) : f.endsWith('.css') ? [readFileSync(p, 'utf8')] : []
    })

  it('defines every custom property the agency-core blocks and design system read, except ones they define themselves', () => {
    const all = css(path.join(repo, 'packages/agency-core/src')).join('\n')
    const used = new Set([...all.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    const own = new Set([...all.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
    const bridged = new Set([...DS_BRIDGE_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const missing = [...used].filter((v) => !own.has(v) && !bridged.has(v)).sort()
    expect(missing).toEqual([])
  })

  it('maps colour roles onto the client tokens (no raw colours in the bridge)', () => {
    expect(DS_BRIDGE_CSS).toContain('--color-accent: var(--client-accent)')
    expect(DS_BRIDGE_CSS).toContain('--color-accent-contrast: var(--client-accent-on)')
    expect(DS_BRIDGE_CSS).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/)
  })
})
