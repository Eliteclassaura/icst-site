import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {RfqMount} from './RfqMount'
import {isPayloadContent,requestServices,snapshotJson} from '../content/runtime-read'
import {deliverySrc} from './media-delivery'
import {BreadcrumbSchema,HOME_CRUMB} from './breadcrumb-schema'
import {heroQuoteAction} from '../content/rfq-controls'
import {heroActionFor,heroSecondaryHref} from './hero-actions'
import {pageCopy} from './page-copy'

export type EnglishService = {
  id:string;path:string;figmaNode:string;title:string;eyebrow:string;lead:string
  hero:string;detailImage:string;diagramImage:string;evidenceImage:string;supportImage:string;decisionImage:string;closingImage:string;processImage?:string
  diagramKind:'crossflow'|'counterflow'|'wet-hybrid-dry'|'low-drift'|'emergency'|'rebuilds'
  overviewTitle:string;overview:string
  principleTitle:string;principles:Array<[string,string]>
  servicesTitle:string;services:Array<[string,string]>
  signsTitle:string;signs:string[];supportTitle:string;support:string
  processTitle:string;process:Array<[string,string]>
  decisionTitle:string;decision:string;faq:Array<[string,string]>;closing:string
}

const contentFile=path.join(process.cwd(),'content/english-completion/service-pages.json')
export function englishServicePages():EnglishService[]{
  // Content bridge seam: payload content mode reads the published snapshot; a previewed service is injected.
  const pages=isPayloadContent()?snapshotJson<EnglishService[]>('english-services.json').map(page=>(requestServices().get(page.id) as EnglishService|undefined)??page):JSON.parse(readFileSync(contentFile,'utf8')) as EnglishService[]
  if(pages.length!==6||new Set(pages.map(page=>page.path)).size!==6)throw new Error('Six distinct English service destinations required')
  return pages
}
export function englishServiceForPath(value:string):EnglishService|undefined{return englishServicePages().find(page=>page.path===value)}

function acceptedImage(src:string){
  if(!/^\/media\/(?:figma-wave2\/figma-image-[a-f0-9]+\.(?:png|jpg)|figma-six-service-r12\/[a-z0-9-]+\.png|luxury\/(?:ics-(?:storm-damage|slep-complete)\.jpeg|(?:0219f2c88f282884-aircooler-bank|be9ea22b7f7312ce-repair-detail|e88bf553ad083ec6-refinery-frp-towers|a43821823afa4ddc-structural-damage|250a76bc50923728-preventive-maint|4752fe427b3400eb-frp-conversion)\.png))$/.test(src))throw new Error('Service media must be a held, accepted H2O source asset')
  const bytes=readFileSync(path.join(process.cwd(),'public',src))
  return {src,sha256:createHash('sha256').update(bytes).digest('hex')}
}
function ServicePhoto({src,alt,priority=false}:{src:string;alt:string;priority?:boolean}){
  const media=acceptedImage(src)
  return <img src={deliverySrc(media.src)} alt={alt} data-source-sha256={media.sha256} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined}/>
}

const systemMaps:Record<EnglishService['diagramKind'],{caption:string;steps:[string,string,string,string]}>={
  crossflow:{caption:'Conceptual crossflow path — air moves across falling water',steps:['Hot-water basin','Water through fill','Air across fill','Cold-water basin']},
  counterflow:{caption:'Conceptual counterflow path — air rises against falling water',steps:['Spray headers','Water through fill','Air rises through fill','Cold-water basin']},
  'wet-hybrid-dry':{caption:'Configuration check — the installed equipment determines the scope',steps:['Wet side','Hybrid modes','Dry surfaces','Site-specific duty']},
  'low-drift':{caption:'Conceptual drift-control path — captured water returns to the tower',steps:['Entrained droplets','Eliminator passages','Droplet capture','Water return']},
  emergency:{caption:'Response sequence — actual safety and repair decisions remain site-specific',steps:['Make the site safe','Document the fault','Assess the scope','Restore and verify']},
  rebuilds:{caption:'Decision sequence — compare options against condition and required duty',steps:['Survey the asset','Targeted repair','Rebuild option','New tower option']},
}
function TechnicalDiagram({kind,src}:{kind:EnglishService['diagramKind'];src:string}){
  const map=systemMaps[kind]
  return <figure className={`english-service-diagram english-service-diagram--${kind}`} aria-label={map.caption}>
    <ServicePhoto src={src} alt={map.caption}/>
    <figcaption><span>ICS / TECHNICAL REFERENCE</span><strong>{map.caption}</strong></figcaption>
    <small>Illustrative operating/decision path. Confirm the arrangement on the installed tower.</small>
  </figure>
}

/** Dedicated service destinations. The shared layout follows the six Figma frames;
 * every section's heading and content are individual and source-bound. */
