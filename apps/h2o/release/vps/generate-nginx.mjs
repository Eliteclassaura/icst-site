// Deployment-only translation of the sealed release manifest to a fail-closed Nginx origin.
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const evidence = fileURLToPath(new URL('../evidence/', import.meta.url))
const manifest = JSON.parse(readFileSync(evidence + 'edge-manifest.json', 'utf8'))
if (manifest.routes.filter(r => r.export).length !== 801 || manifest.redirects.length !== 50) throw new Error('Release count mismatch')
const quote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$') + '"'
const fileValue = value => quote(value).replaceAll('\\$', '${literal_dollar}')
const files = new Map()
const redirects = new Map()
for (const row of manifest.routes) {
  if (row.state !== 'PUBLIC' || !row.export) continue
  const uri = decodeURIComponent(row.path)
  files.set(uri, uri + 'index.html')
  if (uri !== '/') redirects.set(uri.slice(0, -1), {destination: row.path, status: 308})
}
for (const row of manifest.redirects) {
  if (!manifest.routes.some(r => r.path === row.destination && r.state === 'PUBLIC' && r.export)) throw new Error('Invalid redirect target')
  const uri = decodeURIComponent(row.source)
  redirects.set(uri, row)
  redirects.set(uri.replace(/\/$/, ''), row)
}
for (const asset of Object.keys(manifest.assets)) {
  if (asset.endsWith('.html') || /^\/(admin|api|private)(\/|$)/.test(asset)) continue
  if (!files.has(asset)) files.set(asset, asset)
}
let config = `# Generated from immutable release ${manifest.releaseId}; staging environment only.
geo $literal_dollar { default "$"; }
map $uri $release_file {
  default "";
${[...files].map(([uri, file]) => `  ${quote(uri)} ${fileValue(file)};`).join('\n')}
}
map $args $legacy_search {
  default 0;
  ~(^|&)s= 1;
}
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  server_tokens off;
  absolute_redirect off;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Frame-Options "DENY" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
  add_header Cache-Control "private, no-store" always;
  add_header X-H2O-Release "${manifest.releaseId}" always;
  if ($request_method !~ ^(GET|HEAD)$) { return 405; }
  location = /robots.txt { default_type text/plain; return 200 "User-agent: *\\nDisallow: /\\n"; }
  location = / {
    if ($legacy_search) { return 307 /search/?q=$arg_s; }
    try_files /index.html =404;
  }
`
for (const [uri, row] of redirects) config += `  location = ${quote(uri)} { return ${row.status} ${quote(row.destination + '$is_args$args').replaceAll('\\$', '$')}; }\n`
config += `  location / {
    if ($release_file = "") { return 404; }
    try_files $release_file =404;
  }
}\n`
// Large exact allowlist contains intentionally long historical media paths.
config = 'map_hash_bucket_size 512;\nmap_hash_max_size 32768;\n' + config
writeFileSync(evidence + 'vps-nginx.conf', config)
console.log(JSON.stringify({releaseId: manifest.releaseId, files: files.size, redirects: manifest.redirects.length, staticOnly: true}))
