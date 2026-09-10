import manifest from '../../../../content/webmanifest.json'

export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  })
}
