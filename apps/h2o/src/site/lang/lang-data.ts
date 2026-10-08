import {hreflangAlternatesFor,repositoryAlternatesFor} from '../../content/sitemap-response'
import {isPayloadContent} from '../../content/runtime-read'
import {languageMenu,type LanguageMenuData} from './lang-model'

/**
 * LANG-1 (server): the language menu data for a page. The counterparts are the page's hreflang cluster, from the published
 * snapshot in Payload mode (never a fallback to the repository there) and from the release ledger otherwise (same policy, same redirect guard). A page outside a served
 * cluster has none, so every other language is disabled.
 */
export function languageMenuFor(pathname:string):LanguageMenuData{
  let alternates:Record<string,string>|undefined
  try{alternates=isPayloadContent()?hreflangAlternatesFor(pathname):repositoryAlternatesFor(pathname)}catch{alternates=undefined}
  return languageMenu(pathname,alternates)
}
