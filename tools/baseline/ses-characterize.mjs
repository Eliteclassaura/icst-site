// Characterization fixture capture for the legacy Search Evidence Suite engines.
// Loads legacy app.js unmodified into a Node vm with a permissive DOM stub, then
// feeds the suite's own seeded sampleData() through the SAME pipeline run() uses
// (minus rendering/persistence) and writes the engine outputs as JSON fixtures.
// These fixtures pin the current behaviour so the TypeScript extraction
// (Milestone 3) can be verified against it.
import vm from 'node:vm'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(ROOT, 'legacy-reference/search-evidence-suite/search-evidence-console/app.js')
const OUT = resolve(ROOT, 'docs/baselines/ses-fixtures')
mkdirSync(OUT, { recursive: true })

// ---- permissive DOM stub -------------------------------------------------
function anyEl() {
  const store = {
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false
      },
    },
  }
  return new Proxy(function () {}, {
    get(_, k) {
      if (k in store) return store[k]
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return ''
      if (k === 'checked' || k === 'disabled' || k === 'hidden') return false
      if (k === 'children' || k === 'childNodes') return []
      if (k === 'then') return undefined
      if (k === Symbol.toPrimitive) return () => ''
      return anyEl()
    },
    set() {
      return true
    },
    apply() {
      return anyEl()
    },
  })
}
const el = anyEl()
const document = {
  querySelector: () => el,
  querySelectorAll: () => [],
  getElementById: () => el,
  createElement: () => el,
  addEventListener() {},
  body: el,
  documentElement: el,
  head: el,
  title: '',
}
const noopStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const ctx = {
  console,
  document,
  window: {},
  location: { origin: 'https://example.com', href: 'https://example.com/' },
  localStorage: noopStorage,
  sessionStorage: noopStorage,
  navigator: { clipboard: {}, userAgent: 'node' },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  fetch: () => Promise.reject(new Error('no network in characterization')),
  requestAnimationFrame: (f) => setTimeout(f, 0),
  Blob: class {},
  FileReader: class {},
  DOMParser: undefined,
  performance,
  structuredClone,
  crypto: globalThis.crypto,
  indexedDB: undefined, // forces DB_OK=false paths
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  MutationObserver: class {
    observe() {}
  },
  ResizeObserver: class {
    observe() {}
  },
  addEventListener() {},
  alert() {},
  confirm: () => false,
  prompt: () => null,
}
ctx.window = ctx
ctx.globalThis = ctx
ctx.self = ctx
vm.createContext(ctx)

const src = readFileSync(SRC, 'utf8')
try {
  vm.runInContext(src, ctx, { filename: 'app.js' })
} catch (e) {
  console.error('app.js load error (continuing if engines are defined):', e.message)
}

