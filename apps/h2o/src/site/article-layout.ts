import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {SalmonDocument,SalmonNode} from './salmon'

/**
 * ARTICLE-LAYOUT-1 (DD spec 2026-10-08, OGCS copy seal 7d61001f): the pure model behind the technical-article layout and the
 * Tech Articles index: topics, copy strings, reading time, heading ids and contents, the inline-CTA split, related articles,
 * and the (held) index URL scheme. Nothing here renders; nothing here invents copy.
 */
type Element=Exclude<SalmonNode,string>
export type Topic={name:string;slug:string}
type Layout={topics:Topic[];excludedFromEnglishIndex:string[];routes:Record<string,string>;copy:Record<string,string>}

export const articleLayout=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/article-layout.json'),'utf8')) as Layout
const topicBySlug=new Map(articleLayout.topics.map(topic=>[topic.slug,topic]))

/** One OGCS string; `{name}` placeholders are filled from `vars`. A missing key is a build error, never an invented string. */
export function articleCopy(key:string,vars:Record<string,string|number>={}):string{
  const text=articleLayout.copy[key]
  if(text===undefined)throw new Error(`ARTICLE-LAYOUT-1: no copy string "${key}"`)
  return text.replace(/\{(\w+)\}/g,(_,name:string)=>String(vars[name]??''))
}

/** A string around one placeholder, for markup that goes in its place: "By {author}" -> ["By ", ""]. */
export function articleCopyParts(key:string,name:string):[string,string]{
  const text=articleLayout.copy[key]
  if(text===undefined)throw new Error(`ARTICLE-LAYOUT-1: no copy string "${key}"`)
  const at=text.indexOf(`{${name}}`)
  return at<0?[text,'']:[text.slice(0,at),text.slice(at+name.length+2)]
}
/** The two accepted button labels ("Request a Quote | Contact us"). */
export const ctaButtons=():[string,string]=>{const [quote,contact]=articleCopy('cta.buttons').split(' | ');return [quote!,contact!]}

/** The article's one OGCS topic, or undefined (render nothing: a category is never invented). */
export function topicForPath(pathname:string):Topic|undefined{
  const slug=articleLayout.routes[pathname]
  return slug?topicBySlug.get(slug):undefined
}
/** CT ruling: the Thai-language route stays out of the English index; any other non-Latin (percent-encoded Thai) route likewise. */
export const isEnglishIndexRoute=(pathname:string):boolean=>!articleLayout.excludedFromEnglishIndex.includes(pathname)&&!/%e0%b[89a-f]/i.test(pathname)

// ---------------------------------------------------------------------------------------------------------------------
// Held index URL scheme. ONE switch: H2O_ARTICLE_INDEX_URLS=on turns topic chips into /tech-articles/topic/<slug>/ links and the
// grid into numbered pages (/tech-articles/page/<n>/). Default (off): one page with every card and a client-side topic filter,
// no new URLs. The routes themselves are NOT registered here; the SEO Checker rules on the scheme first.
export const articleIndexUrlsOn=(env:Record<string,string|undefined>=process.env):boolean=>env.H2O_ARTICLE_INDEX_URLS?.trim().toLowerCase()==='on'
export const INDEX_PATH='/tech-articles/'
export const PAGE_SIZE=12
export const topicHref=(slug:string|undefined,urls=articleIndexUrlsOn()):string=>!slug?INDEX_PATH:urls?`${INDEX_PATH}topic/${slug}/`:`${INDEX_PATH}#topic-${slug}`
export const pageHref=(page:number):string=>page<=1?INDEX_PATH:`${INDEX_PATH}page/${page}/`
export function paginate<T>(items:readonly T[],page:number,size=PAGE_SIZE):{items:T[];page:number;pages:number}{
  const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.min(Math.max(1,Math.floor(page)||1),pages)
  return {items:items.slice((current-1)*size,current*size),page:current,pages}
}
/** Pager entries: 1 … current±1 … last, with null as the ellipsis. */
export function pagerEntries(page:number,pages:number):Array<number|null>{
  const wanted=new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages))
  const out:Array<number|null>=[]
  let last=0
  for(const n of [...wanted].sort((a,b)=>a-b)){if(last&&n>last+1)out.push(null);out.push(n);last=n}
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Meta row.
/** Words ÷ 220, rounded up; undefined (hidden) under 3 minutes. */
export function readingMinutes(text:string):number|undefined{
  const words=text.trim().split(/\s+/).filter(Boolean).length
  const minutes=Math.ceil(words/220)
  return minutes>=3?minutes:undefined
}
export const wordCount=(text:string):number=>text.trim().split(/\s+/).filter(Boolean).length
/** `dateModified` from the article's own BlogPosting schema, as YYYY-MM-DD. */
export function articleModified(doc:SalmonDocument):string|undefined{
  for(const raw of doc.seo.schema){
    const found=/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(raw)
    if(found)return found[1]
  }
  return undefined
}
export const longDate=(isoDay:string):string=>new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})

