import {readFileSync} from 'node:fs'
import path from 'node:path'
import {testimonials,TESTIMONIAL_AUTHORITY_ID} from './testimonials'
import {deliverySrc} from './media-delivery'

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
     <img src={deliverySrc(portrait.src)} width={portrait.width} height={portrait.height} alt={record.person} loading="lazy"/>
     <figcaption><strong>{record.person}</strong><span>{record.company} / {record.title}</span></figcaption>
    </div>
   </div>
  </figure>})}</div>
</section>}
// Footer social links as round icon buttons in the Salmon footer style (owner decision 2026-10-02, Control Tower ruling).
// Glyphs: Font Awesome Free 5 brand icons (CC BY 4.0, https://fontawesome.com/license/free), the same glyphs Salmon's
// Elementor footer renders inline; TikTok from the same Elementor Font Awesome set. Inline SVG only (CSP img-src self/data:).
const SOCIAL_ORDER=['LinkedIn','Facebook','Instagram','YouTube','TikTok'] as const
const SOCIAL_ICONS:Record<(typeof SOCIAL_ORDER)[number],{viewBox:string;d:string}>={
  LinkedIn:{viewBox:'0 0 448 512',d:'M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z'},
  Facebook:{viewBox:'0 0 512 512',d:'M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z'},
  Instagram:{viewBox:'0 0 448 512',d:'M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z'},
  YouTube:{viewBox:'0 0 576 512',d:'M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z'},
  TikTok:{viewBox:'0 0 448 512',d:'M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z'}
}
/** `compact` (Design R3 About strip): the label is plain text, not a section heading. */
export function ClientSocialLinks({compact=false}:{compact?:boolean}={}){
  const socials=SOCIAL_ORDER.flatMap(network=>clientReviewAuthority.socials.filter(s=>s.network===network).map(s=>({...s,network})))
  return <nav className={compact?'client-socials client-socials--compact':'client-socials'} aria-label="Follow Us">{compact?<span className="client-socials-label">Follow Us</span>:<h2>Follow Us</h2>}<div>{socials.map(s=><a key={s.network} className={`client-social client-social--${s.network.toLowerCase()}`} href={s.url} rel="noopener noreferrer" target="_blank" aria-label={`ICS on ${s.network}`}><span className="client-social-disc" aria-hidden="true"><svg width="16" height="16" viewBox={SOCIAL_ICONS[s.network].viewBox} aria-hidden="true" focusable="false"><path d={SOCIAL_ICONS[s.network].d} fill="currentColor"/></svg></span></a>)}</div></nav>
}
