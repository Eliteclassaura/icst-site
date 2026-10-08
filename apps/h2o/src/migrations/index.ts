import * as migration_20260912_202131 from './20260912_202131';
import * as migration_20260913_012440 from './20260913_012440';
import * as migration_20260914_133257_delete_provenance_fk_restrict from './20260914_133257_delete_provenance_fk_restrict';
import * as migration_20260925_011109_crm1_foundation from './20260925_011109_crm1_foundation';
import * as migration_20260929_181813_content_bridge_r1 from './20260929_181813_content_bridge_r1';
import * as migration_20260930_145341_content_bridge_r1b from './20260930_145341_content_bridge_r1b';
import * as migration_20261002_231259_crm_golive_catalog_index from './20261002_231259_crm_golive_catalog_index';
import * as migration_20261004_214231_crm_email_m1 from './20261004_214231_crm_email_m1';
import * as migration_20261005_002510_crm_email_m2 from './20261005_002510_crm_email_m2';
import * as migration_20261005_003218_crm_email_m3 from './20261005_003218_crm_email_m3';
import * as migration_20261005_164215_restored_sections from './20261005_164215_restored_sections';
import * as migration_20261005_170235_crm_wave1_import from './20261005_170235_crm_wave1_import';
import * as migration_20261005_170237_crm_wave1_saved_views from './20261005_170237_crm_wave1_saved_views';
import * as migration_20261005_192638_crm_wave1_facets from './20261005_192638_crm_wave1_facets';
import * as migration_20261005_203846_crm_patch_l from './20261005_203846_crm_patch_l';
import * as migration_20261005_213459_crm_native_intake from './20261005_213459_crm_native_intake';
import * as migration_20261005_222652_crm_patch_c from './20261005_222652_crm_patch_c';
import * as migration_20261005_235820_crm_ers_slice1 from './20261005_235820_crm_ers_slice1';
import * as migration_20261006_203222_payload_3_90_security from './20261006_203222_payload_3_90_security';
import * as migration_20261007_214405_dark_1_crm_theme from './20261007_214405_dark_1_crm_theme';
import * as migration_20261008_040408_rfq_fix_1_spam_state from './20261008_040408_rfq_fix_1_spam_state';
import * as migration_20261008_052750_rfq_fix_1_1_sweep_limits from './20261008_052750_rfq_fix_1_1_sweep_limits';

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
  {
    up: migration_20261004_214231_crm_email_m1.up,
    down: migration_20261004_214231_crm_email_m1.down,
    name: '20261004_214231_crm_email_m1',
  },
  {
    up: migration_20261005_002510_crm_email_m2.up,
    down: migration_20261005_002510_crm_email_m2.down,
    name: '20261005_002510_crm_email_m2',
  },
  {
    up: migration_20261005_003218_crm_email_m3.up,
    down: migration_20261005_003218_crm_email_m3.down,
    name: '20261005_003218_crm_email_m3',
  },
  {
    up: migration_20261005_164215_restored_sections.up,
    down: migration_20261005_164215_restored_sections.down,
    name: '20261005_164215_restored_sections',
  },
  {
    up: migration_20261005_170235_crm_wave1_import.up,
    down: migration_20261005_170235_crm_wave1_import.down,
    name: '20261005_170235_crm_wave1_import',
  },
  {
    up: migration_20261005_170237_crm_wave1_saved_views.up,
    down: migration_20261005_170237_crm_wave1_saved_views.down,
    name: '20261005_170237_crm_wave1_saved_views',
  },
  {
    up: migration_20261005_192638_crm_wave1_facets.up,
    down: migration_20261005_192638_crm_wave1_facets.down,
    name: '20261005_192638_crm_wave1_facets',
  },
  {
    up: migration_20261005_203846_crm_patch_l.up,
    down: migration_20261005_203846_crm_patch_l.down,
    name: '20261005_203846_crm_patch_l',
  },
  {
    up: migration_20261005_213459_crm_native_intake.up,
    down: migration_20261005_213459_crm_native_intake.down,
    name: '20261005_213459_crm_native_intake',
  },
  {
    up: migration_20261005_222652_crm_patch_c.up,
    down: migration_20261005_222652_crm_patch_c.down,
    name: '20261005_222652_crm_patch_c',
  },
  {
    up: migration_20261005_235820_crm_ers_slice1.up,
    down: migration_20261005_235820_crm_ers_slice1.down,
    name: '20261005_235820_crm_ers_slice1',
  },
  {
    up: migration_20261006_203222_payload_3_90_security.up,
    down: migration_20261006_203222_payload_3_90_security.down,
    name: '20261006_203222_payload_3_90_security',
  },
  {
    up: migration_20261007_214405_dark_1_crm_theme.up,
    down: migration_20261007_214405_dark_1_crm_theme.down,
    name: '20261007_214405_dark_1_crm_theme',
  },
  {
    up: migration_20261008_040408_rfq_fix_1_spam_state.up,
    down: migration_20261008_040408_rfq_fix_1_spam_state.down,
    name: '20261008_040408_rfq_fix_1_spam_state',
  },
  {
    up: migration_20261008_052750_rfq_fix_1_1_sweep_limits.up,
    down: migration_20261008_052750_rfq_fix_1_1_sweep_limits.down,
    name: '20261008_052750_rfq_fix_1_1_sweep_limits'
  },
];
