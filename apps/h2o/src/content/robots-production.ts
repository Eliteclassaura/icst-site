/**
 * AEO-1 (owner 2026-10-09: AI crawlers are ALLOWED; CT 2026-10-09): the production robots.txt.
 *
 * `User-agent: *` keeps the accepted rules (everything allowed except the admin, the API, the CRM and /private/). A crawler that has its
 * own group follows ONLY that group (RFC 9309), so each named AI crawler repeats the same disallows: naming a bot must never open the
 * private surfaces. The staging/private policy is not here (./robots-allow: `Disallow: /`, no Sitemap line).
 */
export const PRODUCTION_DISALLOW: readonly string[] = ['/admin/', '/api/', '/crm/', '/private/']

/** The named AI crawlers and what each is for. Bytespider is deliberately not listed (CT ruling). */
export const AI_CRAWLERS: ReadonlyArray<{ agent: string; product: string; purpose: string }> = [
  { agent: 'GPTBot', product: 'ChatGPT', purpose: 'model training and web index' },
  { agent: 'OAI-SearchBot', product: 'ChatGPT search', purpose: 'search results' },
  { agent: 'ChatGPT-User', product: 'ChatGPT', purpose: 'a user asking it to open a page' },
  { agent: 'ClaudeBot', product: 'Claude', purpose: 'model training and web index' },
  { agent: 'Claude-SearchBot', product: 'Claude', purpose: 'search results' },
  { agent: 'Claude-User', product: 'Claude', purpose: 'a user asking it to open a page' },
  { agent: 'PerplexityBot', product: 'Perplexity', purpose: 'search index' },
  { agent: 'Perplexity-User', product: 'Perplexity', purpose: 'a user asking it to open a page' },
  { agent: 'Google-Extended', product: 'Gemini', purpose: 'training and grounding (not Search ranking)' },
  { agent: 'Applebot-Extended', product: 'Apple Intelligence', purpose: 'training' },
  { agent: 'CCBot', product: 'Common Crawl', purpose: 'the open crawl many AI models train on' },
]

const group = (agent: string): string => [`User-agent: ${agent}`, 'Allow: /', ...PRODUCTION_DISALLOW.map((p) => `Disallow: ${p}`)].join('\n')

export const PRODUCTION_SITEMAP = 'https://h2ocooling.com/sitemap_index.xml'

/** The whole production robots.txt (one string, newline terminated, the Sitemap line last). */
export function productionRobotsBody(): string {
  return [
    group('*'),
    '',
    '# AI crawlers are explicitly allowed (owner decision, 2026-10-09). A crawler with its own group ignores the group above, so each',
    '# named crawler repeats the same Disallow lines: allowing a bot never opens /admin/, /api/, /crm/ or /private/.',
    ...AI_CRAWLERS.map((c) => `# ${c.agent}: ${c.product}, ${c.purpose}`),
    '',
    ...AI_CRAWLERS.flatMap((c) => [group(c.agent), '']),
    `Sitemap: ${PRODUCTION_SITEMAP}`,
    '',
  ].join('\n')
}
