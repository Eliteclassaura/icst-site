import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Manifest } from '../manifest'

/**
 * Test helper (fork): the extraction reference. The default client's manifest, read from `clients/h2o/manifest.json`, so tests that prove a
 * module follows its manifest can still run it against that other client. Not used by application code.
 */
export const H2O_MANIFEST: Manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../clients/h2o/manifest.json'), 'utf8'))
