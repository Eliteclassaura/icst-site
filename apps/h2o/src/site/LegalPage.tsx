import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {Metadata} from 'next'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {markdownBlocks} from './markdown-lite'
import {LEGAL_ORIGIN,type LegalPage as LegalPageData} from './legal-routes'
import {StandardHead} from './standard-head'
import {WEBSITE_ID} from './schema-graph'
import {indexingPolicy,richRobots} from '../content/config'

/**
 * LEGAL-1: a legal text as a plain R4-system page. The words are OGCS's LEGAL-FINAL-1 files, unchanged (content/legal/); the
 * page adds only the site header and footer around them. One H1 (the text's own title), headings as written, a readable measure.
 */
export const legalSource=(page:LegalPageData):string=>readFileSync(path.join(process.cwd(),'content/legal',page.file),'utf8')

export function legalMetadata(page:LegalPageData):Metadata{
  const open=indexingPolicy(process.env)==='production'
  return {title:{absolute:page.title},description:page.description,alternates:{canonical:LEGAL_ORIGIN+page.path},robots:open?richRobots({index:true,follow:true}):{index:false,follow:false}}
}

/** HEAD-POLISH-1: the page as a schema.org WebPage (name, url, dateModified), part of the one site-wide WebSite node. */
export const legalWebPage=(page:LegalPageData)=>({'@context':'https://schema.org','@type':'WebPage','@id':`${LEGAL_ORIGIN}${page.path}#webpage`,url:`${LEGAL_ORIGIN}${page.path}`,name:page.title,description:page.description,inLanguage:'en',dateModified:page.modified,isPartOf:{'@id':WEBSITE_ID}})

export function LegalPage({page}:{page:LegalPageData}){
  return <div className="luxury-site r5-site legal-site" data-legal-page={page.path}>
    {/* HEAD-POLISH-1: the standard social set (default share image) and a WebPage node, like every other public page. */}
    <StandardHead facts={{title:page.title,description:page.description,url:LEGAL_ORIGIN+page.path}}/>
    <script type="application/ld+json" data-legal-webpage="" dangerouslySetInnerHTML={{__html:JSON.stringify(legalWebPage(page)).replaceAll('<','\\u003c')}}/>
    <LuxuryHeader/>
    <main id="main" className="legal-main">
      <article className="legal-doc">{markdownBlocks(legalSource(page))}</article>
    </main>
    <LuxuryFooter/>
  </div>
}
