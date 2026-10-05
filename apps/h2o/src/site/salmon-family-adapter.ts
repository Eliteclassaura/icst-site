/**
 * TRANSITIONAL SOURCE ADAPTER — frozen Salmon JSON → `SalmonFamilyPageModel`.
 *
 * This is the only module that reads Salmon documents and the derived Salmon CSS map for the
 * family presentations. It exists until the runtime Factory's Payload adapter supplies the same
 * `SalmonFamilyPageModel` from Payload content; it is not a CMS and must not become one.
 *
 * Content (text, links, media) is taken from the hash-verified source document through the same
 * public corrections the generic renderer applies (`publicSourceString`, release-document link
 * adaptation). Presentation defaults (layout, type role, panel, overlay, button treatment) come
 * from `content/salmon/parity-css-backgrounds.json`, derived from Salmon's own Elementor CSS by
 * `release/salmon-parity/derive-css-media.mjs`.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {publicSourceString} from './public-text'
import {isPayloadContent,releaseLedger} from '../content/runtime-read'
import {MAIN_OWNED_PARTS_HERO_PATHS} from '../content/rfq-intent'
import {salmonDocument,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode} from './salmon'
import {activeProductRoutes} from './Wave3Products'
import {articleHeadingNodes} from './wave4'
import {applyProjectMedia} from './project-media'
import {backgroundOf,classList,containerChildren,elementId,elementKeys,embeddedIcon,findAll,findFirst,firstTag,hasClass,isContainer,isElement,localHref,sourceImage,widgetType,type SalmonElement,type SourceRef} from './salmon-source'
import {SALMON_FAMILY_CONTRACT,SALMON_FAMILY_CONTRACT_VERSION,type Align,type Block,type ButtonVariant,type ColorRole,type ContainerBlock,type ContainerLayout,type Device,type FrameStyle,type Icon,type MediaRef,type Overlay,type Panel,type ProductCardInput,type RichInline,type RichText,type SalmonFamily,type SalmonFamilyPageModel,type SectionModel,type SvgNode,type TextBlock,type TypeRole} from './salmon-family-model'

/* ---------------- family table (typed route configuration) ---------------- */
export type FamilyConfig={family:SalmonFamily;auditFamily:string;label:string}
const table:Array<[string[],FamilyConfig]>=[
  [['SALMON-pages-2651','SALMON-pages-2696','SALMON-pages-2712','SALMON-pages-2724','SALMON-pages-2730','SALMON-pages-2739','SALMON-pages-2746','SALMON-pages-2752','SALMON-pages-2762'],{family:'parts-landing',auditFamily:'PARTS_LANDING',label:'Salmon Parts landing'}],
  [['SALMON-pages-4140','SALMON-pages-2406'],{family:'parts-editorial',auditFamily:'PARTS_LANDING',label:'Salmon Parts editorial landing'}],
  [['SALMON-pages-2580','SALMON-pages-2507','SALMON-pages-2551','SALMON-pages-2534','SALMON-pages-2568'],{family:'component-class',auditFamily:'COMPONENT_CLASS',label:'Salmon component class'}],
  [['SALMON-pages-2106','SALMON-pages-2228','SALMON-pages-2081','SALMON-pages-2177','SALMON-pages-2042'],{family:'country-service',auditFamily:'COUNTRY_SERVICE',label:'Salmon country service'}],
  [['SALMON-pages-8','SALMON-pages-7'],{family:'company-capability',auditFamily:'COMPANY_CAPABILITY',label:'Salmon company capability'}],
  [['SALMON-pages-1722'],{family:'dry-soda',auditFamily:'SPECIALTY_SERVICE',label:'Salmon Dry Soda Blasting (owner-selected Salmon authority)'}],
  [['SALMON-pages-1353'],{family:'project-portfolio',auditFamily:'PROJECT_PORTFOLIO',label:'Salmon grouped photographic project portfolio'}],
  [['SALMON-pages-1931'],{family:'about',auditFamily:'ABOUT',label:'Salmon About ICS'}],
  [['SALMON-pages-3'],{family:'policy',auditFamily:'POLICY',label:'Salmon policy'}],
  [['SALMON-pages-5792'],{family:'testimonial',auditFamily:'TESTIMONIALS',label:'Salmon testimonial detail'}],
]
const byRoute=new Map(table.flatMap(([ids,config])=>ids.map(id=>[id,config] as const)))
/** The year a project's own staging record states ("Year: 2018"). */
const projectRecordYear=(projectPath:string):string|undefined=>{
  const route=salmonRoutes().find(candidate=>candidate.targetPath===projectPath)
  if(!route)return undefined
  const text=salmonDocument(route).children.map(salmonNodeText).join(' ').replace(/\s+/g,' ')
  return /Year\s*:?\s*(\d{4}(?:\s*-\s*\d{2,4})?)/.exec(text)?.[1]?.replace(/\s+/g,'')
}
const PROJECT_DETAIL:FamilyConfig={family:'project-detail',auditFamily:'PROJECT_DETAIL',label:'Salmon project detail'}
export const salmonFamilyFor=(doc:SalmonDocument):FamilyConfig|undefined=>{
  if(doc.type!=='pages'||!doc.routeId.startsWith('SALMON-pages-'))return undefined
  if(/^\/all-projects\/[^/]+\/$/.test(doc.targetPath))return PROJECT_DETAIL
  return byRoute.get(doc.routeId)
}
export const salmonFamilyRouteIds=():string[]=>[...byRoute.keys()]

