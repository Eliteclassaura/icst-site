/**
 * Self-hosted font resolution. Reads WOFF2 subsets + licence texts from pinned Fontsource npm
 * packages (SIL OFL 1.1) and copies them into an app's public/fonts directory, returning the
 * FontFamily entries for the contract. Deterministic: same package versions → same files.
 *
 * Why Fontsource: Google Fonts' CSS endpoint is a runtime third-party dependency (and blocked in
 * some environments); Fontsource ships the same Google Fonts builds as versioned npm packages,
 * with the OFL licence file beside them (A2).
 */
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import type { FontFamily } from './schema.ts'

const require = createRequire(import.meta.url)

type Family = z.infer<typeof FontFamily>

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

export type FontSpec = {
  /** Fontsource package, e.g. @fontsource-variable/bodoni-moda */
  pkg: string
  /** CSS family name to expose (the legacy stylesheet says "Bodoni Moda", not "Bodoni Moda Variable") */
  family: string
  fallbacks: string[]
  /** file stem inside <pkg>/files, e.g. bodoni-moda-latin-standard-normal */
  files: Array<{
    stem: string
    unicodeRange: string
    axes: string[]
    weight: string | number
    preload?: boolean
  }>
}

export const SYED_FONTS: { display: FontSpec; text: FontSpec } = {
  display: {
    pkg: '@fontsource-variable/bodoni-moda',
    family: 'Bodoni Moda',
    fallbacks: ['Didot', '"Times New Roman"', 'serif'],
    files: [
      // "standard" = opsz+wght axes; the legacy CSS pins opsz 14, so we need the axis (wght-only would ignore it)
      {
        stem: 'bodoni-moda-latin-standard-normal',
        unicodeRange: LATIN,
        axes: ['opsz', 'wght'],
        weight: '400 900',
        preload: true,
      },
      {
        stem: 'bodoni-moda-latin-ext-standard-normal',
        unicodeRange: LATIN_EXT,
        axes: ['opsz', 'wght'],
        weight: '400 900',
      },
    ],
  },
  text: {
    pkg: '@fontsource-variable/jost',
    family: 'Jost',
    fallbacks: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
    files: [
      {
        stem: 'jost-latin-wght-normal',
        unicodeRange: LATIN,
        axes: ['wght'],
        weight: '100 900',
        preload: true,
      },
      { stem: 'jost-latin-ext-wght-normal', unicodeRange: LATIN_EXT, axes: ['wght'], weight: '100 900' },
    ],
  },
}

/** Copy the spec's files (+ LICENSE) into `publicDir/fonts` and return the contract entry. */
export function installFonts(spec: FontSpec, publicDir: string): Family {
  const pkgJsonPath = require.resolve(`${spec.pkg}/package.json`)
  const pkgDir = dirname(pkgJsonPath)
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { version: string; license: string }
  const outDir = join(publicDir, 'fonts')
  mkdirSync(outDir, { recursive: true })

  const slug = spec.pkg.split('/').pop()!
  const licenseSrc = join(pkgDir, 'LICENSE')
  const licenseOut = `/fonts/LICENSE-${slug}.txt`
  if (existsSync(licenseSrc)) copyFileSync(licenseSrc, join(publicDir, licenseOut))

  const files = spec.files.map((f) => {
    const src = join(pkgDir, 'files', `${f.stem}.woff2`)
    if (!existsSync(src)) throw new Error(`font file missing: ${src}`)
    copyFileSync(src, join(outDir, `${f.stem}.woff2`))
    return {
      path: `/fonts/${f.stem}.woff2`,
      origin: `${spec.pkg}@${pkg.version}/files/${f.stem}.woff2`,
      unicodeRange: f.unicodeRange,
      weight: f.weight,
      style: 'normal' as const,
      axes: f.axes,
      preload: Boolean(f.preload),
    }
  })

  return {
    family: spec.family,
    fallbacks: spec.fallbacks,
    license: { name: pkg.license, url: 'https://openfontlicense.org', file: licenseOut },
    files,
    opticalRules: {},
    display: 'swap',
  }
}
