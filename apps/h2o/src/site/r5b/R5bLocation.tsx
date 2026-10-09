import {createElement,Fragment,type ReactNode} from 'react'
import {restoredSlotNodes} from '../RestoredSlot'
import {salmonMedia,salmonNodeText,type SalmonDocument,type SalmonNode} from '../salmon'
import {pageForSegments} from '../cohort'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {renderSalmonNode,SalmonSeo} from '../SalmonCanonical'
import {articleDisplayTitle} from '../wave4'
import {HOME_CRUMB} from '../breadcrumb-schema'
import {heroQuoteAction} from '../../content/rfq-controls'
import {contactOffices} from '../contact'
import {R4Img} from '../r4/R4System'
import {R4LauncherReveal} from '../r4/R4LauncherReveal'
import {r5bMedia} from './r5b-media'
import {PageFaq} from '../PageFaq'

/**
 * Design R5b location template (CT 2026-10-07; DD spec H2O_DESIGN_R5_SPEC_location-template.md). One template for the
 * LIVE-family location pages: it renders the page's EXISTING source text, in source order, mapping each source section onto an
 * R4 component by its heading pattern. Heading tags stay as they are; sections that do not exist are not drawn (no
 * placeholders). The page's own images stay at or below their rendered size; the hero is a verified LIVE original.
 */
type Tag='h1'|'h2'|'h3'|'p'|'li'|'a'|'img'
type Item={kind:Tag;key:string;node:Exclude<SalmonNode,string>;/** an H2 promoted to a card title (its paragraph is the next paragraph, wherever it sits) */promoted?:boolean}
type Card={h:Item;p?:Item}
type Section={h2:Item[];intro:Item[];cards:Card[];outro:Item[];imgs:Item[];links:Item[]}

/** The hero slot per location route (by public path: a route-id literal would make the route structural). */
/** The country pages that carry an office band (COUNTRY-PAGES-1.1 F4), by the contact authority's office key. */
const OFFICE_BANDS:Record<string,string>={'/cooling-tower-thailand/':'thailand','/thailand-cooling-tower/':'thailand','/cooling-tower-construction-repair-in-united-states/':'usa','/cooling-tower-japan/':'japan'}
export const r5bLocationHeroes:Record<string,string>={'/cooling-tower-construction-repair-in-united-states/':'loc.usa','/cooling-tower-construction-repair-in-singapore/':'loc.sg','/thailand-cooling-tower/':'loc.th','/cooling-tower-thailand/':'loc.th','/cooling-tower-japan/':'loc.jp','/cooling-tower-malaysia/':'loc.my'}

/** A hero title longer than this runs five lines at the full size: it takes the smaller one (COUNTRY-PAGES-1.1). */
export const LONG_TITLE=55
const OWN=new Set(['h1','h2','h3','p','li'])
function collect(node:SalmonNode,key:string,out:Item[]){
  if(typeof node==='string'||['script','style','svg'].includes(node.tag))return
  if(node.tag==='img'){out.push({kind:'img',key,node});return}
  if(node.tag==='a'&&node.attrs.href&&salmonNodeText(node).trim()){out.push({kind:'a',key,node});return}
  if(OWN.has(node.tag)){if(salmonNodeText(node).trim())out.push({kind:node.tag as Tag,key,node});return}
  // Template markup that holds text directly (a hero lead in a plain div) is a paragraph.
  if(node.children.some(c=>typeof c==='string'&&c.trim())){out.push({kind:'p',key,node});return}
  node.children.forEach((c,i)=>collect(c,key+'.'+i,out))
}
const parentKey=(key:string)=>key.slice(0,key.lastIndexOf('.'))

/**
 * COUNTRY-PAGES-1 (M3): Elementor pages whose cards carry H2 titles (three or more H2 + paragraph pairs under one container, not
 * the section's own heading) get card titles: the same words as H3, at the card-title size, so a narrow card never breaks a word.
 */
function promoteCardTitles(items:Item[]):Item[]{
  const prefix=(key:string)=>key.split('.').slice(0,3).join('.')
  const groups=new Map<string,number[]>()
  items.forEach((item,i)=>{if(item.kind==='h2'&&items[i+1]?.kind==='p')groups.set(prefix(item.key),[...(groups.get(prefix(item.key))??[]),i])})
  const promote=new Set([...groups.values()].filter(g=>g.length>=3).flat())
  return items.map((item,i)=>promote.has(i)?{...item,kind:'h3' as Tag,promoted:true,node:{...item.node,tag:'h3'}}:item)
}

