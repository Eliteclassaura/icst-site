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
import * as migration_20261008_122143_alerts_1_email_routing from './20261008_122143_alerts_1_email_routing';
import * as migration_20261008_122225_mfa_2_email_codes_devices from './20261008_122225_mfa_2_email_codes_devices';
import * as migration_20261008_134113_send_fix_1a_outbox_outcomes from './20261008_134113_send_fix_1a_outbox_outcomes';
import * as migration_20261008_200000_opp_1_deals from './20261008_200000_opp_1_deals';
import * as migration_20261008_200500_opp_1_1_seed_deal_stages from './20261008_200500_opp_1_1_seed_deal_stages';
import * as migration_20261008_201000_csv_fix_1_name_link_review from './20261008_201000_csv_fix_1_name_link_review';
import * as migration_20261008_205350_mfa_admin_1 from './20261008_205350_mfa_admin_1';
import * as migration_20261008_213813_sheet_sync_1 from './20261008_213813_sheet_sync_1';
import * as migration_20261008_220000_deals_date_fix_1_canceled_label from './20261008_220000_deals_date_fix_1_canceled_label';
import * as migration_20261008_230113_overview_fix_1_resend_accepted from './20261008_230113_overview_fix_1_resend_accepted';
import * as migration_20261009_090000_import_typeform_1_historical_inquiries from './20261009_090000_import_typeform_1_historical_inquiries';
import * as migration_20261009_100000_ers_lib_1_email_library from './20261009_100000_ers_lib_1_email_library';
import * as migration_20261009_100100_ers_seq_build_1 from './20261009_100100_ers_seq_build_1';
import * as migration_20261009_100200_ers_engine_scope_1b from './20261009_100200_ers_engine_scope_1b';
import * as migration_20261009_100300_ers_engine_scope_1c from './20261009_100300_ers_engine_scope_1c';
import * as migration_20261009_220808_signatures_1 from './20261009_220808_signatures_1';

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
    name: '20261008_052750_rfq_fix_1_1_sweep_limits',
  },
  {
    up: migration_20261008_122143_alerts_1_email_routing.up,
    down: migration_20261008_122143_alerts_1_email_routing.down,
    name: '20261008_122143_alerts_1_email_routing',
  },
  {
    up: migration_20261008_122225_mfa_2_email_codes_devices.up,
    down: migration_20261008_122225_mfa_2_email_codes_devices.down,
    name: '20261008_122225_mfa_2_email_codes_devices',
  },
  {
    up: migration_20261008_134113_send_fix_1a_outbox_outcomes.up,
    down: migration_20261008_134113_send_fix_1a_outbox_outcomes.down,
    name: '20261008_134113_send_fix_1a_outbox_outcomes',
  },
  {
    up: migration_20261008_200000_opp_1_deals.up,
    down: migration_20261008_200000_opp_1_deals.down,
    name: '20261008_200000_opp_1_deals',
  },
  {
    up: migration_20261008_200500_opp_1_1_seed_deal_stages.up,
    down: migration_20261008_200500_opp_1_1_seed_deal_stages.down,
    name: '20261008_200500_opp_1_1_seed_deal_stages',
  },
  {
    up: migration_20261008_201000_csv_fix_1_name_link_review.up,
    down: migration_20261008_201000_csv_fix_1_name_link_review.down,
    name: '20261008_201000_csv_fix_1_name_link_review',
  },
  {
    up: migration_20261008_205350_mfa_admin_1.up,
    down: migration_20261008_205350_mfa_admin_1.down,
    name: '20261008_205350_mfa_admin_1',
  },
  {
    up: migration_20261008_213813_sheet_sync_1.up,
    down: migration_20261008_213813_sheet_sync_1.down,
    name: '20261008_213813_sheet_sync_1',
  },
  {
    up: migration_20261008_220000_deals_date_fix_1_canceled_label.up,
    down: migration_20261008_220000_deals_date_fix_1_canceled_label.down,
    name: '20261008_220000_deals_date_fix_1_canceled_label',
  },
  {
    up: migration_20261008_230113_overview_fix_1_resend_accepted.up,
    down: migration_20261008_230113_overview_fix_1_resend_accepted.down,
    name: '20261008_230113_overview_fix_1_resend_accepted',
  },
  {
    up: migration_20261009_090000_import_typeform_1_historical_inquiries.up,
    down: migration_20261009_090000_import_typeform_1_historical_inquiries.down,
    name: '20261009_090000_import_typeform_1_historical_inquiries',
  },
  {
    up: migration_20261009_100000_ers_lib_1_email_library.up,
    down: migration_20261009_100000_ers_lib_1_email_library.down,
    name: '20261009_100000_ers_lib_1_email_library',
  },
  {
    up: migration_20261009_100100_ers_seq_build_1.up,
    down: migration_20261009_100100_ers_seq_build_1.down,
    name: '20261009_100100_ers_seq_build_1',
  },
  {
    up: migration_20261009_100200_ers_engine_scope_1b.up,
    down: migration_20261009_100200_ers_engine_scope_1b.down,
    name: '20261009_100200_ers_engine_scope_1b',
  },
  {
    up: migration_20261009_100300_ers_engine_scope_1c.up,
    down: migration_20261009_100300_ers_engine_scope_1c.down,
    name: '20261009_100300_ers_engine_scope_1c',
  },
  {
    up: migration_20261009_220808_signatures_1.up,
    down: migration_20261009_220808_signatures_1.down,
    name: '20261009_220808_signatures_1'
  },
];
