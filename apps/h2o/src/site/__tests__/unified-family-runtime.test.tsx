import {afterEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {composePublicDocument} from '../../content/compose'
import {extractSlots} from '../../content/content-slots'
import {salmonDocument,salmonRoutes,type SalmonDocument} from '../salmon'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {isStructural} from '../../content/structural'

const saved={...process.env}
afterEach(()=>{process.env={...saved}})
describe('unified Payload composition → accepted Salmon family presentation',()=>{
  it('renders editor text and uploaded image from the composed document, without changing its source tree',()=>{
    const row=salmonRoutes().find(r=>r.targetPath==='/fans/')!
    const source=salmonDocument(row),before=JSON.stringify(source)
    const slots=extractSlots(source as unknown as Record<string,unknown>)
    const heading=slots.find(s=>s.kind==='heading')!
    const image=slots.find(s=>s.kind==='image')!
    expect(heading).toBeDefined()
    expect(image).toBeDefined()
    const composed=composePublicDocument({routeId:source.routeId,path:source.targetPath,family:'salmon',title:source.title,document:source,slots:[{...heading,heading:'Synthetic family edit proof'},{...image,image:'fixture-media',imageUrl:'/api/media/file/family-fixture.png',alt:'Synthetic family image proof'}]}) as unknown as SalmonDocument
    const config=salmonFamilyFor(composed)!
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={composed} config={config}/>)
    expect(html).toContain('data-salmon-family="parts-landing"')
    expect(html).toContain('Synthetic family edit proof')
    expect(html).toContain('/api/media/file/family-fixture.png')
    expect(html).toContain('Synthetic family image proof')
    expect(JSON.stringify(source)).toBe(before)
    expect(isStructural({routeId:source.routeId,family:'salmon',routeClass:'pages'})).toBe(false)
  })
})
