import {R5Chips} from './r5/R5Parts'
import {MOORE_FANS_LEAD,MOORE_FANS_LINKS} from './moore-fans'

/** CLIENT-FIX-1: the Moore Fans entry on the two fan listings (heading, the page's own subtitle, links to the Moore pages). */
export function MooreFansCard({path}:{path:string}){
  return <section className="dr4-section r5-moore" aria-labelledby="moore-fans-title" data-moore-fans-card>
    <h2 id="moore-fans-title" className="dr4-h2"><a href={MOORE_FANS_LINKS[0]![1]}>Moore Fans</a></h2>
    <p>{MOORE_FANS_LEAD}</p>
    <R5Chips items={MOORE_FANS_LINKS.map(([label,href])=>({href,label}))} current={path} label="Moore fans"/>
  </section>
}
