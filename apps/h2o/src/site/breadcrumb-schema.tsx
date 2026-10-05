/**
 * BreadcrumbList structured data (Control Tower SEO parity follow-up R1, Part 2 item 2). Every public page except the home
 * page emits exactly one, generated from the trail its template renders (ancestors + the page itself). Source (Rank Math)
 * BreadcrumbList nodes are dropped where the source schema is rendered (SalmonSeo), so a page never carries two.
 * The node keeps Rank Math's "@id" convention (<url>#breadcrumb) so source WebPage nodes that reference it still resolve.
 */
export const PUBLIC_ORIGIN='https://h2ocooling.com'
export type Crumb={name:string;path:string}
export const HOME_CRUMB:Crumb={name:'Home',path:'/'}

const absolute=(p:string):string=>new URL(p,PUBLIC_ORIGIN).href
export function breadcrumbList(ancestors:Crumb[],current:Crumb):Record<string,unknown>{
  const trail=[...ancestors,current].filter((crumb,i,all)=>crumb.name.trim()&&all.findIndex(other=>other.path===crumb.path)===i)
  return {
    '@context':'https://schema.org',
    '@type':'BreadcrumbList',
    '@id':`${absolute(current.path)}#breadcrumb`,
    itemListElement:trail.map((crumb,i)=>({'@type':'ListItem',position:i+1,name:crumb.name.trim(),item:absolute(crumb.path)})),
  }
}
/** True for a schema node (or graph member) that is a BreadcrumbList. */
export const isBreadcrumbList=(value:unknown):boolean=>Boolean(value)&&typeof value==='object'&&(value as Record<string,unknown>)['@type']==='BreadcrumbList'

export function BreadcrumbSchema({ancestors,current}:{ancestors:Crumb[];current:Crumb}){
  if(current.path==='/')return null
  return <script type="application/ld+json" data-breadcrumb-schema="" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbList(ancestors,current)).replaceAll('<','\\u003c')}}/>
}
