/**
 * The pre-cutover QA sweep's classifiers (ops/qa/sweep-lib.mjs; CT brief H2O_CUTOVER_PREP_MAIN_BRIEF_R1, 2026-10-05).
 */
import {describe,expect,it} from 'vitest'
import {allowedPath,brokenAssets,classify,internalTarget,keyOf,parsePage,reciprocity,summaryMarkdown} from '../../../ops/qa/sweep-lib.mjs'

type Finding={class:string;severity:string;url:string;detail:string}
const classes=(f:Finding[])=>f.map(x=>x.class).sort()
const html=(head:string,body='<h1>T</h1>')=>`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`
const GOOD_HEAD='<title>Cooling tower repair</title><meta name="description" content="'+'x'.repeat(120)+'"><link rel="canonical" href="https://h2ocooling.com/a/"><meta name="robots" content="noindex, nofollow">'
const ok=(page:ReturnType<typeof parsePage>,headers={})=>({hops:[{status:200}],page,headers,finalUrl:'https://s.test/a/'})

describe('parsePage',()=>{
  it('reads lang, title, description, robots, canonicals, hreflang, h1 count, JSON-LD validity, links, images and mixed content',()=>{
    const p=parsePage(`<!doctype html><html lang="th"><head><title>A &amp; B</title><meta name="description" content="d"><meta name="robots" content="index, follow">
      <link rel="canonical" href="https://h2ocooling.com/th/%E0%B8%AB/"><link rel="alternate" hreflang="en" href="https://h2ocooling.com/a/">
      <link rel="stylesheet" href="http://cdn.test/x.css"><script type="application/ld+json">{"@type":"Thing"}</script><script type="application/ld+json">{bad</script></head>
      <body><h1>One</h1><h1 class="x">Two</h1><a href="/b/">b</a><a href="mailto:x@y">m</a><img src="/i.jpg"><picture><source srcset="/s.webp 1x, /s2.webp 2x"></picture></body></html>`)
    expect(p).toMatchObject({lang:'th',title:'A & B',titles:1,descriptions:['d'],robotsMeta:['index, follow'],h1:2,anchors:['/b/','mailto:x@y'],images:['/i.jpg','/s.webp'],mixed:['http://cdn.test/x.css']})
    expect(p.canonicals).toEqual(['https://h2ocooling.com/th/%E0%B8%AB/'])
    expect(p.alternates).toEqual([{hreflang:'en',href:'https://h2ocooling.com/a/'}])
    expect(p.jsonLd.map((j:{ok:boolean})=>j.ok)).toEqual([true,false])
  })
  it('compares paths decoded, independent of origin',()=>{
    expect(keyOf('https://h2ocooling.com/th/%E0%B8%AB/')).toBe(keyOf('https://staging.test/th/ห/'))
  })
})

describe('internal targets and private paths',()=>{
  const hosts=new Set(['s.test','h2ocooling.com'])
  it('keeps same-site links (either origin), drops external, fragment, mailto, tel and data',()=>{
    expect(internalTarget('/b/#x','https://s.test/a/',hosts)).toBe('/b/')
    expect(internalTarget('https://h2ocooling.com/c/?q=1','https://s.test/a/',hosts)).toBe('/c/?q=1')
    for(const raw of ['https://other.test/','#top','mailto:a@b','tel:+1','data:image/png;base64,x','javascript:void(0)'])expect(internalTarget(raw,'https://s.test/a/',hosts),raw).toBeNull()
  })
  it('never requests /crm, /admin or /api, except the sitemap preview under an admin session',()=>{
    for(const p of ['/crm','/crm/leads/','/admin','/admin/collections/pages','/api/users/me'])expect(allowedPath(p),p).toBe(false)
    expect(allowedPath('/api/sitemap-preview/')).toBe(false)
    expect(allowedPath('/api/sitemap-preview/',{preview:true})).toBe(true)
    expect(allowedPath('/api/sitemap-preview/?file=page-sitemap.xml',{preview:true})).toBe(true)
    expect(allowedPath('/api/users/login/',{preview:true})).toBe(false)
    expect(allowedPath('/crmx/')).toBe(true)
    expect(allowedPath('/cooling-tower/')).toBe(true)
  })
})

