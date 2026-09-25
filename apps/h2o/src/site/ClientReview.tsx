import {readFileSync} from 'node:fs'
import path from 'node:path'
import {testimonials,TESTIMONIAL_AUTHORITY_ID} from './testimonials'

type RecoveredMedia={src:string;name:string;width:number;height:number;sha256:string}
type ClientReviewAuthority={hero:RecoveredMedia[];portraits:Array<RecoveredMedia&{person:string}>;socials:Array<{network:string;url:string}>;testimonialOverride:{sourceSections:string[];layoutNode:number;authorityId:string}}
export const clientReviewAuthority=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/client-review.json'),'utf8')) as ClientReviewAuthority
export const clientReviewTestimonials=testimonials.filter(r=>r.recordId.endsWith('-CAROUSEL'))
export const figmaFeaturedTestimonials=testimonials.filter(r=>r.recordId.endsWith('-FEATURED'))
export const figmaTestimonialMedia={
 'Sarah Mitchell':{src:'/media/figma-testimonials/4dd64efea521919a-sarah-mitchell.png',width:1200,height:1200,sha256:'4dd64efea521919a4d886c9c3bd7391768e01631bf4bbde1a56dfc7d553b356e',lines:['Thanks to ICS ','Industrial Cooling ','Solutions']},
 'Daniel White':{src:'/media/figma-testimonials/f9d7170ef3523347-daniel-white.png',width:2731,height:4096,sha256:'f9d7170ef3523347deac591ac836c7a511adbdda9ad1cf36f282eb629d732f08',lines:['From initial design ','to successful ','project completion']},
 'Sophia Martinez':{src:'/media/figma-testimonials/2042b97216629ffe-sophia-martinez.png',width:800,height:800,sha256:'2042b97216629ffe687c6796d041e76bf645ecd2ce66c086bbb2a9283b8435bb',lines:['Installation ','completed smoothly ','from start to finish.']},
} as const
export function ClientTestimonials(){return <section className="client-testimonials" data-owner-override={TESTIMONIAL_AUTHORITY_ID} aria-label="Client testimonials">
 <h2 className="visually-hidden">Client testimonials</h2>
 <div className="client-testimonial-grid">{figmaFeaturedTestimonials.map((record,index)=>{const portrait=figmaTestimonialMedia[record.person as keyof typeof figmaTestimonialMedia];if(!portrait)return null
  const heading=record.quoteLines[0],quote=record.quoteLines[1]
  const lines=portrait.lines.join('')===heading?portrait.lines:[heading]
  return <figure className={`client-testimonial-split${index%2?' client-testimonial-split--reverse':''}`} key={record.recordId} data-testimonial-record={record.recordId} data-figma-node={index===0?'21:991':index===1?'21:1026':'21:1008'}>
   <div className="client-testimonial-inner">
    <div className="client-testimonial-copy">
     <img className="client-testimonial-quote-mark" src="/media/figma-testimonials/figma-quote.svg" width="38" height="31" alt="" aria-hidden="true"/>
     <h3>{lines.map((line,lineIndex)=><span className={`client-testimonial-heading-line${lineIndex===lines.length-1?' client-testimonial-accent':''}`} key={lineIndex}>{line}</span>)}</h3>
     <blockquote><p>{quote}</p></blockquote>
    </div>
    <div className="client-testimonial-media">
     <img src={portrait.src} width={portrait.width} height={portrait.height} alt={record.person} loading="lazy"/>
     <figcaption><strong>{record.person}</strong><span>{record.company} / {record.title}</span></figcaption>
    </div>
   </div>
  </figure>})}</div>
</section>}
export function ClientSocialLinks(){return <nav className="client-socials" aria-label="Follow Us"><h2>Follow Us</h2><div>{clientReviewAuthority.socials.map(s=><a key={s.network} href={s.url} rel="noopener noreferrer" target="_blank">{s.network}<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></a>)}</div></nav>}
