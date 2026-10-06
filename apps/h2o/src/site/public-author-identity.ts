import type {SalmonDocument,SalmonNode} from './salmon'

/**
 * Public author identity (owner decision 2026-10-02, Control Tower ruling; supersedes the neutral "ICS Editorial
 * Team" fallback for public output). Tim Bozic is the site's author and /author/timbozic/ his canonical archive.
 *
 * Every author identity a public document carries resolves to him: JSON-LD Person/author entries that point at the
 * dummy author archive (/author/faizasyed-ai/), the retired address (/author/tbozic/) or the former "Rhonda Miller"
 * author (/author/altaf/, no public route; owner decision 2026-10-02), or that carry the neutral label, that name or
 * an email-shaped name (ADR-028 already removes the email itself). A retargeted Person carries no avatar image.
 * Author links and author meta follow.
 * The dummy identity never reaches public output. Applied at the public projection (`publicReleaseDocument`), so it
 * covers documents imported before this decision without a re-import. Route identity fields are never touched.
 */
export const PUBLIC_AUTHOR={name:'Tim Bozic',path:'/author/timbozic/'} as const
/**
 * R2.5 (CT ruling on the SEO pre-flight, 2026-10-05; OGCS claims sweep R1 CS153, CT accepted): the public author's
 * description. It replaces the imported author biography (and the "Meet Tim Bozic…" variant) on every Person node that is
 * the public author, on English and locale pages alike.
 */
export const PUBLIC_AUTHOR_DESCRIPTION='Tim Bozic is President of Industrial Cooling Solutions, with over two decades of experience in the industrial and manufacturing sectors. He leads ICS’s work in cooling tower engineering, construction, and upgrades for industrial clients in the USA and Asia.'
/** The import-time neutral label (`content/public-author.ts`), as stored in already-imported documents. */
const NEUTRAL_AUTHOR_LABEL='ICS Editorial Team'
const RETIRED_AUTHOR_PATH=/\/author\/(?:faizasyed-ai|tbozic|altaf)\//g
const RETIRED_AUTHOR_URL=/\/author\/(?:faizasyed-ai|tbozic|altaf)\//
const RETIRED_AUTHOR_NAMES=new Set(['Rhonda Miller'])
const EMAIL_SHAPE=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const AUTHOR_META=new Set(['author','article:author','twitter:data1'])

const retarget=(value:string):string=>value.replace(RETIRED_AUTHOR_PATH,PUBLIC_AUTHOR.path)
const anonymous=(value:string):boolean=>value===NEUTRAL_AUTHOR_LABEL||RETIRED_AUTHOR_NAMES.has(value.trim())||EMAIL_SHAPE.test(value.trim())
type Json=null|boolean|number|string|Json[]|{[key:string]:Json}
const isObject=(value:Json):value is {[key:string]:Json}=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)

function schemaValue(value:Json,inAuthor:boolean):Json{
  if(typeof value==='string')return inAuthor&&anonymous(value)?PUBLIC_AUTHOR.name:retarget(value)
  if(Array.isArray(value))return value.map(item=>schemaValue(item,inAuthor))
  if(!isObject(value))return value
  const person=value['@type']==='Person'||(Array.isArray(value['@type'])&&value['@type'].includes('Person'))
  const author=inAuthor||person
  const out:{[key:string]:Json}={}
  for(const [key,item] of Object.entries(value)){
    if(author&&key==='email')continue
    out[key]=schemaValue(item,author||key==='author')
  }
  if(person&&(typeof value.url==='string'&&RETIRED_AUTHOR_URL.test(value.url)||typeof value.name==='string'&&anonymous(value.name))){
    out.name=PUBLIC_AUTHOR.name
    delete out.image
    if(typeof out.url==='string')out.url=/^https?:\/\//.test(out.url)?new URL(PUBLIC_AUTHOR.path,out.url).href:PUBLIC_AUTHOR.path
  }
  // the public author's own Person node (with a description, or the graph node with an @id) carries the approved text
  const isPublicAuthor=person&&(out.name===PUBLIC_AUTHOR.name||typeof out.url==='string'&&out.url.endsWith(PUBLIC_AUTHOR.path)||typeof out['@id']==='string'&&out['@id'].endsWith(PUBLIC_AUTHOR.path))
  if(isPublicAuthor&&('description' in out||'@id' in out))out.description=PUBLIC_AUTHOR_DESCRIPTION
  return out
}

function node(value:SalmonNode):SalmonNode{
  if(typeof value==='string')return value
  const href=value.attrs.href
  return {...value,attrs:href?{...value.attrs,href:retarget(href)}:value.attrs,children:value.children.map(node)}
}

export function projectPublicAuthorIdentity(doc:SalmonDocument):SalmonDocument{
  return {
    ...doc,
    children:doc.children.map(node),
    seo:{
      ...doc.seo,
      meta:doc.seo.meta.map(meta=>AUTHOR_META.has(meta.name)&&anonymous(meta.value)?{...meta,value:PUBLIC_AUTHOR.name}:AUTHOR_META.has(meta.name)?{...meta,value:retarget(meta.value)}:meta),
      schema:doc.seo.schema.map(raw=>JSON.stringify(schemaValue(JSON.parse(raw) as Json,false))),
    },
  }
}
