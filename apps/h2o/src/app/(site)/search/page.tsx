import type {Metadata} from 'next'
import {connection} from 'next/server'
import {salmonDocument,salmonRoutes} from '../../../site/salmon'
import {LuxuryHeader,LuxuryFooter,LuxurySearch} from '../../../site/LuxuryShell'
import {isPayloadContent,requestSearchGeneration} from '../../../content/runtime-read'
import {ReleaseSearchPage} from '../../../content/ReleaseSearchPage'
export const metadata:Metadata={title:'Search ICS',robots:{index:false,follow:false}}
export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 // Payload runtime: the accepted public search (Pagefind index built by the publishing runner).
 if(isPayloadContent()){await connection();return <ReleaseSearchPage searchGeneration={requestSearchGeneration()}/>}
 const query=String((await searchParams).q??'').trim().slice(0,200)
 const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
 const results=words.length?salmonRoutes().map(route=>({route,doc:salmonDocument(route)})).filter(({doc})=>words.every(word=>(doc.title+' '+doc.text).toLocaleLowerCase().includes(word))).sort((a,b)=>{const score=(title:string)=>words.reduce((sum,word)=>sum+(title.toLocaleLowerCase().includes(word)?1:0),0);return score(b.doc.title)-score(a.doc.title)||a.route.targetPath.localeCompare(b.route.targetPath)}).slice(0,100):[]
 return <div className="luxury-site"><LuxuryHeader/><main className="lux-search-page" id="main"><h1>Search ICS</h1><LuxurySearch/>{query?<><p>{results.length===100?'100+':results.length} results for “{query}”</p><ol>{results.map(({route,doc})=><li key={route.routeId}><a href={route.targetPath}>{doc.title}</a><p>{route.targetPath}</p></li>)}</ol>{!results.length?<p>No matches. Try another term or <a href="/contact-us/">contact ICS</a>.</p>:null}</>:<p>Search cooling towers, services, parts and technical articles.</p>}</main><LuxuryFooter/></div>
}
