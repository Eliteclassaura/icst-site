import type { Office } from '../offices'

/**
 * Holiday seed, 2026–2027 (Patch L1). **Owner-approved** standard lists (CT, 2026-10-05): seeded `confirmed: true`. The
 * owner can still edit the list in the CRM admin (`crm-office-settings` → Holidays). The office calendars use the edited
 * list, never this file directly: this file only seeds an empty settings record.
 *
 *   - US: US federal holidays, on their observed weekday (a Saturday holiday is observed the Friday before, a Sunday
 *     holiday the Monday after).
 *   - TH: Thai public holidays. Buddhist holidays follow the lunar calendar, so their dates here are estimates until
 *     the Thai cabinet's annual announcement; substitution days for weekend holidays are included where the rule is
 *     settled. Bridging holidays the cabinet adds each year are not included — add them when announced.
 */
export type HolidaySeed = { office: Office; date: string; name: string; note?: string }

export const HOLIDAY_SEED: readonly HolidaySeed[] = [
  // ---------------------------------------------------------------- US federal 2026
  { office: 'US', date: '2026-01-01', name: "New Year's Day" },
  { office: 'US', date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
  { office: 'US', date: '2026-02-16', name: "Washington's Birthday (Presidents' Day)" },
  { office: 'US', date: '2026-05-25', name: 'Memorial Day' },
  { office: 'US', date: '2026-06-19', name: 'Juneteenth' },
  { office: 'US', date: '2026-07-03', name: 'Independence Day (observed; July 4 is a Saturday)' },
  { office: 'US', date: '2026-09-07', name: 'Labor Day' },
  { office: 'US', date: '2026-10-12', name: 'Columbus Day' },
  { office: 'US', date: '2026-11-11', name: 'Veterans Day' },
  { office: 'US', date: '2026-11-26', name: 'Thanksgiving Day' },
  { office: 'US', date: '2026-12-25', name: 'Christmas Day' },
  // ---------------------------------------------------------------- US federal 2027
  { office: 'US', date: '2027-01-01', name: "New Year's Day" },
  { office: 'US', date: '2027-01-18', name: 'Martin Luther King Jr. Day' },
  { office: 'US', date: '2027-02-15', name: "Washington's Birthday (Presidents' Day)" },
  { office: 'US', date: '2027-05-31', name: 'Memorial Day' },
  { office: 'US', date: '2027-06-18', name: 'Juneteenth (observed; June 19 is a Saturday)' },
  { office: 'US', date: '2027-07-05', name: 'Independence Day (observed; July 4 is a Sunday)' },
  { office: 'US', date: '2027-09-06', name: 'Labor Day' },
  { office: 'US', date: '2027-10-11', name: 'Columbus Day' },
  { office: 'US', date: '2027-11-11', name: 'Veterans Day' },
  { office: 'US', date: '2027-11-25', name: 'Thanksgiving Day' },
  { office: 'US', date: '2027-12-24', name: 'Christmas Day (observed; December 25 is a Saturday)' },
  { office: 'US', date: '2027-12-31', name: "New Year's Day 2028 (observed; January 1, 2028 is a Saturday)" },
  // ---------------------------------------------------------------- Thailand 2026 (lunar dates estimated)
  { office: 'TH', date: '2026-01-01', name: "New Year's Day" },
  { office: 'TH', date: '2026-03-03', name: 'Makha Bucha Day', note: 'lunar; estimated' },
  { office: 'TH', date: '2026-04-06', name: 'Chakri Memorial Day' },
  { office: 'TH', date: '2026-04-13', name: 'Songkran' },
  { office: 'TH', date: '2026-04-14', name: 'Songkran' },
  { office: 'TH', date: '2026-04-15', name: 'Songkran' },
  { office: 'TH', date: '2026-05-01', name: 'National Labour Day' },
  { office: 'TH', date: '2026-05-04', name: 'Coronation Day' },
  { office: 'TH', date: '2026-06-01', name: 'Visakha Bucha Day (substitution; May 31 is a Sunday)', note: 'lunar; estimated' },
  { office: 'TH', date: '2026-06-03', name: "Queen Suthida's Birthday" },
  { office: 'TH', date: '2026-07-28', name: "King Vajiralongkorn's Birthday" },
  { office: 'TH', date: '2026-07-29', name: 'Asanha Bucha Day', note: 'lunar; estimated' },
  { office: 'TH', date: '2026-07-30', name: 'Khao Phansa (Buddhist Lent Day)', note: 'lunar; estimated' },
  { office: 'TH', date: '2026-08-12', name: "Queen Mother's Birthday / Mother's Day" },
  { office: 'TH', date: '2026-10-13', name: 'King Bhumibol Memorial Day' },
  { office: 'TH', date: '2026-10-23', name: 'Chulalongkorn Day' },
  { office: 'TH', date: '2026-12-07', name: "King Bhumibol's Birthday / Father's Day (substitution; December 5 is a Saturday)" },
  { office: 'TH', date: '2026-12-10', name: 'Constitution Day' },
  { office: 'TH', date: '2026-12-31', name: "New Year's Eve" },
  // ---------------------------------------------------------------- Thailand 2027 (lunar dates estimated)
  { office: 'TH', date: '2027-01-01', name: "New Year's Day" },
  { office: 'TH', date: '2027-02-22', name: 'Makha Bucha Day (substitution; estimated February 20, a Saturday)', note: 'lunar; estimated' },
  { office: 'TH', date: '2027-04-06', name: 'Chakri Memorial Day' },
  { office: 'TH', date: '2027-04-13', name: 'Songkran' },
  { office: 'TH', date: '2027-04-14', name: 'Songkran' },
  { office: 'TH', date: '2027-04-15', name: 'Songkran' },
  { office: 'TH', date: '2027-05-03', name: 'National Labour Day (substitution; May 1 is a Saturday)' },
  { office: 'TH', date: '2027-05-04', name: 'Coronation Day' },
  { office: 'TH', date: '2027-05-20', name: 'Visakha Bucha Day', note: 'lunar; estimated' },
  { office: 'TH', date: '2027-06-03', name: "Queen Suthida's Birthday" },
  { office: 'TH', date: '2027-07-19', name: 'Asanha Bucha Day (substitution; estimated July 18, a Sunday)', note: 'lunar; estimated' },
  { office: 'TH', date: '2027-07-20', name: 'Khao Phansa (Buddhist Lent Day)', note: 'lunar; estimated' },
  { office: 'TH', date: '2027-07-28', name: "King Vajiralongkorn's Birthday" },
  { office: 'TH', date: '2027-08-12', name: "Queen Mother's Birthday / Mother's Day" },
  { office: 'TH', date: '2027-10-13', name: 'King Bhumibol Memorial Day' },
  { office: 'TH', date: '2027-10-25', name: 'Chulalongkorn Day (substitution; October 23 is a Saturday)' },
  { office: 'TH', date: '2027-12-06', name: "King Bhumibol's Birthday / Father's Day (substitution; December 5 is a Sunday)" },
  { office: 'TH', date: '2027-12-10', name: 'Constitution Day' },
  { office: 'TH', date: '2027-12-31', name: "New Year's Eve" },
]
