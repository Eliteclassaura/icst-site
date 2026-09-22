import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const app=path.resolve('apps/h2o')
const read=(relative)=>JSON.parse(readFileSync(path.join(app,relative),'utf8'))
const sha=(value)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')
const routes=read('content/salmon/active-routes.json')
const route=routes.find(row=>row.targetPath==='/')
if(!route||route.routeId!=='SALMON-pages-48')throw new Error('Unexpected home route')
const doc=read('content/salmon/'+route.file)
const model=read('content/luxury/48.json')
const review=read('content/luxury/client-review.json')
const contacts=read('content/salmon/OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21.json')
const testimonials=read('content/salmon/OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21.json')
const text=(node)=>typeof node==='string'?node:(node?.children??[]).map(text).join('')
const indexed=new Map()
const index=(node,key)=>{indexed.set(key,node);if(typeof node!=='string')node.children.forEach((child,i)=>index(child,`${key}.${i}`))}
doc.children.forEach((node,i)=>index(node,`body.${i}`))
const refs=[]
const modelText=(node)=>{
  if(node.id===review.testimonialOverride.layoutNode)return '[OWNER_TESTIMONIALS]'
  if(node.decor||node.tag==='img'||node.action==='search')return ''
  if(node.action==='rfq')return 'Request a Quote'
  if(node.slice){const raw=indexed.get(node.slice.ref);return typeof raw==='string'?raw.slice(node.slice.start,node.slice.end):''}
  if(node.ref){refs.push(node.ref);return text(indexed.get(node.ref))}
  if(node.refs){refs.push(...node.refs);return node.refs.map(key=>text(indexed.get(key))).join(' ')}
  return (node.children??[]).map(modelText).filter(Boolean).join(' ')
}
const orderedModelText=model.tree.map(modelText)
const headings=[]
const destinations=[]
const walk=(node)=>{if(typeof node==='string')return;if(/^h[1-6]$/.test(node.tag))headings.push({level:node.tag,text:text(node)});if(node.tag==='a'&&node.attrs.href)destinations.push(node.attrs.href);node.children.forEach(walk)}
doc.children.forEach(walk)
const schemaNormalized=doc.seo.schema.map(raw=>JSON.parse(raw))
const snapshot={
  route:route.targetPath,routeId:route.routeId,sourceSha256:route.sha256,
  orderedVisibleContentText:doc.text,
  orderedModelSectionText:orderedModelText,
  orderedHeadings:headings,
  title:doc.seo.title,
  metaDescription:doc.seo.meta.find(row=>row.name==='description')?.value,
  canonical:doc.seo.canonical,
  robots:'noindex,nofollow (optimized route metadata overrides source robots)',
  schemaNormalizedSha256:sha(schemaNormalized),
  internalDestinationSet:[...new Set(destinations.filter(value=>value.startsWith('/')||value.includes('h2ocooling.com')||value.includes('salmon-rhinoceros-754457.hostingersite.com')))].sort(),
  rfqMounts:['header_action','footer_rfq_band','mobile header_action','rfq_page on /contact-us/'],
  contactAuthoritySha256:sha(contacts),
  testimonialAuthoritySha256:sha(testimonials),
  testimonialNames:['Sarah Mitchell','Daniel White','Sophia Martinez','Laura Bennett','Andrew Lewis','Michael Chen'],
  socialAuthority:review.socials,
  acceptedHomepageMedia:review.hero,
  luxuryModelSha256:sha(readFileSync(path.join(app,'content/luxury/48.json'))),
  referencedSourceNodes:[...new Set(refs)].sort()
}
const out=process.argv[2]
if(out)writeFileSync(out,JSON.stringify(snapshot,null,2)+'\n')
else process.stdout.write(JSON.stringify(snapshot,null,2)+'\n')
