// Derives the Salmon Elementor CSS-background media map used by the Salmon family
// presentations. Input: a directory of Salmon `post-<id>.css` snapshots (read-only GETs of
// <salmon source origin>/wp-content/uploads/elementor/css/post-<id>.css, and local-<id>-frontend-desktop.css).
// Every background URL must resolve to a held original-library binary; otherwise it is recorded
// as UNRESOLVED and never rendered. No media is invented or substituted.
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
const [cssDir,atomicDir]=process.argv.slice(2)
if(!cssDir)throw new Error('usage: node derive-css-media.mjs <post-css-dir> [local-atomic-css-dir]')
const root=process.cwd()
const library=JSON.parse(readFileSync(path.join(root,'content/salmon/original-library.json'),'utf8'))
const byUrl=new Map(library.map(row=>[row.sourceUrl,row]))
const sourcePath=url=>{try{return new URL(url).pathname}catch{return url}}
// Split a stylesheet into [media, css] blocks: '' is the unconditional (desktop-first) layer.
function layers(css){
  const result=[['',[]]];let depth=0,start=0,media=''
  for(let i=0;i<css.length;i++){
    if(css[i]==='{'){if(depth===0&&css.slice(start,i).trim().startsWith('@media')){media=css.slice(start,i).trim();start=i+1;depth=1;continue};depth++}
    else if(css[i]==='}'){depth--;if(depth===0&&media){result.push([media,css.slice(start,i)]);media='';start=i+1;continue};if(depth===0&&!media){result[0][1].push(css.slice(start,i+1));start=i+1}}
  }
  return result.map(([m,c])=>[m,Array.isArray(c)?c.join(''):c])
}
const COLOR={'--e-global-color-primary':'primary','--e-global-color-secondary':'secondary','--e-global-color-c58817e':'accent-blue','--e-global-color-58be983':'white','--e-global-color-dff8941':'ink','--e-global-color-text':'muted','--e-global-color-a495fd4':'soft'}
function layout(css,element){
  const rules=[...css.matchAll(new RegExp(`\\.elementor-element-${element}(?![0-9a-f])([^{,]*)(?:,[^{]*)?\\{([^}]*)\\}`,'g'))]
  const result={}
  for(const [,selector,body] of rules){
    const own=!selector.trim()
    const dir=body.match(/--flex-direction:(row|column)/)?.[1];if(dir&&own)result.direction=dir
    const widgetWidth=body.match(/--container-widget-width:([0-9.]+)%/)?.[1];if(widgetWidth&&own&&!result.widthPct)result.widthPct=Number(widgetWidth)
    if(/image-box-img(?![\w-])|(?:^|\s)img(?![\w-])/.test(selector)&&!/:hover/.test(selector)){const w=body.match(/(?:^|;)(?:max-)?width:([0-9.]+)(%|px)/);if(w&&!result.imgWidth)result.imgWidth=w[1]+w[2];const r=body.match(/border-radius:([0-9]+)(px|%)/);if(r&&!result.imgRadius)result.imgRadius=r[1]+r[2]}
    const grid=body.match(/--e-con-grid-template-columns:repeat\((\d+), *1fr\)/)?.[1];if(grid&&own&&!result.gridColumns)result.gridColumns=Number(grid)
    const tracks=body.match(/--e-con-grid-template-columns:([0-9.]+%(?: [0-9.]+%)+)(?:;|$)/)?.[1];if(tracks&&own&&!result.gridColumns&&!result.gridTemplate)result.gridTemplate=tracks.split(' ').map(track=>`${Number.parseFloat(track)}fr`).join(' ')
    const width=body.match(/--width:([0-9.]+)%/)?.[1];if(width&&own)result.widthPct=Number(width)
    const align=body.match(/(?:^|;)text-align:(center|start|left|end|right)/)?.[1];if(align)result.align=align==='left'?'start':align==='right'?'end':align
    const backgroundLayer=own||selector.trim().startsWith(':not(.elementor-motion-effects-element-type-background)')
    const gradient=body.match(/background-image:(linear-gradient\([^;]+\))/)?.[1];if(gradient&&backgroundLayer)result.backgroundGradient=gradient.replace(/var\( *(--[a-z0-9-]+) *\)/g,(_,name)=>COLOR[name]??name).toLowerCase()
    const bg=body.match(/background-color:([^;]+)/)?.[1]?.trim();if(bg&&bg!=='transparent'&&backgroundLayer)result.background=COLOR[bg.match(/var\( *(--[a-z0-9-]+)/)?.[1]]??(bg.startsWith('#')?bg.toLowerCase():undefined)
    if(own&&/--border-radius:[1-9]/.test(body))result.rounded=true
    if(own&&!result.radius){const r=body.match(/(?:^|;)border-radius:([0-9]+)px/)?.[1];if(r&&Number(r)>0){result.rounded=true;result.radius=Number(r)}}
    if(own&&/--overlay-opacity/.test(body)){result.overlay=true;const opacity=body.match(/--overlay-opacity:([0-9.]+)/)?.[1];if(opacity)result.overlayOpacity=Number(opacity)}
    if(own){const min=body.match(/--min-height:([0-9]+)px/)?.[1];if(min)result.minHeight=Number(min);const radius=body.match(/--border-radius:([0-9]+)px/)?.[1];if(radius)result.radius=Number(radius);if(/--justify-content:flex-end/.test(body))result.justify='end';if(/--justify-content:center/.test(body))result.justify='center'}
    if(selector.trim().startsWith('::before')){const color=body.match(/background-color:([^;]+)/)?.[1]?.trim();const gradient=body.match(/background-image:(linear-gradient\([^;]+\))/)?.[1];if(color)result.overlayColor=COLOR[color.match(/var\( *(--[a-z0-9-]+)/)?.[1]]??color.toLowerCase();if(gradient)result.overlayGradient=gradient.replace(/var\( *(--[a-z0-9-]+) *\)/g,(_,name)=>COLOR[name]??name)}
    if(/\.elementor-icon(?![-\w])/.test(selector)&&!/:hover/.test(selector)){const bg=body.match(/background-color:([^;]+)/)?.[1]?.trim();if(bg&&!result.iconBackground)result.iconBackground=COLOR[bg.match(/var\( *(--[a-z0-9-]+)/)?.[1]]??bg.toLowerCase()}
    const part=own?'self':/heading-title|icon-box-title|image-box-title/.test(selector)?'title':/description|icon-list-text/.test(selector)?'text':/elementor-button/.test(selector)?'button':undefined
    if(part&&!/:hover/.test(selector)){
      const family=body.match(/font-family:"([^"]+)"/)?.[1],size=body.match(/(?:^|;)font-size:([0-9.]+)px/)?.[1],color=body.match(/(?:^|;)color:([^;]+)/)?.[1]?.trim(),weight=body.match(/font-weight:([0-9]+)/)?.[1],transform=body.match(/text-transform:(uppercase|capitalize|none)/)?.[1]
      const type={...(family?{family:/bebas/i.test(family)?'display':/mono/i.test(family)?'mono':'sans'}:{}),...(size?{size:Number(size)}:{}),...(weight?{weight:Number(weight)}:{}),...(transform?{transform}:{}),...(color?{color:COLOR[color.match(/var\( *(--[a-z0-9-]+)/)?.[1]]??(color.startsWith('#')?color.toLowerCase():undefined)}:{})}
      if(Object.keys(type).length)result[`${part}Type`]={...(result[`${part}Type`]??{}),...type}
      if(part==='button'){const bg=body.match(/background-color:([^;]+)/)?.[1]?.trim();if(bg&&!result.buttonBackground)result.buttonBackground=COLOR[bg.match(/var\( *(--[a-z0-9-]+)/)?.[1]]??bg.toLowerCase();if(/border-style:(solid|dashed)/.test(body))result.buttonBorder=true}
    }
  }
  return result
}
const out={authority:'SALMON_ELEMENTOR_CSS_BACKGROUND_DERIVATION_2026_09_28',source:'<salmon source origin>/wp-content/uploads/elementor/css/post-<id>.css (origin as recorded in content/salmon/original-library.json)',routes:{}}
for(const file of readdirSync(cssDir).filter(name=>/^post-\d+\.css$/.test(name)).sort()){
  const id=file.match(/\d+/)[0]
  if(id==='5')continue // global kit: tokens only
  const bytes=readFileSync(path.join(cssDir,file)),css=bytes.toString()
  const elements={},layoutMap={}
  const [[,base],...media]=layers(css),tablet=media.filter(([m])=>/min-width:768px/.test(m)).map(([,c])=>c).join(''),mobile=media.filter(([m])=>/max-width:767px/.test(m)).map(([,c])=>c).join('')
  for(const element of new Set([...css.matchAll(/\.elementor-element-([0-9a-f]{7})(?![0-9a-f])/g)].map(m=>m[1]))){
    const desktop=layout(base,element),wide=layout(tablet,element),narrow=layout(mobile,element)
    const merged={...desktop,...(wide.widthPct?{widthPct:wide.widthPct}:{}),...(wide.direction&&!desktop.direction?{direction:wide.direction}:{})}
    if(narrow.align&&narrow.align!==merged.align)merged.mobileAlign=narrow.align
    if(Object.keys(merged).length)layoutMap[element]=merged
  }
  for(const match of css.matchAll(/\.elementor-element-([0-9a-f]{7})((?::[a-z-]+)?)[^{,]*\{([^}]*)\}/g)){
    const [,element,,body]=match
    const url=body.match(/background-image:url\("?([^")]+)"?\)/)?.[1]
    if(!url||elements[element])continue
    const decoded=decodeURI(url),row=byUrl.get(url)??byUrl.get(decoded)
    const local=row&&existsSync(path.join(root,'public',row.publicPath))
    const fit=body.match(/background-size:(cover|contain|auto)/)?.[1],position=body.match(/background-position:([a-z0-9% ]+?)(?:;|$)/)?.[1]?.trim()
    elements[element]=row&&local?{state:'SOURCE_BINARY_HELD',sourcePath:sourcePath(row.sourceUrl),src:row.publicPath,sha256:row.sha256,width:row.width,height:row.height,attachmentId:row.attachmentId,...(fit?{fit}:{}),...(position?{position}:{})}:{state:'UNRESOLVED',sourcePath:sourcePath(url)}
  }
  out.routes[`SALMON-pages-${id}`]={cssSha256:createHash('sha256').update(bytes).digest('hex'),elements,layout:layoutMap}
}
// Atomic (Elementor v4) elements: `.elementor .e-<hash>{...}` in local-<id>-frontend-desktop.css.
// Keyed by the atomic class, which the source document carries on the same element.
if(atomicDir)for(const file of readdirSync(atomicDir).filter(name=>/^local-\d+\.css$/.test(name)).sort()){
  const id=file.match(/\d+/)[0],bytes=readFileSync(path.join(atomicDir,file)),css=bytes.toString(),key=`SALMON-pages-${id}`
  const route=out.routes[key]??={cssSha256:null,elements:{},layout:{}}
  route.atomicCssSha256=createHash('sha256').update(bytes).digest('hex')
  const [[,base]]=layers(css)
  for(const [,cls,body] of base.matchAll(/\.elementor \.(e-[0-9a-f]{7})\{([^}]*)\}/g)){
    const url=[...body.matchAll(/url\("?([^")]+)"?\)/g)].map(m=>m[1]).at(-1)
    const layout={}
    if(url){
      // A WordPress size variant (`name-1024x857.ext`) resolves to its held full-size original.
      const original=url.replace(/-\d+x\d+(\.[a-z]+)$/i,'$1')
      const exact=byUrl.get(url)??byUrl.get(decodeURI(url)),row=exact??byUrl.get(original)??byUrl.get(decodeURI(original))
      route.elements[cls]=row&&existsSync(path.join(root,'public',row.publicPath))?{state:'SOURCE_BINARY_HELD',sourcePath:sourcePath(url),src:row.publicPath,sha256:row.sha256,width:row.width,height:row.height,attachmentId:row.attachmentId,...(exact?{}:{resolution:'WORDPRESS_SIZE_VARIANT_TO_HELD_ORIGINAL',originalPath:sourcePath(row.sourceUrl)})}:{state:'UNRESOLVED',sourcePath:sourcePath(url)}
      const veil=body.match(/linear-gradient\((#[0-9a-f]{8}), *#[0-9a-f]{8}\)/i)?.[1]
      if(veil){layout.overlay=true;layout.overlayColor=veil.toLowerCase()}
    }
    const height=body.match(/(?:^|;)(?:min-)?height:([0-9]+)px/)?.[1];if(height)layout.minHeight=Number(height)
    if(/flex-direction:row/.test(body))layout.direction='row'
    if(/justify-content:center/.test(body))layout.justify='center'
    if(/align-items:center/.test(body)&&/text-align:center|justify-content:center/.test(body))layout.align='center'
    const radius=body.match(/border-radius:([0-9]+)px/)?.[1];if(radius){layout.rounded=true;layout.radius=Number(radius)}
    if(Object.keys(layout).length)route.layout[cls]={...(route.layout[cls]??{}),...layout}
  }
}
writeFileSync(path.join(root,'content/salmon/parity-css-backgrounds.json'),JSON.stringify(out,null,1)+'\n')
const all=Object.values(out.routes).flatMap(route=>Object.values(route.elements)),layoutCount=Object.values(out.routes).reduce((n,route)=>n+Object.keys(route.layout).length,0)
console.log(JSON.stringify({routes:Object.keys(out.routes).length,elements:all.length,held:all.filter(e=>e.state==='SOURCE_BINARY_HELD').length,unresolved:all.filter(e=>e.state!=='SOURCE_BINARY_HELD').length,layoutElements:layoutCount}))