// Replace the UI-bound run() with a pure pipeline mirroring run() at app.js:7601.
vm.runInContext(
  `
  function __pureRun(){
    MODEL = buildModel(DATASETS);
    const sf = DATASETS.filter(d => d.kind === 'sf_crawl');
    if (sf.length && (!CRAWL || !CRAWL.pages.length)){
      CRAWL = { origin: 'https://' + hostOf(CFG.domain), pages: sf.flatMap(sfToPages), sitemaps: SITEMAPS, robots: ROBOTS, at: 0, mode: 'imported' };
    }
    GATES = runGates(MODEL, CFG, DATASETS, FILTERS);
    FIND = analyse(MODEL, CFG);
    const pageIndex = new Map();
    for (const r of MODEL.gscPQ){
      if (r.period && r.period !== 'current') continue;
      if (!r.query || !r.url) continue;
      const list = pageIndex.get(r.query) || [];
      list.push({ url:r.url, raw:r.urlRaw, impr:r.impr, clicks:r.clicks, pos:r.pos });
      pageIndex.set(r.query, list);
    }
    const intents = new Map();
    for (const r of MODEL.smrPos) if (r.intent) intents.set(r.keyword, r.intent);
    for (const r of MODEL.smrGap) if (r.intent) intents.set(r.keyword, r.intent);
    const brandTokens = String(CFG.brand||'').toLowerCase().split(/\\s+/).filter(t => t.length > 2);
    CLUST = clusterQueries(MODEL.gscQ.current, { threshold: CFG.clusterThreshold || 0.38, pageIndex: pageIndex.size ? pageIndex : null, intents, brandTokens, curve: FIND.curve, ctrAt });
    CLUST.clusters = addGapClusters(CLUST.clusters, FIND.gaps, { brandTokens });
    CLUST.stats = summariseClusters(CLUST.clusters);
    PAGEMAP = mapPages(CLUST.clusters);
    const gscPageMap = new Map();
    for (const r of MODEL.gscP.current) gscPageMap.set(r.url, { impr:r.impr, clicks:r.clicks, raw:r.urlRaw });
    ISSUES = technicalChecks(CRAWL || { pages: [] }, { sitemaps: SITEMAPS, sitemapUrls: SITEMAP_URLS, robots: ROBOTS, gscPages: gscPageMap, origin: 'https://' + hostOf(CFG.domain) });
    BACKLINKS = analyseBacklinks(DATASETS, CFG);
    LINKPLAN = planInternalLinks({ crawl: CRAWL, clusters: CLUST.clusters, gscPages: gscPageMap, cfg: CFG });
    BRIEFS = buildBriefs({ clusters: CLUST.clusters, crawl: CRAWL, gscPages: gscPageMap, links: LINKPLAN, cfg: CFG, gaps: FIND.gaps });
    MEDIA = analyseMedia(CRAWL, gscPageMap);
    SCHEMA = analyseSchema(CRAWL);
    HREF = analyseHreflang(CRAWL);
    SERP = analyseSerpFeatures(MODEL, FIND, FIND.curve, ctrAt);
    AI = analyseAiSearch({ model: MODEL, find: FIND, clusters: CLUST.clusters, crawl: CRAWL, issues: ISSUES, robots: ROBOTS, cfg: CFG, curve: FIND.curve, ctrAtFn: ctrAt, serp: SERP, observations: OBSERVATIONS });
    const topicImpr = CLUST.clusters.reduce((s,c)=>s+c.impr,0);
    const topicTop10 = topicImpr ? CLUST.clusters.filter(c => c.pos != null && c.pos <= 10.5).reduce((s,c)=>s+c.impr,0)/topicImpr : null;
    SCORE = scoreProject({ crawl: CRAWL, issues: ISSUES, find: FIND, clusters: CLUST.clusters, clusterStats: CLUST.stats, backlinks: BACKLINKS, curve: FIND.curve, ctrAt,
      baseRows: MODEL.gscQ.current.length ? MODEL.gscQ.current : MODEL.gscP.current,
      strikingImpr: FIND.striking.reduce((s,r)=>s+r.impr,0), sitemapUrls: SITEMAP_URLS, topicTop10 });
    try { augmentActions(); } catch (e) { __augmentError = String(e); }
    __ran = true;
  }
  var __ran = false, __augmentError = null;
  run = __pureRun;
  // Mirror the DOM values sampleData() writes at app.js:11832-11839, which readCfg() would read back.
  readCfg = function(){
    Object.assign(CFG, { domain: 'example.com', brand: 'Example water', country: 'United Kingdom', gscCountry: 'gbr', semrushDb: 'uk',
      language: 'English', conversion: 'Qualified site survey request', competitors: 'watertechpros.com\\ncoolingsystems.co',
      generativeControl: 'included', clusterThreshold: 0.38, crawlLimit: 200 });
  };
  const __origPure = __pureRun;
  run = function(){ readCfg(); __origPure(); };
  saveCfg = function(){}; renderLedger = function(){}; syncChips = function(){}; toast = function(){};
`,
  ctx,
)

// Fixed clock so freshness/sitemap-future checks are reproducible.
vm.runInContext(`Date.now = () => Date.UTC(2026, 8, 3, 12, 0, 0); const __RealDate = Date;`, ctx)

vm.runInContext(`sampleData();`, ctx)

const g = (k) => vm.runInContext(k, ctx)
if (!g('__ran')) throw new Error('pipeline did not run')

const strip = (o) =>
  JSON.parse(
    JSON.stringify(o, (k, v) => {
      if (v instanceof Uint32Array || (v && v.constructor && v.constructor.name === 'Uint32Array'))
        return Array.from(v)
      if (v instanceof Map) return Object.fromEntries(v)
      if (v instanceof Set) return [...v]
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
      return v
    }),
  )

