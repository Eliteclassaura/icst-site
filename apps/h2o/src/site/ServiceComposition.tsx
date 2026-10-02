import type {CSSProperties,ReactNode} from 'react'
import {deliverySrc} from './media-delivery'

type Media={node:string;asset:string;width:number;height:number;slotWidth:number;slotHeight:number;cap?:number;position?:string;shape?:'circle'|'pill'|'card'|'band'|'chart'}
type Composition={roles:string[];replace:Record<number,Media>;inside:Record<number,Media>;after:Record<number,Media[]>;suppress?:number[]}
const media=(node:string,asset:string,width:number,height:number,slotWidth:number,slotHeight:number,cap?:number,shape?:Media['shape'],position='50% 50%'):Media=>({node,asset,width,height,slotWidth,slotHeight,cap,shape,position})
const root='/media/figma-wave2/'

/* Presentation-only Figma bytes. The Salmon documents, not this map, own all copy and facts. */
export const serviceCompositions:Record<string,Composition>={
 'SALMON-pages-1446':{
  roles:['hero','intro','service-types','checks','blue-band','maintenance','closing'],
  replace:{13:media('21:731','figma-image-e6bc1ac6b2abd368.jpg',832,565,409,277,undefined,'card'),87:media('21:937','figma-image-ca900cb9c58fa9c4.png',1024,862,864,864,864,'band')},
  inside:{
   1:media('21:896','figma-image-3dee1e0bdb7185ac.png',1024,585,1164,593,1024,'card'),
   26:media('21:745','figma-image-94723fa719f90488.jpg',1280,732,271,449,undefined,'card'),
   30:media('21:765','figma-image-7156ab221e009016.png',1195,896,271,449,undefined,'card'),
   34:media('21:785','figma-image-388e5059a5a0ecaf.jpg',1280,960,271,449,undefined,'card'),
   38:media('21:755','figma-image-94723fa719f90488.jpg',1280,732,271,449,undefined,'card'),
   42:media('21:775','figma-image-7156ab221e009016.png',1195,896,271,449,undefined,'card'),
   46:media('21:795','figma-image-388e5059a5a0ecaf.jpg',1280,960,271,449,undefined,'card'),
   107:media('21:984','figma-image-b854160022338764.png',336,336,336,313,336,'card','50% 69%'),
  },after:{}
 },
 'SALMON-pages-1534':{
  roles:['hero','recovery','photo-band','closing'],replace:{},
  inside:{1:media('21:1460','figma-image-bac62286743b59b3.png',1712,1186,1164,593,undefined,'card'),25:media('21:1508','figma-image-208395a39aa445d0.png',1000,1000,306,605,306,'card','35% 84%')},
  after:{29:[media('21:1471','figma-image-54ec4cea140b6635.png',1478,834,1440,522,undefined,'band')]}
 },
 'SALMON-pages-1555':{
  roles:['hero','intro','photo-cta','benefits','closing'],
  replace:{9:media('3:745','figma-image-575a9df8b1fca4af.png',2328,2030,1164,593,undefined,'card','50% 15%'),45:media('3:667','figma-image-a11b1d3785c2d57f.png',1128,944,1129,581,1128,'card')},inside:{},
  after:{10:[media('3:662','figma-image-7d12e69a53e08f8d.png',3076,2576,769,315,undefined,'card')]}
 },
 'SALMON-pages-1572':{
  roles:['hero','intro','reasons','benefits','interlude','case','maintenance','closing'],
  replace:{2:media('3:845','figma-image-c008d271ce7af4d7.png',1128,944,1059,593,1059,'card','67% 15%'),53:media('3:1147','figma-image-8e52691eb4972886.png',1294,1294,259,647,undefined,'pill','50% 9%'),109:media('3:1148','figma-image-8e52691eb4972886.png',1294,1294,353,364,undefined,'circle','50% 9%')},inside:{},
  after:{10:[media('3:763','figma-image-7d12e69a53e08f8d.png',3076,2576,420,410,undefined,'card'),media('3:764','figma-image-7d12e69a53e08f8d.png',3076,2576,420,410,undefined,'circle')],54:[media('3:1151','figma-image-8e52691eb4972886.png',1294,1294,259,647,undefined,'pill','50% 9%')],75:[media('3:1150','figma-image-8e52691eb4972886.png',1294,1294,353,364,undefined,'circle','50% 9%')],110:[media('3:1149','figma-image-8e52691eb4972886.png',1294,1294,353,364,undefined,'circle','50% 9%')],147:[media('3:858','figma-image-23e349db1cc56273.png',1128,944,1127,468,1127,'band','50% 72%')]}
 },
 'SALMON-pages-1668':{
  roles:['hero','intro','overview','types','benefits','services','closing'],
  replace:{41:media('5:1445','figma-image-7659adeb32007d56.png',886,806,356,328,undefined,'circle','33% 0%'),48:media('5:1446','figma-image-b0e6f0cc16b07069.png',1024,931,356,328,undefined,'circle'),56:media('5:1447','figma-image-e9082ebf6338457c.png',1024,931,363,336,undefined,'circle')},inside:{},suppress:[10],
  after:{11:[media('5:1449','figma-image-31184c20cdd8c6d5.png',908,826,426,355,undefined,'card','50% 99%')],76:[media('5:1444','figma-image-37e0077b2a820ba5.png',1024,931,312,374,undefined,'card')]}
 },
 'SALMON-pages-1722':{
  roles:['hero','interlude','intro','ways','process','results','why','detail','closing'],
  replace:{10:media('5:1923','figma-image-60ab787249f41f0f.png',1459,1436,705,359,705,'card','60% 59%'),22:media('5:1943','figma-image-ab063bac9e46be23.png',712,662,356,328,undefined,'circle','99% 1%'),61:media('5:1944','figma-image-13183ab19f5b2de6.png',672,762,336,381,undefined,'chart'),89:media('5:1945','figma-image-cb082139827f45d6.png',3559,2432,477,1216,undefined,'pill','8% 50%')},
  inside:{1:media('5:1917','figma-image-2b0fc0527234a0c7.png',2338,2338,1169,593,undefined,'card')},
  after:{32:[media('5:1946','figma-image-cb082139827f45d6.png',3559,2432,477,1198,undefined,'pill','8% 50%')]}
 }
}

