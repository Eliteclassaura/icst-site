import {readFileSync} from 'node:fs'
import path from 'node:path'

/**
 * OGCS pre-launch copy R1 (CT accepted 2026-10-05): template copy as data (content/design/page-copy.json), so an OGCS
 * wording change edits that file only. A null value renders no element.
 */
export type PageCopy={
  contact:{eyebrow:string|null;heading:string;lead:string;requestHeading:string|null;requestBody:string;officeTitles:Record<string,string>;phoneOnlyPrefix:string
    /** Design R3 (CT 2026-10-06; OGCS Contact review bdc9a49b). */
    heroLead:string;requestChip:string;requestTitle:string;sendHeading:string;send:Array<{text:string;media:string}>
    officesChip:string;officesHeading:string;officesNote:string|null;officeSubtitles:Record<string,string>;officeBadges:Record<string,string>;callLabel:string;formLink:string}
  englishServices:{evidenceCaption:string|null}
}
let cache:PageCopy|undefined
export const pageCopy=():PageCopy=>cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/page-copy.json'),'utf8')) as PageCopy
