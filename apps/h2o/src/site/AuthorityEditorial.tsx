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
// Routes whose source has no H1: the opening section's heading is the page H1 (OGCS_H1_DECISIONS_2026-10-02,
// Control Tower ruling). Same node, text and styling (.authority-opening styles h1 and h2 alike); no duplicate.
const PROMOTED_OPENING_HEADING=new Set(['SALMON-b2503fcd6ca86806'])
const promoted=(node:SalmonNode):SalmonNode=>typeof node==='string'||node.tag!=='h2'?node:{...node,tag:'h1'}
export function AuthorityEditorial({doc}:{doc:SalmonDocument}){
  const promote=PROMOTED_OPENING_HEADING.has(doc.routeId)&&!doc.seo.h1.length
  const about=doc.routeId==='SALMON-pages-1931'
  const sections=doc.children.map((node,i)=>pieces(node,`body.${i}`).filter(piece=>{
    if(!about)return true
    const value=salmonNodeText(piece.node).trim()
    // Historical location tabs are bare decorative strings, not office claims.
    if(i===13&&typeof piece.node==='string'&&['USA','Thailand','Japan','Saudi Arabia'].includes(value))return false
    return !/^((?:Industrial Cooling Solutions in Saudi Arabia)|(?:Saudi Arabia is ICS’s newest regional office)|(?:ICS is a registered company in the Kingdom of Saudi Arabia))/.test(value)
  })).filter(group=>group.length)
  return <main id="main" className={`luxury-site authority-editorial${about?' authority-about':''}`} data-salmon-region="body">
    {sections.map((group,i)=>{
      const heading=group.find(piece=>typeof piece.node!=='string'&&/^h[1-6]$/.test(piece.node.tag))
      const rest=group.filter(piece=>piece!==heading)
      return <section className={`authority-section${i===0?' authority-opening':''}`} key={i} data-authority-section={i}>
        <div className="authority-heading">{heading?renderSalmonNode(promote&&i===0?promoted(heading.node):heading.node,heading.key,doc):null}</div>
        <div className="authority-content">{rest.map(piece=>renderSalmonNode(piece.node,piece.key,doc))}{about&&i===1?<div className="about-presence-list" aria-label="Confirmed ICS presence"><span>Lakewood, Colorado <small>Main office</small></span><span>Japan <small>Confirmed presence</small></span><span>Bangkok, Thailand <small>Confirmed presence</small></span></div>:null}</div>
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
