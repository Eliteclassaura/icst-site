import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Read-only public-source acquisition. Never executes WordPress or imports SQL.
const origin = 'https://salmon-rhinoceros-754457.hostingersite.com'
const root = path.resolve('../salmon-authority')
mkdirSync(path.join(root, 'raw'), { recursive: true })
const sha = v => createHash('sha256').update(v).digest('hex')
const records = []
function acquire(url) {
  const id = sha(url)
  const file = path.join(root, 'raw', id)
  if (!existsSync(file + '.identity.json')) {
    const status = execFileSync('curl', ['-sS', '-L', '--max-time', '60', '--retry', '2', '-D', file + '.headers', '-o', file + '.body', '-w', '%{http_code}', url], { encoding: 'utf8' })
    writeFileSync(file + '.identity.json', JSON.stringify({ url, status: Number(status), acquiredAt: new Date().toISOString() }, null, 2))
  }
  const identity = JSON.parse(readFileSync(file + '.identity.json'))
  const bytes = readFileSync(file + '.body')
  const entry = { ...identity, file: 'raw/' + id + '.body', sha256: sha(bytes), bytes: bytes.length }
  records.push(entry)
  return { ...entry, body: bytes.toString(), headers: readFileSync(file + '.headers', 'utf8') }
}
const collections = {}
for (const base of ['posts', 'pages', 'product', 'media', 'categories', 'tags', 'product_cat', 'product_tag', 'product_brand']) {
  collections[base] = []
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const result = acquire(`${origin}/wp-json/wp/v2/${base}?per_page=100&page=${page}`)
    if (result.status !== 200) { console.log(base, 'unavailable', result.status); break }
    pages = Number([...result.headers.matchAll(/x-wp-totalpages:\s*(\d+)/gi)].at(-1)?.[1] ?? 1)
    const data = JSON.parse(result.body)
    if (!Array.isArray(data)) throw new Error('Unexpected REST collection')
    collections[base].push(...data)
    console.log(base, page, '/', pages, data.length)
  }
}
const queue = [origin + '/sitemap_index.xml', origin + '/wp-sitemap.xml', origin + '/robots.txt']
const seen = new Set()
const sitemapUrls = new Set()
while (queue.length) {
  const url = queue.shift()
  if (seen.has(url)) continue
  seen.add(url)
  const result = acquire(url)
  if (result.status !== 200 || !/xml/.test(url)) continue
  for (const match of result.body.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)) {
    const loc = match[1].replaceAll('&amp;', '&')
    if (loc.endsWith('.xml') && new URL(loc).origin === origin) queue.push(loc)
    else sitemapUrls.add(loc)
  }
}
const publicObjects = ['posts', 'pages', 'product', 'categories', 'tags', 'product_cat', 'product_tag', 'product_brand'].flatMap(type => collections[type].map(item => ({ type, item })))
const routes = new Map(publicObjects.filter(({item}) => item.link && (!item.status || item.status === 'publish')).map(({type,item}) => [item.link, { url: item.link, type, wordpressId: item.id, rest: item }]))
for (const url of sitemapUrls) if (new URL(url).origin === origin && !routes.has(url)) routes.set(url, {url, type: 'sitemap-discovered'})
routes.set(origin + '/', routes.get(origin + '/') ?? {url: origin + '/', type: 'homepage'})
writeFileSync(path.join(root, 'collections.json'), JSON.stringify(collections, null, 2) + '\n')
const pending=[...routes.values()]
const run=promisify(execFile)
let complete=0
await Promise.all(Array.from({length:4},async()=>{
  while(pending.length){
    const route=pending.shift()
    const file=path.join(root,'raw',sha(route.url))
    if(!existsSync(file+'.identity.json')){
      const {stdout}=await run('curl',['-sS','-L','--max-time','60','--retry','2','-D',file+'.headers','-o',file+'.body','-w','%{http_code}',route.url])
      writeFileSync(file+'.identity.json',JSON.stringify({url:route.url,status:Number(stdout),acquiredAt:new Date().toISOString()},null,2))
    }
    const {body,headers,...identity}=acquire(route.url)
    route.snapshot=identity
    complete++
    if(complete%50===0 || identity.status!==200)console.log('SNAPSHOTS',complete,'/',routes.size,identity.status)
  }
}))
writeFileSync(path.join(root, 'routes.json'), JSON.stringify([...routes.values()].sort((a,b) => a.url.localeCompare(b.url)), null, 2) + '\n')
writeFileSync(path.join(root, 'source-identities.json'), JSON.stringify(records, null, 2) + '\n')
console.log('RECOVERED', routes.size, 'routes;', collections.media.length, 'attachment records')