/**
 * Component-defined CTA labels the owner classified as quote actions (CT R1.1 review, B): the ten
 * Parts landing / Parts index heroes. Exact label match only — no word-based rewrite of source text.
 */
export const OWNER_QUOTE_LABELS:ReadonlySet<string>=new Set(['contact us for a quote'])

/* ---------------- source exclusions (Control Tower R1 review, C1) ---------------- */
type Exclusion=SalmonFamilyPageModel['exclusions'][number]&{routeId:string}
/**
 * Source blocks withheld from public rendering and from the public model. The frozen source
 * document is untouched (provenance preserved); a Payload import must apply the same rule.
 * No replacement content is created.
 */
export const SOURCE_EXCLUSIONS:ReadonlyArray<Omit<Exclusion,'sourceKey'>>=[
  {routeId:'SALMON-pages-8',elementId:'11cbd29',reason:'UNSUPPORTED_THEME_TESTIMONIAL',ruling:'CT_R1_REVIEW_2026_09_29_C1: Hostinger AI-theme placeholder portraits and unattributed endorsements; not genuine customer testimony'},
  {routeId:'SALMON-pages-8',elementId:'f5dbc72',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_REVIEW_2026_09_29_C1: "Chemical Plants" card shows a server/electrical-cabinet corridor photograph; no approved mapping, card held'},
  {routeId:'SALMON-pages-8',elementId:'f3b2417',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_REVIEW_2026_09_29_C1: "Data Centers" label with a food-safety description over an industrial-pipework photograph; no approved mapping, card held'},
  {routeId:'SALMON-pages-8',elementId:'cacba3b',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_1_REVIEW_2026_09_29_A: "Manufacturing" card under Power Plants pairs a cooling-tower stock photograph with a factory-machinery project assertion; no approved mapping, card held'},
  {routeId:'SALMON-pages-7',elementId:'90732f5',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_1_REVIEW_2026_09_29_A: "Data Center" card pairs a cooling-tower landscape with server-context copy; no approved mapping, card held'},
  {routeId:'SALMON-pages-7',elementId:'9c34e97',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_1_REVIEW_2026_09_29_A: "Manufacturing" card pairs server/electrical-cabinet corridor imagery with manufacturing copy; no approved mapping, card held'},
  {routeId:'SALMON-pages-7',elementId:'4492d17',reason:'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING',ruling:'CT_R1_1_REVIEW_2026_09_29_A: second "Manufacturing" card pairs grain-storage imagery with food-production copy; no approved mapping, card held'},
]
const exclusionFor=(routeId:string,value:SalmonElement)=>{const id=elementId(value);return id?SOURCE_EXCLUSIONS.find(rule=>rule.routeId===routeId&&rule.elementId===id):undefined}

/* ---------------- Salmon CSS layout map ---------------- */
type SourceType={family?:'display'|'sans'|'mono';size?:number;weight?:number;color?:string;transform?:string}
type SourceLayout={direction?:'row'|'column';widthPct?:number;align?:Align;background?:string;backgroundGradient?:string;rounded?:boolean;radius?:number;overlay?:boolean;overlayOpacity?:number;overlayColor?:string;overlayGradient?:string;minHeight?:number;justify?:'end'|'center';selfType?:SourceType;titleType?:SourceType;textType?:SourceType;buttonType?:SourceType;buttonBackground?:string;iconBackground?:string;gridColumns?:number;gridTemplate?:string;imgWidth?:string;imgRadius?:string;mobileAlign?:Align}
let layoutCache:Record<string,{layout:Record<string,SourceLayout>}>|undefined
const sourceLayout=(routeId:string,key:string):SourceLayout=>{
  layoutCache??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/parity-css-backgrounds.json'),'utf8')) as {routes:typeof layoutCache}).routes
  return layoutCache?.[routeId]?.layout[key]??{}
}
const layoutOf=(routeId:string,node:SalmonElement):SourceLayout=>Object.assign({},...elementKeys(node).toReversed().map(key=>sourceLayout(routeId,key))) as SourceLayout

/** Source colour values reduced to bounded roles; no source hex reaches the presentation. */
export function colorRole(value:string|undefined):ColorRole|undefined{
  if(!value||value==='transparent')return undefined
  if(value==='white'||value==='ink')return value
  if(['primary','secondary','accent-blue'].includes(value))return 'blue'
  if(value==='muted'||value==='soft')return 'muted'
  const hex=value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/)?.[1]
  if(!hex)return undefined
  const [r,g,b]=[0,2,4].map(i=>Number.parseInt(hex.slice(i,i+2),16)/255)
  const max=Math.max(r,g,b),min=Math.min(r,g,b),light=(max+min)/2
  if(max-min>0.18&&b>=r&&b>=g)return 'blue'
  if(light>0.99)return 'white'
  if(light>0.8)return 'soft'
  if(light<0.3)return 'ink'
  return 'muted'
}
const typeRole=(role:SourceType|undefined,fallback:'display'|'sans',defaultColor=false):TypeRole=>{
  const family=role?.family==='display'?'display':role?.family==='sans'||role?.family==='mono'?'sans':fallback
  const color=colorRole(role?.color)
  return {family,...(role?.size?{sizePx:role.size}:{}),...(role?.weight?{weight:role.weight}:{}),...(color?{color}:defaultColor?{defaultColor:true}:{}),...(role?.transform==='uppercase'||role?.transform==='capitalize'?{transform:role.transform}:{})}
}
const alignOf=(layout:SourceLayout)=>({...(layout.align?{align:layout.align}:{}),...(layout.mobileAlign?{mobileAlign:layout.mobileAlign}:{})})
const panelOf=(layout:SourceLayout):Panel|undefined=>{
  if(layout.backgroundGradient)return [...layout.backgroundGradient.matchAll(/#[0-9a-f]{6}/g)].some(match=>colorRole(match[0])==='blue')?'blue-gradient':'dark'
  const role=colorRole(layout.background)
  return role==='blue'?'blue':role==='soft'?'soft':role==='white'?'white':role==='ink'?'dark':undefined
}
const overlayOf=(layout:SourceLayout):Overlay|undefined=>{
  if(!layout.overlay)return undefined
  // Effective shade = Elementor overlay opacity x the overlay colour's own alpha channel.
  const alpha=layout.overlayColor?.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/)?.[1]
  const opacity=Number(((layout.overlayOpacity??(layout.overlayGradient?0.6:1))*(alpha?Number.parseInt(alpha,16)/255:1)).toFixed(3))
  if(layout.overlayGradient){
    const stops=[...layout.overlayGradient.matchAll(/#([0-9a-f]{6})([0-9a-f]{2})?/gi)]
    const roles=stops.map(match=>colorRole(`#${match[1].toLowerCase()}`))
    // A blue gradient whose first stop is (near-)transparent fades into blue rather than tinting.
    const fades=stops.length>1&&stops[0][2]!==undefined&&Number.parseInt(stops[0][2],16)<64
    return {tone:roles.length&&roles.every(role=>role==='blue')?(fades?'blue-fade':'blue'):'fade',opacity}
  }
  const role=colorRole(layout.overlayColor)
  return {tone:role==='blue'?'blue':role==='white'||role==='soft'?'light':'dark',opacity}
}
const frameOf=(layout:SourceLayout):FrameStyle=>{
  const role=colorRole(layout.background)
  return {...(role==='soft'||role==='white'?{panel:'soft' as const}:role==='blue'?{panel:'blue' as const}:{}),...(layout.radius?{radiusPx:Math.min(layout.radius,92)}:{}),...(layout.widthPct&&layout.widthPct<100?{widthPct:layout.widthPct}:{})}
}
export function buttonVariantOf(layout:SourceLayout):ButtonVariant{
  const bg=layout.buttonBackground
  if(bg&&/^#ffffff[0-9a-f]{2}$/.test(bg)&&!bg.endsWith('ff'))return 'glass'
  if(colorRole(bg)==='white')return 'outline'
  if(!bg&&colorRole(layout.buttonType?.color)==='ink')return 'pill'
  return 'solid'
}

/* ---------------- content extraction ---------------- */
const RFQ_ONLY=/^(?:Buy|Order|Purchase) Now$/i
export function richText(ref:SourceRef,doc:SalmonDocument):RichText{
  const out:RichInline[]=[]
  const push=(span:RichInline)=>{
    const last=out.at(-1)
    if(last&&last.bold===span.bold&&last.italic===span.italic&&last.href===span.href)last.text+=span.text
    else out.push(span)
  }
  const visit=(node:SalmonNode,marks:{bold?:boolean;italic?:boolean;href?:string})=>{
    if(typeof node==='string'){const text=RFQ_ONLY.test(node.trim())?'Request a Quote':publicSourceString(doc,node);if(text)push({text,...marks});return}
    if(['script','style','svg','template','iframe','input','textarea','button'].includes(node.tag))return
    if(node.tag==='br'){push({text:'\n',...marks});return}
    const next={...marks}
    if(node.tag==='strong'||node.tag==='b')next.bold=true
    if(node.tag==='em'||node.tag==='i')next.italic=true
    if(node.tag==='a'){const href=localHref(node.attrs.href,doc);if(href)next.href=href}
    node.children.forEach(child=>visit(child,next))
  }
  ref.node.children.forEach(child=>visit(child,{}))
  // Collapse source indentation whitespace exactly as a browser would, per span.
  const collapsed=out.map(span=>({...span,text:span.text==='\n'?span.text:span.text.replace(/\s+/g,' ')}))
  if(collapsed[0])collapsed[0].text=collapsed[0].text.replace(/^ /,'')
  const tail=collapsed.at(-1);if(tail)tail.text=tail.text.replace(/ $/,'')
  return collapsed.filter(span=>span.text!=='')
}
const plain=(text:RichText):string=>text.map(span=>span.text).join('').trim()
function textBlocks(ref:SourceRef,doc:SalmonDocument):TextBlock[]{
  const blocks=findAll(ref,current=>/^(p|ul|ol|h[1-6]|table|blockquote)$/.test(current.node.tag))
  if(!blocks.length){const content=richText(ref,doc);return plain(content)?[{kind:'paragraph',content}]:[]}
  return blocks.flatMap((block):TextBlock[]=>{
    const tag=block.node.tag
    if(tag==='ul'||tag==='ol')return [{kind:tag==='ul'?'bullets':'numbered',items:findAll(block,current=>current.node.tag==='li').map(li=>richText(li,doc))}]
    if(tag==='table')return [{kind:'table',rows:findAll(block,current=>current.node.tag==='tr').map(row=>findAll(row,current=>/^t[hd]$/.test(current.node.tag)).map(cell=>richText(cell,doc)))}]
    if(tag==='blockquote')return [{kind:'quote',content:richText(block,doc)}]
    const content=richText(block,doc)
    if(!plain(content))return []
    if(/^h[1-6]$/.test(tag))return [{kind:'heading',level:Math.max(2,Number(tag[1])) as 2|3|4|5|6,content}]
    return [{kind:'paragraph',content}]
  })
}
const mediaOf=(doc:SalmonDocument,node:SalmonElement|undefined):MediaRef|undefined=>{
  const image=node?sourceImage(doc,node):undefined
  return image?{src:image.src,alt:image.alt,width:image.width,height:image.height,sha256:image.sha256,sourceUrl:image.sourceUrl}:undefined
}
const SVG_TAGS=new Set(['svg','path','circle','rect','g','polygon','polyline','line','ellipse'])
const SVG_ATTRS=new Set(['d','viewBox','width','height','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','cx','cy','r','rx','ry','x','y','x1','y1','x2','y2','points','transform','opacity','fill-opacity'])
const svgOf=(node:SalmonNode):SvgNode|null=>{
  if(!isElement(node)||!SVG_TAGS.has(node.tag))return null
  const attrs=Object.fromEntries(Object.entries(node.attrs).filter(([name,value])=>SVG_ATTRS.has(name)&&!/url\(|javascript:/i.test(value)))
  return {tag:node.tag,attrs,children:node.children.map(svgOf).filter((child):child is SvgNode=>child!==null)}
}
function iconOf(ref:SourceRef,layout:SourceLayout={}):Icon|undefined{
  const svg=findFirst(ref,current=>current.node.tag==='svg')
  if(!svg)return undefined
  const embedded=embeddedIcon(svg)
  if(embedded)return {kind:'image',media:{src:embedded.src,alt:'',width:22,height:15,sha256:embedded.sha256}}
  const tree=svgOf(svg.node)
  if(!tree)return undefined
  const name=classList(svg.node).find(value=>/^e-fa[srb]?-/.test(value))?.replace(/^e-fa[srb]?-/,'')
  return {kind:'svg',svg:tree,...(name?{name}:{}),...(colorRole(layout.iconBackground)==='blue'?{disc:true}:{})}
}
const headingLevel=(tag:string|undefined):1|2|3|4|5|6=>{const level=Number(tag?.[1]);return (level>=1&&level<=6?level:3) as 1|2|3|4|5|6}
const linkOf=(ref:SourceRef,doc:SalmonDocument)=>{const link=findFirst(ref,current=>current.node.tag==='a'&&!!current.node.attrs.href);return link?localHref(link.node.attrs.href,doc):undefined}

type AdaptContext={doc:SalmonDocument;productCards:boolean;excluded:SalmonFamilyPageModel['exclusions']}
function productCard(ref:SourceRef,ctx:AdaptContext):ProductCardInput{
  const {doc}=ctx
  const title=firstTag(ref,/^h[1-6]$/)
  const anchor=findFirst(ref,current=>current.node.tag==='a'&&/\/product\//.test(current.node.attrs.href??''))
  const href=localHref(anchor?.node.attrs.href,doc)
  const route=href?activeProductRoutes().find(candidate=>candidate.targetPath===href):undefined
  const detail=findAll(ref,current=>widgetType(current.node)==='text-editor').flatMap(text=>textBlocks(text,doc))
  const name=title?richText(title,doc):route?[{text:salmonDocument(route).seo.h1[0]??''}]:[]
  const media=mediaOf(doc,findFirst(ref,current=>current.node.tag==='img')?.node)
  return {key:ref.key,name,...(route?{productPath:route.targetPath,productRouteId:route.routeId}:{}),...(media?{media:{...media,alt:media.alt||plain(name)}}:{}),...(detail.length?{detail}:{})}
}
function widget(ref:SourceRef,ctx:AdaptContext):Block[]{
  const {doc}=ctx
  const layout=layoutOf(doc.routeId,ref.node)
  if(ctx.productCards&&hasClass(ref.node,'product'))return [{type:'productGrid',key:ref.key,products:[productCard(ref,ctx)],single:true}]
  switch(widgetType(ref.node)){
    case 'heading':{
      const heading=firstTag(ref,/^h[1-6]$/)
      if(!heading){
        // Elementor headings may use a p/span/div title tag: keep the text, not a false heading.
        const text=richText(ref,doc)
        return plain(text)?[{type:'text',key:ref.key,blocks:[{kind:'paragraph',content:text}],style:{...typeRole(layout.titleType??layout.selfType,'sans',true),...alignOf(layout)}}]:[]
      }
      const text=richText(heading,doc)
      return plain(text)?[{type:'heading',key:heading.key,level:Number(heading.node.tag[1]) as 1|2|3|4|5|6,text,...(heading.node.attrs.id?{anchorId:heading.node.attrs.id}:{}),style:{...typeRole(layout.titleType??layout.selfType,'sans',true),...alignOf(layout)}}]:[]
    }
    case 'text-editor':{
      const blocks=textBlocks(ref,doc)
      return blocks.length?[{type:'text',key:ref.key,blocks,style:{...typeRole(layout.selfType??layout.textType,'sans'),...alignOf(layout)}}]:[]
    }
    case 'button':{
      const label=salmonNodeText(ref.node).replace(/\s+/g,' ').trim()
      if(!label)return []
      const rfqOnly=RFQ_ONLY.test(label)
      const href=rfqOnly?'/contact-us/':localHref(firstTag(ref,/^a$/)?.node.attrs.href,doc)
      // A source "button" with no destination (e.g. a project year) is a tag, not an action.
      if(!href)return [{type:'label',key:ref.key,text:publicSourceString(doc,label),style:alignOf(layout)}]
      // An explicit quote request ("Request … Quote", "Get … Quote") aimed at Contact is a quote
      // action, as is the owner-classified Parts component CTA "Contact Us for a Quote" (exact
      // label). Every other "Contact …" label remains an ordinary Contact link.
      const toContact=/^\/contact-us\/?(?:[?#]|$)/.test(href)
      // Payload mode honours the import stamp. The import deliberately leaves the ten Main-owned Parts hero
      // actions unstamped (MAIN_OWNED_PARTS_HERO), so Main's exact-label owner rule applies to those ten paths only.
      const ownerPartsQuote=toContact&&OWNER_QUOTE_LABELS.has(label.toLowerCase())&&MAIN_OWNED_PARTS_HERO_PATHS.has(doc.targetPath)
      const quoteIntent=isPayloadContent()?firstTag(ref,/^a$/)?.node.attrs['data-rfq-intent']==='quote'||ownerPartsQuote:rfqOnly||(toContact&&(/^(?:request|get)\b.*\bquote\b/i.test(label)||OWNER_QUOTE_LABELS.has(label.toLowerCase())))
      return [{type:'button',key:ref.key,label:rfqOnly?'Request a Quote':publicSourceString(doc,label),...(href?{href}:{}),variant:buttonVariantOf(layout),...(rfqOnly?{rfqOnly:true}:{}),...(quoteIntent?{intent:'quote' as const}:{}),style:alignOf(layout)}]
    }
    case 'image':{
      const media=mediaOf(doc,findFirst(ref,current=>current.node.tag==='img')?.node)
      return media?[{type:'image',key:ref.key,media,style:{...alignOf(layout),...(layout.imgWidth?{width:layout.imgWidth}:{}),...(layout.imgRadius?{radius:layout.imgRadius}:{})}}]:[]
    }
    case 'icon-box':{
      const title=findFirst(ref,current=>/^h[1-6]$/.test(current.node.tag)),description=findFirst(ref,current=>current.node.tag==='p')
      const icon=iconOf(ref,layout),href=linkOf(ref,doc)
      return [{type:'iconCard',key:ref.key,...(icon?{icon}:{}),...(title?{title:richText(title,doc)}:{}),titleLevel:headingLevel(title?.node.tag),...(description?{text:richText(description,doc)}:{}),...(href?{href}:{}),side:classList(ref.node).some(name=>/elementor-position-(left|inline-start|right|inline-end)$/.test(name)),...(classList(ref.node).some(name=>/elementor-position-(block-end|bottom)$/.test(name))?{iconAfter:true}:{}),titleStyle:typeRole(layout.titleType,'sans'),textStyle:typeRole(layout.textType,'sans'),style:{...alignOf(layout),...frameOf(layout)}}]
    }
    case 'image-box':{
      const title=findFirst(ref,current=>/^h[1-6]$/.test(current.node.tag)),description=findFirst(ref,current=>current.node.tag==='p')
      const media=mediaOf(doc,findFirst(ref,current=>current.node.tag==='img')?.node),href=linkOf(ref,doc)
      return [{type:'imageCard',key:ref.key,...(media?{media}:{}),...(title?{title:richText(title,doc)}:{}),titleLevel:headingLevel(title?.node.tag),...(description?{text:richText(description,doc)}:{}),...(href?{href}:{}),titleStyle:typeRole(layout.titleType,'sans'),textStyle:typeRole(layout.textType,'sans'),style:{...alignOf(layout),...frameOf(layout),...(layout.imgWidth?{imageWidth:layout.imgWidth}:{}),...(layout.imgRadius?{imageRadius:layout.imgRadius}:{})}}]
    }
    case 'icon-list':return [{type:'list',key:ref.key,items:findAll(ref,current=>current.node.tag==='li').map(item=>{
      const text=findFirst(item,current=>hasClass(current.node,'elementor-icon-list-text'))
      const href=linkOf(item,doc),icon=iconOf(item)
      return {text:richText(text??item,doc).map(({href:_,...span})=>span),...(href?{href}:{}),...(icon?{icon}:{})}
    }),style:typeRole(layout.textType,'sans')}]
    case 'n-accordion':case 'nested-accordion':{
      const items=findAll(ref,current=>current.node.tag==='details')
      return [{type:'accordion',key:ref.key,items:items.map(item=>{
        const summary=findFirst(item,current=>current.node.tag==='summary')
        const answer=item.node.children.flatMap((child,i)=>isElement(child)&&child.tag!=='summary'?node({node:child,key:`${item.key}.${i}`},ctx):[])
        const title=summary?findFirst(summary,current=>hasClass(current.node,'e-n-accordion-item-title-text'))??summary:undefined
        return {question:title?salmonNodeText(title.node).replace(/\s+/g,' ').trim():'',answer}
      })}]
    }
    case 'menu-anchor':{const anchor=findFirst(ref,current=>!!current.node.attrs.id);return anchor?[{type:'anchor',key:ref.key,id:anchor.node.attrs.id}]:[]}
    case 'icon':{
      const link=findFirst(ref,current=>current.node.tag==='a'&&!!current.node.attrs.href),icon=iconOf(ref)
      const href=link?localHref(link.node.attrs.href,doc):undefined
      return [{type:'iconLink',key:ref.key,...(href?{href}:{}),label:link?.node.attrs['aria-label']||'Open',...(icon?{icon}:{})}]
    }
    case 'loop-grid':{
      // The source "Load More" control was a WordPress pagination script; every card is kept.
      const cards=findAll(ref,current=>hasClass(current.node,'product'))
      return [{type:'productGrid',key:ref.key,products:cards.map(card=>productCard(card,ctx))}]
    }
    case 'spacer':case 'divider':case 'shortcode':case 'html':return []
    default:{
      const blocks=textBlocks(ref,doc)
      return blocks.length?[{type:'text',key:ref.key,blocks,style:{family:'sans'}}]:[]
    }
  }
}
const readable=(ref:SourceRef):boolean=>findAll(ref,current=>/^(h[1-6]|p|li)$/.test(current.node.tag)&&!!salmonNodeText(current.node).trim()).length>0
const hiddenOn=(value:SalmonElement):Device[]=>(['desktop','tablet','mobile'] as const).filter(device=>hasClass(value,`elementor-hidden-${device}`))
const withVisibility=(blocks:Block[],value:SalmonElement):Block[]=>{const hide=hiddenOn(value);return hide.length?blocks.map(block=>({...block,hideOn:hide})):blocks}
function node(ref:SourceRef,ctx:AdaptContext):Block[]{
  const excluded=exclusionFor(ctx.doc.routeId,ref.node)
  if(excluded){ctx.excluded.push({elementId:excluded.elementId,sourceKey:ref.key,reason:excluded.reason,ruling:excluded.ruling});return []}
  if(isContainer(ref.node)){
    const block=container(ref,ctx)
    // A container emptied by an exclusion (and without its own media) is not rendered.
    return !block.children.length&&!block.background&&block.layout.panel===undefined&&containerChildren(ref).length?[]:withVisibility([block],ref.node)
  }
  if(widgetType(ref.node)||hasClass(ref.node,'product'))return withVisibility(widget(ref,ctx),ref.node)
  const inner=containerChildren(ref)
  if(inner.length)return inner.flatMap(child=>node(child,ctx))
  const blocks=salmonNodeText(ref.node).trim()?textBlocks(ref,ctx.doc):[]
  return blocks.length?[{type:'text',key:ref.key,blocks,style:{family:'sans'}}]:[]
}
function container(ref:SourceRef,ctx:AdaptContext):ContainerBlock{
  const {doc}=ctx
  const layout=layoutOf(doc.routeId,ref.node)
  const image=backgroundOf(doc.routeId,ref.node)
  const children=containerChildren(ref).flatMap(child=>node(child,ctx))
  const panel=panelOf(layout),overlay=overlayOf(layout)
  const template=layout.gridTemplate&&/^(?:[0-9.]+fr ?)+$/.test(layout.gridTemplate)?layout.gridTemplate:undefined
  const shape:ContainerLayout={direction:layout.gridColumns||template?'grid':layout.direction==='row'?'row':'column',...(layout.gridColumns?{gridColumns:layout.gridColumns}:{}),...(template?{gridTemplate:template}:{}),...(layout.widthPct&&layout.widthPct<100?{widthPct:layout.widthPct}:{}),...alignOf(layout),...(layout.justify?{justify:layout.justify}:{}),...(layout.rounded?{rounded:true}:{}),...(layout.radius?{radiusPx:Math.min(layout.radius,56)}:{}),...(image&&layout.minHeight?{minHeightPx:layout.minHeight}:{}),...(panel?{panel}:{}),...(overlay?{overlay}:{})}
  const background=image?{media:{src:image.src,alt:'',width:image.width,height:image.height,sha256:image.sha256,sourceUrl:image.sourceUrl},mode:readable(ref)?'photo' as const:children.length?'backdrop' as const:'image' as const,...(image.fit?{fit:image.fit}:{}),...(image.position?{position:image.position}:{})}:undefined
  const id=elementId(ref.node)
  return {type:'container',key:ref.key,...(id?{elementId:id}:{}),layout:shape,...(background?{background}:{}),children}
}

/* ---------------- accepted source adaptations per family ---------------- */
const ABOUT_REMOVED=/^((?:Industrial Cooling Solutions in Saudi Arabia)|(?:Saudi Arabia is ICS’s newest regional office)|(?:ICS is a registered company in the Kingdom of Saudi Arabia))/
/** The accepted About owner-geography filter, applied at node level (was `AuthorityEditorial`). */
function withoutHistoricalSaudiClaims(doc:SalmonDocument):SalmonDocument{
  const strip=(value:SalmonNode,topIndex:number):SalmonNode|null=>{
    if(typeof value==='string')return topIndex===13&&['USA','Thailand','Japan','Saudi Arabia'].includes(value.trim())?null:value
    if(/^(h[1-6]|p|li|a)$/.test(value.tag)&&ABOUT_REMOVED.test(salmonNodeText(value).trim()))return null
    return {...value,children:value.children.map(child=>strip(child,topIndex)).filter((child):child is SalmonNode=>child!==null)}
  }
  return {...doc,children:doc.children.map((value,i)=>strip(value,i)).filter((value):value is SalmonNode=>value!==null)}
}
type LedgerRow={path:string;routeId:string;state:string;export:boolean}
let ledgerRows:LedgerRow[]|undefined
export const publicProjectRows=():LedgerRow[]=>{
  const rows=isPayloadContent()?(releaseLedger() as {routes:LedgerRow[]}).routes:(ledgerRows??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:LedgerRow[]}).routes)
  return rows.filter(row=>row.state==='PUBLIC'&&row.export&&/^\/all-projects\/[^/]+\/$/.test(row.path))
}
/** Every portfolio card resolves to its public project detail (the current index's destinations). */
function withProjectDetailLinks(doc:SalmonDocument):SalmonDocument{
  if(isPayloadContent()){
    const current=new Set(publicProjectRows().map(row=>row.path))
    // The source portfolio uses /projects/<identity>/; accepted detail destinations use
    // /all-projects/<identity>/. Match that complete destination, never labels or partial slugs.
    const destination=(value:SalmonNode):string|undefined=>{
      if(typeof value==='string'||value.tag!=='a')return undefined
      const href=localHref(value.attrs.href,doc)
      const match=href?.match(/^\/(?:all-projects|projects)\/([^/?#]+)\/(?:[?#].*)?$/)
      return match?`/all-projects/${match[1]}/`:undefined
    }
    const destinations=(value:SalmonNode):Set<string>=>{
      const found=new Set<string>()
      const walk=(node:SalmonNode)=>{const target=destination(node);if(target)found.add(target);if(typeof node!=='string')node.children.forEach(walk)}
      walk(value)
      return found
    }
    const visit=(value:SalmonNode):SalmonNode|null=>{
      if(typeof value==='string')return value
      const identities=destinations(value)
      // A source card has sibling photo and description containers bearing the same exact
      // destination. Remove that card, not the enclosing geographic section or a text match.
      const card=isContainer(value)&&value.children.filter(child=>isElement(child)&&isContainer(child)).length>=2&&identities.size===1
      if(card&&![...identities].some(target=>current.has(target)))return null
      const target=destination(value)
      if(target&&!current.has(target))return null
      return {...value,attrs:target?{...value.attrs,href:target}:value.attrs,children:value.children.map(visit).filter((child):child is SalmonNode=>child!==null)}
    }
    return {...doc,children:doc.children.map(visit).filter((child):child is SalmonNode=>child!==null)}
  }
  const detail=(href:string|undefined)=>{if(!href)return undefined;const slug=href.replace(/[?#].*$/,'').split('/').filter(Boolean).at(-1);return publicProjectRows().find(row=>row.path===`/all-projects/${slug}/`)?.path}
  const visit=(value:SalmonNode):SalmonNode=>{
    if(typeof value==='string')return value
    const target=value.tag==='a'?detail(localHref(value.attrs.href,doc)):undefined
    return {...value,attrs:target?{...value.attrs,href:target}:value.attrs,children:value.children.map(visit)}
  }
  return {...doc,children:doc.children.map(visit)}
}
const sourceFor=(doc:SalmonDocument,family:SalmonFamily):SalmonDocument=>family==='about'?withoutHistoricalSaudiClaims(doc):family==='testimonial'?{...doc,children:articleHeadingNodes(doc.children)}:family==='project-portfolio'?withProjectDetailLinks(doc):doc

export const composedSectionRefs=(doc:SalmonDocument):Array<SourceRef&{index:number}>=>doc.children.flatMap((value,i)=>isElement(value)&&!value.attrs['data-restored-slot']&&(salmonNodeText(value).trim()||findAll({node:value as SalmonElement,key:`body.${i}`},ref=>ref.node.tag==='img').length||backgroundOf(doc.routeId,value as SalmonElement))?[{node:value as SalmonElement,key:`body.${i}`,index:i}]:[])
/** One source section as a model section (also used by the Parts index hero). */
export function adaptSection(doc:SalmonDocument,section:SourceRef,position:number,options:{productCards?:boolean;treatment?:SectionModel['treatment'];role?:SectionModel['role'];excluded?:SalmonFamilyPageModel['exclusions']}={}):SectionModel{
  const root=container(section,{doc,productCards:!!options.productCards,excluded:options.excluded??[]})
  const layout=layoutOf(doc.routeId,section.node)
  const tone=colorRole(layout.background)
  const treatment=options.treatment??(position===0?'hero':(root.background&&!layout.rounded)||root.layout.panel==='blue'?'band':'boxed')
  const id=elementId(section.node)
  return {key:section.key,index:position,...(id?{elementId:id}:{}),treatment,...(tone?{tone}:{}),...(options.role?{role:options.role}:{}),root}
}

const hasHeadingOne=(block:Block):boolean=>block.type==='heading'?block.level===1:block.type==='container'&&block.children.some(hasHeadingOne)
/** The transitional adapter's single output: the typed page model for one family route. */
export function salmonFamilyModel(doc:SalmonDocument,config:FamilyConfig):SalmonFamilyPageModel{
  const source=sourceFor(doc,config.family)
  const productCards=config.family==='parts-landing'||config.family==='parts-editorial'
  const excluded:SalmonFamilyPageModel['exclusions']=[]
  const refs=composedSectionRefs(source).filter(section=>{const rule=exclusionFor(doc.routeId,section.node);if(rule)excluded.push({elementId:rule.elementId,sourceKey:section.key,reason:rule.reason,ruling:rule.ruling});return !rule})
  const sections=refs.map((section,position)=>{
    const hasLoop=findAll(section,current=>widgetType(current.node)==='loop-grid').length>0
    return adaptSection(source,section,position,{productCards,excluded,treatment:position===0?'hero':hasLoop?'boxed':undefined,role:config.family==='parts-landing'&&position===refs.length-1&&position>1?'related-products':undefined})
  })
  const linked=new Set<string>()
  const collect=(block:Block)=>{if('href' in block&&block.href)linked.add(block.href);if(block.type==='container')block.children.forEach(collect);if(block.type==='heading'||block.type==='text')JSON.stringify(block).replace(/"href":"([^"]+)"/g,(_,href:string)=>{linked.add(href);return ''})}
  sections.forEach(section=>collect(section.root))
  const coverage=config.family==='project-portfolio'?publicProjectRows().filter(row=>!linked.has(row.path)).map(row=>{const route=salmonRoutes().find(candidate=>candidate.routeId===row.routeId)!;const project=salmonDocument(route);return {path:row.path,title:project.seo.h1[0]??project.title}}):undefined
  const model:SalmonFamilyPageModel={
    contract:SALMON_FAMILY_CONTRACT,contractVersion:SALMON_FAMILY_CONTRACT_VERSION,family:config.family,auditFamily:config.auditFamily,routeId:doc.routeId,path:doc.targetPath,
    source:{kind:'SALMON_TRANSITIONAL_JSON',sha256:doc.sourceIdentity.sha256},
    sections,
    exclusions:excluded,
    modules:{...(config.family==='company-capability'&&!sections.some(section=>hasHeadingOne(section.root))?{pageTitle:doc.seo.h1[0]??doc.title}:{}),...(config.family==='about'?{aboutPresence:true}:{}),...(coverage?{projectCoverage:coverage,projectDiscovery:true}:{}),...(config.family==='project-detail'?{projectNavigation:true}:{})},
  }
  // Design Fixes R1 A1: each project's own verified photo and record year (./project-media).
  return applyProjectMedia(model,projectRecordYear)
}
