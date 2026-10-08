/**
 * LANG-2.2 (Design Director T1): brand, client, project and manufacturer names are never translated ("Shell" is not "Caparazón").
 * Matched case-sensitively as whole words in page text and wrapped in a translate="no" span while a translation is active.
 * The list comes from the pages themselves: the client strip, the project names on /all-projects/, and the manufacturer names in
 * the parts catalog and technical articles. Add a name here when a new client, project or manufacturer appears.
 */
export const PROTECTED_NAMES:readonly string[]=[
  // ICS itself
  'Industrial Cooling Solutions','ICS','H2O',
  // clients (the About page strip)
  'Star Energy','Shintech','Shin-Etsu','TTCL','PTT Group','PTT','Pertamina','Mitsubishi','Marubeni','Shell','Empire Farms','Lanxess','Vinachem','KBR','PETRONAS RAPID','PETRONAS','EDC',
  // projects
  'Keramasan','Palinpinon','Cawayan Bacman','BacMan','Bacman','Mak Ban','Patuha',
  // manufacturers and brands in the catalog and articles
  'Baltimore Aircoil','Amarillo Gear','Tower Performance','Tower Tech','Marley','SPX','Evapco','EVAPCO','Rexnord','Baldor','Imeco','Hamon','Hudson Products','BAC','CTI',
]

const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
// longest first, so "Baltimore Aircoil" wins over a shorter name inside it; whole words only (a name inside another word is left alone)
export const PROTECTED_PATTERN=new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...PROTECTED_NAMES].sort((a,b)=>b.length-a.length).map(escape).join('|')})(?![\\p{L}\\p{N}])`,'gu')
