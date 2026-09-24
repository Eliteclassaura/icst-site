import {readFileSync} from 'node:fs'
import path from 'node:path'
import {salmonRoutes,salmonDocument,type SalmonDocument} from './salmon'
import {renderSalmonNode} from './SalmonCanonical'
import {sourceIntroduction,sourceProjectName} from './AuthorityEditorial'

export function ProjectAuthorityIndex({doc}:{doc:SalmonDocument}){
  const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean}>}
  const sources=salmonRoutes()
  const projects=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&row.path.startsWith('/all-projects/')&&row.path!=='/all-projects/').map(row=>{
    const source=sources.find(candidate=>candidate.routeId===row.routeId)
    if(!source)throw new Error(`Missing project source: ${row.routeId}`)
    return {row,doc:salmonDocument(source)}
  })
  return <main id="main" className="luxury-site authority-projects" data-salmon-region="body">
    <header className="authority-projects-opening">{sourceIntroduction(doc).map(piece=>renderSalmonNode(piece.node,piece.key,doc))}</header>
    <nav className="authority-project-list" aria-label="Project detail records">{projects.map(({row,doc:project})=><a href={row.path} key={row.routeId} data-project-source={row.routeId}>
      <span>{sourceProjectName(project)}</span><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
    </a>)}</nav>
  </main>
}