export function ServiceImage({media:asset,layer='inline',layoutNode}:{media:Media;layer?:'inline'|'inside'|'after';layoutNode?:number}){
 const safeWidth=Math.min(asset.cap??asset.width,asset.width,asset.height*asset.slotWidth/asset.slotHeight,asset.slotWidth)
 const style={'--wave2-media-max':`${Math.floor(safeWidth)}px`,'--wave2-native-height':`${asset.height}px`,'--wave2-ratio':`${asset.slotWidth} / ${asset.slotHeight}`,'--wave2-position':asset.position} as CSSProperties
 return <span className={`wave2-media wave2-media--${layer} wave2-media--${asset.shape??'card'}`} data-layout-node={layoutNode} data-figma-node={asset.node} data-figma-media-src={deliverySrc(root+asset.asset)} style={style}>
  <img src={deliverySrc(root+asset.asset)} alt={asset.shape==='chart'?'Static pressure and airflow results chart':''} width={asset.width} height={asset.height} loading={layer==='inside'&&asset.node.endsWith(':896')?'eager':'lazy'} fetchPriority={layer==='inside'&&asset.node.endsWith(':896')?'high':undefined}/>
 </span>
}

export function ServiceHero({children}:{children:ReactNode}){return <div className="wave2-stage wave2-stage--hero">{children}</div>}
export function ServiceClosing({children}:{children:ReactNode}){return <div className="wave2-stage wave2-stage--closing">{children}</div>}
export function ServicePage({routeId,sections}:{routeId:string;sections:ReactNode[]}){
 const config=serviceCompositions[routeId]
 return <div className="wave2-service" data-wave2-route={routeId} data-air-cooler-hero={routeId==='SALMON-pages-1668'?'TYPE_LED':undefined}>{sections.map((section,i)=>{
  const role=config.roles[i]
  const content=<div key={i} className={`wave2-stage wave2-stage--${role}`} data-wave2-section={role}>{section}</div>
  return i===0?<ServiceHero key={i}>{content}</ServiceHero>:i===sections.length-1?<ServiceClosing key={i}>{content}</ServiceClosing>:content
 })}</div>
}
