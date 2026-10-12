/**
 * FBG-11 (OGCS audit fix-before-go, CT 2026-10-11): the "Additional information" table of a product page shows the WooCommerce attribute slugs and an
 * unsorted value list: "brand", "diameters", "tower-type", "number-of-blades" and "10, 11, 12, 6, 7, 8, 9". Read-time template transform (pure, no
 * database step): the four labels read "Brand", "Diameters", "Tower type", "Number of blades"; a value list sorts ascending by its numbers (a mixed
 * list keeps its text values after the numbers, in their order). Applies to every product page (about 213) and to nothing else.
 */
import type {SalmonNode} from './salmon'

type El=Exclude<SalmonNode,string>
export const ATTRIBUTE_LABELS:Readonly<Record<string,string>>=Object.freeze({brand:'Brand',diameters:'Diameters','tower-type':'Tower type','number-of-blades':'Number of blades'})
const SEPARATOR=/,[\s\u00a0]*/
/** A token that starts with a number: "9", "10", "20 ft". */
const numberOf=(token:string):number|null=>{const m=/^(\d+(?:\.\d+)?)(?:[\s\u00a0].*)?$/.exec(token.trim());return m?Number(m[1]):null}

/** A comma-separated value list sorted ascending by number; text values (no leading number) follow in their original order. Fewer than two values: unchanged. */
export function sortAttributeValues(value:string):string{
  const tokens=value.split(SEPARATOR).map(t=>t.trim()).filter(Boolean)
  if(tokens.length<2)return value
  const numeric=tokens.map((t,i)=>({t,i,n:numberOf(t)})).filter(x=>x.n!==null)
  if(!numeric.length)return value
  numeric.sort((a,b)=>a.n!-b.n!||a.i-b.i)
  const text=tokens.filter(t=>numberOf(t)===null)
  return [...numeric.map(x=>x.t),...text].join(', ')
}

/** The tokens of a value cell: element nodes (attribute links without an href) and the pieces of its text, split at commas. */
function valueTokens(children:SalmonNode[]):SalmonNode[]{
  const tokens:SalmonNode[]=[]
  for(const c of children){
    if(typeof c==='string'){for(const piece of c.split(SEPARATOR).map(x=>x.trim()).filter(Boolean))tokens.push(piece)}
    else tokens.push(c)
  }
  return tokens
}
const tokenText=(n:SalmonNode):string=>typeof n==='string'?n:n.children.map(tokenText).join('')
/** Sorted children for a value cell (tokens joined by ", "), or null when the cell has fewer than two values, no number, or is already in order. */
function sortValueNodes(children:SalmonNode[]):SalmonNode[]|null{
  if(children.some(c=>isEl(c)&&c.tag!=='a'&&c.tag!=='span'&&c.tag!=='p'))return null
  const tokens=valueTokens(children.length===1&&isEl(children[0]!)&&(children[0] as El).tag==='p'?(children[0] as El).children:children)
  if(tokens.length<2)return null
  const items=tokens.map((t,i)=>({t,i,n:numberOf(tokenText(t))}))
  if(!items.some(x=>x.n!==null))return null
  const numeric=items.filter(x=>x.n!==null).sort((a,b)=>a.n!-b.n!||a.i-b.i)
  const text=items.filter(x=>x.n===null)
  const ordered=[...numeric,...text]
  if(ordered.every((x,k)=>x.i===k))return null
  const joined:SalmonNode[]=[]
  ordered.forEach((x,k)=>{if(k)joined.push(', ');joined.push(x.t)})
  return children.length===1&&isEl(children[0]!)&&(children[0] as El).tag==='p'?[{...(children[0] as El),children:joined}]:joined
}
const isEl=(n:SalmonNode):n is El=>typeof n!=='string'
const textLeaves=(n:SalmonNode):string[]=>typeof n==='string'?(n.trim()?[n]:[]):n.children.flatMap(textLeaves)
const mapLeaf=(n:SalmonNode,f:(s:string)=>string):SalmonNode=>typeof n==='string'?(n.trim()?f(n):n):{...n,children:n.children.map(c=>mapLeaf(c,f))}

/** Apply to the children of the Additional information panel. The same array when nothing changes. */
export function tidyAdditionalInfo(nodes:SalmonNode[]):SalmonNode[]{
  let changed=false
  const visit=(n:SalmonNode):SalmonNode=>{
    if(!isEl(n))return n
    if(n.tag==='th'){
      const leaves=textLeaves(n)
      const label=leaves.length===1?ATTRIBUTE_LABELS[leaves[0]!.trim().toLowerCase()]:undefined
      if(label&&leaves[0]!.trim()!==label){changed=true;return mapLeaf(n,()=>label)}
      return n
    }
    if(n.tag==='td'){
      const sorted=sortValueNodes(n.children)
      if(sorted){changed=true;return {...n,children:sorted}}
      return n
    }
    const children=n.children.map(visit)
    return children.some((c,i)=>c!==n.children[i])?{...n,children}:n
  }
  const out=nodes.map(visit)
  return changed?out:nodes
}
