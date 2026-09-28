import type {SalmonDocument} from './salmon'

/** Source H1 explicitly identifies this as Part 2; no body, URL or canonical is changed. */
const scopedTitles:Record<string,string>={
  '/inspect-cooling-tower-part-2/':'How to Inspect a Cooling Tower — Part 2 | ICS',
}

export const articleMetadataTitle=(doc:SalmonDocument):string=>doc.type==='posts'?(scopedTitles[doc.targetPath]??doc.seo.title):doc.seo.title
export const articleSocialTitle=(doc:SalmonDocument,current:string):string=>doc.type==='posts'&&scopedTitles[doc.targetPath]?scopedTitles[doc.targetPath]:current
