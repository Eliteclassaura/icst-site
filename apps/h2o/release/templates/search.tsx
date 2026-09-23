import type {Metadata} from 'next'
import {LuxuryHeader,LuxuryFooter,LuxurySearch} from '../../../site/LuxuryShell'
import {StaticSearchController} from '../../../site/StaticSearchController'
export const metadata:Metadata={title:'Search ICS',alternates:{canonical:'https://h2ocooling.com/search/'},robots:{index:false,follow:true}}
export default function SearchPage(){
  return <div className="luxury-site"><LuxuryHeader/><main className="lux-search-page" id="main" data-pagefind-ignore><h1>Search ICS</h1><LuxurySearch/><p id="release-search-status" role="status">Search cooling towers, services, parts and technical articles.</p><ol id="release-search-results"/><noscript>Enable JavaScript to search the static index.</noscript></main><LuxuryFooter/><StaticSearchController/></div>
}
