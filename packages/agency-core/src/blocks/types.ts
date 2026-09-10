import type { Block } from 'payload'
import type { ReactNode } from 'react'

/**
 * A registry entry — the only way a component reaches a page (ADR-008).
 *
 * - `payload`   the Payload block config editors see (no React imports; see ./payload.ts)
 * - `Component` the server component that renders the block's resolved data
 * - `fixtures`  named prop sets rendered in /dev/blocks and looped by the e2e suite; `default` is required
 * - `a11y`      the accessibility contract in plain words — reviewers read it, tests assert it
 * - `kind`      `layout` blocks live in `pages.layout`; `chrome` blocks (header, footer) are rendered from globals
 * - `interactive` the block enhances with JS; it must still render its full content without it
 */
export type BlockDefinition<TProps = unknown> = {
  slug: string
  label: string
  kind: 'layout' | 'chrome'
  payload?: Block
  Component: (props: TProps) => ReactNode
  fixtures: { default: TProps } & Record<string, TProps>
  a11y: readonly string[]
  interactive?: boolean
}

/** Resolved image as blocks consume it — independent of the Media collection's shape. */
export type ImageRef = {
  url: string
  alt: string
  width: number
  height: number
  /** `srcset` candidates, largest last */
  sources?: Array<{ url: string; width: number; type?: string }>
  decorative?: boolean
}

export type LinkRef = { label: string; href: string; external?: boolean }

export type CtaPair = { primary?: LinkRef; secondary?: LinkRef }

/** Helper to declare a block with full inference on `TProps`. */
export function defineBlock<TProps>(def: BlockDefinition<TProps>): BlockDefinition<TProps> {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(def.slug)) throw new Error(`block slug must be camelCase: ${def.slug}`)
  return def
}
