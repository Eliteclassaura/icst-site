import {readFileSync} from 'node:fs'
import {withImageUrls} from '../content/image-slugs'
import path from 'node:path'
import type {Block,MediaRef,SalmonFamilyPageModel} from './salmon-family-model'

/**
 * Project photos and years (Design Fixes R1 A1; h2o-corpus-asset-curator; content/projects/project-media.json).
 *
 * The held portfolio composition reused one photo for different projects (five pairs on the listing, and shared detail
 * heroes), and the listing year of EDC (2011) contradicted its own record (2018). Every project with a LIVE_CURRENT project
 * page now shows that page's own featured photo (verified local original; provenance and SHA-256 in the registry), on its
 * listing card and as its detail hero. Never another project's photo: a project without a verified own photo keeps
 * its current photo only when no other project uses it.
 * Card years follow the project's own record: the live record where it states a year, otherwise the staging record.
 */
type Registry={projects:Record<string,{media:MediaRef&{sha256:string;width:number;height:number};/** PROJ-IMG-1: the listing-card photo where it differs from the page photo (a 353 px live featured image beside a larger page photo). */card?:MediaRef&{sha256:string;width:number;height:number};/** PROJ-IMG-1.1: a small native-size photo shown centred in a soft frame, never scaled to fill. */framed?:boolean;year:string|null}>;
  /** Projects with no verified own photo whose held photos are unsafe as project evidence: shown without a photo. */
  withheld?:Record<string,{reason:string;withheldSha256:string[]}>;
  /** The listing hero: a held image (`replaces`, by SHA-256) shown instead as a project's own verified photo. */
  portfolioHero?:{replaces:string;project:string;reason:string}
  /** PROJECT-IMAGES-1 R2: a project page that also shows the photo gallery (with captions) of a historical page that now redirects to it. */
  projectGalleries?:Record<string,{reason:string;fromPage?:string;photos:Array<{src:string;width:number;height:number;alt:string;caption:string;sha256:string;sourceUrl?:string}>}>}
let cache:Registry|undefined
export const projectMediaRegistry=():Registry=>cache??=withImageUrls(JSON.parse(readFileSync(path.join(process.cwd(),'content/projects/project-media.json'),'utf8')) as Registry)

const PROJECT_PATH=/^\/all-projects\/[^/]+\/$/
/**
 * R2.3 (CT 2026-10-05): the images a page's head (social tags, structured data) may name follow the same rule as its body.
 * A photo the registry withholds is named nowhere; a project page names only its own verified photo, or none.
 */
export function projectHeadImagePolicy(pagePath:string,origin:string):(image:{url:string;width?:number;height?:number;type?:string;sha256?:string})=>{url:string;width?:number;height?:number;type?:string;sha256?:string}|null{
  const registry=projectMediaRegistry()
  const withheld=new Set(Object.values(registry.withheld??{}).flatMap(w=>w.withheldSha256))
  const own=PROJECT_PATH.test(pagePath)?registry.projects[pagePath]:undefined
  return image=>{
    if(image.sha256&&withheld.has(image.sha256))return null
    if(!PROJECT_PATH.test(pagePath))return image
    return own?{url:origin+own.media.src,width:own.media.width,height:own.media.height,type:'image/jpeg',sha256:own.media.sha256}:null
  }
}
/**
 * SEO-FIX-2 (SC-01; SEO Checker REPORT SC-01): a project page's own verified photo is its social image whether or not the imported
 * head carried an eligible one (EDC emitted none although its own photo renders). Returns the tags to add, or [] when the project has
 * no verified own photo (the standard head then falls back to the site default social image, never another project's photo).
 */
