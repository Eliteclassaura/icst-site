import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {salmonRoutes,salmonDocument,salmonNodeText,type SalmonNode} from '../salmon'
import {AuthorityEditorial} from '../AuthorityEditorial'
import {SalmonCanonical} from '../SalmonCanonical'
import {ProjectAuthorityIndex} from '../ProjectAuthorityIndex'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {commercialNavigation} from '../LuxuryShell'

const documentFor=(id:string)=>salmonDocument(salmonRoutes().find(row=>row.routeId===id)!)
describe('final polish authority and semantic safety',()=>{
  it('bounds the owner Precision override to its slot and preserves the original Figma binary',()=>{
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-48')}/> )
    expect(html.match(/data-precision-media="OWNER_OVERRIDE"/g)).toHaveLength(1)
    expect(html).toContain('/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg')
    const bytes=readFileSync(path.join(process.cwd(),'public/media/figma-home/21-1295-fcf10d82.png'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('f62d34f4682140c43b139496033912587283d692fe0568b61cb395cc8731b27f')
  })
  it('keeps source paragraphs except the owner-ruled Saudi office claims',()=>{
    for(const id of ['SALMON-pages-1931','SALMON-b2503fcd6ca86806']){
      const doc=documentFor(id),html=renderToStaticMarkup(<AuthorityEditorial doc={doc}/>),keys:string[]=[]
      const visit=(node:SalmonNode,key:string)=>{if(typeof node==='string')return;if(node.tag==='p'&&salmonNodeText(node).trim()&&!/^Saudi Arabia is ICS’s newest regional office|^ICS is a registered company in the Kingdom of Saudi Arabia/.test(salmonNodeText(node).trim()))keys.push(key);node.children.forEach((child,i)=>visit(child,`${key}.${i}`))}
      doc.children.forEach((node,i)=>visit(node,`body.${i}`))
      for(const key of keys)expect(html).toContain(`data-source-node="${key}"`)
    }
  })
  it('applies only the authorized current company-presence claims on About',()=>{
    const html=renderToStaticMarkup(<AuthorityEditorial doc={documentFor('SALMON-pages-1931')}/> )
    expect(html).toContain('main office in Lakewood, Colorado')
    expect(html).toContain('confirmed presence in Japan and Bangkok, Thailand')
    for(const stale of ['branch offices','the Philippines','Saudi Arabia','regional hub','rapid deployment across Asia','serves Japan, Korea, and China'])expect(html).not.toContain(stale)
  })
  it('places the existing RFQ mount after the Contact hero and renders exactly three authorized offices',()=>{
    const html=renderToStaticMarkup(<SalmonCanonical doc={documentFor('SALMON-pages-1891')}/> )
    const hero=html.match(/<section class="figma-contact-hero">([\s\S]*?)<\/section>/)?.[1]??''
    expect(hero).toContain('Contact Us')
    expect(hero).not.toContain('Request a Quote')
    expect(html).toContain('figma-contact-rfq')
    expect(html).toContain('figma-contact-action')
    const offices=html.match(/<div class="figma-contact-office-list">([\s\S]*?)<\/div>/)?.[1]??''
    expect(offices.match(/<address data-office=/g)).toHaveLength(3)
    for(const phone of ['tel:+13034622000','tel:+819042046742','tel:+6626617723'])expect(html).toContain(phone)
    expect(html).not.toContain('+66-2-260-6598')
  })
  it('uses only the 22 accepted project detail identities and source-backed excerpts without invented photography',()=>{
    const html=renderToStaticMarkup(<ProjectAuthorityIndex doc={documentFor('SALMON-pages-1353')}/> )
    expect(html.match(/data-project-source=/g)).toHaveLength(22)
    expect(html).not.toContain('<img')
    expect(html).toContain('The PTT Cracker Project in Rayong, Thailand, is a major petrochemical cooling infrastructure project completed in 2011 for TTCL Corp.')
    expect(html).toContain('href="/all-projects/kbr/"')
  })
  it('renders the counterflow source paragraphs in a block wrapper, not a nested paragraph',()=>{
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-1230')}/> )
    expect(html).toMatch(/<div[^>]+data-layout-node="114"/)
    expect(html).not.toMatch(/<p[^>]+data-layout-node="114"/)
    expect(html).toContain('Counterflow cooling towers move air vertically')
  })
  it('uses the owner-authorized About URL and keeps Tim out of primary navigation',()=>{
    expect(commercialNavigation).toContainEqual(['About','/about-ics-industrial-cooling-solutions/'])
    expect(commercialNavigation.flat()).not.toContain('/author/tbozic/')
    const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8'))
    const author=ledger.routes.find((row:{path:string})=>row.path==='/author/tbozic/')
    expect(author).toMatchObject({export:true,indexable:false,sitemap:false,searchable:false})
  })
})
