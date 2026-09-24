import {renderSalmonNode} from './SalmonCanonical'
import {salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'

type Piece={node:SalmonNode;key:string}
// Remove only inherited presentation wrappers; retain source semantic nodes and text.
function pieces(node:SalmonNode,key:string):Piece[]{
  if(typeof node==='string')return node.trim()?[{node,key}]:[]
  if(['script','style','iframe','svg','template'].includes(node.tag))return []
  if(/^(h[1-6]|p|ul|ol|img|figure|table|blockquote|a)$/.test(node.tag))return [{node,key}]
  return node.children.flatMap((child,i)=>pieces(child,`${key}.${i}`))
}
export function AuthorityEditorial({doc}:{doc:SalmonDocument}){
  const sections=doc.children.map((node,i)=>pieces(node,`body.${i}`).filter(piece=>doc.routeId!=='SALMON-pages-1931'||!/^((?:Industrial Cooling Solutions in Saudi Arabia)|(?:Saudi Arabia is ICS’s newest regional office)|(?:ICS is a registered company in the Kingdom of Saudi Arabia))/.test(salmonNodeText(piece.node).trim()))).filter(group=>group.length)
  return <main id="main" className="luxury-site authority-editorial" data-salmon-region="body">
    {sections.map((group,i)=>{
      const heading=group.find(piece=>typeof piece.node!=='string'&&/^h[1-6]$/.test(piece.node.tag))
      const rest=group.filter(piece=>piece!==heading)
      return <section className={`authority-section${i===0?' authority-opening':''}`} key={i}>
        <div className="authority-heading">{heading?renderSalmonNode(heading.node,heading.key,doc):null}</div>
        <div className="authority-content">{rest.map(piece=>renderSalmonNode(piece.node,piece.key,doc))}</div>
      </section>
    })}
  </main>
}

export function sourceProjectName(doc:SalmonDocument):string{
  const heading=doc.seo.h1[0]
  if(!heading)throw new Error(`Project H1 authority missing: ${doc.routeId}`)
  return heading
}
export const sourceIntroduction=(doc:SalmonDocument):Piece[]=>{
  const first=doc.children.find(node=>typeof node!=='string'&&salmonNodeText(node).trim())
  return first?pieces(first,`body.${doc.children.indexOf(first)}`).filter(({node})=>typeof node!=='string'&&/^(h[12]|p)$/.test(node.tag)):[]
}
