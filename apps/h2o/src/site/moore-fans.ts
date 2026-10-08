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
/** The listings that carry the Moore Fans card. */
export const MOORE_LISTING_PATHS=new Set(['/fans/','/product-category/fans/'])