const dump = (name, expr) => {
  const val = strip(g(expr))
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(val, null, 1))
  return val
}

const summary = {
  capturedAt: new Date().toISOString(),
  source: 'legacy-reference/search-evidence-suite/search-evidence-console/app.js',
  method:
    'sampleData() (seeded LCG, seed 7) through the run() pipeline with Date.now pinned to 2026-09-03T12:00:00Z',
  scoreModel: g('SCORE_MODEL'),
  augmentError: g('__augmentError'),
  datasets: dump(
    'datasets-ledger',
    'DATASETS.map(d => ({ name:d.name, kind:d.kind, source:d.source, period:d.period, rows:d.rows.length, headers:d.headers }))',
  ),
  gates: dump('gates', 'GATES'),
  curve: dump('ctr-curve', 'FIND.curve'),
  findingsSnapshot: dump(
    'findings-snapshot',
    '({ snapshot: FIND.snapshot, branded: FIND.branded, distribution: FIND.distribution })',
  ),
  findingsCounts: (() => {
    dump('findings-striking', 'FIND.striking')
    dump('findings-ctrgap', 'FIND.ctrGap')
    dump('findings-decay', 'FIND.decay')
    dump('findings-risers', 'FIND.risers')
    dump('findings-cannibal', 'FIND.cannibal')
    dump('findings-gaps', 'FIND.gaps')
    dump('findings-smrdrops', 'FIND.smrDrops')
    dump('findings-reconcile', 'FIND.reconcile')
    return g(
      '({ striking: FIND.striking.length, ctrGap: FIND.ctrGap.length, decay: FIND.decay.length, risers: FIND.risers.length, cannibal: FIND.cannibal.length, gaps: FIND.gaps.length, smrDrops: FIND.smrDrops.length, reconcile: FIND.reconcile.length })',
    )
  })(),
  actions: (dump('actions', 'FIND.actions'), g('FIND.actions.length')),
  clusters:
    (dump('clusters', 'CLUST'),
    dump('pagemap', 'PAGEMAP'),
    g('({ n: CLUST.clusters.length, stats: CLUST.stats })')),
  issues: (dump('technical-issues', 'ISSUES'), g('ISSUES.length')),
  score: dump('score', 'SCORE'),
  grade: g('gradeOf(SCORE.overall)'),
  backlinks:
    (dump('backlinks', 'BACKLINKS'),
    g(
      'BACKLINKS && ({ domains: BACKLINKS.domains && BACKLINKS.domains.length, anchorDiversity: BACKLINKS.anchorDiversity, targetSpread: BACKLINKS.targetSpread })',
    )),
  linkplan:
    (dump('internal-link-plan', 'LINKPLAN'),
    g(
      'LINKPLAN && Object.fromEntries(Object.entries(LINKPLAN).map(([k,v]) => [k, Array.isArray(v) ? v.length : v]))',
    )),
  briefs: (dump('briefs', 'BRIEFS'), g('BRIEFS && BRIEFS.length')),
  media: dump('media', 'MEDIA'),
  schema: dump('schema', 'SCHEMA'),
  hreflang: dump('hreflang', 'HREF'),
  serp: dump('serp', 'SERP'),
  ai:
    (dump('ai-search', 'AI'),
    g(
      'AI && Object.fromEntries(Object.entries(AI).map(([k,v]) => [k, Array.isArray(v) ? v.length : (v && typeof v === "object" ? "object" : v)]))',
    )),
  aiReadinessPillar: dump('ai-readiness-pillar', 'aiReadiness({ crawl: CRAWL, robots: ROBOTS }, metric)'),
}
dump('crawl-pages', 'CRAWL.pages')
writeFileSync(resolve(OUT, 'SUMMARY.json'), JSON.stringify(summary, null, 2))
console.log(
  JSON.stringify(
    {
      scoreModel: summary.scoreModel,
      overall: summary.score.overall,
      grade: summary.grade,
      pillars: summary.score.pillars.map((p) => [p.key, p.score]),
      actions: summary.actions,
      clusters: summary.clusters.n,
      issues: summary.issues,
      gates: summary.gates.length,
      augmentError: summary.augmentError,
    },
    null,
    2,
  ),
)
