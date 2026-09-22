import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {ClientTestimonials,clientReviewAuthority,clientReviewTestimonials} from '../ClientReview'
import {LuxuryFooter} from '../LuxuryShell'
import {SalmonCanonical} from '../SalmonCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'
describe('Bounded client-review source restoration',()=>{
 it('uses the six existing owner-authorized records without invented attribution',()=>{expect(clientReviewTestimonials.map(r=>r.person)).toEqual(['Sarah Mitchell','Daniel White','Sophia Martinez','Laura Bennett','Andrew Lewis','Michael Chen']);const html=renderToStaticMarkup(<ClientTestimonials/>);for(const r of clientReviewTestimonials){expect(html).toContain(r.recordId);expect(html).toContain(r.person)}expect(html).not.toMatch(/rating|star|schema.org\/Review/i)})
 it('preserves the nine recovered original binaries with historically verified identities',()=>{const rows=[...clientReviewAuthority.hero,...clientReviewAuthority.portraits];expect(rows).toHaveLength(9);for(const r of rows)expect(createHash('sha256').update(readFileSync(path.join(process.cwd(),'public',r.src))).digest('hex')).toBe(r.sha256)})
 it('renders exact country phones, flags and only recovered social destinations',()=>{const html=renderToStaticMarkup(<LuxuryFooter/>);for(const s of ['🇺🇸','🇯🇵','🇹🇭','+1-303-462-2000','+81-90-4204-6742','+662-661-7723'])expect(html).toContain(s);expect(html).not.toContain('+66-2-260-6598');expect(clientReviewAuthority.socials).toHaveLength(5);for(const s of clientReviewAuthority.socials)expect(html).toContain(s.url)})
 it('limits testimonial source presentation exceptions to the three replaced homepage sections',()=>{expect(clientReviewAuthority.testimonialOverride.sourceSections).toEqual(['body.13','body.15','body.17']);expect(clientReviewAuthority.testimonialOverride.layoutNode).toBe(209)})
 it('routes every product Buy Now presentation to RFQ without altering source records',()=>{for(const r of salmonRoutes().filter(r=>r.routeId.startsWith('SALMON-product-'))){const doc=salmonDocument(r),before=JSON.stringify(doc),html=renderToStaticMarkup(<SalmonCanonical doc={doc}/>);expect(html).not.toContain('Buy Now');expect(html).not.toMatch(/ href="https:\/\/salmon[^"]*\/contact-us\//);expect(JSON.stringify(doc)).toBe(before)}})
 it('uses the accepted rfq_page Typeform mount for the quote contact path',()=>{const formId=process.env.H2O_TYPEFORM_FORM_ID,origin=process.env.H2O_TYPEFORM_ORIGIN;process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com';try{const r=salmonRoutes().find(r=>r.targetPath==='/contact-us/')!;const html=renderToStaticMarkup(<SalmonCanonical doc={salmonDocument(r)}/>);expect(html).toContain('client-rfq');expect(html).toContain('https://form.typeform.com/to/F22cAgx3');expect(html).toContain('cta_placement=rfq_page');expect(html).not.toContain('<form')}finally{if(formId===undefined)delete process.env.H2O_TYPEFORM_FORM_ID;else process.env.H2O_TYPEFORM_FORM_ID=formId;if(origin===undefined)delete process.env.H2O_TYPEFORM_ORIGIN;else process.env.H2O_TYPEFORM_ORIGIN=origin}})
})
