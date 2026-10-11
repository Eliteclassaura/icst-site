import {readFileSync} from 'node:fs'
import path from 'node:path'

/** DD country-page review M4: question-and-answer sections restored on curated pages, from content/design/page-faqs.json (self-contained, no dependency on the source record). */
type Faq={heading:string;source:string;items:Array<{q:string;a:string}>}
let cache:Record<string,Faq>|undefined
const registry=():Record<string,Faq>=>cache??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/design/page-faqs.json'),'utf8')) as {pages:Record<string,Faq>}).pages
export const pageFaq=(pagePath:string):Faq|undefined=>registry()[pagePath]
/** The FAQPage structured data of the given questions and answers (plain text; the visible text is the source, so the two cannot differ). */
export const faqPageJsonLd=(items:ReadonlyArray<{q:string;a:string}>):Record<string,unknown>=>({'@context':'https://schema.org','@type':'FAQPage',mainEntity:items.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))})
/** The FAQPage structured data of the same questions and answers (plain text). */
export function pageFaqJsonLd(pagePath:string):Record<string,unknown>|undefined{
  const faq=pageFaq(pagePath)
  if(!faq)return undefined
  return faqPageJsonLd(faq.items)
}
