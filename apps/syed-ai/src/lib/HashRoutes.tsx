/**
 * Legacy hash views (`/#case/skincare`, `/#services`) became real URLs (A4). Fragments never reach the
 * server, so this tiny inline script — nonced for the CSP — maps them on arrival. Sections that stayed on
 * the home page (`#faq`, `#glossary`, `#contact`) resolve to their block anchors; everything else redirects.
 */
import { headers } from 'next/headers'

export async function HashRoutes({ map }: { map: Record<string, string> }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const js = `(function(){var h=location.hash;if(!h)return;var m=h.match(/^#case\\/([a-z0-9-]+)$/);if(m){location.replace('/work/'+m[1]+'/');return}var map=${JSON.stringify(map)};var t=map[h];if(t&&t.indexOf('#')===0){var el=document.getElementById(t.slice(1));if(el){el.scrollIntoView();}return}if(t&&t!==location.pathname+location.hash){location.replace(t)}})();`
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: js }} />
}
