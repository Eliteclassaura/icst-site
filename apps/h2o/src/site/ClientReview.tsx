import {readFileSync} from 'node:fs'
import path from 'node:path'
import {testimonials,TESTIMONIAL_AUTHORITY_ID} from './testimonials'

type RecoveredMedia={src:string;name:string;width:number;height:number;sha256:string}
type ClientReviewAuthority={hero:RecoveredMedia[];portraits:Array<RecoveredMedia&{person:string}>;socials:Array<{network:string;url:string}>;testimonialOverride:{sourceSections:string[];layoutNode:number;authorityId:string}}
export const clientReviewAuthority=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/client-review.json'),'utf8')) as ClientReviewAuthority
export const clientReviewTestimonials=testimonials.filter(r=>r.recordId.endsWith('-CAROUSEL'))
export function ClientTestimonials(){return <section className="client-testimonials" data-owner-override={TESTIMONIAL_AUTHORITY_ID} aria-label="Client testimonials">
 <h2>Client testimonials</h2>
 <div className="client-testimonial-grid">{clientReviewTestimonials.map(record=>{const portrait=clientReviewAuthority.portraits.find(p=>p.person===record.person);return <figure key={record.recordId} data-testimonial-record={record.recordId}>
  <blockquote>{record.quoteLines.map((line,i)=><p key={i}>{line}</p>)}</blockquote>
  <figcaption>{portrait?<img src={portrait.src} width={portrait.width} height={portrait.height} alt={record.person} loading="lazy"/>:null}<div><strong>{record.person}</strong><span>{record.company} / {record.title}</span></div></figcaption>
 </figure>})}</div>
</section>}
export function ClientSocialLinks(){return <nav className="client-socials" aria-label="Follow Us"><h2>Follow Us</h2><div>{clientReviewAuthority.socials.map(s=><a key={s.network} href={s.url} rel="noopener noreferrer" target="_blank">{s.network}<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></a>)}</div></nav>}
