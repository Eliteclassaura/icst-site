import {readFileSync} from 'node:fs'
import path from 'node:path'

/**
 * The owner-protected testimonial portraits, derived from the testimonial content (never typed): the home page's source sections the
 * owner authority replaces (content/luxury/client-review.json `testimonialOverride.sourceSections`) carry the Salmon portrait backgrounds
 * (Elementor elements); the stylesheets name each element's image. The portraits' URLs are never renamed or redirected (IMG-SEO-1.2).
 */
const read=<T>(file:string,app:string):T=>JSON.parse(readFileSync(path.join(app,file),'utf8')) as T
const STYLESHEETS=['src/app/(site)/salmon-parity.css','src/app/(site)/salmon-parity-overrides.css']

/** The image URLs the stylesheets give the testimonial source sections' elements (physical or descriptive form, as the sheets hold them). */
export function testimonialBackgroundUrls(app=process.cwd()):string[]{
  const authority=read<{testimonialOverride:{sourceSections:string[]}}>('content/luxury/client-review.json',app)
  const ledger=read<{routes:Array<{path:string;sourceFile:string}>}>('content/release/route-ledger.json',app)
  const home=ledger.routes.find(r=>r.path==='/')
  if(!home)throw new Error('home route missing from the ledger')
  const doc=read<{children:unknown[]}>(`content/salmon/${home.sourceFile}`,app)
  const ids=new Set<string>()
  const walk=(n:unknown)=>{
    if(!n||typeof n==='string')return
    const node=n as {attrs?:{class?:string};children?:unknown[]}
    for(const m of (node.attrs?.class??'').matchAll(/elementor-element-([0-9a-f]{7})\b/g))ids.add(m[1]!)
    for(const c of node.children??[])walk(c)
  }
  for(const section of authority.testimonialOverride.sourceSections){
    const index=Number(/^body\.(\d+)$/.exec(section)?.[1])
    if(Number.isInteger(index)&&doc.children[index])walk(doc.children[index])
  }
  const urls=new Set<string>()
  for(const sheet of STYLESHEETS){
    const css=readFileSync(path.join(app,sheet),'utf8')
    for(const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)){
      const selector=rule[1]!
      if(![...ids].some(id=>selector.includes(`elementor-element-${id}`)))continue
      for(const u of rule[2]!.matchAll(/url\("?(\/media\/[^")]+\.(?:png|jpe?g|webp|gif))"?\)/g))urls.add(u[1]!)
    }
  }
  return [...urls]
}
