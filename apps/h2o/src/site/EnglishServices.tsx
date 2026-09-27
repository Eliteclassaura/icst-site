import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'

export type EnglishService = {
  id:string;path:string;figmaNode:string;title:string;eyebrow:string;lead:string
  hero:string;detailImage:string;evidenceImage:string;decisionImage:string
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
  const pages=JSON.parse(readFileSync(contentFile,'utf8')) as EnglishService[]
  if(pages.length!==6||new Set(pages.map(page=>page.path)).size!==6)throw new Error('Six distinct English service destinations required')
  return pages
}
export function englishServiceForPath(value:string):EnglishService|undefined{return englishServicePages().find(page=>page.path===value)}

function acceptedImage(src:string){
  if(!/^\/media\/(?:figma-wave2\/figma-image-[a-f0-9]+\.(?:png|jpg)|luxury\/(?:ics-(?:storm-damage|slep-complete)\.jpeg|(?:0219f2c88f282884-aircooler-bank|be9ea22b7f7312ce-repair-detail|e88bf553ad083ec6-refinery-frp-towers|a43821823afa4ddc-structural-damage|250a76bc50923728-preventive-maint|4752fe427b3400eb-frp-conversion)\.png))$/.test(src))throw new Error('Service media must be a held, accepted H2O source asset')
  const bytes=readFileSync(path.join(process.cwd(),'public',src))
  return {src,sha256:createHash('sha256').update(bytes).digest('hex')}
}
function ServicePhoto({src,alt,priority=false}:{src:string;alt:string;priority?:boolean}){
  const media=acceptedImage(src)
  return <img src={media.src} alt={alt} data-source-sha256={media.sha256} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined}/>
}

const systemMaps:Record<EnglishService['diagramKind'],{caption:string;steps:[string,string,string,string]}>={
  crossflow:{caption:'Conceptual crossflow path — air moves across falling water',steps:['Hot-water basin','Water through fill','Air across fill','Cold-water basin']},
  counterflow:{caption:'Conceptual counterflow path — air rises against falling water',steps:['Spray headers','Water through fill','Air rises through fill','Cold-water basin']},
  'wet-hybrid-dry':{caption:'Configuration check — the installed equipment determines the scope',steps:['Wet side','Hybrid modes','Dry surfaces','Site-specific duty']},
  'low-drift':{caption:'Conceptual drift-control path — captured water returns to the tower',steps:['Entrained droplets','Eliminator passages','Droplet capture','Water return']},
  emergency:{caption:'Response sequence — actual safety and repair decisions remain site-specific',steps:['Make the site safe','Document the fault','Assess the scope','Restore and verify']},
  rebuilds:{caption:'Decision sequence — compare options against condition and required duty',steps:['Survey the asset','Targeted repair','Rebuild option','New tower option']},
}
function TechnicalDiagram({kind}:{kind:EnglishService['diagramKind']}){
  const map=systemMaps[kind]
  return <figure className={`english-service-diagram english-service-diagram--${kind}`} aria-label={map.caption}>
    <figcaption><span>ICS / TECHNICAL REFERENCE</span><strong>{map.caption}</strong></figcaption>
    <div className="english-service-diagram-track">{map.steps.map((step,index)=><div className="english-service-diagram-node" key={step}><span>{String(index+1).padStart(2,'0')}</span><strong>{step}</strong>{index<3&&<i aria-hidden="true">→</i>}</div>)}</div>
    <small>Illustrative operating/decision path. Confirm the arrangement on the installed tower.</small>
  </figure>
}

/** Dedicated service destinations. The shared layout follows the six Figma frames;
 * every section's heading and content are individual and source-bound. */
