import {RfqMount} from './RfqMount'
import {isPayloadContent} from '../content/runtime-read'
import {renderSalmonNode} from './SalmonCanonical'
import type {SalmonDocument,SalmonNode} from './salmon'

type ProjectPiece={node:SalmonNode;key:string;tag:string}
const semantic=/^(h[1-6]|p|ul|ol|img|figure|table|blockquote)$/
function collect(node:SalmonNode,key:string):ProjectPiece[]{
  if(typeof node==='string')return node.trim()?[{node,key,tag:'text'}]:[]
  if(['script','style','iframe','svg','template'].includes(node.tag))return []
  if(semantic.test(node.tag))return [{node,key,tag:node.tag}]
  return node.children.flatMap((child,index)=>collect(child,`${key}.${index}`))
}

export function ProjectDetail({doc}:{doc:SalmonDocument}){
  const all=doc.children.flatMap((node,index)=>collect(node,`body.${index}`))
  const titleIndex=all.findIndex(piece=>piece.tag==='h1')
  const imageIndex=all.findIndex(piece=>piece.tag==='img')
  const title=all[titleIndex]
  const image=all[imageIndex]
  const before=all.filter((_,index)=>index<titleIndex&&index!==imageIndex)
  const after=all.filter((_,index)=>index>titleIndex&&index!==imageIndex)
  const render=(piece:ProjectPiece)=>renderSalmonNode(piece.node,piece.key,doc)
  return <main id="main" className="luxury-site project-detail" data-salmon-region="body">
    <header className="project-detail-hero">
      <div className="project-detail-hero-copy"><a href="/all-projects/" className="project-detail-back">← All projects</a><span className="project-detail-eyebrow">Industrial cooling project</span>{title?render(title):<h1>{doc.seo.h1[0]}</h1>}</div>
      {image?<div className="project-detail-image">{render(image)}</div>:null}
    </header>
    <div className="project-detail-body">
      <section className="project-detail-description" aria-label="Project description">{before.map(render)}</section>
      <aside className="project-detail-record" aria-label="Project record">{after.map(render)}</aside>
    </div>
    <nav className="project-detail-next" aria-label="Project and enquiry links"><a href="/all-projects/">View all projects <span aria-hidden="true">↗</span></a>{isPayloadContent()?<span className="project-detail-quote" data-rfq-decision="D4"><RfqMount mountId="editorial_inline" routePath={doc.targetPath} label="Request a Quote"/></span>:<a href="/contact-us/">Request a Quote <span aria-hidden="true">↗</span></a>}</nav>
  </main>
}
