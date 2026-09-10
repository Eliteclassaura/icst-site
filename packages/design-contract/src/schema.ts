/**
 * design-contract.json — the single, versioned intermediate format every design source
 * (Figma variables, a Claude design package, an existing site's CSS) compiles into, and
 * the only design input rendering may consume (ADR-006).
 *
 * Every value carries a provenance so inferred values are never mistaken for decisions.
 */
import { z } from 'zod'

export const CONTRACT_VERSION = 1 as const

export const Source = z.object({
  /** declared: a designer/owner decision · inferred: derived from an existing artefact · default: compiler default */
  kind: z.enum(['declared', 'inferred', 'default']),
  /** Where it came from: "figma:node/12:34", "site.css:14", "DESIGN-TOKENS.md#colour", ... */
  ref: z.string().min(1),
  note: z.string().optional(),
})
export type Source = z.infer<typeof Source>

const sourced = <T extends z.ZodTypeAny>(value: T) => z.object({ value, source: Source })

export const Hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'hex colour (#rrggbb or #rrggbbaa)')
export const CssLength = z
  .string()
  .regex(/^(?:0|-?\d*\.?\d+(?:px|rem|em|vw|vh|ch|%)|clamp\(.+\)|calc\(.+\))$/, 'CSS length')

/** Colour roles, not raw colours (master prompt §Design-to-code). Raw palette lives under `palette`. */
export const ColorRoles = z.object({
  canvas: sourced(Hex),
  surface: sourced(Hex),
  surfaceRaised: sourced(Hex),
  surfaceWell: sourced(Hex),
  textPrimary: sourced(Hex),
  textBody: sourced(Hex),
  textMuted: sourced(Hex),
  accent: sourced(Hex),
  accentLight: sourced(Hex),
  accentDark: sourced(Hex),
  accentContrast: sourced(Hex),
  border: sourced(Hex),
  borderSoft: sourced(Hex),
  /** Border that identifies a form control or interactive boundary — must meet 3:1 (WCAG 1.4.11) */
  controlBorder: sourced(Hex),
  success: sourced(Hex),
  warning: sourced(Hex),
  error: sourced(Hex),
})

export const FontFile = z.object({
  /** Path relative to the app's public dir, e.g. /fonts/bodoni-moda-latin-standard-normal.woff2 */
  path: z.string().startsWith('/'),
  /** npm package + file this was copied from, for reproducibility */
  origin: z.string(),
  unicodeRange: z.string().optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  style: z.enum(['normal', 'italic']).default('normal'),
  /** Variable axes present in the file, e.g. ["opsz","wght"] */
  axes: z.array(z.string()).default([]),
  preload: z.boolean().default(false),
})

export const FontFamily = z.object({
  family: z.string(),
  fallbacks: z.array(z.string()).min(1),
  license: z.object({ name: z.string(), url: z.string().url().optional(), file: z.string().optional() }),
  files: z.array(FontFile).min(1),
  /** e.g. { 'font-optical-sizing': 'none', 'font-variation-settings': '"opsz" 14' } */
  opticalRules: z.record(z.string(), z.string()).default({}),
  display: z.enum(['swap', 'optional', 'block', 'fallback']).default('swap'),
})

export const Typography = z.object({
  display: FontFamily,
  text: FontFamily,
  weights: z.record(z.string(), sourced(z.number().int().min(100).max(900))),
  /** Fluid/fixed size scale; keys are the legacy step names so parity is checkable. */
  scale: z.record(z.string(), sourced(CssLength)),
  lineHeights: z.record(z.string(), sourced(z.number())),
  letterSpacing: z.record(z.string(), sourced(z.string())),
  /** Readable prose measure in ch */
  measure: sourced(z.object({ min: z.number(), ideal: z.number(), max: z.number() })),
  headingWrap: sourced(z.enum(['balance', 'pretty', 'normal'])),
  uppercaseOnlyFor: z.array(z.string()).default([]),
})

export const Layout = z.object({
  spacing: z.record(z.string(), sourced(CssLength)),
  containerMax: sourced(CssLength),
  navHeight: sourced(CssLength),
  breakpoints: z.record(z.string(), sourced(z.number().int())),
  grids: z.record(z.string(), sourced(z.object({ columns: z.number().int(), gap: z.string() }))),
  radii: z.record(z.string(), sourced(CssLength)),
  borders: z.record(z.string(), sourced(z.string())),
  shadows: z.record(z.string(), sourced(z.string())),
  zIndex: z.record(z.string(), sourced(z.number().int())),
})

export const Motion = z.object({
  durations: z.record(z.string(), sourced(z.string())),
  easings: z.record(z.string(), sourced(z.string())),
  reducedMotion: sourced(z.enum(['disable-all', 'essential-only'])),
})

export const Focus = z.object({
  outline: sourced(z.string()),
  offset: sourced(CssLength),
})

export const ImageRatio = z.object({ ratio: z.string(), note: z.string().optional() })

export const ContrastPair = z.object({
  foreground: z.string(),
  background: z.string(),
  /** what this pair is used for; decides the required ratio */
  use: z.enum(['body-text', 'large-text', 'ui-component', 'caption-only', 'decorative']),
})

export const DesignContract = z.object({
  $schema: z.string().optional(),
  version: z.literal(CONTRACT_VERSION),
  meta: z.object({
    client: z.string(),
    name: z.string(),
    generatedAt: z.string().optional(),
    /** Sources consulted, for the record */
    sources: z.array(z.string()),
  }),
  brand: z.object({
    name: z.string(),
    wordmark: z
      .object({ text: z.string(), accentSuffix: z.string().optional(), subline: z.string().optional() })
      .optional(),
    logo: z
      .object({ svg: z.string().optional(), png: z.string().optional(), monogramSvg: z.string().optional() })
      .optional(),
    colorScheme: z.enum(['dark', 'light', 'both']),
  }),
  palette: z.record(z.string(), sourced(Hex)),
  colors: ColorRoles,
  typography: Typography,
  layout: Layout,
  motion: Motion,
  focus: Focus,
  /** Named component variants & states the registry must implement */
  components: z.record(z.string(), z.object({ variants: z.array(z.string()), states: z.array(z.string()) })),
  images: z.record(z.string(), ImageRatio),
  accessibility: z.object({
    contrastPairs: z.array(ContrastPair),
    notes: z.array(z.string()),
  }),
  /** Legacy CSS custom properties preserved verbatim so existing selectors keep working (parity gate). */
  legacyVars: z.record(z.string(), sourced(z.string())).default({}),
})
export type DesignContract = z.infer<typeof DesignContract>

export function parseContract(json: unknown): DesignContract {
  return DesignContract.parse(json)
}
