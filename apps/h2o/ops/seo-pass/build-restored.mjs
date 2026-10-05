#!/usr/bin/env node
/**
 * SEO parity Part 2 R2: restored-sections batch data (OGCS Part 1 content decisions; CT approved the content model 2026-10-05).
 * Offline; writes data files only.
 *
 *   node ops/seo-pass/build-restored.mjs <reviewed-dir> [--evidence=<dir>]
 *
 * <reviewed-dir> holds one reviewed JSON per page (h2o-technical-b2b-content review: live text, surgical remediation, claim
 * notes). Output: data/restored-sections.json, keyed by path: { routeId, h1?, groups: [{ mode, anchor, source, blocks }] },
 * the shape apply-seo-pass.mjs writes to `restoredSections` (Payload blocks; rich text as Lexical). With --evidence, the
 * per-page claim notes and omissions are written there too.
 *
 * Rule checks stop the build:
 *   - the wrong company name;
 *   - contact details;
 *   - commerce wording;
 *   - prices outside the cost article (where they must read as market guidance);
 *   - links that are not public internal paths;
 *   - empty blocks.
 * Anchors are resolved by the gate test (site/__tests__/seo-parity-part2), which runs the same validator as the save hook
 * (content/restored-sections validateRestoredSections) against each page's imported tree.
 */
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const [dir]=process.argv.slice(2).filter(a=>!a.startsWith('--'))
const evidence=process.argv.find(a=>a.startsWith('--evidence='))?.slice('--evidence='.length)
if(!dir){process.stderr.write('usage: build-restored.mjs <reviewed-dir> [--evidence=<dir>]\n');process.exit(2)}
const APP=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','..')
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8'))
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const routeOf=new Map(ledger.routes.map(r=>[decode(r.path),r]))
const publicPaths=new Set(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export).map(r=>decode(r.path)))
const PRICE_PAGE='/cooling-tower-replacement-cost/'

