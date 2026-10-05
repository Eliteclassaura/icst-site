import type {SalmonDocument,SalmonNode} from './salmon'

/**
 * Presentation-level text repair (Control Tower SEO parity follow-up R1, Part 2). The hash-verified source JSON is never
 * rewritten: documents are repaired after the identity check, at load, so every template, listing and metadata path sees
 * the same text.
 *
 * - Entities: WordPress stores some names already escaped ("&amp;", "&#8211;"); decode until stable so React escapes once.
 * - Mojibake: some held text is UTF-8 that was mis-decoded as Latin-1 ("itâ\u0080\u0099s", "40Â°C"). A run of
 *   characters is restored only when its code units form exactly one valid UTF-8 sequence, so ordinary accented text
 *   ("café", Vietnamese "đây") is never touched. URLs, media paths and schema identifiers are left alone.
 * - Alt text: an image with an empty alt takes its held alt (live, then media library or caption). The primary image of an
 *   article or product (its first image) with no held text takes the article or product title. Every other image with no
 *   held text keeps alt="" (decorative, or awaiting an editorial alt; nothing is invented).
 */
const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',prime:'′',Prime:'″'}
export function decodeEntities(value:string):string{
  let current=value
  for(let i=0;i<4;i++){
    const next=current.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,(entity,body:string)=>body[0]==='#'?String.fromCodePoint(body[1]==='x'||body[1]==='X'?parseInt(body.slice(2),16):Number(body.slice(1))):ENTITIES[body]??entity)
    if(next===current)break
    current=next
  }
  return current
}

const MOJIBAKE=/[Â-ß][\u0080-¿]|[à-ï][\u0080-¿]{2}|[ð-ô][\u0080-¿]{3}/g
const strictUtf8=new TextDecoder('utf-8',{fatal:true})
export function repairMojibake(value:string):string{
  if(!/[Â-ô][\u0080-¿]/.test(value))return value
  return value.replace(MOJIBAKE,run=>{try{return strictUtf8.decode(Uint8Array.from(run,c=>c.charCodeAt(0)))}catch{return run}})
}

/** Attributes that carry reader-facing text (everything else — href, src, srcset, data-*, class — is left as held). */
const TEXT_ATTRS=new Set(['alt','title','aria-label','placeholder','content'])
const looksLikeUrl=(value:string)=>/^(?:https?:|\/|#|mailto:|tel:)/i.test(value)

export type HeldAlt=(source:string)=>string|undefined
function repairNode(node:SalmonNode,heldAlt:HeldAlt):SalmonNode{
  if(typeof node==='string')return repairMojibake(node)
  let attrs=node.attrs
  for(const [name,value] of Object.entries(node.attrs)){
    if(TEXT_ATTRS.has(name)&&typeof value==='string'&&!looksLikeUrl(value)){
      const fixed=repairMojibake(value)
      if(fixed!==value)attrs={...attrs,[name]:fixed}
    }
  }
  if(node.tag==='img'&&!(attrs.alt??'').trim()){
    const held=heldAlt(attrs['data-src']||attrs.src||'')
    if(held)attrs={...attrs,alt:held}
  }
  const children=node.children.map(child=>repairNode(child,heldAlt))
  return attrs===node.attrs&&children.every((child,i)=>child===node.children[i])?node:{...node,attrs,children}
}
function repairSchemaValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(repairSchemaValue)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,repairSchemaValue(v)]))
  return typeof value==='string'&&!looksLikeUrl(value)?repairMojibake(value):value
}
const repairSchema=(raw:string):string=>{
  if(!/[Â-ô][\u0080-¿]/.test(raw))return raw
  try{return JSON.stringify(repairSchemaValue(JSON.parse(raw)))}catch{return raw}
}

/** Give the first image with an empty alt the primary name (article or product title). */
function namePrimaryImage(nodes:SalmonNode[],name:string):SalmonNode[]{
  let done=false
  const visit=(node:SalmonNode):SalmonNode=>{
    if(done||typeof node==='string')return node
    if(node.tag==='img'){done=true;return (node.attrs.alt??'').trim()?node:{...node,attrs:{...node.attrs,alt:name}}}
    const children=node.children.map(visit)
    return children.every((child,i)=>child===node.children[i])?node:{...node,children}
  }
  return nodes.map(visit)
}
const PRIMARY_IMAGE_TYPES=new Set(['posts','product'])
/** The repaired view of a held document: same identity and structure; only reader-facing text changes. */
export function repairDocumentText(doc:SalmonDocument,heldAlt:HeldAlt=()=>undefined):SalmonDocument{
  const primaryName=PRIMARY_IMAGE_TYPES.has(doc.type)?repairMojibake(decodeEntities(doc.seo.h1[0]||doc.title)).replace(/\s+/g,' ').trim():''
  const children=doc.children.map(child=>repairNode(child,heldAlt))
  return {
    ...doc,
    title:repairMojibake(doc.title),
    text:repairMojibake(doc.text),
    children:primaryName?namePrimaryImage(children,primaryName):children,
    chrome:doc.chrome?.map(region=>({...region,text:repairMojibake(region.text),tree:repairNode(region.tree,heldAlt)})),
    seo:{
      ...doc.seo,
      title:repairMojibake(doc.seo.title),
      h1:doc.seo.h1.map(repairMojibake),
      meta:doc.seo.meta.map(meta=>looksLikeUrl(meta.value)?meta:{...meta,value:repairMojibake(meta.value)}),
      schema:doc.seo.schema.map(repairSchema),
    },
    images:doc.images?.map((image,i)=>image.alt?{...image,alt:repairMojibake(image.alt)}:{...image,alt:heldAlt(image.src)??(i===0&&primaryName?primaryName:image.alt)}),
  }
}
