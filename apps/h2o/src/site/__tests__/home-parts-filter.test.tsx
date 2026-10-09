import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {homePartCatalogData,homePartCategoryAuthority} from '../HomePartsData'
import {HomePartsCatalog} from '../HomePartsCatalog'
import {activeProductRoutes} from '../Wave3Products'

describe('homepage spare-parts filter authority',()=>{
  const data=homePartCatalogData()
  it('keeps exactly the 194 public product routes and eight source-featured cards',()=>{
    const publicRoutes=new Set(activeProductRoutes().map(route=>route.targetPath))
    expect(data.records).toHaveLength(194)
    expect(data.records.filter(record=>record.featured)).toHaveLength(8)
    expect(new Set(data.records.map(record=>record.route))).toEqual(publicRoutes)
  })
  it('maps every displayed category to verified public product-category archive membership',()=>{
    expect(data.categories.map(category=>category.key)).toEqual(homePartCategoryAuthority.map(category=>category.key))
    for(const category of data.categories){
      expect(category.count).toBeGreaterThan(0)
      expect(data.records.filter(record=>record.categories.includes(category.key))).toHaveLength(category.count)
      expect(category.sources.length).toBeGreaterThan(0)
      expect(category.sources.every(source=>source.sha256.length===64)).toBe(true)
    }
  })
  it('renders native filter controls and separate accepted product/quote links',()=>{
    const html=renderToStaticMarkup(<HomePartsCatalog data={data}/>)
    expect((html.match(/aria-pressed="false"/g)??[])).toHaveLength(9)
    expect((html.match(/aria-pressed="true"/g)??[])).toHaveLength(1)
    expect((html.match(/class="home-part-card"/g)??[])).toHaveLength(8)
    for(const featured of data.records.filter(record=>record.featured))expect(html).toContain(`href="${featured.route}"`)
    expect(html).toContain('href="/contact-us/"')
    expect(html).not.toContain('Add to Cart')
    expect(html).not.toContain('Checkout')
  })
})
