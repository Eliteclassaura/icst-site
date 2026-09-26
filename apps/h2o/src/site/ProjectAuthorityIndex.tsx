import {readFileSync} from 'node:fs'
import path from 'node:path'
import {salmonRoutes,salmonDocument,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'
import {renderSalmonNode} from './SalmonCanonical'
import {sourceIntroduction,sourceProjectName} from './AuthorityEditorial'
import {R2Discovery} from './R2Discovery'

function firstDescription(node:SalmonNode):string|undefined{
  if(typeof node==='string')return undefined
  if(node.tag==='p'){
    const value=salmonNodeText(node).replace(/\s+/g,' ').trim()
    if(value.length>80){const sentence=value.match(/^.*?[.!?](?=\s|$)/)?.[0];return sentence&&sentence.length>35?sentence:value.slice(0,210).replace(/\s+\S*$/,'')+'…'}
  }
  for(const child of node.children){const found=firstDescription(child);if(found)return found}
  return undefined
}

export function ProjectAuthorityIndex({doc}:{doc:SalmonDocument}){
  const intro=sourceIntroduction(doc)
  const orderedIntro=[...intro.filter(piece=>typeof piece.node!=='string'&&piece.node.tag==='h1'),...intro.filter(piece=>typeof piece.node==='string'||piece.node.tag!=='h1')]
  const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean}>}
  const sources=salmonRoutes()
  const projects=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&row.path.startsWith('/all-projects/')&&row.path!=='/all-projects/').map(row=>{
    const source=sources.find(candidate=>candidate.routeId===row.routeId)
    if(!source)throw new Error(`Missing project source: ${row.routeId}`)
    const project=salmonDocument(source)
    return {row,doc:project,summary:project.children.map(firstDescription).find(Boolean)}
  })
  return <main id="main" className="luxury-site authority-projects" data-salmon-region="body">
    <header className="authority-projects-opening">{orderedIntro.map(piece=>renderSalmonNode(piece.node,piece.key,doc))}</header>
    <nav className="authority-project-list" aria-label="Project detail records">{projects.map(({row,doc:project,summary},index)=><a href={row.path} key={row.routeId} data-project-source={row.routeId}>
      <span className="project-record-number">{String(index+1).padStart(2,'0')}</span><span className="project-record-body"><strong>{sourceProjectName(project)}</strong>{summary?<small>{summary}</small>:null}</span><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
    </a>)}</nav>
    <R2Discovery kind="projects"/>
  </main>
}
