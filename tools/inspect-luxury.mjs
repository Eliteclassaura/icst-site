import {chromium} from 'playwright'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
const authority=path.resolve('../h2o-luxury-design-authority'),out=path.resolve('../luxury-evidence')
mkdirSync(out,{recursive:true})
const pairs=[['/',48,'ICS Home 1440'],['/cooling-tower/',1230,'ICS New Cooling Towers 1440'],['/cooling-tower-maintenance-repair-upgrade/',1446,'ICS Repair Maintenance 1440'],['/disaster-recovery/',1534,'ICS Disaster Recovery 1440'],['/thermal-upgrade/',1555,'ICS Thermal Upgrade 1440'],['/cooling-tower-replacement/',1572,'ICS Cooling Tower Replacement 1440'],['/air-coolers/',1668,'ICS Air Coolers 1440'],['/dry-soda-blasting/',1722,'ICS Dry Soda Blasting 1440'],['/cooling-tower-parts-online/',411,'ICS Parts 1440']]
const browser=await chromium.launch()
const page=await browser.newPage()
const all=[]
for(const [route,id,name]of pairs){
 const doc=JSON.parse(readFileSync(`apps/h2o/content/salmon/documents/SALMON-pages-${id}.json`))
 const leaves=[];function walk(n,key){if(typeof n==='string'){if(n.trim())leaves.push({key,text:n});return}n.children.forEach((v,i)=>walk(v,key+'.'+i))}doc.children.forEach((n,i)=>walk(n,'body.'+i))
 await page.setContent(readFileSync(path.join(authority,name+'.dc.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''))
 const tree=await page.evaluate(()=>{function node(n){if(n.nodeType===3)return n.textContent; if(n.nodeType!==1)return null;return {tag:n.tagName.toLowerCase(),attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value])),children:[...n.childNodes].map(node).filter(n=>n!==null)}}return node(document.querySelector('[data-screen-label]'))})
 all.push({route,id,name,tree,leaves})
 writeFileSync(path.join(out,id+'-source.txt'),leaves.map(x=>x.key+' '+x.text).join('\n'))
}
writeFileSync(path.join(out,'design-trees.json'),JSON.stringify(all,null,2))
await browser.close()
