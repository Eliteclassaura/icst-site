import * as migration_20260904_141134_initial from './20260904_141134_initial'
import * as migration_20260904_214439_blocks_registry from './20260904_214439_blocks_registry'
import * as migration_20260904_230435_c5_blocks_seo from './20260904_230435_c5_blocks_seo'
import * as migration_20260904_230942_c5_schema from './20260904_230942_c5_schema'
import * as migration_20260904_232000_c5_social from './20260904_232000_c5_social'
import * as migration_20260905_214658_c6_intake from './20260905_214658_c6_intake'
import * as migration_20260906_003618_c6_5_foundations from './20260906_003618_c6_5_foundations'
import * as migration_20260906_153316_c7_ai from './20260906_153316_c7_ai'

export const migrations = [
  {
    up: migration_20260904_141134_initial.up,
    down: migration_20260904_141134_initial.down,
    name: '20260904_141134_initial',
  },
  {
    up: migration_20260904_214439_blocks_registry.up,
    down: migration_20260904_214439_blocks_registry.down,
    name: '20260904_214439_blocks_registry',
  },
  {
    up: migration_20260904_230435_c5_blocks_seo.up,
    down: migration_20260904_230435_c5_blocks_seo.down,
    name: '20260904_230435_c5_blocks_seo',
  },
  {
    up: migration_20260904_230942_c5_schema.up,
    down: migration_20260904_230942_c5_schema.down,
    name: '20260904_230942_c5_schema',
  },
  {
    up: migration_20260904_232000_c5_social.up,
    down: migration_20260904_232000_c5_social.down,
    name: '20260904_232000_c5_social',
  },
  {
    up: migration_20260905_214658_c6_intake.up,
    down: migration_20260905_214658_c6_intake.down,
    name: '20260905_214658_c6_intake',
  },
  {
    up: migration_20260906_003618_c6_5_foundations.up,
    down: migration_20260906_003618_c6_5_foundations.down,
    name: '20260906_003618_c6_5_foundations',
  },
  {
    up: migration_20260906_153316_c7_ai.up,
    down: migration_20260906_153316_c7_ai.down,
    name: '20260906_153316_c7_ai',
  },
]
