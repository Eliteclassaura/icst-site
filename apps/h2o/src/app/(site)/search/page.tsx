import type {Metadata} from 'next'
import {connection} from 'next/server'
import {salmonDocument,salmonRoutes} from '../../../site/salmon'
import {LuxuryHeader,LuxuryFooter,LuxurySearch} from '../../../site/LuxuryShell'
import {isPayloadContent,requestSearchGeneration} from '../../../content/runtime-read'
import {ReleaseSearchPage} from '../../../content/ReleaseSearchPage'
import {StandardHead} from '../../../site/standard-head'
import {PUBLIC_ORIGIN,indexingPolicy} from '../../../content/config'
// R2.4 (CT ruling 2026-10-05; SEO Checker item d): a utility page — noindex,follow, out of the sitemap, with its canonical
// and the standard head (og/twitter, Organization/WebSite).
const SEARCH_INTRO='Search cooling towers, services, parts and technical articles.'
/** OGCS SEO R2.4 titles/metas R1 (CT accepted 2026-10-05): the /search/ meta description (the page stays noindex,follow). */
const SEARCH_META='Search the ICS website for cooling tower parts, services, projects, and technical articles.'
const SEARCH_TITLE='Search ICS'
// SEO-FIX-2 (SC-03): the robots meta follows the same private floor as the X-Robots-Tag header (noindex, nofollow) unless the
// production indexing policy is on, where this utility page stays noindex,follow. Read per request, never frozen at build time.
export function generateMetadata():Metadata{
  return {title:SEARCH_TITLE,description:SEARCH_META,alternates:{canonical:`${PUBLIC_ORIGIN}/search/`},robots:{index:false,follow:indexingPolicy()==='production'}}
}
const searchHead=<StandardHead facts={{title:SEARCH_TITLE,description:SEARCH_META,url:`${PUBLIC_ORIGIN}/search/`}}/>
export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 // Payload runtime: the accepted public search (Pagefind index built by the publishing runner).
 if(isPayloadContent()){await connection();return <>{searchHead}<ReleaseSearchPage searchGeneration={requestSearchGeneration()}/></>}
 const query=String((await searchParams).q??'').trim().slice(0,200)
 const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
 const results=words.length?salmonRoutes().map(route=>({route,doc:salmonDocument(route)})).filter(({doc})=>words.every(word=>(doc.title+' '+doc.text).toLocaleLowerCase().includes(word))).sort((a,b)=>{const score=(title:string)=>words.reduce((sum,word)=>sum+(title.toLocaleLowerCase().includes(word)?1:0),0);return score(b.doc.title)-score(a.doc.title)||a.route.targetPath.localeCompare(b.route.targetPath)}).slice(0,100):[]
 return <div className="luxury-site">{searchHead}<LuxuryHeader/><main className="lux-search-page" id="main"><h1>Search ICS</h1><LuxurySearch/>{query?<><p>{results.length===100?'100+':results.length} results for “{query}”</p><ol>{results.map(({route,doc})=><li key={route.routeId}><a href={route.targetPath}>{doc.title}</a><p>{route.targetPath}</p></li>)}</ol>{!results.length?<p>No matches. Try another term or <a href="/contact-us/">contact ICS</a>.</p>:null}</>:<p>{SEARCH_INTRO}</p>}</main><LuxuryFooter/></div>
}
