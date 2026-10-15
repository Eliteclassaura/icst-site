/** Files of the manifest validator that the app carries as a generated copy (both are file-system free). */
export const SYNCED = ['check.ts', 'manifest.ts'] as const

export const appCopy = (source: string, file: string): string =>
  `/* GENERATED from tools/client-kit/src/${file} by tools/client-kit/bin/sync-app.ts. Do not edit: change the source and re-run. */\n${source.replace(/from '\.\/([a-z-]+)\.ts'/g, "from './$1'")}`
