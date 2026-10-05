import {renderSalmonNode} from './SalmonCanonical'
import {restoredSlot} from '../content/restored-sections'
import type {SalmonDocument,SalmonNode} from './salmon'

/** Nodes restored into a template slot (content/restored-sections; content model change 2026-10-05). */
export const restoredSlotNodes=(doc:SalmonDocument,slot:string):SalmonNode[]=>restoredSlot(doc.children,slot) as SalmonNode[]

/**
 * A template-owned slot for restored sections on templates with a fixed layout (archive intro, parts-index intro, the
 * product description, the end of family and luxury pages). Renders nothing when the page has none. The source nodes render
 * through the accepted Salmon node renderer, in the template's existing reading styles (no new CSS).
 */
export function RestoredSlot({doc,slot,className}:{doc:SalmonDocument;slot:string;className:string}){
  const nodes=restoredSlotNodes(doc,slot)
  if(!nodes.length)return null
  return <section className={className} data-restored-slot-render={slot}>{nodes.map((node,i)=>renderSalmonNode(node,`restored.${slot}.${i}`,doc))}</section>
}
