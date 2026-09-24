/** Sole public origin. No network fetch or WordPress/Next/Payload fallback exists. */
export function createWorker(manifest){
  const routes=new Map(manifest.routes.map(row=>[decodeURIComponent(row.path),row]))
  const redirects=new Map(manifest.redirects.map(row=>[decodeURIComponent(row.source),row]))
  const mime=key=>key.endsWith('.html')?'text/html; charset=utf-8':key.endsWith('.xml')?'application/xml; charset=utf-8':key.endsWith('.txt')?'text/plain; charset=utf-8':key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':key.endsWith('.pdf')?'application/pdf':key.endsWith('.png')?'image/png':/\.jpe?g$/.test(key)?'image/jpeg':key.endsWith('.webp')?'image/webp':key.endsWith('.svg')?'image/svg+xml':key.endsWith('.wasm')?'application/wasm':key.endsWith('.woff2')?'font/woff2':'application/octet-stream'
  return {async fetch(request,env){
    const url=new URL(request.url)
    const preview=env.RELEASE_STAGE!=='production'||!['h2ocooling.com','www.h2ocooling.com'].includes(url.hostname)
    const headers=new Headers({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Cross-Origin-Opener-Policy':'same-origin','Strict-Transport-Security':'max-age=31536000; includeSubDomains; preload'})
    if(preview)headers.set('X-Robots-Tag','noindex, nofollow')
    const respond=(body,status=200)=>new Response(request.method==='HEAD'?null:body,{status,headers})
    if(!['GET','HEAD'].includes(request.method)){headers.set('Allow','GET, HEAD');return respond('Method not allowed',405)}
    if(!env.RELEASE_ID||env.RELEASE_ID!==manifest.releaseId||!env.RELEASE_BUCKET)return respond('Release unavailable',503)
    let pathname
    try{pathname=decodeURIComponent(url.pathname)}catch{return respond('Bad path',400)}
    if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').includes('..')||/^\/(admin|api|private)(\/|$)/.test(pathname))return respond('Not found',404)
    if(pathname==='/'&&url.searchParams.has('s')){
      headers.set('Location','/search/?'+new URLSearchParams({q:url.searchParams.get('s')??''}));return respond(null,307)
    }
    const canonicalPath=pathname.endsWith('/')?pathname:pathname+'/'
    const redirect=redirects.get(canonicalPath)
    if(redirect){
      const target=routes.get(decodeURIComponent(redirect.destination))
      if(target?.state!=='PUBLIC')return respond('Not found',404)
      headers.set('Location',redirect.destination+url.search);return respond(null,redirect.status)
    }
    if(pathname==='/robots.txt'&&preview){headers.set('Content-Type','text/plain; charset=utf-8');return respond('User-agent: *\nDisallow: /\n')}
    const row=routes.get(canonicalPath)
    let key=pathname
    if(row){
      if(row.state!=='PUBLIC'||!row.export)return respond('Not found',404)
      if(pathname!==canonicalPath){headers.set('Location',row.path+url.search);return respond(null,308)}
      key=pathname+'index.html'
      if(!row.indexable)headers.set('X-Robots-Tag','noindex, follow')
      if(preview)headers.set('X-Robots-Tag','noindex, nofollow')
      const hashes=manifest.scriptHashes[row.path]??[]
      headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self' https://form.typeform.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`)
    }else if(key.endsWith('.html'))return respond('Not found',404)
    if(!manifest.assets[key])return respond('Not found',404)
    const object=await env.RELEASE_BUCKET.get(`releases/${manifest.releaseId}${key}`)
    if(!object)return respond('Not found',404)
    headers.set('Content-Type',key.endsWith('.ico')?'image/x-icon':mime(key))
    headers.set('Content-Length',String(manifest.assets[key].bytes))
    headers.set('ETag',`"${manifest.assets[key].sha256}"`)
    headers.set('Cache-Control',preview?'private, no-store':key.startsWith('/_next/')?'public, max-age=31536000, immutable':'public, max-age=300')
    return respond(object.body)
  }}
}