/** The hero's two actions (content/design/hero-actions.json): the quote action, then the on-page anchor or office telephone. */
function heroActions(service:EnglishService){
  const action=heroActionFor(service.path)
  if(!action)return <><a href="#english-request-title">Request a Quote</a><a href="#service-scope">Explore the service</a></>
  return <>{heroQuoteAction({routeId:service.id,targetPath:service.path},'hero-primary',action.label)}{action.secondary?<a href={heroSecondaryHref(action.secondary)} data-hero-action="secondary">{action.secondary.label}</a>:null}</>
}
export function EnglishServicePage({service}:{service:EnglishService}){
  return <div className="luxury-site english-service" data-english-service={service.id} data-figma-node={service.figmaNode}>
    <BreadcrumbSchema ancestors={[HOME_CRUMB]} current={{name:service.title,path:service.path}}/>
    <LuxuryHeader routePath={service.path}/>
    <main id="main">
      <section className="english-service-hero">
        <ServicePhoto src={service.hero} alt="" priority/>
        <div className="english-service-hero-shade"/>
        <div className="english-service-hero-copy"><span className="english-service-eyebrow">{service.eyebrow}</span><h1>{service.title}</h1><p>{service.lead}</p><div className="english-service-actions">{heroActions(service)}</div></div>
      </section>
      <section className="english-service-intro english-service-width" aria-labelledby="english-intro-title">
        <figure><ServicePhoto src={service.detailImage} alt="Industrial cooling tower equipment"/></figure>
        <div><span className="english-service-index">01 / The challenge</span><h2 id="english-intro-title">{service.overviewTitle}</h2><p>{service.overview}</p><a href="#service-process">How ICS approaches the work <span aria-hidden="true">↗</span></a></div>
      </section>
      <section className="english-service-principle english-service-width" aria-labelledby="english-principle-title">
        <div className="english-service-section-heading"><span className="english-service-index">02 / Operating principle</span><h2 id="english-principle-title">{service.principleTitle}</h2></div>
        <div className="english-service-principle-list">{service.principles.map(([name,copy],index)=><div key={name}><span>{String(index+1).padStart(2,'0')}</span><h3>{name}</h3><p>{copy}</p></div>)}</div>
        <TechnicalDiagram kind={service.diagramKind} src={service.diagramImage}/>
      </section>
      <section className="english-service-scope english-service-width" id="service-scope" aria-labelledby="english-scope-title">
        <div className="english-service-section-heading"><span className="english-service-index">03 / Scope of work</span><h2 id="english-scope-title">{service.servicesTitle}</h2><p>The scope follows the findings on the installed tower. The six areas below guide the inspection and quotation.</p></div>
        <div className="english-service-scope-grid">{service.services.map(([name,copy],index)=><article key={name}><span>{String(index+1).padStart(2,'0')}</span><h3>{name}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="english-service-signs english-service-width" aria-labelledby="english-signs-title">
        <figure><ServicePhoto src={service.evidenceImage} alt="Industrial cooling equipment or inspection setting"/>{pageCopy().englishServices.evidenceCaption?<figcaption>{pageCopy().englishServices.evidenceCaption}</figcaption>:null}</figure>
        <div><span className="english-service-index">04 / Site evidence</span><h2 id="english-signs-title">{service.signsTitle}</h2><p>Share what you observe with ICS so the enquiry can be scoped against the actual tower condition.</p><ul>{service.signs.map(sign=><li key={sign}>{sign}</li>)}</ul></div>
      </section>
      <section className="english-service-band" aria-labelledby="english-support-title"><div className="english-service-width"><span className="english-service-index">05 / Continued support</span><h2 id="english-support-title">{service.supportTitle}</h2><p>{service.support}</p><a href="/cooling-tower-maintenance-repair-upgrade/">Explore repair and maintenance <span aria-hidden="true">↗</span></a></div></section>
      <section className="english-service-process english-service-width" id="service-process" aria-labelledby="english-process-title"><span className="english-service-index">06 / Process</span><h2 id="english-process-title">{service.processTitle}</h2>{service.processImage&&<figure className="english-service-process-photo"><ServicePhoto src={service.processImage} alt="ICS technician assessing industrial cooling equipment"/></figure>}<div>{service.process.map(([number,title])=><article key={number}><span>{number}</span><h3>{title}</h3></article>)}</div></section>
      <section className="english-service-decision english-service-width" aria-labelledby="english-decision-title"><article className="english-service-support-card"><figure><ServicePhoto src={service.supportImage} alt="Industrial cooling equipment in service context"/></figure><div><span className="english-service-index">07 / Where we work</span><h2>Industries we support</h2><p>Industrial cooling support is scoped around the installed asset, duty and site constraints.</p><a href="/industries/">Explore ICS industries <span aria-hidden="true">↗</span></a></div></article><article className="english-service-support-card"><figure><ServicePhoto src={service.decisionImage} alt="Industrial cooling tower equipment or project setting"/></figure><div><span className="english-service-index">08 / Decision support</span><h2 id="english-decision-title">{service.decisionTitle}</h2><p>{service.decision}</p><a href="/cooling-tower-replacement/">Explore repair and replacement <span aria-hidden="true">↗</span></a></div></article></section>
      <section className="english-service-request english-service-width" aria-labelledby="english-request-title"><div><span className="english-service-index">09 / Request a scope</span><h2 id="english-request-title">Request a {service.eyebrow.toLowerCase()} assessment</h2><p>Tell ICS what is happening at your site. Share the installed tower and the outcome you need; the request flow will guide your enquiry.</p><RfqMount mountId="rfq_page" routePath={service.path} label="Start your request"/></div><aside><h3>Useful details to share</h3><ul><li>Tower make, model and location</li><li>Operating duty and affected cell</li><li>Photographs and inspection reports</li><li>Shutdown or access constraints</li></ul></aside></section>
      <section className="english-service-faq english-service-width" aria-labelledby="english-faq-title"><div><span className="english-service-index">10 / Questions</span><h2 id="english-faq-title">{service.eyebrow} FAQ</h2></div><div>{service.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className="english-service-closing english-service-width"><ServicePhoto src={service.closingImage} alt=""/><div><h2>{service.closing}</h2><p>Talk to ICS about the installed tower, the problem and the outcome you need.</p><a href="/contact-us/">Contact ICS <span aria-hidden="true">→</span></a></div></section>
    </main>
    <LuxuryFooter routePath={service.path}/>
  </div>
}