describe('classify',()=>{
  it('a clean page under the private policy has no findings',()=>{
    expect(classify('https://s.test/a/','sitemap',ok(parsePage(html(GOOD_HEAD))),{canonical:'https://h2ocooling.com/a/',lang:'en'},'private')).toEqual([])
  })
  it('flags canonical count and mismatch, language, h1 count, title, meta, JSON-LD and mixed content',()=>{
    const bad=parsePage(`<html lang="en"><head><meta name="robots" content="noindex"><link rel="canonical" href="https://h2ocooling.com/z/"><script type="application/ld+json">{</script><img src="http://x.test/a.png"></head><body><p>no h1</p></body></html>`)
    expect(classes(classify('u','sitemap',ok(bad),{canonical:'https://h2ocooling.com/a/',lang:'ja'}))).toEqual(['CANONICAL_MISMATCH','H1_COUNT','JSONLD_INVALID','LANG_MISMATCH','META_MISSING','MIXED_CONTENT','TITLE_MISSING'])
    const two=parsePage(html(GOOD_HEAD+'<link rel="canonical" href="https://h2ocooling.com/a/"><meta name="description" content="y"><title>2</title>','<h1>a</h1><h1>b</h1>'))
    expect(classes(classify('u','sitemap',ok(two),{}))).toEqual(['CANONICAL_COUNT','H1_COUNT','META_DUPLICATE','TITLE_DUPLICATE_TAG'])
    const long=parsePage(html('<title>'+'t'.repeat(71)+'</title><meta name="description" content="short"><link rel="canonical" href="/a/"><meta name="robots" content="noindex">'))
    expect(classify('u','sitemap',ok(long),{}).map((f:Finding)=>[f.class,f.severity])).toEqual([['TITLE_LONG','warn'],['META_LENGTH','warn']])
  })
  it('robots against the policy: private must be noindex (meta or header); production follows the authority',()=>{
    const indexable=parsePage(html(GOOD_HEAD.replace('noindex, nofollow','index, follow')))
    expect(classes(classify('u','sitemap',ok(indexable),{},'private'))).toEqual(['PRIVATE_SURFACE_INDEXABLE'])
    const plain=parsePage(html(GOOD_HEAD.replace(/<meta name="robots"[^>]*>/,'')))
    expect(classify('u','sitemap',ok(plain,{'x-robots-tag':'noindex, nofollow'}),{},'private')).toEqual([])
    expect(classify('u','sitemap',ok(plain),{robots:'index'},'production')).toEqual([])
    expect(classes(classify('u','sitemap',ok(plain,{'x-robots-tag':'noindex'}),{robots:'index'},'production'))).toEqual(['ROBOTS_NOINDEX_ON_INDEXABLE'])
    expect(classes(classify('u','sitemap',ok(plain),{robots:'noindex,follow'},'production'))).toEqual(['ROBOTS_INDEXABLE_ON_NOINDEX'])
  })
  it('sitemap URLs answer 200 in one hop',()=>{
    expect(classes(classify('u','sitemap',{hops:[{status:301,location:'/b/'},{status:200}]}))).toEqual(['SITEMAP_URL_REDIRECTS'])
    expect(classes(classify('u','sitemap',{hops:[{status:404}]}))).toEqual(['SITEMAP_URL_NOT_200'])
    expect(classes(classify('u','sitemap',{hops:[{status:502}]}))).toEqual(['SITEMAP_URL_NOT_200','UNREACHABLE_OR_5XX'])
    expect(classes(classify('u','sitemap',{hops:[{status:0}]}))).toEqual(['SITEMAP_URL_NOT_200','UNREACHABLE_OR_5XX'])
  })
  it('redirects: one permanent hop to the recorded destination, which answers 200',()=>{
    const e={redirectTo:'/b/',status:301}
    expect(classify('/a/','redirect',{hops:[{status:301,location:'https://s.test/b/'},{status:200}]},e)).toEqual([])
    expect(classify('/a/','redirect',{hops:[{status:308,location:'/b/'},{status:200}]},{redirectTo:'/b/',status:308})).toEqual([])
    expect(classes(classify('/a/','redirect',{hops:[{status:200}]},e))).toEqual(['REDIRECT_NOT_REDIRECTING'])
    expect(classes(classify('/a/','redirect',{hops:[{status:302,location:'/b/'},{status:200}]},e))).toEqual(['REDIRECT_NOT_PERMANENT'])
    expect(classes(classify('/a/','redirect',{hops:[{status:308,location:'/b/'},{status:200}]},e))).toEqual(['REDIRECT_STATUS_MISMATCH'])
    expect(classes(classify('/a/','redirect',{hops:[{status:301,location:'/c/'},{status:301,location:'/b/'},{status:200}]},e))).toEqual(['REDIRECT_CHAIN','REDIRECT_WRONG_TARGET'])
    expect(classes(classify('/a/','redirect',{hops:[{status:301,location:'/b/'},{status:404}]},e))).toEqual(['REDIRECT_TARGET_NOT_200'])
  })
  it('410 paths answer 410; every Yoast URL ends at 200 (at most one permanent hop) or 410',()=>{
    expect(classify('/gh/','gone',{hops:[{status:410}]})).toEqual([])
    expect(classes(classify('/gh/','gone',{hops:[{status:404}]}))).toEqual(['GONE_NOT_410'])
    expect(classify('y','yoast',{hops:[{status:200}]})).toEqual([])
    expect(classify('y','yoast',{hops:[{status:301,location:'/b/'},{status:200}]})).toEqual([])
    expect(classify('y','yoast',{hops:[{status:410}]})).toEqual([])
    for(const hops of [[{status:404}],[{status:301,location:'/b/'},{status:301,location:'/c/'},{status:200}],[{status:302,location:'/b/'},{status:200}],[{status:301,location:'/b/'},{status:410}]])
      expect(classes(classify('y','yoast',{hops})),JSON.stringify(hops)).toEqual(['YOAST_URL_UNACCOUNTED'])
  })
})

