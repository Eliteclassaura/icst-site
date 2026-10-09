import fanMenu from '../../content/design/fan-menu.json'
/**
 * CLIENT-FIX-1 (client feedback, CT GO 2026-10-08): Moore fans are not catalog products but four public pages. The live site's Fans
 * dropdown lists them; the rebuilt Fans menu and fan listings lost the links. One definition feeds the header Parts menu, the /fans/
 * page and the /product-category/fans/ archive. Labels are the pages' own titles.
 */
export const MOORE_FANS_HREF='/fans/moore-fans/'
export const MOORE_CLASS_PAGES:ReadonlyArray<readonly [string,string]>=[
  ['Class 10000 Heavy Duty Standard Chord','/class-10000-heavy-duty-standard-chord/'],
  ['Class 10000 XC','/class-10000-xc/'],
  ['Class 10000 Minimum Acoustic Geometry','/class-10000-minimum-acoustic-geometry/'],
]
/** The page's own subtitle (source text of /fans/moore-fans/). */
export const MOORE_FANS_LEAD='High-Performance Industrial Axial Flow Fans for Maximum Cooling Efficiency'
export const MOORE_FANS_LINKS:ReadonlyArray<readonly [string,string]>=[['Moore Fans',MOORE_FANS_HREF],...MOORE_CLASS_PAGES]
/** Every fan brand and family in the catalog (content/design/fan-menu.json, derived by ops/catalog/build-fan-menu.mjs) followed by Moore Fans and its pages. */
export const FAN_MENU_LINKS:ReadonlyArray<readonly [string,string]>=[...(fanMenu.items.map(i=>[i.label,i.href] as const)),...MOORE_FANS_LINKS]
/** The listings that carry the Moore Fans card. */
export const MOORE_LISTING_PATHS=new Set(['/fans/','/product-category/fans/'])