export function EnglishServicePage({service}:{service:EnglishService}){
  return <div className="luxury-site english-service" data-english-service={service.id} data-figma-node={service.figmaNode}>
    <LuxuryHeader/>
    <main id="main">
      <section className="english-service-hero">
        <ServicePhoto src={service.hero} alt="" priority/>
        <div className="english-service-hero-shade"/>
        <div className="english-service-hero-copy"><span className="english-service-eyebrow">{service.eyebrow}</span><h1>{service.title}</h1><p>{service.lead}</p><div className="english-service-actions"><a href="/contact-us/">Request a service assessment</a><a href="#service-scope">Explore the service</a></div></div>
      </section>
      <section className="english-service-intro english-service-width" aria-labelledby="english-intro-title">
        <figure><ServicePhoto src={service.detailImage} alt="Industrial cooling tower equipment"/></figure>
        <div><span className="english-service-index">01 / The challenge</span><h2 id="english-intro-title">{service.overviewTitle}</h2><p>{service.overview}</p><a href="#service-process">How ICS approaches the work <span aria-hidden="true">↗</span></a></div>
      </section>
      <section className="english-service-principle english-service-width" aria-labelledby="english-principle-title">
        <div className="english-service-section-heading"><span className="english-service-index">02 / Operating principle</span><h2 id="english-principle-title">{service.principleTitle}</h2></div>
        <div className="english-service-principle-list">{service.principles.map(([name,copy],index)=><div key={name}><span>{String(index+1).padStart(2,'0')}</span><h3>{name}</h3><p>{copy}</p></div>)}</div>
        <TechnicalDiagram kind={service.diagramKind}/>
      </section>
      <section className="english-service-scope english-service-width" id="service-scope" aria-labelledby="english-scope-title">
        <div className="english-service-section-heading"><span className="english-service-index">03 / Scope of work</span><h2 id="english-scope-title">{service.servicesTitle}</h2><p>The scope follows the findings on the installed tower. The six areas below guide the inspection and quotation.</p></div>
        <div className="english-service-scope-grid">{service.services.map(([name,copy],index)=><article key={name}><span>{String(index+1).padStart(2,'0')}</span><h3>{name}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="english-service-signs english-service-width" aria-labelledby="english-signs-title">
        <figure><ServicePhoto src={service.evidenceImage} alt="Industrial cooling equipment or inspection setting"/><figcaption>Source-verified ICS visual archive · Illustrative, not a diagnosis of your site</figcaption></figure>
        <div><span className="english-service-index">04 / Site evidence</span><h2 id="english-signs-title">{service.signsTitle}</h2><p>Share what you observe with ICS so the enquiry can be scoped against the actual tower condition.</p><ul>{service.signs.map(sign=><li key={sign}>{sign}</li>)}</ul></div>
      </section>
      <section className="english-service-band" aria-labelledby="english-support-title"><div className="english-service-width"><span className="english-service-index">05 / Continued support</span><h2 id="english-support-title">{service.supportTitle}</h2><p>{service.support}</p><a href="/cooling-tower-maintenance-repair-upgrade/">Explore repair and maintenance <span aria-hidden="true">↗</span></a></div></section>
      <section className="english-service-process english-service-width" id="service-process" aria-labelledby="english-process-title"><span className="english-service-index">06 / Process</span><h2 id="english-process-title">{service.processTitle}</h2><div>{service.process.map(([number,title])=><article key={number}><span>{number}</span><h3>{title}</h3></article>)}</div></section>
      <section className="english-service-decision english-service-width" aria-labelledby="english-decision-title"><div><span className="english-service-index">07 / Decision support</span><h2 id="english-decision-title">{service.decisionTitle}</h2><p>{service.decision}</p><div><a href="/cooling-tower/">New cooling towers <span aria-hidden="true">↗</span></a><a href="/cooling-tower-replacement/">Cooling tower replacement <span aria-hidden="true">↗</span></a></div></div><figure><ServicePhoto src={service.decisionImage} alt="Industrial cooling tower equipment or project setting"/><figcaption>ICS source media · Illustrative of equipment and site context</figcaption></figure></section>
      <section className="english-service-request english-service-width" aria-labelledby="english-request-title"><div><span className="english-service-index">08 / Request a scope</span><h2 id="english-request-title">Request a {service.eyebrow.toLowerCase()} assessment</h2><p>Tell ICS what is happening at your site. Share the installed tower and the outcome you need; the request flow will guide your enquiry.</p><a href="/contact-us/">Start your request <span aria-hidden="true">→</span></a></div><aside><h3>Useful details to share</h3><ul><li>Tower make, model and location</li><li>Operating duty and affected cell</li><li>Photographs and inspection reports</li><li>Shutdown or access constraints</li></ul></aside></section>
      <section className="english-service-faq english-service-width" aria-labelledby="english-faq-title"><div><span className="english-service-index">09 / Questions</span><h2 id="english-faq-title">{service.eyebrow} FAQ</h2></div><div>{service.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className="english-service-closing english-service-width"><ServicePhoto src={service.detailImage} alt=""/><div><h2>{service.closing}</h2><p>Talk to ICS about the installed tower, the problem and the outcome you need.</p><a href="/contact-us/">Contact ICS <span aria-hidden="true">→</span></a></div></section>
    </main>
    <LuxuryFooter/>
  </div>
}
