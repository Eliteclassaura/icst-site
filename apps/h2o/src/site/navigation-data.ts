import {FAN_MENU_LINKS} from './moore-fans'
import projectsMenu from '../../content/design/projects-menu.json'
/** PROJECTS-MENU-1: the live Projects dropdown, resolved against the route ledger (content/design/projects-menu.json, ops/catalog/build-projects-menu.mjs). */
export const PROJECTS_MENU_LINKS:ReadonlyArray<readonly [string,string]>=projectsMenu.items.map(i=>[i.label,i.href] as const)
/** Accepted navigation defaults (data only, so server code can read them; `SiteNavigation` is a client module). */
export const siteNavigation=[
  {label:'Cooling Towers',href:'/cooling-tower/',items:[['New Cooling Towers','/cooling-tower/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Thermal Upgrade','/thermal-upgrade/']]},
  {label:'Services',items:[['Repair & Maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blast-cleaning-services-2/'],['Air Coolers','/air-coolers/']]},
  {label:'Parts',href:'/cooling-tower-parts-online/'},
  {label:'Projects',href:'/all-projects/'},
  {label:'Resources',items:[['Resources','/resources/'],['Technical Articles','/tech-articles/'],['Brochures','/resources/cooling-tower-brochures/'],['Search','/search/']]},
  {label:'Company',items:[['About ICS','/about-ics-industrial-cooling-solutions/'],['Contact Us','/contact-us/']]},
] as const
export const salmonNavigation=[
  {label:'New Towers',href:'/cooling-tower/',items:[['New Cooling Towers','/cooling-tower/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Thermal Upgrade','/thermal-upgrade/']]},
  {label:'Services',href:'/cooling-tower-maintenance-repair-upgrade/',items:[['All repair and maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Crossflow towers','/crossflow-cooling-tower-repair-maintenance/'],['Counterflow towers','/counterflow-cooling-tower-repair-maintenance/'],['Wet, hybrid and dry towers','/wet-hybrid-dry-cooling-tower-repair/'],['Low drift solutions','/low-drift-cooling-tower-solutions/'],['Emergency repair','/emergency-cooling-tower-repair/'],['Rebuilds and new towers','/cooling-tower-rebuilds-new-towers/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blast-cleaning-services-2/']],sections:[{label:'By tower type',items:[['Crossflow towers','/crossflow-cooling-tower-repair-maintenance/'],['Counterflow towers','/counterflow-cooling-tower-repair-maintenance/'],['Wet, hybrid and dry towers','/wet-hybrid-dry-cooling-tower-repair/']]},{label:'Specialist work',items:[['Low drift solutions','/low-drift-cooling-tower-solutions/'],['Emergency repair','/emergency-cooling-tower-repair/'],['Rebuilds and new towers','/cooling-tower-rebuilds-new-towers/']]},{label:'Recovery & cleaning',items:[['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blast-cleaning-services-2/']]}]},
  {label:'Air Coolers',href:'/air-coolers/'},
  {label:'Parts',href:'/cooling-tower-parts-online/',items:[['All cooling tower parts','/cooling-tower-parts-online/'],['Fan stacks','/cooling-tower-fan-stacks/'],['Fans','/fans/'],...FAN_MENU_LINKS,['Fill media','/fill-media/'],['Drive shafts','/drive-shafts-assembles/'],['Gear boxes','/gear-box/'],['Motors','/motors/'],['Nozzles','/nozzles/'],['FRP members','/frp-members/'],['Tower hardware','/tower-hardware/']]},
  {label:'Projects',href:'/all-projects/',items:PROJECTS_MENU_LINKS},
  {label:'Resources',href:'/resources/',items:[['Resources library','/resources/'],['Technical Articles','/tech-articles/'],['Brochures','/resources/cooling-tower-brochures/'],['Tools','/resources/tools/'],['Search','/search/']]},
  {label:'About',href:'/about-ics-industrial-cooling-solutions/',items:[['About ICS','/about-ics-industrial-cooling-solutions/'],['Contact Us','/contact-us/']]},
] as const

