import * as migration_20260912_202131 from './20260912_202131'
import * as migration_20260913_012440 from './20260913_012440'
import * as migration_20260914_133257_delete_provenance_fk_restrict from './20260914_133257_delete_provenance_fk_restrict'

export const migrations = [
  {
    up: migration_20260912_202131.up,
    down: migration_20260912_202131.down,
    name: '20260912_202131',
  },
  {
    up: migration_20260913_012440.up,
    down: migration_20260913_012440.down,
    name: '20260913_012440',
  },
  {
    up: migration_20260914_133257_delete_provenance_fk_restrict.up,
    down: migration_20260914_133257_delete_provenance_fk_restrict.down,
    name: '20260914_133257_delete_provenance_fk_restrict',
  },
]
