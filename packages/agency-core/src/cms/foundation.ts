/**
 * Foundation entry — the closed shared collection set, plus the hooks and blocks those definitions need.
 *
 * Registering `foundationCollections` satisfies every collection reference these definitions make. It is
 * the smallest registration a second app can make while still compiling the shared field helpers, the
 * audit hooks and the layout blocks.
 *
 * `makeSlugRedirectHook` is deliberately **not** here: it reads and writes `redirects`, which lives in the
 * CRM layer, so exporting it from this entry would put `redirects` back into every consumer's union.
 */
export * from './collections/foundation'
export * from './hooks/audit'
export { layoutBlocks } from '../blocks/payload'
