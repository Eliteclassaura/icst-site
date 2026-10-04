import * as migration_20260912_202131 from './20260912_202131'
import * as migration_20260913_012440 from './20260913_012440'
import * as migration_20260914_133257_delete_provenance_fk_restrict from './20260914_133257_delete_provenance_fk_restrict'
import * as migration_20260925_011109_crm1_foundation from './20260925_011109_crm1_foundation'
import * as migration_20260929_181813_content_bridge_r1 from './20260929_181813_content_bridge_r1'
import * as migration_20260930_145341_content_bridge_r1b from './20260930_145341_content_bridge_r1b'
import * as migration_20261002_231259_crm_golive_catalog_index from './20261002_231259_crm_golive_catalog_index'

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
  {
    up: migration_20260925_011109_crm1_foundation.up,
    down: migration_20260925_011109_crm1_foundation.down,
    name: '20260925_011109_crm1_foundation',
  },
  {
    up: migration_20260929_181813_content_bridge_r1.up,
    down: migration_20260929_181813_content_bridge_r1.down,
    name: '20260929_181813_content_bridge_r1',
  },
  {
    up: migration_20260930_145341_content_bridge_r1b.up,
    down: migration_20260930_145341_content_bridge_r1b.down,
    name: '20260930_145341_content_bridge_r1b',
  },
  {
    up: migration_20261002_231259_crm_golive_catalog_index.up,
    down: migration_20261002_231259_crm_golive_catalog_index.down,
    name: '20261002_231259_crm_golive_catalog_index',
  },
]
