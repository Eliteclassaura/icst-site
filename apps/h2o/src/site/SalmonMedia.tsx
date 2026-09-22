import { readFileSync } from 'node:fs'
import path from 'node:path'

type SalmonAsset = { id: string; src: string; alt: string; width: number; height: number }
const assets = (): SalmonAsset[] => JSON.parse(readFileSync(path.join(process.cwd(),'content/r41-articles/salmon-media.json'),'utf8')) as SalmonAsset[]

/** Topic-based presentation, never a claim that an image documents the article's procedure. */
export const articleMedia: Record<string,string> = {
  'RT-0241':'water-system', 'RT-0275':'tower-installation', 'RT-0292':'fan-stack',
  'RT-0303':'fill-structure', 'RT-0314':'tower-scale', 'RT-0318':'field-inspection',
  'RT-0321':'deck-team', 'RT-0325':'tower-louvers', 'RT-0335':'mechanical-deck',
  'RT-0350':'water-system', 'RT-0356':'tower-deck', 'RT-0358':'fan-stack',
  'RT-0360':'water-nozzle', 'RT-0361':'water-system', 'RT-0400':'tower-installation',
  'RT-0403':'drive-shaft', 'RT-0426':'tower-louvers', 'RT-0480':'tower-setting',
  'RT-0495':'fan-assembly', 'RT-0732':'tower-scale', 'RT-1203':'gearbox',
  'RT-1236':'field-inspection',
}

export const SalmonMedia = ({id, className='', priority=false}: {id:string; className?:string; priority?:boolean}) => {
  const asset=assets().find(a=>a.id===id)
  if(!asset)throw new Error(`Unknown curated Salmon asset ${id}`)
  return <figure className={`salmon-media ${className}`} data-salmon-id={id} style={{maxWidth:asset.width}}>
    <div className="salmon-photo"><img alt={asset.alt} height={asset.height} loading={priority?'eager':'lazy'} src={asset.src} width={asset.width}/></div>
    <figcaption><span>ICS / Field &amp; equipment library</span>{asset.alt}</figcaption>
  </figure>
}