function parse(rawItems:Item[]):Section{
  const items=promoteCardTitles(rawItems)
  const s:Section={h2:[],intro:[],cards:[],outro:[],imgs:[],links:[]}
  for(const item of items){
    if(item.kind==='img')s.imgs.push(item)
    else if(item.kind==='a')s.links.push(item)
    else if(item.kind==='h1')continue // the page's one H1 is the hero title (doc.seo.h1), not a second heading in the body
    else if(item.kind==='h2')s.h2.push(item)
    else if(item.kind==='h3')s.cards.push({h:item})
    else{
      const last=s.cards.at(-1)
      if(last&&!last.p&&(last.h.promoted||parentKey(last.h.key)===parentKey(item.key)))last.p=item
      else if(s.cards.length)s.outro.push(item)
      else s.intro.push(item)
    }
  }
  return s
}

export function R5bLocationPage({doc}:{doc:SalmonDocument}){
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const inner=(item:Item)=>item.node.children.map((c,i)=>renderSalmonNode(c,item.key+'.'+i,doc,true))
  const Text=({item,className,as}:{item:Item;className?:string;as?:string})=>createElement(/^h[1-6]$/.test(item.node.tag)?item.node.tag:as??item.node.tag,{className},inner(item))
  const quote=(key:string,label:string,variant:'white'|'blue')=><span className={`dr4-btn dr4-btn--${variant}`} key={key}>{heroQuoteAction(doc,key,label)}</span>
  const photo=(item:Item,className='dr4-photo dr4-photo--4x3')=><span className={`r5b-photo ${className}`}>{renderSalmonNode(item.node,item.key,doc,true)}</span>

  const top:Section[]=[]
  if(doc.routeId.startsWith('LIVE-')){
    const body=doc.children[1]
    if(body&&typeof body!=='string')body.children.forEach((c,i)=>{const items:Item[]=[];collect(c,'body.1.'+i,items);if(items.length)top.push(parse(items))})
  }else{
    // COUNTRY-PAGES-1 (F1): an imported Elementor page: each top-level container is a section; restored sections are placed by the template
    doc.children.forEach((c,i)=>{if(typeof c==='string'||c.attrs?.['data-restored-slot'])return;const items:Item[]=[];collect(c,'body.'+i,items);if(items.length)top.push(parse(items))})
  }
  // A section that is only a heading takes the next section's content (Elementor splits a heading from its cards); a section that
  // is only an image hands the image to the next section (it sits beside that section's heading, never alone in a row).
  // The identity of an image is its held bytes (SHA-256 of the media identity), else its file name without the size suffix.
  const stem=(i:Item)=>{const src=i.node.attrs.src||i.node.attrs['data-src']||'';return salmonMedia(src,doc.sourceUrl)?.sha256??src.split('/').pop()!.replace(/-\d+x\d+(?=\.)/,'').toLowerCase()}
  const sections:Section[]=[]
  let carry:Item[]=[]
  for(let i=0;i<top.length;i++){
    let s=top[i]!
    if(carry.length){s={...s,imgs:[...carry,...s.imgs]};carry=[]}
    if(s.imgs.length&&!s.h2.length&&!s.intro.length&&!s.cards.length&&!s.links.length&&top[i+1]){carry=s.imgs;continue}
    if(i>0&&s.h2.length&&!s.intro.length&&!s.cards.length&&!s.imgs.length&&!s.links.length&&top[i+1]){const n=top[i+1]!;sections.push({...n,h2:[...s.h2,...n.h2]});i++}
    else sections.push(s)
  }
  // No photo repeats on a page (DD R4 rule): each distinct source image is used once, in render order; later slots are text-only.
  const seen=new Set<string>()
  for(const s of sections)s.imgs=s.imgs.filter(i=>{const k=stem(i);if(seen.has(k))return false;seen.add(k);return true})
  // A page with only one or two distinct body images (Singapore, legacy Thailand: frames of one site) shows the first only; the
  // later slots stay text-only rather than echoing the same site (DD R5b review M3/P1).
  if(sections.reduce((n,s)=>n+s.imgs.length,0)<=2){let kept=false;for(const s of sections){if(s.imgs.length&&kept)s.imgs=[];if(s.imgs.length)kept=true}}
  const [hero,...rest]=sections
  const heroSlot=r5bLocationHeroes[doc.targetPath]
  const title=articleDisplayTitle(doc.seo.h1[0]||doc.title)
  const heading=(s:Section)=>s.h2.map(h=><Text key={h.key} item={h} className="dr4-h2"/>)
  const cardList=(s:Section,ordered:boolean)=>ordered
    ?<ol className="dr4-steps">{s.cards.map((c,i)=><li key={c.h.key} className="dr4-step"><span className="dr4-step-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div className="dr4-step-text"><Text item={c.h} className="dr4-card-title"/>{c.p?<Text item={c.p} className="dr4-card-body"/>:null}</div></li>)}</ol>
    :null
  const cardGrid=(s:Section,columns:2|3)=><ol className={`dr4-cards dr4-cards--${columns}`}>{s.cards.map((c,i)=><li key={c.h.key} className="dr4-card"><span className="dr4-badge" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><Text item={c.h} className="dr4-card-title"/>{c.p?<Text item={c.p} className="dr4-card-body"/>:null}</li>)}</ol>
  const prose=(items:Item[])=>items.length?<div className="dr4-prose">{items.map(p=><Text key={p.key} item={p}/>)}</div>:null
  const actions=(s:Section,variant:'white'|'blue')=>s.links.length?<div className="dr4-actions">{s.links.map(l=>quote(l.key,salmonNodeText(l.node).replace(/\s+/g,' ').trim(),variant))}</div>:null

  // COUNTRY-PAGES-1 (M5): a section restored at the end of the page (Malaysia: the Petronas RAPID featured project) is a normal section of the
  // template, placed before the closing call to action; its heading, paragraphs and highlight cards take the template's own styles.
  const featured=(()=>{const items:Item[]=[];restoredSlotNodes(doc,'body-end').forEach((n,i)=>collect(n,`restored.body-end.${i}`,items));return items.length?parse(items):null})()
  // A short intro line that ends in a colon ("Key Highlights of the Project:") is the label of what follows: the template's small-label style
  const isLabel=(p:Item)=>{const t=salmonNodeText(p.node).replace(/\s+/g,' ').trim();return t.length<=60&&t.endsWith(':')}
  const featuredIntro=(items:Item[])=>items.length?<div className="dr4-prose">{items.map(p=>isLabel(p)?<Text key={p.key} item={p} className="r5b-kicker" as="p"/>:<Text key={p.key} item={p}/>)}</div>:null
  // COUNTRY-PAGES-1.1 (F4): the office band on the Thailand, United States and Japan pages: the owner contact authority's own address and number, nothing new.
  const officeKey=OFFICE_BANDS[doc.targetPath]
  const office=officeKey?contactOffices.find(o=>o.officeKey===officeKey):undefined
  const officeLines=office?[...office.addressLines,[office.city,office.region,office.postalCode].filter(Boolean).join(' ').replace(/^(\S+) (\S+) (\d+)$/,'$1, $2 $3')].filter(Boolean):[]
  const officeBand=office?<section key="office" className="dr4-section r5b-office" aria-labelledby="r5b-office-title">
    <h2 className="dr4-h2" id="r5b-office-title">{officeLines.length?`Our ${office.countryName==='USA'?'U.S.':office.countryName} office`:`Call our ${office.countryName} team`}</h2>
    <div className="dr4-card r5b-office-card">
      {officeLines.length?<address className="r5b-office-address">{office.company?<span>{office.company}</span>:null}{officeLines.map(line=><span key={line}>{line}</span>)}<span>{office.countryName}</span></address>:null}
      <a className="r5b-office-phone" href={office.telephoneHref}>{office.telephoneDisplay}</a>
      <div className="dr4-actions">{quote('office-quote','Request a Quote','blue')}</div>
    </div>
  </section>:null
  const featuredSection=featured?<section key="featured" className="dr4-section r5b-featured">{heading(featured)}{featuredIntro(featured.intro)}{featured.cards.length?cardGrid(featured,featured.cards.length===3?3:2):null}{prose(featured.outro)}</section>:null

  function render(s:Section,index:number):ReactNode{
    const headText=s.h2.map(h=>salmonNodeText(h.node)).join(' ')
    const closing=index===rest.length-1&&!s.cards.length&&!s.imgs.length&&s.links.length>0
    if(closing)return <Fragment key={index}>{featuredSection}{officeBand}<PageFaq path={doc.targetPath}/><section className="dr4-section r5b-closing"><div className="dr4-navy r5b-closing-panel">{s.h2.map(h=><Text key={h.key} item={h} className="dr4-h2 dr4-h2--on-navy"/>)}{s.intro.length?<div className="dr4-prose dr4-prose--on-navy">{s.intro.map(p=><Text key={p.key} item={p}/>)}</div>:null}{actions(s,'white')}</div></section></Fragment>
    const img=s.imgs[0]
    const process=/process|how we|how ics/i.test(headText)&&s.cards.length>=3
    const reasons=/why|trust|stand out/i.test(headText)&&s.cards.length>=2
    const consider=/consider|look for|what to/i.test(headText)&&s.cards.length>=2
    const quality=/quality|sustainab|commitment/i.test(headText)&&s.cards.length>=2
    let main:ReactNode
    if(process)main=<>{cardList(s,true)}{prose(s.outro)}</>
    else if(consider)main=cardGrid(s,2)
    else if(quality)main=cardGrid(s,s.cards.length===3?3:2)
    else if(reasons||s.cards.length)main=cardGrid(s,s.cards.length===3?3:2)
    else main=null
    const text=<>{heading(s)}{prose(s.intro)}</>
    const tail=actions(s,'blue')
    // A photo-led section with no cards is a split; with a process the photo sits beside the steps; with a card grid it leads the section.
    if(img&&!s.cards.length)return <section key={index} className="dr4-section"><div className={`dr4-split${index%2?' dr4-split--reverse':''}`}><div className="dr4-split-media">{photo(img)}</div><div className="dr4-split-text">{text}{tail}</div></div></section>
    if(img&&process)return <section key={index} className="dr4-section"><div className={`dr4-split${index%2?' dr4-split--reverse':''}`}><div className="dr4-split-media">{photo(img,'dr4-photo dr4-photo--4x5')}</div><div className="dr4-split-text">{text}{main}{tail}</div></div></section>
    // COUNTRY-PAGES-1.1: a photo whose neighbouring text column would be empty (the heading belongs to the section before) shares the row with the cards instead of leaving the column blank
    if(img&&!s.h2.length&&!s.intro.length&&main)return <section key={index} className="dr4-section"><div className={`dr4-split${index%2?' dr4-split--reverse':''} r5b-split-cards`}><div className="dr4-split-media">{photo(img)}</div><div className="dr4-split-text">{main}{tail}</div></div></section>
    if(img)return <section key={index} className="dr4-section"><div className="dr4-split"><div className="dr4-split-media">{photo(img)}</div><div className="dr4-split-text">{text}</div></div>{main}{tail}</section>
    return <section key={index} className="dr4-section">{text}{main}{tail}</section>
  }
  const heroLead=hero?hero.h2.filter(h=>salmonNodeText(h.node).trim()):[]

  return <div className="luxury-site figma-wave4 r5b-location" data-r4-route={doc.targetPath} data-live-english={doc.routeId} data-salmon-document={doc.routeId} data-source-rest-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB]}/>
    <LuxuryHeader page={page} routePath={doc.targetPath}/>
    {/* DD-FIX-1 F1: the R4 content container wraps the page content only, so the header and footer keep the full-width site container */}
    <div className="dr4"><main id="main" className="wave4-detail r5b-location-main">
      {heroSlot?<section className="dr4-hero dr4-hero--photo" aria-labelledby="r4-hero-title">
        <R4Img media={r5bMedia(heroSlot)} slot={heroSlot} eager className="dr4-hero-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/>
        <div className="dr4-hero-body">
          <h1 className={`dr4-hero-title${title.length>LONG_TITLE?' dr4-hero-title--long':''}`} id="r4-hero-title">{title}</h1>
          {heroLead.map(h=><Text key={h.key} item={h} className="dr4-hero-lead"/>)}
          {hero?.intro.map(p=><Text key={p.key} item={p} className="dr4-hero-lead"/>)}
          <div className="dr4-actions">{quote('hero-primary','Request a Quote','white')}</div>
        </div>
      </section>:null}
      {rest.map(render)}
      {!(rest.length&&rest.at(-1)!.links.length&&!rest.at(-1)!.cards.length&&!rest.at(-1)!.imgs.length)?<>{featuredSection}{officeBand}<PageFaq path={doc.targetPath}/></>:null}
      <R4LauncherReveal/>
    </main></div>
    <LuxuryFooter page={page} routePath={doc.targetPath}/>
  </div>
}
