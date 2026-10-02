import type {SalmonDocument} from './salmon'

/** Source H1 explicitly identifies this as Part 2; no body, URL or canonical is changed. */
const scopedTitles:Record<string,string>={
  '/inspect-cooling-tower-part-2/':'How to Inspect a Cooling Tower — Part 2 | ICS',
}

/**
 * Route titles replaced by an accepted SEO decision (OGCS_H1_DECISIONS_2026-10-02, Control Tower ruling). Applied only
 * while the title is still the imported source title, so an editor's later SEO title wins.
 */
const decidedTitles:Record<string,{source:string;title:string}>={
  'SALMON-b2503fcd6ca86806':{source:'Tim Bozic | President, Industrial Cooling Solutions',title:'Tim Bozic - ICS'},
}
const decided=(doc:SalmonDocument,current:string):string=>{const rule=decidedTitles[doc.routeId];return rule&&current===rule.source?rule.title:current}

export const articleMetadataTitle=(doc:SalmonDocument):string=>doc.type==='posts'?(scopedTitles[doc.targetPath]??doc.seo.title):decided(doc,doc.seo.title)
export const articleSocialTitle=(doc:SalmonDocument,current:string):string=>doc.type==='posts'&&scopedTitles[doc.targetPath]?scopedTitles[doc.targetPath]:decided(doc,current)
