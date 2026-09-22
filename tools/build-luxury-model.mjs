import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {createRequire} from 'node:module'
const sharp=createRequire(new URL('../apps/h2o/package.json',import.meta.url))('sharp')
const authority=path.resolve('../h2o-luxury-design-authority'),out=path.resolve('../luxury-evidence'),content='apps/h2o/content/luxury'
mkdirSync(content,{recursive:true});mkdirSync('apps/h2o/public/media/luxury',{recursive:true})
const designs=JSON.parse(readFileSync(path.join(out,'design-trees.json'))),media=[],mapping=[],unmatched=[]
const norm=s=>s.replace(/\s+/g,' ').trim(),plain=n=>typeof n==='string'?n:n.children.map(plain).join('')
const routes=JSON.parse(readFileSync('apps/h2o/content/salmon/active-routes.json'))
const known=new Set(routes.map(r=>r.targetPath))
const hash=b=>createHash('sha256').update(b).digest('hex')
const held=JSON.parse(readFileSync('apps/h2o/content/salmon/media-identities.json'))
const enhancement=new Map(readFileSync(path.join(authority,'manifests/IMAGE_ENHANCEMENT_LEDGER.tsv'),'utf8').trim().split('\n').slice(1).map(line=>{const cols=line.split('\t');return [cols[0],cols[2]]}))
const placements=[]
const styleObj=s=>Object.fromEntries((s??'').split(';').filter(s=>s.includes(':')).map(s=>{const i=s.indexOf(':');return [s.slice(0,i).trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),s.slice(i+1).trim()]}))
for(const design of designs){
 const doc=JSON.parse(readFileSync(`apps/h2o/content/salmon/documents/SALMON-pages-${design.id}.json`))
 const source=[],used=new Set(),ranges=new Map(),parents=new Map();
 function index(n,key,ancestry=[]){if(typeof n==='string')return;source.push({node:n,key,text:norm(plain(n)),leaves:leaves(n,key),ancestry});n.children.forEach((c,i)=>{parents.set(key+'.'+i,key);index(c,key+'.'+i,[...ancestry,key])})}
 function leaves(n,key){if(typeof n==='string')return n.trim()?[key]:[];return n.children.flatMap((c,i)=>leaves(c,key+'.'+i))}
 doc.children.forEach((n,i)=>index(n,'body.'+i))
 const nodes=new Map(source.map(s=>[s.key,s.node]))
 const byText=new Map();for(const s of source){if(!s.text)continue;const list=byText.get(s.text)??[];list.push(s);byText.set(s.text,list)}
 // Smallest semantic source node wins; no page copy is serialized into presentation data.
 const matches=text=>(byText.get(text)??[]).filter(s=>s.leaves.every(k=>!used.has(k)&&!ranges.has(k))).sort((a,b)=>a.leaves.length-b.leaves.length||b.key.length-a.key.length)
 const sections=design.tree.children.filter(n=>typeof n!=='string'&&n.tag!=='header'&&n.tag!=='footer'&&n.tag!=='dc-import'&&!plain(n).includes('Design authority — not implemented')&&!((n.attrs.style??'').includes('font-size:11px')&&plain(n).includes('SALMON-')))
 let seq=0
 async function asset(src){const file=path.resolve(authority,src.replace(/^\.\//,''));if(!file.startsWith(authority+'/')||!existsSync(file))throw Error('Missing approved asset '+src);const bytes=readFileSync(file),sha=hash(bytes),name=sha.slice(0,16)+'-'+path.basename(file),dest='apps/h2o/public/media/luxury/'+name;copyFileSync(file,dest);const info=await sharp(file).metadata();if(!media.some(m=>m.sha256===sha))media.push({original_path:path.relative(process.cwd(),file),sha256:sha,width:info.width,height:info.height,publicPath:'/media/luxury/'+name,designSource:src,identity:'UNKNOWN_UNLESS_CANONICAL_CONTEXT_ESTABLISHES',derivative:src.includes('/graded/')});return '/media/luxury/'+name}
 async function convert(n){
  if(typeof n==='string'){const text=norm(n);if(!text)return null;const found=matches(text)[0];if(!found)return null;found.leaves.forEach(k=>used.add(k));return {tag:'span',ref:found.key,children:[]}}
  const text=norm(plain(n)),style=styleObj(n.attrs.style),id=++seq
  if(n.tag==='script'||n.tag==='style'||n.tag==='helmet')return null
  if(/IMAGE NOT HELD|NOT HELD/.test(text)&&text.length<300)return null
  const result={tag:n.tag,style,id,children:[]}
  if(n.tag==='img'){result.src=await asset(n.attrs.src);const selected=media.find(m=>m.publicPath===result.src),originalSha=enhancement.get(n.attrs.src.replace(/^\.\//,''))??selected.sha256;const source=doc.images.find(i=>held.find(m=>m.url===new URL(i.src,doc.sourceUrl).href)?.sha256===originalSha);result.alt=source?source.alt??'':n.attrs.alt??'';result.canonicalSource=source?.src;placements.push({route:design.route,designNode:id,publicPath:result.src,sourceOriginalSha256:originalSha,canonicalSource:source?.src??null,canonicalAlt:source?.alt??null,designAlt:n.attrs.alt??'',renderedAlt:result.alt,association:source?'CANONICAL_ASSOCIATION_APPROVED_DERIVATIVE':'EXPLICIT_DESIGN_SELECTED_PLACEMENT'});return result}
  const elements=n.children.filter(c=>typeof c!=='string')
  const found=(['h1','h2','h3','h4','h5','h6','p','blockquote'].includes(n.tag)||elements.length===0)?matches(text)[0]:undefined
  if(found&&text){
   found.leaves.forEach(k=>used.add(k));result.ref=found.key;result.children=[]
   if(/^h[1-6]$/.test(n.tag)&&!/^h[1-6]$/.test(found.node.tag)){const ancestor=[found.key,...found.ancestry.reverse()].map(k=>({key:k,node:nodes.get(k)})).find(x=>/^h[1-6]$/.test(x.node.tag)&&norm(plain(x.node))===text);if(ancestor)result.ref=ancestor.key}
   mapping.push({route:design.route,designNode:id,sourceNode:result.ref,state:'EXACT_CANONICAL_NODE'})
   return result
  }
  if(text.length>30&&(['p','h1','h2','h3','h4'].includes(n.tag)||elements.length===0)){
   const target=text.replace(/\s/g,''),list=design.leaves
   for(let a=0;a<list.length;a++){if(used.has(list[a].key)||ranges.has(list[a].key))continue;let joined='';const keys=[]
    for(let b=a;b<Math.min(list.length,a+15);b++){if(used.has(list[b].key)||ranges.has(list[b].key))break;joined+=list[b].text.replace(/\s/g,'');keys.push(list[b].key);if(!target.startsWith(joined))break;if(joined===target){keys.forEach(k=>used.add(k));result.refs=keys;mapping.push({route:design.route,designNode:id,sourceNode:keys,state:'EXACT_CANONICAL_FRAGMENTS'});return result}}
   }
  }
  // Bind a mockup's split heading/paragraph to exact ranges of one canonical text node.
  // The range owns no text: rendering always slices the hash-verified source document.
  if(text.length>=12&&!style.fontFamily?.includes('Mono')&&(['p','h1','h2','h3','h4'].includes(n.tag)||elements.length===0)){
   const folded=s=>s.replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,'')
   const target=folded(text)
   for(const l of design.leaves){if(used.has(l.key))continue;const compact=folded(l.text),at=compact.indexOf(target);if(at<0)continue
    const heading=source.filter(s=>/^h[1-6]$/.test(s.node.tag)&&s.leaves.includes(l.key)).sort((a,b)=>b.key.length-a.key.length)[0]
    if(heading){if(!/^h[1-6]$/.test(n.tag)||heading.leaves.some(k=>used.has(k)||ranges.has(k)))continue;heading.leaves.forEach(k=>used.add(k));result.ref=heading.key;mapping.push({route:design.route,designNode:id,sourceNode:heading.key,state:'CANONICAL_HEADING_RESTORED_OVER_CONDENSED_DESIGN'});return result}
    const positions=[];for(let j=0;j<l.text.length;j++)if(!/\s/.test(l.text[j]))positions.push(j)
    const start=positions[at],end=positions[at+target.length-1]+1,prior=ranges.get(l.key)??[]
    if(prior.some(([a,b])=>start<b&&end>a))continue
    ranges.set(l.key,[...prior,[start,end]]);result.slice={ref:l.key,start,end};mapping.push({route:design.route,designNode:id,sourceNode:l.key,start,end,state:'EXACT_CANONICAL_RANGE'});return result
   }
  }
  if(elements.length===0&&text){
   if(/^0?\d{1,2}$/.test(text)||text==='→'){result.decor=text;return result}
   if(/^(Buy Now|Request a Quote)$/i.test(text)){result.action='rfq';return result}
   if(text==='Search'){result.action='search';return result}
   const partial=source.filter(s=>s.text===text.replace(/ · /g,' '))[0]
   unmatched.push({route:design.route,id,text,state:partial?'PRESENTATION_DIFFERENCE':'DESIGN_ONLY_OMITTED'})
   return null
  }
  result.children=(await Promise.all(n.children.map(convert))).filter(Boolean)
  if(!result.children.length&&text)return null
  return result
 }
 const tree=(await Promise.all(sections.map(convert))).filter(Boolean)
 // Duplicate matches are processed synchronously before async image copies resume.
 const remaining=[]
 function prune(n,key){if(typeof n==='string'){
  if(!n.trim()||used.has(key))return null
  const spans=ranges.get(key);if(!spans)return {ref:key}
  let cursor=0;const children=[];for(const [a,b]of spans.sort((x,y)=>x[0]-y[0])){if(n.slice(cursor,a).trim())children.push({slice:{ref:key,start:cursor,end:a}});cursor=b}if(n.slice(cursor).trim())children.push({slice:{ref:key,start:cursor,end:n.length}})
  return children.length?{tag:'span',children}:null
 }
  if(['script','style','iframe','svg','template','input','textarea','img'].includes(n.tag))return null
  const c=n.children.map((v,i)=>prune(v,key+'.'+i)).filter(Boolean);if(!c.length)return null
  return {tag:n.tag,key,children:c}
 }
 doc.children.forEach((n,i)=>{const item=prune(n,'body.'+i);if(item)remaining.push({sourceSection:'body.'+i,tree:item})})
 // The two source search labels are one usable search form, not repeated design-only boxes.
 function searchSurface(n){const s=n.style??{};if(s.display==='flex'&&s.background==='#FFFFFF'&&['60px','64px','66px','68px','56px','70px'].includes(s.height)){const refs=[];function collect(v){if(v.ref)refs.push(v.ref);v.refs?.forEach(r=>refs.push(r));v.children?.forEach(collect)}collect(n);n.action='search-form';n.refs=refs;n.children=[]}else n.children?.forEach(searchSurface)}
 tree.forEach(searchSurface)
 writeFileSync(content+'/'+design.id+'.json',JSON.stringify({route:design.route,sourceId:doc.routeId,designFile:design.name+'.dc.html',tree,remaining},null,2))
 console.log(design.route,'bound',used.size,'of',design.leaves.length,'source text fragments; remainder',remaining.length)
}
writeFileSync(content+'/media.json',JSON.stringify(media,null,2))
writeFileSync(path.join(out,'design-binding-map.json'),JSON.stringify(mapping,null,2))
writeFileSync(path.join(out,'design-text-differences.json'),JSON.stringify(unmatched,null,2))
writeFileSync(path.join(out,'media-placement-map.json'),JSON.stringify(placements,null,2))