describe('hreflang reciprocity',()=>{
  const set=[{hreflang:'en',href:'https://h2ocooling.com/a/'},{hreflang:'th',href:'https://h2ocooling.com/th/%E0%B8%AB/'}]
  it('every named page serves the identical set, self included',()=>{
    expect(reciprocity(new Map([['/a/',set],['/th/ห/',[...set].reverse()]]))).toEqual([])
  })
  it('flags a missing self entry, a non-reciprocal partner and a partner that was not checked',()=>{
    expect(classes(reciprocity(new Map([['/a/',set],['/th/ห/',[set[0]]]])))).toEqual(['HREFLANG_NOT_RECIPROCAL','HREFLANG_NOT_RECIPROCAL','HREFLANG_NO_SELF'])
    expect(reciprocity(new Map([['/a/',set]])).map((f:Finding)=>[f.class,f.severity])).toEqual([['HREFLANG_TARGET_UNCHECKED','warn']])
    expect(reciprocity(new Map([['/a/',[]]]))).toEqual([])
  })
})

describe('broken assets and the summary',()=>{
  it('a 4xx or unanswered internal link or image is broken; 2xx and 3xx are not',()=>{
    const r=new Map([['/x.jpg',{kind:'image',status:404,from:['/a/']}],['/b/',{kind:'link',status:0,from:['/a/']}],['/c/',{kind:'link',status:301,from:['/a/']}],['/d/',{kind:'link',status:200,from:['/a/']}]])
    expect(classes(brokenAssets(r))).toEqual(['BROKEN_IMAGE','BROKEN_LINK'])
  })
  it('the markdown groups findings by class, fails before warnings, and truncates long classes',()=>{
    const findings=[...Array.from({length:3},(_,i)=>({class:'H1_COUNT',severity:'fail',url:`/p${i}/`,detail:'0 h1'})),{class:'TITLE_LONG',severity:'warn',url:'/t/',detail:'80 chars'}]
    const md=summaryMarkdown({origin:'https://s.test',policy:'private',preview:false,rps:4,startedAt:'a',finishedAt:'b',requests:9,inputs:{sitemap:1},findings},2)
    expect(md).toContain('| H1_COUNT | fail | 3 |')
    expect(md.indexOf('## H1_COUNT')).toBeLessThan(md.indexOf('## TITLE_LONG'))
    expect(md).toContain('… 1 more in the JSON')
    expect(md).toContain('**Fail:** 3 · **Warn:** 1')
  })
})
