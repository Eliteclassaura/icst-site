import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {LuxuryHeader,LuxuryFooter,LuxurySearch} from '../LuxuryShell'
import {salmonDocument,salmonRoutes} from '../salmon'

describe('Canonical luxury presentation',()=>{
 it('limits dedicated layouts to nine approved canonical routes',()=>{expect(luxuryIds.size).toBe(9);expect(salmonRoutes().filter(r=>luxuryIds.has(r.routeId))).toHaveLength(9)})
 it('keeps model copy as source references, never independent rewritten text',()=>{for(const r of salmonRoutes().filter(r=>luxuryIds.has(r.routeId))){const m=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury',r.routeId.split('-').at(-1)+'.json'),'utf8'));expect(m.sourceId).toBe(r.routeId);expect(JSON.stringify(m)).not.toContain(salmonDocument(r).seo.h1[0])}})
 it('does not render review metadata or ecommerce actions',()=>{for(const r of salmonRoutes().filter(r=>luxuryIds.has(r.routeId))){const html=renderToStaticMarkup(<LuxuryCanonical doc={salmonDocument(r)}/>);expect(html).not.toMatch(/IMAGE NOT HELD|Design authority|Buy Now|add-to-cart=|href="\/checkout/);expect(html).toContain('Request a Quote')}})
 it('preserves authentic supplied asset bytes',()=>{const rows=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/media.json'),'utf8')) as {publicPath:string;sha256:string}[];expect(rows.length).toBeGreaterThan(25);for(const r of rows){expect(createHash('sha256').update(readFileSync(path.join(process.cwd(),'public',r.publicPath))).digest('hex')).toBe(r.sha256)}})
 it('wires header and footer navigation without placeholder targets',()=>{const html=renderToStaticMarkup(<><LuxuryHeader/><LuxuryFooter/></>);expect(html).not.toContain('href="#0"');expect(html).toContain('href="/all-projects/"');expect(html).toContain('href="/contact-us/"');expect(html).toContain('<summary')})
 it('uses an actual canonical GET search form',()=>{const html=renderToStaticMarkup(<LuxurySearch/>);expect(html).toContain('action="/search/"');expect(html).toContain('name="q"');expect(html).toContain('type="submit"')})
 it('keeps reconciliation redirects deterministic and outside disabled owner-mapping paths',()=>{const rows=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/reconciled-redirects.json'),'utf8')) as {source:string;destination:string;evidence:string}[];const active=new Set(salmonRoutes().map(r=>r.targetPath));expect(rows).toHaveLength(4);for(const r of rows){expect(active.has(r.destination)).toBe(true);expect(r.destination).not.toBe('/');expect(r.source).not.toBe('/about-ics-industrial-cooling-solutions/');expect(r.evidence).toContain('Observed source HTTP redirect')}})
})