export function projectOwnSocialMeta(pagePath:string,origin:string):Array<{name:string;value:string}>{
  if(!PROJECT_PATH.test(pagePath))return []
  const registry=projectMediaRegistry()
  const own=registry.projects[pagePath]
  if(!own)return []
  const withheld=new Set(Object.values(registry.withheld??{}).flatMap(w=>w.withheldSha256))
  if(withheld.has(own.media.sha256))return []
  const url=origin+own.media.src
  const type=/\.png$/i.test(own.media.src)?'image/png':/\.webp$/i.test(own.media.src)?'image/webp':'image/jpeg'
  return [
    {name:'og:image',value:url},
    {name:'og:image:width',value:String(own.media.width)},
    {name:'og:image:height',value:String(own.media.height)},
    {name:'og:image:type',value:type},
    ...(own.media.alt?[{name:'og:image:alt',value:own.media.alt}]:[]),
    {name:'twitter:image',value:url},
  ]
}
const YEAR=/^\s*\d{4}(?:\s*-\s*\d{2,4})?\s*$/
const children=(block:Block):Block[]=>block.type==='container'?block.children:[]
const walk=(block:Block,visit:(block:Block)=>void):void=>{visit(block);children(block).forEach(child=>walk(child,visit))}
const buttonsIn=(block:Block):Array<Extract<Block,{type:'button'}>>=>{const out:Array<Extract<Block,{type:'button'}>>=[];walk(block,b=>{if(b.type==='button')out.push(b)});return out}
/** Project destinations a block links to (buttons, icon cards, icon links, image cards). */
const projectHrefsIn=(block:Block):string[]=>{const out:string[]=[];walk(block,b=>{const href=(b.type==='button'||b.type==='iconCard'||b.type==='iconLink'||b.type==='imageCard')?b.href:undefined;if(href&&PROJECT_PATH.test(href))out.push(href)});return out}
/** Native-size display: a photo smaller than its frame is never stretched past its own width. */
const media=(entry:Registry['projects'][string],part:'media'|'card'='media'):MediaRef=>{const m=part==='card'?entry.card??entry.media:entry.media;return {src:m.src,alt:m.alt,width:m.width,height:m.height,sha256:m.sha256,...(entry.framed?{framed:true}:{})}}

/** @param recordYear the year a project's own staging record states (used when the live record states none) */
export function applyProjectMedia(model:SalmonFamilyPageModel,recordYear:(projectPath:string)=>string|undefined=()=>undefined):SalmonFamilyPageModel{
  const registry=projectMediaRegistry().projects
  const withheld=projectMediaRegistry().withheld??{}
  const hero=projectMediaRegistry().portfolioHero
  if(model.family==='project-portfolio'&&hero&&registry[hero.project]){
    const own=registry[hero.project]!
    for(const section of model.sections)walk(section.root,block=>{
      if(block.type==='container'&&block.background?.media.sha256===hero.replaces)block.background={...block.background,media:media(own)}
    })
  }
  if(model.family==='project-portfolio'){
    for(const section of model.sections)walk(section.root,block=>{
      if(block.type!=='container'||!block.background)return
      const link=buttonsIn(block).find(button=>button.href&&PROJECT_PATH.test(button.href))
      if(!link?.href)return
      const entry=registry[link.href]
      if(entry)block.background={...block.background,media:media(entry,'card')}
      else if(withheld[link.href])delete block.background
      const year=entry?.year??recordYear(link.href)
      if(year&&YEAR.test(link.label))link.label=year
    })
    // Panel cards: a photo panel with no link of its own beside the card that links to one project (e.g. disaster recovery).
    for(const section of model.sections)walk(section.root,block=>{
      if(block.type!=='container')return
      for(const panel of block.children){
        if(panel.type!=='container'||!panel.background||projectHrefsIn(panel).length)continue
        const hrefs=[...new Set(block.children.filter(sibling=>sibling!==panel).flatMap(projectHrefsIn))]
        const entry=hrefs.length===1?registry[hrefs[0]!]:undefined
        if(entry)panel.background={...panel.background,media:media(entry,'card')}
        else if(hrefs.length===1&&withheld[hrefs[0]!])delete panel.background
      }
    })
  }
  if(model.family==='project-detail'&&withheld[model.path]&&!registry[model.path]){
    // No verified own photo: the detail page shows its text without the held hero image.
    let done=false
    for(const section of model.sections)walk(section.root,block=>{
      if(done||block.type!=='container')return
      const index=block.children.findIndex(child=>child.type==='image')
      if(index<0)return
      block.children.splice(index,1)
      done=true
    })
  }
  if(model.family==='project-detail'){
    const entry=registry[model.path]
    let done=false
    if(entry)for(const section of model.sections)walk(section.root,block=>{
      if(done||block.type!=='image')return
      done=true
      block.media=media(entry)
      if(entry.media.width<720&&!entry.framed)block.style={...block.style,width:`${entry.media.width}px`}
    })
  }
  return model
}

export const projectGalleryConfig=(pagePath:string)=>projectMediaRegistry().projectGalleries?.[pagePath]
