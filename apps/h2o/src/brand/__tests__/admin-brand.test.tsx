/**
 * BRAND-ADMIN-1 (owner request, CT 2026-10-07): the ICS brand on the admin login, the admin nav and the CRM sign-in pages,
 * and an environment-driven admin title suffix.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ADMIN_BRAND_ALT, ADMIN_EMBLEM, ADMIN_LOGO, adminTitleSuffix } from '../admin-brand'
import { AdminIcon, AdminLogo } from '../AdminGraphics'

const APP = process.cwd()
const read = (p: string) => readFileSync(path.join(APP, p), 'utf8')

describe('admin title suffix follows the environment', () => {
  it('production indexing policy → "· ICS admin"', () => {
    expect(adminTitleSuffix({ H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('· ICS admin')
  })
  it('anything else (staging, unset, a typo) → "· ICS staging admin"', () => {
    for (const v of [undefined, 'private', 'staging', 'Production'])
      expect(adminTitleSuffix({ H2O_INDEXING_POLICY: v } as unknown as NodeJS.ProcessEnv), String(v)).toBe('· ICS staging admin')
  })
  it('the suffix has no leading space, so Payload\'s own single-space join gives "Login · ICS staging admin" (QA R17B M1)', () => {
    const join = (title: string, suffix: string) => `${title} ${suffix}` // @payloadcms/next utilities/meta.js appendTitleSuffix
    for (const v of [undefined, 'production']) {
      const title = join('Login', adminTitleSuffix({ H2O_INDEXING_POLICY: v } as unknown as NodeJS.ProcessEnv))
      expect(title).not.toMatch(/\s{2,}/)
      expect(title).toMatch(/^Login · ICS (staging )?admin$/)
    }
  })
  it('the config uses it; the fixed staging label is gone everywhere', () => {
    const config = read('src/payload.config.ts')
    expect(config).toContain('titleSuffix: adminTitleSuffix()')
    expect(config).not.toContain('H2O staging admin')
  })
})

describe('admin graphics', () => {
  it('the login logo: both theme variants, fixed 240 × 61 box, the ICS alt', () => {
    const html = renderToStaticMarkup(<AdminLogo />)
    expect(html).toContain(`src="${ADMIN_LOGO.light}"`)
    expect(html).toContain(`src="${ADMIN_LOGO.dark}"`)
    expect(html.match(/width="240" height="61"/g)).toHaveLength(2)
    expect(html.match(new RegExp(`alt="${ADMIN_BRAND_ALT}"`, 'g'))).toHaveLength(2)
    const css = read('src/brand/admin-brand.css')
    expect(css).toMatch(/\.h2o-admin-logo \{[^}]*aspect-ratio: 1000 \/ 256;[^}]*inline-size: 240px;/)
    expect(css).toMatch(/html\[data-theme='dark'\] \.h2o-admin-logo \.h2o-admin-logo__light \{\s*display: none;/)
  })
  it('the nav icon is the ICS emblem', () => {
    expect(renderToStaticMarkup(<AdminIcon />)).toContain(`<img class="h2o-admin-icon" src="${ADMIN_EMBLEM.src}" width="28" height="28" alt="${ADMIN_BRAND_ALT}" decoding="async"/>`)
  })
  it('the assets exist in /public/brand with the recorded sizes', () => {
    for (const p of [ADMIN_LOGO.light, ADMIN_LOGO.dark, ADMIN_EMBLEM.src]) expect(existsSync(path.join(APP, 'public', p)), p).toBe(true)
  })
  it('Payload uses them (config + regenerated importMap)', () => {
    const config = read('src/payload.config.ts')
    expect(config).toContain("graphics: { Logo: '/brand/AdminGraphics#AdminLogo', Icon: '/brand/AdminGraphics#AdminIcon' }")
    const map = read('src/app/(payload)/admin/importMap.js')
    expect(map).toContain('"/brand/AdminGraphics#AdminLogo"')
    expect(map).toContain('"/brand/AdminGraphics#AdminIcon"')
  })
})

describe('CRM sign-in pages carry the same brand', () => {
  it('the workspace brand slot shows the ICS emblem, not the placeholder text mark', () => {
    const shell = read('src/crm/workspace/ui/Shell.tsx')
    expect(shell).toContain('<img className="c-mark c-mark--logo" src={ADMIN_EMBLEM.src} width={24} height={24} alt="" />')
    expect(shell).not.toMatch(/<span className="c-mark" aria-hidden="true">\s*ICS\s*<\/span>/)
  })
  it('the two-factor page shows the ICS logo in both of its states', () => {
    const page = read('src/app/(crm)/crm/mfa/page.tsx')
    // DARK-1 (R17 rebase): one <MfaLogo /> per state; it holds the original logo and the white one for the dark theme
    expect(page.match(/<MfaLogo \/>/g)).toHaveLength(2)
    expect(page).toContain('<img className="c-mfa-logo is-light" src={ADMIN_LOGO.light} width={200} height={51} alt={ADMIN_BRAND_ALT} />')
    expect(page).toContain('<img className="c-mfa-logo is-dark" src={ADMIN_LOGO.dark} width={200} height={51} alt={ADMIN_BRAND_ALT} />')
  })
})