/* Markdown-lite (**bold**, *italic*, [text](/path/)) → restricted Lexical (paragraph, text, link). */
const BOLD=1,ITALIC=2
const text=(t,format)=>({type:'text',text:t,format,detail:0,mode:'normal',style:'',version:1})
function inlineNodes(src,problems,where){
  const out=[];let i=0,buf='',format=0
  const flush=()=>{if(buf){out.push(text(buf,format));buf=''}}
  while(i<src.length){
    if(src.startsWith('**',i)){flush();format^=BOLD;i+=2;continue}
    if(src[i]==='*'&&(format&ITALIC?/\S/.test(src[i-1]??''):/\S/.test(src[i+1]??''))){flush();format^=ITALIC;i++;continue}
    if(src[i]==='['){
      const m=/^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i))
      if(m){
        flush()
        // A link to a consolidated page points at its destination (one hop fewer; the renderer would do the same).
        const target=routeOf.get(decode(m[2].split(/[?#]/)[0]))
        const url=target?.state==='REDIRECT'&&target.redirect?target.redirect:m[2]
        if(!/^\/(?!\/)/.test(url)||!publicPaths.has(decode(url.split(/[?#]/)[0]))){problems.push(`${where}: link is not a public internal page: ${url}`)}
        out.push({type:'link',fields:{url,newTab:false,linkType:'custom'},children:[text(m[1].replace(/\*+/g,''),format)],format:'',indent:0,version:3,direction:'ltr'})
        i+=m[0].length;continue
      }
    }
    buf+=src[i];i++
  }
  flush()
  if(format)problems.push(`${where}: unbalanced emphasis markers`)
  return out
}
const lexical=(src,problems,where)=>({root:{type:'root',children:[{type:'paragraph',children:inlineNodes(src,problems,where),format:'',indent:0,version:1,direction:'ltr',textFormat:0,textStyle:''}],format:'',indent:0,version:1,direction:'ltr'}})
const plain=s=>String(s??'').replace(/\*\*|\*/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/g,' ').trim()

const FORBIDDEN=[
  [/international\s+cooling\s+solutions/i,'wrong company name'],
  [/industrail/i,'misspelled company'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,'email address'],
  [/\+?\d[\d\s().-]{8,}\d/,'phone-like number'],
  [/\b(buy now|buy online|shop now|order online|add to cart|price list|for sale)\b/i,'commerce wording'],
]
const PRICE=/\$\s?\d|\bUSD\b|\d\s?(?:k|K)\b(?=.*\$)/

const pages={},notes={},problems=[],summary=[]
for(const file of readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){
  const page=JSON.parse(readFileSync(path.join(dir,file),'utf8'))
  const route=routeOf.get(decode(page.path))
  if(!route){problems.push(`${file}: no route for ${page.path}`);continue}
  notes[page.path]={decision:page.decision,omitted:page.omitted??[],claimNotes:page.claimNotes??[],liveWords:page.liveWords??null,restoredWords:page.restoredWords??null}
  const groups=[]
  for(const [gi,g] of (page.groups??[]).entries()){
    const where=`${page.path} group ${gi+1}`
    const blocks=[]
    for(const b of g.blocks??[]){
      const texts=b.type==='heading'?[b.text]:b.type==='paragraph'?[b.text]:b.type==='list'?b.items:b.type==='table'?[...(b.header??[]),...(b.rows??[]).flat()]:b.type==='faq'?(b.items??[]).flatMap(it=>[it.q,it.a]):[]
      for(const t of texts){
        for(const [re,label] of FORBIDDEN)if(re.test(String(t)))problems.push(`${where}: ${label}: "${String(t).slice(0,90)}"`)
        if(PRICE.test(String(t))&&decode(page.path)!==PRICE_PAGE)problems.push(`${where}: price outside the cost article: "${String(t).slice(0,90)}"`)
      }
      if(b.type==='heading'){if(!plain(b.text))problems.push(`${where}: empty heading`);blocks.push({blockType:'restoredHeading',text:plain(b.text),level:String(b.level??2)})}
      else if(b.type==='paragraph'){if(!plain(b.text))continue;blocks.push({blockType:'restoredParagraph',content:lexical(b.text,problems,where)})}
      else if(b.type==='list'){const items=(b.items??[]).filter(x=>plain(x));if(!items.length)continue;blocks.push({blockType:'restoredList',ordered:Boolean(b.ordered),items:items.map(x=>({content:lexical(x,problems,where)}))})}
      else if(b.type==='table'){blocks.push({blockType:'restoredTable',header:(b.header??[]).map(h=>({text:plain(h)})),rows:(b.rows??[]).map(r=>({cells:r.map(c=>({text:plain(c)}))}))})}
      else if(b.type==='faq'){blocks.push({blockType:'restoredFaq',items:(b.items??[]).map(it=>({question:plain(it.q),answer:plain(it.a)}))})}
      else problems.push(`${where}: unsupported block type ${b.type}`)
    }
    if(!blocks.length){problems.push(`${where}: no blocks`);continue}
    groups.push({mode:g.mode,anchor:g.anchor,source:`live https://h2ocooling.com${page.path} (CT SEO parity audit R1 live fetch, 2026-10-04); OGCS R1.2 ${page.decision}; h2o-technical-b2b-content review`,blocks})
  }
  if(!groups.length){summary.push({path:page.path,groups:0,words:0,note:'nothing to restore (staging already carries the live text)'});continue}
  const words=groups.flatMap(g=>g.blocks).map(b=>JSON.stringify(b).match(/"text":"([^"]*)"|"question":"([^"]*)"|"answer":"([^"]*)"/g)??[]).flat().join(' ').replace(/"(text|question|answer)":/g,'').split(/\s+/).filter(Boolean).length
  pages[route.path]={routeId:route.routeId,...(page.h1?{h1:page.h1}:{}),groups}
  summary.push({path:route.path,groups:groups.length,blocks:groups.reduce((n,g)=>n+g.blocks.length,0),words})
}
const OUT=path.join(APP,'ops/seo-pass/data')
mkdirSync(OUT,{recursive:true})
writeFileSync(path.join(OUT,'restored-sections.json'),JSON.stringify(pages,null,1)+'\n')
if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(path.join(evidence,'restored-sections-claim-notes.json'),JSON.stringify(notes,null,1)+'\n')}
process.stdout.write(JSON.stringify({pages:Object.keys(pages).length,summary,problems},null,1)+'\n')
if(problems.length)process.exit(1)
