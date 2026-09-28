import {afterEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {publicMountGate,type PublicReleaseRoute} from '../gate'
import {RfqMount} from '../RfqMount'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {EnglishServicePage,englishServicePages} from '../EnglishServices'
import {Wave4ArticleDetail} from '../Wave4Presentation'
import {activeProductRoutes} from '../Wave3Products'
import {salmonDocument,salmonRoutes} from '../salmon'

const configured={H2O_TYPEFORM_FORM_ID:'F22cAgx3',H2O_TYPEFORM_ORIGIN:'https://form.typeform.com'}
const originalId=process.env.H2O_TYPEFORM_FORM_ID
const originalOrigin=process.env.H2O_TYPEFORM_ORIGIN
const publicRoute=(path:string):PublicReleaseRoute=>({path,state:'PUBLIC',export:true,redirect:null,routeClass:'pages'})

afterEach(()=>{
  if(originalId===undefined)delete process.env.H2O_TYPEFORM_FORM_ID
  else process.env.H2O_TYPEFORM_FORM_ID=originalId
  if(originalOrigin===undefined)delete process.env.H2O_TYPEFORM_ORIGIN
  else process.env.H2O_TYPEFORM_ORIGIN=originalOrigin
})

describe('owner-authorized PUBLIC English RFQ gate',()=>{
  it('opens the approved placements only for exported PUBLIC English routes with a public fallback',()=>{
    for(const routePath of ['/resources/','/cooling-tower/','/how-does-a-cooling-tower-work/',...englishServicePages().map(page=>page.path)]){
      for(const placement of ['header_action','footer_rfq_band','editorial_inline','rfq_page']){
        expect(publicMountGate(routePath,placement,{env:configured})).toMatchObject({mounted:true,reason:'MOUNTED',formUrl:'https://form.typeform.com/to/F22cAgx3'})
      }
    }
  })

  it('fails closed for redirects, held, unpublished, missing, internal, preview and non-English routes',()=>{
    const fallback=publicRoute('/contact-us/')
    const cases:PublicReleaseRoute[]=[
      {...publicRoute('/redirect/'),redirect:'/resources/'},
      {...publicRoute('/held/'),state:'REVIEW_HOLD'},
      {...publicRoute('/unpublished/'),export:false},
      {...publicRoute('/internal/example/'),routeClass:'internal'},
      publicRoute('/preview/example/'),
      publicRoute('/admin/example/'),
      publicRoute('/my-account/'),
      publicRoute('/my-account/lost-password/'),
      publicRoute('/ja/example/'),
    ]
    for(const route of cases){
      expect(publicMountGate(route.path,'header_action',{env:configured,routes:[fallback,route]})).toMatchObject({mounted:false,reason:'ROUTE_NOT_PUBLIC_EXPORT'})
    }
    expect(publicMountGate('/missing/','header_action',{env:configured,routes:[fallback]})).toMatchObject({mounted:false,reason:'ROUTE_NOT_PUBLIC_EXPORT'})
    expect(publicMountGate('/resources/','header_action',{env:configured,routes:[publicRoute('/resources/')]})).toMatchObject({mounted:false,reason:'FALLBACK_ROUTE_NOT_PUBLIC_EXPORT'})
    expect(publicMountGate('/resources/','unapproved',{env:configured})).toMatchObject({mounted:false,reason:'MOUNT_NOT_AUTHORIZED_FOR_PUBLIC'})
    expect(publicMountGate('/resources/','header_action',{env:{}})).toMatchObject({mounted:false,reason:'CONFIGURATION_UNRESOLVED'})
  })

  it('passes only page_path and cta_placement for generic public pages, retaining Contact us navigation',()=>{
    process.env.H2O_TYPEFORM_FORM_ID=configured.H2O_TYPEFORM_FORM_ID
    process.env.H2O_TYPEFORM_ORIGIN=configured.H2O_TYPEFORM_ORIGIN
    const html=renderToStaticMarkup(<><LuxuryHeader routePath="/resources/"/><LuxuryFooter routePath="/resources/"/></>)
    expect(html).toContain('https://form.typeform.com/to/F22cAgx3')
    expect(html).toContain('data-rfq-placement="header_action"')
    expect(html).toContain('data-rfq-placement="footer_rfq_band"')
    expect(html).toContain('page_path=')
    expect(html).toContain('cta_placement=')
    for(const prohibited of ['product_slug','product_id','service_id','account_id','customer_id','campaign_id','cohort_id'])expect(html).not.toContain(prohibited)
    expect(html).toContain('href="/contact-us/">Contact us</a>')
    expect(html).not.toContain('<iframe')
  })

  it('makes service request and article inline surfaces real Typeform links without a live submission',()=>{
    process.env.H2O_TYPEFORM_FORM_ID=configured.H2O_TYPEFORM_FORM_ID
    process.env.H2O_TYPEFORM_ORIGIN=configured.H2O_TYPEFORM_ORIGIN
    const service=englishServicePages()[0]
    const serviceHtml=renderToStaticMarkup(<EnglishServicePage service={service}/>)
    expect(serviceHtml).toContain('data-rfq-placement="rfq_page"')
    expect(serviceHtml).toContain('https://form.typeform.com/to/F22cAgx3')
    const route=salmonRoutes().find(row=>row.targetPath==='/how-does-a-cooling-tower-work/')
    expect(route).toBeDefined()
    const articleHtml=renderToStaticMarkup(<Wave4ArticleDetail doc={salmonDocument(route!)}/>)
    expect(articleHtml).toContain('data-rfq-placement="editorial_inline"')
    expect(articleHtml).toContain('https://form.typeform.com/to/F22cAgx3')
    expect(articleHtml).not.toContain('<iframe')
  })

  it('preserves verified product context on product routes and suppresses an unverified product',()=>{
    process.env.H2O_TYPEFORM_FORM_ID=configured.H2O_TYPEFORM_FORM_ID
    process.env.H2O_TYPEFORM_ORIGIN=configured.H2O_TYPEFORM_ORIGIN
    const product=salmonDocument(activeProductRoutes()[0])
    const html=renderToStaticMarkup(<LuxuryHeader routePath={product.targetPath} product={product}/>)
    expect(html).toContain('https://form.typeform.com/to/F22cAgx3')
    expect(html).toContain('product_slug=')
    expect(html).toContain('product_id=')
    const invalid={...product,sourceIdentity:{...product.sourceIdentity,sha256:'0'.repeat(64)}}
    expect(renderToStaticMarkup(<RfqMount mountId="header_action" product={invalid}/>)).not.toContain('form.typeform.com')
  })

  it('uses Contact only when configuration is unavailable and never for a disallowed route',()=>{
    delete process.env.H2O_TYPEFORM_FORM_ID
    delete process.env.H2O_TYPEFORM_ORIGIN
    expect(renderToStaticMarkup(<RfqMount mountId="header_action" routePath="/resources/"/>)).toContain('href="/contact-us/"')
    expect(renderToStaticMarkup(<RfqMount mountId="header_action" routePath="/missing/"/>)).toBe('')
  })
})