// ---------------------------------------------------------------------------------------------------------------------
// Call to action copy group by topic (OGCS COPY_SLOTS).
export type CtaGroup='maintenance'|'components'|'design'|'news'|'default'
export function ctaGroup(slug:string|undefined):CtaGroup{
  switch(slug){
    case 'operation-maintenance':case 'repair-rebuild':return 'maintenance'
    case 'fans-drives-components':return 'components'
    case 'design-construction-materials':return 'design'
    case 'ics-news-projects':return 'news'
    default:return 'default'
  }
}
/** The inline CTA is for long articles only (about 1,200 words), and never for news posts. */
export const INLINE_CTA_MIN_WORDS=1200
export const wantsInlineCta=(words:number,group:CtaGroup):boolean=>words>INLINE_CTA_MIN_WORDS&&group!=='news'

// ---------------------------------------------------------------------------------------------------------------------
// Headings: ids, contents, and the split point for the inline CTA.
const textOf=(node:SalmonNode):string=>typeof node==='string'?node:node.children.map(textOf).join('')
export const slugify=(text:string):string=>text.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'section'
export type ArticleHeading={level:2|3;id:string;text:string;/** characters of article text before this heading */at:number}

/** A copy of the tree with an id on every h2/h3 that lacks one (existing ids are kept), plus the headings in document order. */
export function withHeadingIds(nodes:SalmonNode[],taken:Iterable<string>=[]):{nodes:SalmonNode[];headings:ArticleHeading[];chars:number}{
  const used=new Set<string>(taken)
  const headings:ArticleHeading[]=[]
  let offset=0
  const visit=(node:SalmonNode):SalmonNode=>{
    if(typeof node==='string'){offset+=node.length;return node}
    let attrs=node.attrs
    if(node.tag==='h2'||node.tag==='h3'){
      const text=textOf(node).replace(/\s+/g,' ').trim()
      let id=node.attrs.id
      if(!id){
        const base=slugify(text);id=base
        for(let n=2;used.has(id);n++)id=`${base}-${n}`
        attrs={...node.attrs,id}
      }
      used.add(id)
      if(text)headings.push({level:node.tag==='h2'?2:3,id,text,at:offset})
    }
    return attrs===node.attrs&&!node.children.length?node:{...node,attrs,children:node.children.map(visit)}
  }
  const out=nodes.map(visit)
  return {nodes:out,headings,chars:offset}
}
/** Existing ids anywhere in the tree, so generated ids never collide with them. */
export function existingIds(nodes:SalmonNode[]):string[]{
  const ids:string[]=[]
  const walk=(node:SalmonNode):void=>{if(typeof node==='string')return;if(node.attrs.id)ids.push(node.attrs.id);node.children.forEach(walk)}
  nodes.forEach(walk)
  return ids
}
/** The h2 nearest 40% of the article text, never the first heading; undefined when there is no suitable one. */
export function inlineCtaHeading(headings:ArticleHeading[],totalChars:number):ArticleHeading|undefined{
  const h2=headings.filter(heading=>heading.level===2).slice(1)
  if(!h2.length||totalChars<=0)return undefined
  const target=totalChars*0.4
  return h2.reduce((best,heading)=>Math.abs(heading.at-target)<Math.abs(best.at-target)?heading:best)
}
/**
 * Split the tree in two at the element with this id: `before` keeps everything ahead of it, `after` starts with it. Both halves
 * keep every node at its original index (what is cut becomes an empty string), so the render keys, the LCP image key and the
 * provenance paths are exactly those of the unsplit article. Ancestors of the cut appear in both halves.
 */
export function splitAtId(nodes:SalmonNode[],id:string):{before:SalmonNode[];after:SalmonNode[]}|undefined{
  const split=(list:SalmonNode[]):{before:SalmonNode[];after:SalmonNode[]}|undefined=>{
    for(let i=0;i<list.length;i++){
      const node=list[i]!
      if(typeof node==='string')continue
      if(node.attrs.id===id)return {before:list.map((n,at)=>at<i?n:''),after:list.map((n,at)=>at>=i?n:'')}
      const inner=split(node.children)
      if(inner)return {
        before:list.map((n,at)=>at<i?n:at===i?{...node,children:inner.before} as Element:''),
        after:list.map((n,at)=>at>i?n:at===i?{...node,children:inner.after} as Element:'')
      }
    }
    return undefined
  }
  return split(nodes)
}

// ---------------------------------------------------------------------------------------------------------------------
// Related articles: same topic first, then nearest by directory order (newest first), never the current one, never fewer than
// three when the directory has them.
export function relatedArticles<T extends {path:string}>(current:string,directory:readonly T[],count=3):T[]{
  const index=directory.findIndex(entry=>entry.path===current)
  const slug=articleLayout.routes[current]
  const others=directory.map((entry,at)=>({entry,at})).filter(({entry})=>entry.path!==current&&isEnglishIndexRoute(entry.path))
  const sameTopic=slug?others.filter(({entry})=>articleLayout.routes[entry.path]===slug):[]
  const rank=(list:typeof others)=>[...list].sort((a,b)=>Math.abs(a.at-index)-Math.abs(b.at-index)||a.at-b.at)
  const picked=rank(sameTopic).slice(0,count)
  if(picked.length<count){
    const have=new Set(picked.map(({entry})=>entry.path))
    for(const item of rank(others.filter(({entry})=>!have.has(entry.path)))){if(picked.length>=count)break;picked.push(item)}
  }
  return picked.map(({entry})=>entry)
}
