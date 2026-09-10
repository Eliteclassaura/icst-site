/* ============================================================
   INGEST: csv / tsv / xlsx / zip  ->  {headers, rows}
   Everything runs in the browser. No network, no upload.
   ============================================================ */

const HAS_DECOMP = typeof DecompressionStream !== 'undefined';

/* ---------- numbers ---------- */
function num(v){
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s === '-' || s === '--' || s === 'n/a' || s === 'N/A') return null;
  const pct = /%/.test(s);
  s = s.replace(/[%\s  ]/g,'').replace(/[$€£¥₹]/g,'');
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1,-1);
  const hasC = s.includes(','), hasD = s.includes('.');
  if (hasC && hasD){
    s = (s.lastIndexOf(',') > s.lastIndexOf('.')) ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if (hasC){
    s = /,\d{3}(\D|$)/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g,'') : s.replace(',','.');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return pct ? n/100 : n;
}
function pctVal(v){                     // CTR may arrive as "4.2%" or 0.042 or 4.2
  const n = num(v);
  if (n === null) return null;
  if (typeof v === 'string' && v.includes('%')) return n;
  return n > 1 ? n/100 : n;
}

/* ---------- csv ---------- */
function sniffDelim(text){
  const line = text.slice(0, 4000).split(/\r?\n/).find(l => l.trim().length) || '';
  const counts = {',':0,';':0,'\t':0,'|':0};
  let q = false;
  for (const ch of line){
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0] || ',';
}
function parseDelimited(text, delim){
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  delim = delim || sniffDelim(text);
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){
      if (c === '"'){ if (text[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"'){ q = true; }
    else if (c === delim){ row.push(field); field = ''; }
    else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r'){ /* skip */ }
    else field += c;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* ---------- zip (stored + deflate, via DecompressionStream) ---------- */
async function readZip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a readable ZIP archive.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize  = dv.getUint32(p + 20, true);
    const usize  = dv.getUint32(p + 24, true);
    const nlen   = dv.getUint16(p + 28, true);
    const elen   = dv.getUint16(p + 30, true);
    const clen   = dv.getUint16(p + 32, true);
    const lho    = dv.getUint32(p + 42, true);
    const name   = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = raw;
    else if (method === 8){
      if (!HAS_DECOMP) throw new Error('This browser cannot unzip compressed archives. Unzip the file first and drop the CSVs in.');
      const ds = new DecompressionStream('deflate-raw');
      const ab = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
      bytes = new Uint8Array(ab);
    } else continue;
    out.push({ name, bytes, size: usize || bytes.length });
  }
  return out;
}

/* ---------- xlsx ---------- */
function colToIdx(ref){
  let n = 0;
  for (const ch of ref){
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64); else break;
  }
  return n - 1;
}
async function readXlsx(buf){
  const files = await readZip(buf);
  const get = n => files.find(f => f.name === n || f.name.toLowerCase() === n.toLowerCase());
  const dec = f => new TextDecoder().decode(f.bytes);
  const dp = new DOMParser();

  let shared = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss){
    const doc = dp.parseFromString(dec(ss), 'application/xml');
    shared = Array.from(doc.getElementsByTagName('si')).map(si => {
      const ts = si.getElementsByTagName('t');
      let s = '';
      for (let i = 0; i < ts.length; i++){
        if (ts[i].parentNode && ts[i].parentNode.nodeName === 'rPh') continue;
        s += ts[i].textContent;
      }
      return s;
    });
  }
  const sheetFiles = files
    .filter(f => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f.name))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));

  let names = [];
  const wb = get('xl/workbook.xml');
  if (wb){
    const doc = dp.parseFromString(dec(wb), 'application/xml');
    names = Array.from(doc.getElementsByTagName('sheet')).map(s => s.getAttribute('name'));
  }
  const sheets = [];
  sheetFiles.forEach((f, si) => {
    const doc = dp.parseFromString(dec(f), 'application/xml');
    const rowsEl = doc.getElementsByTagName('row');
    const rows = [];
    for (let i = 0; i < rowsEl.length; i++){
      const cells = rowsEl[i].getElementsByTagName('c');
      const r = [];
      for (let j = 0; j < cells.length; j++){
        const c = cells[j];
        const idx = colToIdx(c.getAttribute('r') || '');
        const t = c.getAttribute('t');
        let val = '';
        if (t === 'inlineStr'){
          const ts = c.getElementsByTagName('t');
          for (let k = 0; k < ts.length; k++) val += ts[k].textContent;
        } else {
          const v = c.getElementsByTagName('v')[0];
          if (v){ val = t === 's' ? (shared[parseInt(v.textContent,10)] ?? '') : v.textContent; }
        }
        if (idx >= 0) r[idx] = val; else r.push(val);
      }
      for (let k = 0; k < r.length; k++) if (r[k] === undefined) r[k] = '';
      rows.push(r);
    }
    sheets.push({ name: names[si] || ('Sheet' + (si+1)), rows: rows.filter(r => r.some(c => String(c).trim() !== '')) });
  });
  return sheets;
}

/* ---------- gzip ---------- */
async function gunzipText(bytes){
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read .gz files. Decompress it first.');
  const ds = new DecompressionStream('gzip');
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder().decode(ab);
}

/* ---------- json ----------
   Handles a Search Console API response, a BigQuery export, or any plain
   array of objects. Returns a header row plus data rows, like every other
   reader here, so the rest of the pipeline never learns about JSON.        */
function jsonToMatrix(text){
  let j;
  try { j = JSON.parse(text); }
  catch(e){
    // newline-delimited JSON, which is what BigQuery exports
    const lines = String(text).split(/\r?\n/).filter(l => l.trim());
    const rows = [];
    for (const l of lines){ try { rows.push(JSON.parse(l)); } catch(err){ return null; } }
    if (!rows.length) return null;
    j = rows;
  }
  let rows = null, dims = null;
  if (Array.isArray(j)) rows = j;
  else if (j && Array.isArray(j.rows)){ rows = j.rows; dims = j.dimensions || j.dimensionHeaders || null; }
  else if (j && Array.isArray(j.data)) rows = j.data;
  else if (j && typeof j === 'object'){
    const arr = Object.values(j).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
    if (arr) rows = arr;
  }
  if (!rows || !rows.length) return null;

  // Search Console API shape: { keys: [...], clicks, impressions, ctr, position }
  if (rows[0] && Array.isArray(rows[0].keys)){
    const n = rows[0].keys.length;
    /* The API returns dimension values without saying which dimension each one is unless the
       caller kept the request alongside the response. When the names are missing, read them off
       the values: a URL is a page, an ISO date is a date, a three-letter code is a country, and
       so on. Falling back to "dimension1" would leave the column unreadable to everything
       downstream, which is worse than an inference the user can correct in the mapper. */
    const nameOf = i => {
      const vals = rows.slice(0, 40).map(r => String(r.keys[i] == null ? '' : r.keys[i])).filter(Boolean);
      if (!vals.length) return 'dimension' + (i + 1);
      const all = re => vals.every(v => re.test(v));
      if (all(/^https?:\/\//i) || all(/^\//)) return 'page';
      if (all(/^\d{4}-\d{2}-\d{2}$/)) return 'date';
      if (all(/^(MOBILE|DESKTOP|TABLET)$/i)) return 'device';
      if (all(/^[a-z]{3}$/) && new Set(vals).size < Math.max(4, vals.length)) return 'country';
      if (all(/^[A-Z_]{3,30}$/) && !all(/\s/)) return 'searchAppearance';
      return 'query';
    };
    const seen = {};
    const names = (dims && dims.length === n) ? dims.map(String) : Array.from({length:n}, (_, i) => {
      let nm = nameOf(i);
      if (seen[nm]) nm = nm + (++seen[nm]); else seen[nm] = 1;   // never collide
      return nm;
    });
    const head = names.concat(['clicks','impressions','ctr','position']);
    return [head].concat(rows.map(r => r.keys.concat([r.clicks, r.impressions, r.ctr, r.position])));
  }
  const keys = [...new Set(rows.flatMap(r => (r && typeof r === 'object') ? Object.keys(r) : []))];
  if (!keys.length) return null;
  return [keys].concat(rows.map(r => keys.map(k => {
    const v = r ? r[k] : '';
    return (v && typeof v === 'object') ? JSON.stringify(v) : (v == null ? '' : v);
  })));
}

/* ---------- header classification ---------- */
const H = s => String(s || '').replace(/^﻿/,'').trim().toLowerCase().replace(/\s+/g,' ');
const KNOWN_METRIC = /^(keyword|search volume|volume|keyword difficulty|kd|kd %|cpc|cpc \(usd\)|competition|competitive density|number of results|results|keyword intents?|intent|serp features|serp features by keyword|timestamp|position|previous position|position difference|traffic|traffic \(%\)|traffic cost|trends|url|position type|tags?|last update|difficulty|com\.|clicks|impressions|ctr)$/;

function looksDomain(h){
  const s = H(h);
  if (KNOWN_METRIC.test(s)) return false;
  const base = s.replace(/\s*\((pos|position|pages?|url|traffic|volume)\)\s*$/,'').trim();
  return /^([a-z0-9-]+\.)+[a-z]{2,24}$/.test(base) && base.length < 64;
}


/* ---------- header aliases across Search Console export languages ---------- */
const ALIAS = {
  query:   ['query','top queries','queries','search query','suchanfrage','häufigste suchanfragen','haufigste suchanfragen','consulta','consultas principales','requête','requete','requêtes les plus fréquentes','requetes les plus frequentes','principais consultas','query principali','zoekopdracht','belangrijkste zoekopdrachten','sorgu','en çok kullanılan sorgular','zapytanie','najpopularniejsze zapytania','запрос','популярные запросы','クエリ','上位のクエリ','kueri','kata kunci utama'],
  page:    ['page','top pages','pages','landing page','address','seite','häufigste seiten','haufigste seiten','página','pagina','páginas principales','paginas principales','pages les plus consultées','pages les plus consultees','principais páginas','principais paginas','pagine principali','belangrijkste paginas','belangrijkste pagina\'s','sayfa','en çok tıklanan sayfalar','strona','najpopularniejsze strony','страница','популярные страницы','ページ','上位のページ','halaman'],
  clicks:  ['clicks','url clicks','klicks','clics','cliques','clic','klikken','tıklamalar','tiklamalar','kliknięcia','klikniecia','клики','クリック数','klik'],
  impr:    ['impressions','impr.','impressionen','impresiones','impressões','impressoes','impressioni','vertoningen','gösterimler','gosterimler','wyświetlenia','wyswietlenia','показы','表示回数','tayangan'],
  ctr:     ['ctr','click through rate','click-through rate','klickrate','porcentaje de clics','taux de clics','taxa de cliques','percentuale di clic','doorklikratio','tıklama oranı','ctr (%)','クリック率'],
  pos:     ['position','average position','avg. position','avg position','durchschnittliche position','posición','posicion','posición media','position moyenne','posição','posizione','positie','konum','ortalama konum','pozycja','позиция','掲載順位','posisi'],
  date:    ['date','datum','fecha','data','tarih','дата','日付','tanggal'],
  country: ['country','land','país','pais','pays','paese','ülke','ulke','kraj','страна','国','negara'],
  device:  ['device','gerät','gerat','dispositivo','appareil','apparaat','cihaz','urządzenie','urzadzenie','устройство','デバイス','perangkat'],
  /* 'searchappearance' is the Search Console API's own spelling — the alias table is
     where every spelling of a dimension belongs, including the machine one. */
  appearance: ['search appearance','searchappearance','suchergebnistyp','aspecto en la búsqueda','apparence dans les résultats','aspetto nella ricerca','tipo de aparência']
};
const aliasHas = (h, key) => ALIAS[key].some(a => h.some(x => x === a || x.startsWith(a)));
const aliasPick = (headers, key) => {
  const h = headers.map(H);
  for (const a of ALIAS[key]){ const i = h.indexOf(a); if (i >= 0) return headers[i]; }
  for (const a of ALIAS[key]){ const i = h.findIndex(x => x.startsWith(a)); if (i >= 0) return headers[i]; }
  return null;
};

function classify(headers, filename){
  const h = headers.map(H);
  const any = (...names) => names.some(n => h.some(x => x === n || x.startsWith(n)));
  const fn = String(filename || '').toLowerCase();

  const hasQuery = aliasHas(h,'query'), hasPage = aliasHas(h,'page');
  const hasClicks = aliasHas(h,'clicks'), hasImpr = aliasHas(h,'impr');
  const hasPos = aliasHas(h,'pos'), hasDate = aliasHas(h,'date');
  const hasCountry = aliasHas(h,'country'), hasDevice = aliasHas(h,'device');

  /* Search Console generative AI export: an impressions column with a dimension,
     but none of the click, click-through or position columns the classic report
     always carries. The file name is a strong hint when the export is renamed. */
  const genaiName = /generative|\bai[-_ ]?(overview|mode|search|performance)/i.test(fn);
  if (hasImpr && (genaiName || (!hasClicks && !hasPos && !aliasHas(h,'ctr')))){
    if (hasPage) return {source:'gsc', kind:'gsc_genai_page'};
    if (hasDate) return {source:'gsc', kind:'gsc_genai_date'};
    if (hasCountry) return {source:'gsc', kind:'gsc_genai_country'};
    if (hasDevice) return {source:'gsc', kind:'gsc_genai_device'};
    if (genaiName) return {source:'gsc', kind:'gsc_genai_page'};
  }

  if (hasClicks && hasImpr && hasPos){
    if (hasQuery && hasPage) return {source:'gsc', kind:'gsc_page_query'};
    if (hasQuery) return {source:'gsc', kind:'gsc_query'};
    if (hasPage) return {source:'gsc', kind:'gsc_page'};
    if (hasDate) return {source:'gsc', kind:'gsc_date'};
    if (hasCountry) return {source:'gsc', kind:'gsc_country'};
    if (hasDevice) return {source:'gsc', kind:'gsc_device'};
    if (aliasHas(h,'appearance')) return {source:'gsc', kind:'gsc_appearance'};
    return {source:'gsc', kind:'gsc_query'};
  }
  if (hasClicks && hasImpr && hasDate) return {source:'gsc', kind:'gsc_date'};

  const domCols = headers.filter(looksDomain);
  if (h.includes('keyword') && domCols.length >= 2) return {source:'semrush', kind:'semrush_gap', domainCols:domCols};
  if (h.includes('keyword') && any('position') && any('search volume','volume') && any('url')) return {source:'semrush', kind:'semrush_positions'};
  if (h.includes('keyword') && any('position') && any('visibility','tags','landing page')) return {source:'semrush', kind:'semrush_tracking'};
  if (any('source url','source page url') && any('target url','target page url')) return {source:'semrush', kind:'semrush_backlinks'};
  if (any('address') && any('status code')) return {source:'sf', kind:'sf_crawl'};
  if (any('url','page url','address') && any('crawl depth','http status code','internal linkrank','status code','indexability')) return {source:'semrush', kind:'semrush_audit'};
  if (h.includes('keyword') && any('search volume','volume')) return {source:'semrush', kind:'semrush_positions'};

  if (/quer|suchanfr|consulta|requet|requêt/.test(fn) && hasImpr) return {source:'gsc', kind:'gsc_query'};
  if (/page|seite|pagin|halaman/.test(fn) && hasImpr) return {source:'gsc', kind:'gsc_page'};
  return {source:'unknown', kind:'unknown'};
}

const KIND_LABEL = {
  gsc_query:'GSC — Queries', gsc_page:'GSC — Pages', gsc_page_query:'GSC — Page × Query',
  gsc_date:'GSC — Dates', gsc_country:'GSC — Countries', gsc_device:'GSC — Devices',
  gsc_appearance:'GSC — Search appearance',
  semrush_positions:'Semrush — Organic positions', semrush_gap:'Semrush — Keyword gap',
  semrush_tracking:'Semrush — Position tracking', semrush_audit:'Semrush — Site audit',
  gsc_genai_page:'GSC — Generative AI by page', gsc_genai_date:'GSC — Generative AI by date',
  gsc_genai_country:'GSC — Generative AI by country', gsc_genai_device:'GSC — Generative AI by device',
  semrush_backlinks:'Semrush — Backlinks', sf_crawl:'Crawler export (Screaming Frog)',
  aio_observation:'AI Overview observations', unknown:'Unrecognised'
};

/* ---------- column resolution ---------- */
function pick(headers, ...cands){
  const h = headers.map(H);
  for (const c of cands){
    const i = h.indexOf(c);
    if (i >= 0) return headers[i];
  }
  for (const c of cands){
    const i = h.findIndex(x => x.startsWith(c));
    if (i >= 0) return headers[i];
  }
  return null;
}

/* ---------- url + query normalisation ---------- */
function normUrl(u, opts){
  if (!u) return '';
  let s = String(u).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i,'').replace(/^www\./i,'');
  const hash = s.indexOf('#'); if (hash >= 0) s = s.slice(0, hash);
  if (!opts || opts.stripParams !== false){ const q = s.indexOf('?'); if (q >= 0) s = s.slice(0, q); }
  s = s.replace(/\/+$/,'');
  return s.toLowerCase();
}
function hostOf(u){ return normUrl(u).split('/')[0]; }
function pathOf(u){ const n = normUrl(u); const i = n.indexOf('/'); return i < 0 ? '/' : n.slice(i); }
function normQuery(q){ return String(q||'').trim().toLowerCase().replace(/\s+/g,' '); }

/* ============================================================
   COUNTRIES
   name | ISO-3166 alpha-3, which is what Search Console exports
   use in its Country column | Semrush database code | the
   language most Semrush databases assume for that country.
   ============================================================ */
const COUNTRIES = [
["Worldwide","","","English"],
["United States","usa","us","English"],["United Kingdom","gbr","uk","English"],
["Canada","can","ca","English"],["Australia","aus","au","English"],
["India","ind","in","English"],["Pakistan","pak","pk","English"],
["Ireland","irl","ie","English"],["New Zealand","nzl","nz","English"],
["South Africa","zaf","za","English"],["Singapore","sgp","sg","English"],
["United Arab Emirates","are","ae","English"],["Saudi Arabia","sau","sa","Arabic"],
["Germany","deu","de","German"],["France","fra","fr","French"],
["Spain","esp","es","Spanish"],["Italy","ita","it","Italian"],
["Netherlands","nld","nl","Dutch"],["Belgium","bel","be","Dutch"],
["Switzerland","che","ch","German"],["Austria","aut","at","German"],
["Poland","pol","pl","Polish"],["Portugal","prt","pt","Portuguese"],
["Sweden","swe","se","Swedish"],["Norway","nor","no","Norwegian"],
["Denmark","dnk","dk","Danish"],["Finland","fin","fi","Finnish"],
["Czechia","cze","cz","Czech"],["Slovakia","svk","sk","Slovak"],
["Hungary","hun","hu","Hungarian"],["Romania","rou","ro","Romanian"],
["Bulgaria","bgr","bg","Bulgarian"],["Greece","grc","gr","Greek"],
["Croatia","hrv","hr","Croatian"],["Serbia","srb","rs","Serbian"],
["Slovenia","svn","si","Slovenian"],["Ukraine","ukr","ua","Ukrainian"],
["Turkey","tur","tr","Turkish"],["Israel","isr","il","Hebrew"],
["Russia","rus","ru","Russian"],["Kazakhstan","kaz","kz","Russian"],
["Brazil","bra","br","Portuguese"],["Mexico","mex","mx","Spanish"],
["Argentina","arg","ar","Spanish"],["Chile","chl","cl","Spanish"],
["Colombia","col","co","Spanish"],["Peru","per","pe","Spanish"],
["Ecuador","ecu","ec","Spanish"],["Uruguay","ury","uy","Spanish"],
["Venezuela","ven","ve","Spanish"],["Costa Rica","cri","cr","Spanish"],
["Japan","jpn","jp","Japanese"],["South Korea","kor","kr","Korean"],
["China","chn","","Chinese"],["Hong Kong","hkg","hk","English"],
["Taiwan","twn","tw","Chinese"],["Indonesia","idn","id","Indonesian"],
["Malaysia","mys","my","English"],["Philippines","phl","ph","English"],
["Thailand","tha","th","Thai"],["Vietnam","vnm","vn","Vietnamese"],
["Bangladesh","bgd","bd","Bengali"],["Sri Lanka","lka","lk","English"],
["Nepal","npl","np","Nepali"],["Nigeria","nga","ng","English"],
["Kenya","ken","ke","English"],["Ghana","gha","gh","English"],
["Egypt","egy","eg","Arabic"],["Morocco","mar","ma","French"],
["Tunisia","tun","tn","French"],["Algeria","dza","dz","French"],
["Qatar","qat","qa","Arabic"],["Kuwait","kwt","kw","Arabic"],
["Bahrain","bhr","bh","Arabic"],["Oman","omn","om","Arabic"],
["Jordan","jor","jo","Arabic"],["Lebanon","lbn","lb","Arabic"],
["Iceland","isl","is","Icelandic"],["Estonia","est","ee","Estonian"],
["Latvia","lva","lv","Latvian"],["Lithuania","ltu","lt","Lithuanian"],
["Cyprus","cyp","cy","Greek"],["Malta","mlt","mt","English"],
["Luxembourg","lux","lu","French"],["Bolivia","bol","bo","Spanish"],
["Paraguay","pry","py","Spanish"],["Panama","pan","pa","Spanish"],
["Guatemala","gtm","gt","Spanish"],["Dominican Republic","dom","do","Spanish"],
["Puerto Rico","pri","pr","Spanish"],["Jamaica","jam","jm","English"],
["Trinidad and Tobago","tto","tt","English"],["Zimbabwe","zwe","zw","English"],
["Tanzania","tza","tz","English"],["Uganda","uga","ug","English"],
["Ethiopia","eth","et","English"],["Senegal","sen","sn","French"],
["Ivory Coast","civ","ci","French"],["Cameroon","cmr","cm","French"],
["Myanmar","mmr","mm","English"],["Cambodia","khm","kh","English"],
["Afghanistan","afg","af","English"],["Iraq","irq","iq","Arabic"],
["Georgia","geo","ge","English"],["Armenia","arm","am","English"],
["Azerbaijan","aze","az","English"],["Belarus","blr","by","Russian"],
["Moldova","mda","md","Romanian"],["Albania","alb","al","English"],
["Bosnia and Herzegovina","bih","ba","English"],["North Macedonia","mkd","mk","English"],
["Montenegro","mne","me","English"]
].map(([name, iso3, db, lang]) => ({ name, iso3, db, lang }));

const COUNTRY_BY_ISO3 = Object.fromEntries(COUNTRIES.filter(c=>c.iso3).map(c => [c.iso3, c]));
const COUNTRY_BY_NAME = Object.fromEntries(COUNTRIES.map(c => [c.name.toLowerCase(), c]));

function findCountry(v){
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return COUNTRY_BY_NAME[s] || COUNTRY_BY_ISO3[s] || COUNTRIES.find(c => c.db && c.db === s) || null;
}

/* ============================================================
   ANALYSIS ENGINE
   Deterministic arithmetic over the loaded exports.
   Nothing here asks a language model anything.
   ============================================================ */

const BASE_CURVE = {1:.275,2:.152,3:.099,4:.070,5:.053,6:.041,7:.033,8:.028,9:.024,10:.021,
                    11:.017,12:.015,13:.013,14:.012,15:.011,16:.010,17:.009,18:.0085,19:.008,20:.0075};
const TAIL_CTR = .004;
const MONTH_TO_PERIOD = 28/30.4;   // Semrush volume is monthly; GSC exports are usually 28 days

function ctrAt(curve, pos){
  if (pos == null) return TAIL_CTR;
  const p = Math.max(1, Math.round(pos));
  if (p > 20) return TAIL_CTR;
  return curve[p] != null ? curve[p] : BASE_CURVE[p];
}
function median(a){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function sum(a,f){ let t=0; for(const x of a) t += (f?f(x):x)||0; return t; }

/* ---------- normalise a parsed file into typed rows ---------- */
function normalizeDataset(ds){
  const hs = ds.headers, R = ds.rows;
  const c = {
    query: aliasPick(hs,'query') || pick(hs,'keyword'),
    page:  aliasPick(hs,'page')  || pick(hs,'url','address'),
    clicks: aliasPick(hs,'clicks'),
    impr:  aliasPick(hs,'impr'),
    ctr:   aliasPick(hs,'ctr'),
    pos:   aliasPick(hs,'pos'),
    date:  aliasPick(hs,'date'),
    country: aliasPick(hs,'country'), device: aliasPick(hs,'device'),
    prevPos: pick(hs,'previous position','prev. position'),
    volume: pick(hs,'search volume','volume'),
    kd:    pick(hs,'keyword difficulty','kd','kd %','difficulty'),
    cpc:   pick(hs,'cpc','cpc (usd)'),
    intent: pick(hs,'keyword intents','intent','keyword intent'),
    feat:  pick(hs,'serp features by keyword','serp features'),
    traffic: pick(hs,'traffic'),
    status: pick(hs,'http status code','status code'),
    depth: pick(hs,'crawl depth'),
    issues: pick(hs,'issues')
  };
  const k = ds.kind;
  const out = [];

  if (k.startsWith('gsc')){
    for (const r of R){
      const clicks = num(r[c.clicks]) || 0, impr = num(r[c.impr]) || 0;
      const row = {
        query: c.query ? normQuery(r[c.query]) : '',
        queryRaw: c.query ? String(r[c.query]||'').trim() : '',
        url: c.page ? normUrl(r[c.page]) : '',
        urlRaw: c.page ? String(r[c.page]||'').trim() : '',
        date: c.date ? String(r[c.date]||'').trim() : '',
        dim: c.country ? String(r[c.country]||'') : (c.device ? String(r[c.device]||'') : ''),
        clicks, impr,
        ctr: impr > 0 ? clicks/impr : 0,
        ctrReported: c.ctr ? pctVal(r[c.ctr]) : null,
        pos: c.pos ? num(r[c.pos]) : null
      };
      if (!row.query && !row.url && !row.date && !row.dim) continue;
      out.push(row);
    }
  } else if (k === 'semrush_gap'){
    const domCols = ds.domainCols || hs.filter(looksDomain);
    for (const r of R){
      const kw = normQuery(r[c.query]);
      if (!kw) continue;
      const positions = {};
      for (const d of domCols){
        const v = num(r[d]);
        positions[H(d).replace(/\s*\(.*\)$/,'')] = (v && v > 0) ? v : null;
      }
      out.push({
        keyword: kw, keywordRaw: String(r[c.query]||'').trim(),
        volume: num(r[c.volume]) || 0, kd: num(r[c.kd]) || 0, cpc: num(r[c.cpc]) || 0,
        intent: String(r[c.intent]||'').trim(), positions
      });
    }
  } else if (k === 'semrush_positions' || k === 'semrush_tracking'){
    for (const r of R){
      const kw = normQuery(r[c.query]);
      if (!kw) continue;
      out.push({
        keyword: kw, keywordRaw: String(r[c.query]||'').trim(),
        pos: num(r[c.pos]), prevPos: c.prevPos ? num(r[c.prevPos]) : null,
        volume: num(r[c.volume]) || 0, kd: num(r[c.kd]) || 0, cpc: num(r[c.cpc]) || 0,
        url: c.page ? normUrl(r[c.page]) : '', urlRaw: c.page ? String(r[c.page]||'').trim() : '',
        intent: String(r[c.intent]||'').trim(), features: String(r[c.feat]||'').trim(),
        traffic: num(r[c.traffic]) || 0
      });
    }
  } else if (k === 'semrush_audit'){
    for (const r of R){
      const u = c.page ? normUrl(r[c.page]) : '';
      if (!u) continue;
      out.push({ url:u, urlRaw:String(r[c.page]||'').trim(), status:num(r[c.status]), depth:num(r[c.depth]), issues:num(r[c.issues]) });
    }
  } else {
    for (const r of R) out.push(r);
  }
  return out;
}

/* ---------- build the working model ---------- */
function buildModel(datasets){
  const M = {
    gscQ:{current:[],previous:[],yoy:[]}, gscP:{current:[],previous:[],yoy:[]},
    gscPQ:[], gscDates:[], gscDevice:[], gscCountry:[],
    genai:{ page:{current:[],previous:[],yoy:[]}, date:{current:[],previous:[],yoy:[]},
            country:{current:[],previous:[],yoy:[]}, device:{current:[],previous:[],yoy:[]} },
    genaiLoaded:false, aioObs:[],
    smrPos:[], smrGap:[], smrAudit:[], smrTracking:[],
    truncated:[], parseWarnings:[]
  };
  for (const ds of datasets){
    const rows = normalizeDataset(ds);
    ds.parsedCount = rows.length;
    const per = ds.period || 'current';
    if (ds.kind === 'gsc_query') M.gscQ[per] = M.gscQ[per].concat(rows);
    else if (ds.kind === 'gsc_page') M.gscP[per] = M.gscP[per].concat(rows);
    else if (ds.kind === 'gsc_page_query') M.gscPQ = M.gscPQ.concat(rows.map(r => ({...r, period:per})));
    else if (ds.kind === 'gsc_date') M.gscDates = M.gscDates.concat(rows.map(r => ({...r, period:per})));
    else if (ds.kind === 'gsc_device') M.gscDevice = M.gscDevice.concat(rows);
    else if (ds.kind === 'gsc_country') M.gscCountry = M.gscCountry.concat(rows);
    else if (ds.kind === 'semrush_positions') M.smrPos = M.smrPos.concat(rows);
    else if (ds.kind === 'semrush_tracking') M.smrTracking = M.smrTracking.concat(rows);
    else if (ds.kind === 'semrush_gap') M.smrGap = M.smrGap.concat(rows);
    else if (ds.kind === 'semrush_audit') M.smrAudit = M.smrAudit.concat(rows);
    else if (ds.kind.startsWith('gsc_genai_')){
      const dim = ds.kind.replace('gsc_genai_','');
      if (M.genai[dim]) { M.genai[dim][per] = M.genai[dim][per].concat(rows); M.genaiLoaded = true; }
    }
    else if (ds.kind === 'aio_observation') M.aioObs = M.aioObs.concat(rows);

    if (ds.kind.startsWith('gsc') && rows.length >= 999 && rows.length <= 1001) M.truncated.push(ds.name);
    if (ds.kind.startsWith('gsc')){
      let bad = 0, checked = 0;
      for (const r of rows){
        if (r.ctrReported == null || r.impr < 10) continue;
        checked++;
        if (Math.abs(r.ctrReported - r.ctr) > Math.max(.01, r.ctr * .12)) bad++;
      }
      if (checked > 20 && bad / checked > .2) M.parseWarnings.push(ds.name);
    }
  }
  return M;
}

/* ---------- calibrate the click-through curve on the user's own data ---------- */
function buildCurve(rows){
  const buckets = {};
  for (const r of rows){
    if (!r.pos || r.impr < 25) continue;
    const p = Math.round(r.pos);
    if (p < 1 || p > 20) continue;
    (buckets[p] = buckets[p] || []).push(r.ctr);
  }
  const curve = {}; let filled = 0;
  for (let p = 1; p <= 20; p++){
    const b = buckets[p];
    if (b && b.length >= 8){ curve[p] = median(b); filled++; }
  }
  if (filled < 4) return { curve: {...BASE_CURVE}, source:'baseline', filled:0 };
  // fill gaps by scaling the baseline to the nearest calibrated anchor
  for (let p = 1; p <= 20; p++){
    if (curve[p] != null) continue;
    let lo = null, hi = null;
    for (let q = p-1; q >= 1; q--) if (curve[q] != null && q <= 20){ lo = q; break; }
    for (let q = p+1; q <= 20; q++) if (curve[q] != null){ hi = q; break; }
    const anchor = lo != null ? lo : hi;
    curve[p] = BASE_CURVE[p] * (curve[anchor] / BASE_CURVE[anchor]);
  }
  // enforce a non-increasing curve so "one tier up" is never negative
  for (let p = 2; p <= 20; p++) if (curve[p] > curve[p-1]) curve[p] = curve[p-1] * .94;
  return { curve, source:'calibrated', filled };
}

/* ---------- the gates ---------- */
function runGates(M, cfg, datasets, filters){
  const g = [];
  const add = (state,title,detail) => g.push({state,title,detail});
  const host = hostOf(cfg.domain || '');

  add(datasets.length ? 'pass':'fail', 'Files loaded',
      datasets.length ? `${datasets.length} file${datasets.length>1?'s':''} parsed, ${datasets.reduce((a,d)=>a+(d.parsedCount||0),0).toLocaleString()} usable rows.` : 'No exports loaded.');

  if (!host) add('fail','Domain set','Set the domain in stage 1. URL matching and the Semrush column lookup both depend on it.');
  else {
    const urls = [...M.gscP.current, ...M.gscPQ].map(r => r.url).filter(Boolean);
    if (!urls.length) add('skip','Domain matches the data','No page-level export loaded, so there is nothing to match yet.');
    else {
      const hit = urls.filter(u => hostOf(u) === host || hostOf(u).endsWith('.' + host)).length;
      const share = hit / urls.length;
      add(share > .9 ? 'pass' : share > .5 ? 'warn' : 'fail', 'Domain matches the data',
        `${Math.round(share*100)}% of exported page URLs sit on ${host}.` + (share <= .9 ? ' Check for a www or subdomain mismatch, or a property that covers more than this domain.' : ''));
    }
  }

  const hasPrev = M.gscQ.previous.length || M.gscP.previous.length;
  add(hasPrev ? 'pass':'warn', 'Comparison period present',
    hasPrev ? 'A previous period is loaded, so decay and momentum can be measured.'
            : 'Only one period is loaded. Decay, recovery and momentum are all switched off. Export the same report for the prior period and label it Previous.');

  if (M.gscDates.length){
    const cur = M.gscDates.filter(r=>r.period==='current').map(r=>r.date).filter(Boolean).sort();
    const prev = M.gscDates.filter(r=>r.period==='previous').map(r=>r.date).filter(Boolean).sort();
    let d = cur.length ? `Current range ${cur[0]} to ${cur[cur.length-1]} (${cur.length} days).` : '';
    if (prev.length){
      d += ` Previous range ${prev[0]} to ${prev[prev.length-1]} (${prev.length} days).`;
      const off = Math.abs(cur.length - prev.length);
      add(off === 0 ? 'pass' : off <= 1 ? 'warn' : 'fail', 'Periods are the same length',
          d + (off ? ` The two ranges differ by ${off} day${off>1?'s':''}, which biases every delta below.` : ''));
    } else add('warn','Periods are the same length', d + ' No previous-period Dates export, so the comparison length cannot be verified. Confirm it by hand.');
  } else {
    add('warn','Periods are the same length','No Dates export loaded. This page cannot verify that your two ranges are equal length, and an unequal comparison invalidates every delta. Confirm it before acting.');
  }

  add(M.truncated.length ? 'warn':'pass','Exports are not truncated',
    M.truncated.length ? `${M.truncated.join(', ')} returned about 1,000 rows, which is the Search Console report cap. The long tail is missing, so totals here are not site totals.`
                       : 'No export hit the 1,000-row report cap.');

  add(M.parseWarnings.length ? 'warn':'pass','Numbers parsed cleanly',
    M.parseWarnings.length ? `In ${M.parseWarnings.join(', ')} the stated click-through rate disagrees with clicks divided by impressions on many rows. Usually a decimal-comma locale. Re-export in English or check the delimiter.`
                           : 'Reported click-through rates agree with clicks divided by impressions.');

  if (M.smrGap.length){
    const domains = Object.keys(M.smrGap[0].positions || {});
    const mine = domains.find(d => d === host || hostOf(d) === host);
    add(mine ? 'pass':'fail','Your column found in the keyword gap export',
      mine ? `Matched column "${mine}". The other ${domains.length-1} are treated as competitors.`
           : `The gap export has columns for ${domains.join(', ') || 'no domains'}, none of which match ${host}. Fix the domain in stage 1.`);
  }

  if (M.smrPos.length && M.gscQ.current.length){
    add('warn','Scope agreement between sources',
      'Semrush volume, difficulty and traffic are modelled estimates for one database and location. Search Console figures are your measured results under whatever filters you applied. Confirm both cover the same country and device before trusting any side-by-side number.');
  }

  if (filters && filters.length){
    const pairs = filters.flatMap(f => f.pairs).map(([k,v]) => `${k}: ${v}`);
    add('pass','Export filters recorded', `The archive carried its own filter sheet, so the scope is documented: ${pairs.join('; ')}.`);
  }

  const n = M.gscQ.current.length;
  if (n) add(n >= 200 ? 'pass' : n >= 50 ? 'warn' : 'fail','Enough rows to generalise',
    `${n.toLocaleString()} query rows in the current period.` + (n < 200 ? ' Small samples make position averages jumpy. Treat single-row findings as leads, not conclusions.' : ''));

  return g;
}

/* ---------- findings ---------- */
function analyse(M, cfg){
  const host = hostOf(cfg.domain || '');
  const brand = String(cfg.brand||'').trim().toLowerCase();
  const brandTokens = brand ? brand.split(/\s+/).filter(t => t.length > 2) : [];
  const isBrand = q => brandTokens.length ? brandTokens.every(t => q.includes(t)) : false;
  const minImpr = 20;

  const curCurveRows = M.gscQ.current.length ? M.gscQ.current : M.gscP.current;
  const cal = buildCurve(curCurveRows);
  const curve = cal.curve;

  const F = { curveInfo: cal, curve };

  /* -- snapshot -- */
  const snap = (rows) => {
    const clicks = sum(rows,r=>r.clicks), impr = sum(rows,r=>r.impr);
    const wpos = impr ? sum(rows,r=> (r.pos||0)*r.impr)/impr : null;
    return { clicks, impr, ctr: impr?clicks/impr:0, pos: wpos, n: rows.length };
  };
  const baseCur = M.gscQ.current.length ? M.gscQ.current : M.gscP.current;
  const basePrev = M.gscQ.previous.length ? M.gscQ.previous : M.gscP.previous;
  /* The year-ago window is kept separate from the previous period rather than
     averaged into it. They answer different questions — "is this month worse
     than last month" and "is this month worse than the same month last year" —
     and on a seasonal site the two routinely disagree. Neither is a correction
     to the other, so both are reported and neither is blended. */
  const baseYoy = M.gscQ.yoy.length ? M.gscQ.yoy : M.gscP.yoy;
  F.snapshot = { current: snap(baseCur), previous: basePrev.length ? snap(basePrev) : null,
                 yoy: baseYoy.length ? snap(baseYoy) : null,
                 basis: M.gscQ.current.length ? 'query' : (M.gscP.current.length ? 'page' : 'no') };
  F.hasYoy = !!F.snapshot.yoy;
  F.branded = null;
  if (brandTokens.length && M.gscQ.current.length){
    const b = M.gscQ.current.filter(r => isBrand(r.query));
    F.branded = { clicks: sum(b,r=>r.clicks), impr: sum(b,r=>r.impr), n: b.length,
                  share: F.snapshot.current.clicks ? sum(b,r=>r.clicks)/F.snapshot.current.clicks : 0 };
  }

  /* -- position distribution (impressions by bucket) -- */
  const bucketsDef = [[1,3,'1-3'],[4,10,'4-10'],[11,20,'11-20'],[21,50,'21-50'],[51,999,'51+']];
  F.distribution = bucketsDef.map(([lo,hi,label]) => {
    const rows = baseCur.filter(r => r.pos != null && r.pos >= lo && r.pos < hi + .5);
    return { label, impr: sum(rows,r=>r.impr), clicks: sum(rows,r=>r.clicks), n: rows.length };
  });

  /* -- striking distance -- */
  const tierTarget = p => p <= 10 ? 3 : (p <= 20 ? 8 : 15);
  F.striking = baseCur
    .filter(r => r.pos != null && r.pos >= 3.5 && r.pos <= 40 && r.impr >= minImpr)
    .map(r => {
      const target = tierTarget(r.pos);
      const gain = Math.max(0, r.impr * (ctrAt(curve,target) - r.ctr));
      return { key: r.query || r.url, isQuery: !!r.query, raw: r.queryRaw || r.urlRaw,
               clicks: r.clicks, impr: r.impr, pos: r.pos, ctr: r.ctr, target, gain,
               brandFlag: r.query ? isBrand(r.query) : false };
    })
    .filter(r => r.gain >= 1)
    .sort((a,b) => b.gain - a.gain);

  /* -- click-through underperformance at a rank you already hold -- */
  F.ctrGap = baseCur
    .filter(r => r.pos != null && r.pos <= 10.4 && r.impr >= Math.max(minImpr, 50))
    .map(r => {
      const exp = ctrAt(curve, r.pos);
      return { key: r.query || r.url, isQuery: !!r.query, raw: r.queryRaw || r.urlRaw,
               clicks: r.clicks, impr: r.impr, pos: r.pos, ctr: r.ctr, exp,
               ratio: exp ? r.ctr/exp : 1, lost: Math.max(0, r.impr*(exp - r.ctr)),
               brandFlag: r.query ? isBrand(r.query) : false };
    })
    .filter(r => r.ratio < .6 && r.lost >= 2)
    .sort((a,b) => b.lost - a.lost);

  /* -- decay and momentum -- */
  const pairUp = (cur, prev, keyFn) => {
    const p = new Map();
    for (const r of prev){ const k = keyFn(r); if(!k) continue; const e = p.get(k); if (e){ e.clicks+=r.clicks; e.impr+=r.impr; e.posW += (r.pos||0)*r.impr; } else p.set(k,{clicks:r.clicks,impr:r.impr,posW:(r.pos||0)*r.impr}); }
    const out = [];
    for (const r of cur){
      const k = keyFn(r); if(!k) continue;
      const e = p.get(k);
      out.push({ key:k, raw: r.queryRaw || r.urlRaw, cur:r, prevClicks: e?e.clicks:0, prevImpr: e?e.impr:0,
                 prevPos: e && e.impr ? e.posW/e.impr : null, seen: !!e });
      if (e) p.delete(k);
    }
    for (const [k,e] of p) out.push({ key:k, raw:k, cur:{clicks:0,impr:0,pos:null,ctr:0}, prevClicks:e.clicks, prevImpr:e.impr, prevPos: e.impr?e.posW/e.impr:null, seen:true, vanished:true });
    return out;
  };

  F.decay = []; F.risers = []; F.hasComparison = false;
  const cmpSets = [];
  if (M.gscP.current.length && M.gscP.previous.length) cmpSets.push(['page', M.gscP.current, M.gscP.previous, r=>r.url]);
  if (M.gscQ.current.length && M.gscQ.previous.length) cmpSets.push(['query', M.gscQ.current, M.gscQ.previous, r=>r.query]);
  for (const [type, cur, prev, kf] of cmpSets){
    F.hasComparison = true;
    for (const p of pairUp(cur, prev, kf)){
      const d = p.cur.clicks - p.prevClicks;
      const di = p.cur.impr - p.prevImpr;
      const posMove = (p.prevPos && p.cur.pos) ? p.cur.pos - p.prevPos : null;
      const rec = { type, key:p.key, raw:p.raw, clicks:p.cur.clicks, prevClicks:p.prevClicks, delta:d,
                    impr:p.cur.impr, prevImpr:p.prevImpr, dImpr:di, pos:p.cur.pos, prevPos:p.prevPos,
                    posMove, vanished: !!p.vanished };
      if (p.prevClicks >= 5 && d <= -Math.max(3, p.prevClicks*.25)){
        rec.cause = p.vanished ? 'Dropped out of the export'
          : (posMove != null && posMove >= 1) ? 'Ranking loss'
          : (p.prevImpr > 0 && di <= -p.prevImpr*.25) ? 'Impressions fell at a stable rank'
          : 'Click-through fell at a stable rank';
        F.decay.push(rec);
      } else if (p.prevClicks >= 3 && d >= Math.max(5, p.prevClicks*.25)){
        F.risers.push(rec);
      }
    }
  }
  F.decay.sort((a,b)=>a.delta-b.delta);
  F.risers.sort((a,b)=>b.delta-a.delta);

  /* -- cannibalisation -- */
  F.cannibal = [];
  if (M.gscPQ.length){
    const byQ = new Map();
    for (const r of M.gscPQ){
      if (r.period && r.period !== 'current') continue;
      if (!r.query || !r.url) continue;
      const e = byQ.get(r.query) || { query:r.query, raw:r.queryRaw, impr:0, clicks:0, urls:new Map() };
      e.impr += r.impr; e.clicks += r.clicks;
      const u = e.urls.get(r.url) || { url:r.url, raw:r.urlRaw, impr:0, clicks:0, posW:0 };
      u.impr += r.impr; u.clicks += r.clicks; u.posW += (r.pos||0)*r.impr;
      e.urls.set(r.url, u); byQ.set(r.query, e);
    }
    for (const e of byQ.values()){
      if (e.impr < 100) continue;
      const urls = [...e.urls.values()].map(u => ({...u, share:u.impr/e.impr, pos:u.impr?u.posW/u.impr:null}))
                    .filter(u => u.share >= .12 && u.impr >= 20)
                    .sort((a,b)=>b.impr-a.impr);
      if (urls.length >= 2){
        const top = urls[0], second = urls[1];
        const close = top.pos != null && second.pos != null && Math.abs(top.pos - second.pos) < 3;
        // which URL should win, and what to do with the other
        const rank = u => (u.clicks * 3) + (u.impr / 100) + (u.pos != null ? Math.max(0, 30 - u.pos) : 0);
        const keep = rank(top) >= rank(second) ? top : second;
        const other = keep === top ? second : top;
        let action, why;
        if (second.share < .2 || (second.clicks === 0 && second.share < .3)){
          action = 'Monitor';
          why = `${Math.round(top.share*100)}% of the query sits on one URL and the second earns little. This is usually a related page surfacing occasionally, not a real split.`;
        } else if (Math.abs(top.share - second.share) < .18 && close){
          action = 'Consolidate';
          why = `The query is split almost evenly (${urls.slice(0,2).map(u=>Math.round(u.share*100)+'%').join(' / ')}) and both URLs surface at similar depth. Neither can build authority while the other exists. Keep ${keep.raw||keep.url}, redirect the other into it and fold its unique content across.`;
        } else if (close){
          action = 'Differentiate';
          why = `Both rank within three places of each other. Keep ${keep.raw||keep.url} as the page for this query, and re-angle ${other.raw||other.url} onto the intent it serves better rather than deleting it.`;
        } else {
          action = 'De-optimise the weaker page';
          why = `${keep.raw||keep.url} clearly leads. Pull the query's exact phrasing out of ${other.raw||other.url}'s title, H1 and internal link anchors so it stops competing.`;
        }
        F.cannibal.push({ query:e.query, raw:e.raw, impr:e.impr, clicks:e.clicks, urls,
          severity: second.share >= .35 ? 'high' : second.share >= .2 ? 'medium' : 'low',
          action, keep: keep.raw || keep.url, drop: other.raw || other.url, why,
          note: close ? 'Both URLs surface at similar depth, which is the classic split-signal pattern.' : 'One URL dominates; the second may simply be a related page.' });
      }
    }
    F.cannibal.sort((a,b)=>b.impr-a.impr);
  }

  /* -- keyword gap -- */
  F.gaps = [];
  if (M.smrGap.length && host){
    const domains = Object.keys(M.smrGap[0].positions || {});
    const mine = domains.find(d => d === host || hostOf(d) === host);
    const comps = domains.filter(d => d !== mine);
    const gscIndex = new Map(M.gscQ.current.map(r => [r.query, r]));
    const intentW = s => /transactional|commercial/i.test(s) ? 1.35 : /informational/i.test(s) ? 1 : /navigational/i.test(s) ? .5 : 1;
    for (const r of M.smrGap){
      const myPos = mine ? r.positions[mine] : null;
      let best = null;
      for (const c of comps){ const p = r.positions[c]; if (p && p <= 20 && (!best || p < best.pos)) best = {domain:c, pos:p}; }
      if (!best || best.pos > 10) continue;
      if (myPos && myPos <= 10) continue;
      const g = gscIndex.get(r.keyword);
      const estClicks = r.volume * ctrAt(curve, 5) * MONTH_TO_PERIOD;
      const score = estClicks * intentW(r.intent) / (1 + (r.kd||0)/60);
      F.gaps.push({ keyword:r.keyword, raw:r.keywordRaw, volume:r.volume, kd:r.kd, cpc:r.cpc, intent:r.intent,
        myPos, best, gscImpr: g?g.impr:0, gscClicks: g?g.clicks:0, gscPos: g?g.pos:null,
        estClicks, score,
        verdict: (myPos && myPos <= 30) ? 'Refresh the page that already ranks'
               : (g && g.impr >= 30) ? 'Refresh: you already get impressions for this'
               : 'Create'
      });
    }
    F.gaps.sort((a,b)=>b.score-a.score);
    F.gapMeta = { mine, comps };
  }

  /* -- Semrush position drops -- */
  F.smrDrops = M.smrPos
    .filter(r => r.pos != null && r.prevPos != null && r.prevPos > 0 && r.pos - r.prevPos >= 3 && r.prevPos <= 20)
    .map(r => ({...r, drop: r.pos - r.prevPos}))
    .sort((a,b) => (b.drop*Math.log10(10+(b.volume||0))) - (a.drop*Math.log10(10+(a.volume||0))));

  /* -- observed vs estimated reconciliation -- */
  F.reconcile = [];
  if (M.smrPos.length && M.gscQ.current.length){
    const gscIndex = new Map(M.gscQ.current.map(r => [r.query, r]));
    for (const r of M.smrPos){
      if (r.pos == null || r.pos > 10) continue;
      const g = gscIndex.get(r.keyword);
      if (!g && r.volume >= 100) F.reconcile.push({ keyword:r.keyword, raw:r.keywordRaw, smrPos:r.pos, volume:r.volume, gscImpr:0, gscPos:null,
        note:'Semrush reports a top-10 position, but this query does not appear in your Search Console export at all.' });
      else if (g && g.impr < Math.max(10, r.volume*.03*MONTH_TO_PERIOD) && r.volume >= 100) F.reconcile.push({ keyword:r.keyword, raw:r.keywordRaw, smrPos:r.pos, volume:r.volume, gscImpr:g.impr, gscPos:g.pos,
        note:'Impressions are far below what this estimated volume and position would imply.' });
    }
    F.reconcile.sort((a,b)=>b.volume-a.volume);
  }

  F.actions = buildActions(F, cfg, curve);
  return F;
}

/* ---------- merge every finding into one ranked queue ---------- */
const EFFORT = { create:'High', refresh:'Medium', ctr:'Low', consolidate:'Medium', protect:'Low', investigate:'Low', fix:'Low' };
const DECISION_LABEL = { create:'Create', refresh:'Refresh', ctr:'Fix title and snippet', consolidate:'Consolidate', protect:'Protect', investigate:'Investigate', fix:'Technical fix' };

function buildActions(F, cfg, curve){
  const map = new Map();
  const push = (target, decision, impact, evidence, basis, extra) => {
    const k = decision + '::' + target;
    const e = map.get(k);
    if (e){ e.impact = Math.max(e.impact, impact); e.evidence.push(evidence); }
    else map.set(k, { target, targetRaw: (extra&&extra.raw)||target, decision, impact, evidence:[evidence], basis, ...(extra||{}) });
  };

  for (const r of F.striking.slice(0, 120))
    push(r.raw || r.key, 'refresh', r.gain,
      `Position ${r.pos.toFixed(1)} on ${r.impr.toLocaleString()} impressions. Reaching position ${r.target} would add roughly ${Math.round(r.gain)} clicks in a period this length.`, 'observed', {raw:r.raw, kind: r.isQuery?'query':'page'});

  for (const r of F.ctrGap.slice(0, 80))
    push(r.raw || r.key, 'ctr', r.lost,
      `Ranks ${r.pos.toFixed(1)} but converts ${(r.ctr*100).toFixed(1)}% of ${r.impr.toLocaleString()} impressions against ${(r.exp*100).toFixed(1)}% expected at that rank. About ${Math.round(r.lost)} clicks left on the table.`, 'observed', {raw:r.raw, kind: r.isQuery?'query':'page'});

  for (const r of F.decay.slice(0, 80))
    push(r.raw || r.key, r.cause === 'Click-through fell at a stable rank' ? 'ctr' : 'refresh', Math.abs(r.delta),
      `${r.cause}. Clicks ${r.prevClicks.toLocaleString()} to ${r.clicks.toLocaleString()} (${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString()})${r.posMove!=null ? `, average position moved ${r.posMove > 0 ? 'down' : 'up'} ${Math.abs(r.posMove).toFixed(1)}` : ''}.`, 'observed', {raw:r.raw, kind:r.type});

  for (const r of F.risers.slice(0, 40))
    push(r.raw || r.key, 'protect', r.delta * .3,
      `Clicks up ${r.delta.toLocaleString()} against the previous period. Log the current version before anyone edits it, and check what changed.`, 'observed', {raw:r.raw, kind:r.type});

  for (const r of F.cannibal.slice(0, 40)){
    const est = r.impr * ctrAt(curve, 3) * .25;
    push(r.raw || r.query, 'consolidate', est,
      `${r.urls.length} URLs split ${r.impr.toLocaleString()} impressions for this query (${r.urls.slice(0,2).map(u=>Math.round(u.share*100)+'%').join(' / ')}). ${r.note}`, 'observed', {raw:r.raw, kind:'query'});
  }

  for (const r of F.gaps.slice(0, 100))
    push(r.raw || r.keyword, r.verdict.startsWith('Create') ? 'create' : 'refresh', r.estClicks,
      `${r.best.domain} ranks ${r.best.pos} and you ${r.myPos ? 'rank ' + r.myPos : 'do not rank'}. Estimated volume ${r.volume.toLocaleString()} a month, difficulty ${r.kd || 'n/a'}${r.gscImpr ? `, and you already draw ${r.gscImpr.toLocaleString()} impressions for it` : ''}.`, 'estimated', {raw:r.raw, kind:'keyword'});

  for (const r of F.smrDrops.slice(0, 40))
    push(r.urlRaw || r.keywordRaw || r.keyword, 'investigate', (r.volume||0) * .01,
      `Semrush shows ${r.keywordRaw || r.keyword} falling from position ${r.prevPos} to ${r.pos}. Confirm against Search Console before acting.`, 'estimated', {raw:r.urlRaw || r.keywordRaw, kind:'keyword'});

  for (const r of F.reconcile.slice(0, 25))
    push(r.raw || r.keyword, 'investigate', 0,
      r.note + ' Treat the estimate as unproven until Search Console agrees.', 'estimated', {raw:r.raw, kind:'keyword'});

  const out = [...map.values()].map(a => ({...a, effort: EFFORT[a.decision], impact: Math.round(a.impact*10)/10 }));
  out.sort((a,b) => b.impact - a.impact);
  return out;
}

/* ============================================================
   KEYWORD CLUSTERING AND CONTENT MAPPING
   Groups queries into topics, then decides which page should
   own each topic. Two similarity signals:
     1. shared vocabulary, weighted by how rare each word is
     2. shared serving URL, taken from your own page x query data
   The second is far stronger evidence than the first, because it
   is Google's own opinion about which queries belong together.
   ============================================================ */

const STOP = new Set(('a an the and or but if then than that this these those of for to in on at by with from as is are was were be been being do does did have has had can could should would will shall may might must i you he she it we they my your our their what which who whom whose there here about into over under out up down off very just also not no nes'.split(' ')));

function stem(w){
  if (w.length <= 3) return w;
  if (/[^aeiou]ies$/.test(w)) return w.slice(0,-3) + 'y';
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0,-2);
  if (/s$/.test(w)) w = w.slice(0,-1);
  if (/ing$/.test(w) && w.length > 6) w = w.slice(0,-3);
  else if (/ed$/.test(w) && w.length > 5) w = w.slice(0,-2);
  if (/ly$/.test(w) && w.length > 5) w = w.slice(0,-2);
  return w;
}
function tokens(q){
  return String(q||'').toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s'-]/g,' ')
    .split(/[\s'-]+/)
    .filter(t => t && t.length > 1 && !STOP.has(t))
    .map(stem);
}

const INTENT_RULES = [
  ['transactional', /\b(buy|order|purchas|coupon|discount|deal|cheap|price|pricing|cost|quote|hire|book|rent|subscription|for sale|near me|delivery|shop)\b/],
  ['commercial',    /\b(best|top|review|compare|comparison|vs|versus|alternative|which|recommend|rating|ranked|service|services|company|companies|supplier|suppliers|contractor|contractors|specialist|specialists|agency|provider|providers|firm|consultant|consultants)\b/],
  ['informational', /\b(how|what|why|when|where|guide|tutorial|example|idea|mean|meaning|definition|tip|checklist|explain|learn|diy|steps|template)\b/]
];
function guessIntent(q, brandTokens){
  const s = ' ' + String(q||'').toLowerCase() + ' ';
  if (brandTokens && brandTokens.length && brandTokens.every(t => s.includes(t))) return 'navigational';
  for (const [label, re] of INTENT_RULES) if (re.test(s)) return label;
  return 'informational';
}

/* ============================================================
   clusterQueries(rows, opts)
   rows: [{query, queryRaw, clicks, impr, ctr, pos}]
   opts: { threshold, pageIndex: Map(query -> [{url, impr, clicks, pos}]),
           intents: Map(query -> intentString), brandTokens: [], curve, ctrAt }

   Greedy centroid agglomeration, not pairwise union-find. Comparing a
   query to a whole cluster instead of to one member is what stops
   "cleaning cost" and "treatment cost" chaining four topics into one.
   ============================================================ */
function clusterQueries(rows, opts){
  opts = opts || {};
  const TH = opts.threshold != null ? opts.threshold : 0.38;
  const N = rows.length;
  const out = { clusters: [], stats: {} };
  if (!N) return out;

  const toks = rows.map(r => Array.from(new Set(tokens(r.query))));
  const df = new Map();
  for (const t of toks) for (const w of t) df.set(w, (df.get(w)||0)+1);
  const idf = new Map();
  for (const [w,c] of df) idf.set(w, Math.log(1 + N/c));

  const vecs = toks.map(t => {
    const v = new Map(); let s = 0;
    for (const w of t){ const x = idf.get(w) || 0; v.set(w, x); s += x*x; }
    const n = Math.sqrt(s) || 1;
    for (const [w,x] of v) v.set(w, x/n);
    return v;
  });

  // dominant serving URL per query, from page x query data
  const dom = new Array(N).fill(null);
  if (opts.pageIndex){
    for (let i=0;i<N;i++){
      const list = opts.pageIndex.get(rows[i].query);
      if (!list || !list.length) continue;
      let best = null, tot = 0;
      for (const u of list){ tot += u.impr; if (!best || u.impr > best.impr) best = u; }
      if (best && tot > 0) dom[i] = { url: best.url, raw: best.raw, share: best.impr/tot };
    }
  }

  const cosine = (a,b) => { let s=0; const [s1,s2] = a.size < b.size ? [a,b] : [b,a]; for (const [w,x] of s1){ const y = s2.get(w); if (y) s += x*y; } return s; };
  const normalise = sum => { let s=0; for (const x of sum.values()) s += x*x; const n = Math.sqrt(s)||1; const v=new Map(); for (const [w,x] of sum) v.set(w, x/n); return v; };
  const topTokens = (v,k) => [...v.entries()].sort((a,b)=>b[1]-a[1]).slice(0,k).map(e=>e[0]);

  const C = [];                       // {sum, cent, members[], urls:Map, tokens:Set}
  const cIndex = new Map();           // token -> [clusterIdx]
  const indexCluster = (ci) => {
    for (const w of topTokens(C[ci].cent, 4)){
      if (C[ci].tokens.has(w)) continue;
      C[ci].tokens.add(w);
      if (!cIndex.has(w)) cIndex.set(w, []);
      cIndex.get(w).push(ci);
    }
  };
  const clusterDom = (c) => {
    let best = null, tot = 0;
    for (const [url,v] of c.urls){ tot += v; if (!best || v > c.urls.get(best)) best = url; }
    return best ? { url: best, share: c.urls.get(best)/tot } : null;
  };
  const addTo = (ci, i) => {
    const c = C[ci];
    c.members.push(i);
    for (const [w,x] of vecs[i]) c.sum.set(w, (c.sum.get(w)||0) + x);
    c.cent = normalise(c.sum);
    if (opts.pageIndex){
      for (const u of (opts.pageIndex.get(rows[i].query) || [])) c.urls.set(u.url, (c.urls.get(u.url)||0) + u.impr);
    }
    indexCluster(ci);
  };

  // biggest queries first: heads become the seeds, tails attach to them
  const order = Array.from({length:N}, (_,i)=>i).sort((a,b) => (rows[b].impr - rows[a].impr) || (toks[a].length - toks[b].length));

  for (const i of order){
    if (!toks[i].length){ C.push({sum:new Map(vecs[i]), cent:vecs[i], members:[i], urls:new Map(), tokens:new Set()}); indexCluster(C.length-1); continue; }
    const rare = [...toks[i]].sort((a,b) => (df.get(a)||0) - (df.get(b)||0)).slice(0,4);
    const cand = new Set();
    for (const w of rare) for (const ci of (cIndex.get(w) || [])) cand.add(ci);

    let best = null;
    for (const ci of cand){
      const c = C[ci];
      let sim = cosine(vecs[i], c.cent);
      const a = dom[i], b = clusterDom(c);
      if (a && b){
        if (a.url === b.url) sim = Math.min(1, sim + 0.25);
        else if (a.share > .5 && b.share > .5 && sim < 0.75) continue;   // Google says these are different pages
      }
      const floor = c.members.length >= 60 ? TH + 0.15 : TH;             // stop runaway clusters
      if (sim >= floor && (!best || sim > best.sim)) best = { ci, sim };
    }
    if (best) addTo(best.ci, i);
    else { C.push({sum:new Map(vecs[i]), cent:vecs[i], members:[i], urls:new Map(), tokens:new Set()}); addTo(C.length-1, i); C[C.length-1].members = [i]; }
  }

  // one consolidation pass: near-identical centroids are one topic
  const dead = new Set();
  for (let a=0;a<C.length;a++){
    if (dead.has(a)) continue;
    for (let b=a+1;b<C.length;b++){
      if (dead.has(b)) continue;
      let shares = false;
      for (const w of C[a].tokens) if (C[b].tokens.has(w)){ shares = true; break; }
      if (!shares) continue;
      const sim = cosine(C[a].cent, C[b].cent);
      if (sim < TH + 0.12) continue;
      const da = clusterDom(C[a]), dbb = clusterDom(C[b]);
      if (da && dbb && da.url !== dbb.url && da.share > .5 && dbb.share > .5 && sim < 0.85) continue;
      for (const m of C[b].members) C[a].members.push(m);
      for (const [w,x] of C[b].sum) C[a].sum.set(w, (C[a].sum.get(w)||0)+x);
      for (const [u,v] of C[b].urls) C[a].urls.set(u, (C[a].urls.get(u)||0)+v);
      C[a].cent = normalise(C[a].sum);
      dead.add(b);
    }
  }

  const curve = opts.curve, ctrAtFn = opts.ctrAt;
  const clusters = [];
  C.forEach((c, ci) => {
    if (dead.has(ci)) return;
    const members = c.members.map(i => ({ i, ...rows[i], dom: dom[i] }));
    members.sort((a,b) => b.impr - a.impr);
    const impr = members.reduce((s,m)=>s+m.impr,0);
    const clicks = members.reduce((s,m)=>s+m.clicks,0);
    const posW = impr ? members.reduce((s,m)=>s+(m.pos||0)*m.impr,0)/impr : null;
    const bestPos = members.reduce((b,m)=> (m.pos!=null && (b==null || m.pos<b)) ? m.pos : b, null);

    const urlMap = new Map();
    if (opts.pageIndex){
      for (const m of members){
        for (const u of (opts.pageIndex.get(m.query) || [])){
          const e = urlMap.get(u.url) || { url:u.url, raw:u.raw, impr:0, clicks:0, queries:0 };
          e.impr += u.impr; e.clicks += u.clicks; e.queries++;
          urlMap.set(u.url, e);
        }
      }
    }
    const urlTotal = [...urlMap.values()].reduce((s,u)=>s+u.impr,0);
    const urls = [...urlMap.values()].map(u => ({...u, share: urlTotal ? u.impr/urlTotal : 0})).sort((a,b)=>b.impr-a.impr);

    let status, owner = null;
    if (!urls.length) status = 'unmapped';
    else {
      owner = urls[0];
      const contenders = urls.filter(u => u.share >= .2).length;
      if (owner.share >= .6) status = 'owned';
      else if (contenders >= 2) status = 'split';
      else status = 'weak';
    }

    let opportunity = 0;
    if (curve && ctrAtFn){
      for (const m of members){
        if (m.pos == null || m.pos < 3.5) continue;
        const target = m.pos <= 10 ? 3 : m.pos <= 20 ? 8 : 15;
        opportunity += Math.max(0, m.impr * (ctrAtFn(curve, target) - m.ctr));
      }
    }

    const intentCounts = {};
    for (const m of members){
      const it = (opts.intents && opts.intents.get(m.query)) || guessIntent(m.query, opts.brandTokens);
      const key = String(it).toLowerCase().split(/[,/]/)[0].trim();
      intentCounts[key] = (intentCounts[key]||0) + Math.max(1, m.impr);
    }
    const intent = Object.keys(intentCounts).sort((a,b)=>intentCounts[b]-intentCounts[a])[0] || 'informational';

    clusters.push({ id:'', name: members[0].queryRaw || members[0].query, size: members.length, members,
                    impr, clicks, ctr: impr ? clicks/impr : 0, pos: posW, bestPos,
                    urls, owner, status, opportunity, intent, source:'gsc' });
  });
  clusters.sort((a,b) => b.impr - a.impr);
  clusters.forEach((c,i) => c.id = 'c' + i);

  out.clusters = clusters;
  out.stats = summariseClusters(clusters);
  return out;
}

/* ---------- clusters that exist only in competitor data ---------- */
function addGapClusters(clusters, gaps, opts){
  if (!gaps || !gaps.length) return clusters;
  const known = new Set();
  for (const c of clusters) for (const m of c.members) for (const t of tokens(m.query)) known.add(t);

  const buckets = new Map();
  for (const g of gaps){
    if (g.gscImpr >= 30) continue;                 // already visible in your own data
    const t = tokens(g.keyword);
    if (!t.length) continue;
    const key = t.slice().sort((a,b)=>a.localeCompare(b)).slice(0,2).join(' ');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }
  let n = 0;
  for (const [key, items] of buckets){
    if (!items.length) continue;
    items.sort((a,b)=>b.volume-a.volume);
    const volume = items.reduce((s,i)=>s+i.volume,0);
    clusters.push({
      id: 'g' + (n++), name: items[0].raw || items[0].keyword,
      size: items.length,
      members: items.map(i => ({ query:i.keyword, queryRaw:i.raw, clicks:0, impr:0, ctr:0, pos:null, volume:i.volume })),
      impr: 0, clicks: 0, ctr: 0, pos: null, bestPos: null,
      urls: [], owner: null, status: 'missing',
      opportunity: items.reduce((s,i)=>s+(i.estClicks||0),0),
      volume,
      intent: (items[0].intent || guessIntent(items[0].keyword, opts && opts.brandTokens) || 'informational').toLowerCase().split(/[,/]/)[0].trim(),
      bestCompetitor: items[0].best,
      source: 'semrush'
    });
  }
  return clusters;
}

function summariseClusters(clusters){
  const s = { total: clusters.length, owned:0, split:0, weak:0, unmapped:0, missing:0, impr:0, opportunity:0 };
  for (const c of clusters){ s[c.status] = (s[c.status]||0)+1; s.impr += c.impr; s.opportunity += c.opportunity; }
  const mapped = s.owned + s.split + s.weak;
  s.coverage = mapped ? s.owned / mapped : null;
  return s;
}

/* ---------- the reverse view: what each page is being asked to do ---------- */
function mapPages(clusters){
  const pages = new Map();
  for (const c of clusters){
    if (!c.owner) continue;
    const e = pages.get(c.owner.url) || { url:c.owner.url, raw:c.owner.raw, owned:[], contested:[], impr:0, clicks:0 };
    e.owned.push(c); e.impr += c.impr; e.clicks += c.clicks;
    pages.set(c.owner.url, e);
    for (const u of c.urls.slice(1)){
      if (u.share < .2) continue;
      const e2 = pages.get(u.url) || { url:u.url, raw:u.raw, owned:[], contested:[], impr:0, clicks:0 };
      e2.contested.push(c);
      pages.set(u.url, e2);
    }
  }
  const list = [...pages.values()].map(p => {
    const distinct = p.owned.length;
    const intents = new Set(p.owned.map(c => c.intent));
    let verdict = 'focused';
    if (distinct === 0 && p.contested.length) verdict = 'competing only';
    else if (distinct >= 4 && intents.size >= 2) verdict = 'diluted';
    else if (distinct >= 2 && intents.size >= 2) verdict = 'mixed intent';
    else if (p.contested.length >= 2) verdict = 'overlapping';
    return { ...p, distinct, intents:[...intents], verdict,
             opportunity: p.owned.reduce((s,c)=>s+c.opportunity,0) };
  });
  list.sort((a,b) => b.impr - a.impr);
  return list;
}

/* ============================================================
   SITE CRAWLER, SITEMAP AUDIT AND TECHNICAL CHECKS
   Three ways to reach a site, resolved at run time:
     proxy   optional proxy.php sitting next to this page
     direct  same-origin, or a host that sends CORS headers
     manual  you supply the files, nothing is fetched
   ============================================================ */

let FETCH_MODE = null, PROXY_URL = 'proxy.php', PROXY_INFO = null;

async function detectFetchMode(origin){
  PROXY_INFO = null;
  try {
    const r = await fetch(PROXY_URL + '?ping=1', { cache:'no-store' });
    if (r.ok){
      /* A host with no PHP serves proxy.php as plain text, so this throws and
         the mode falls through to direct or manual. That is the shared-hosting
         case and it must not be an error. */
      const j = await r.json();
      if (j && j.ok && j.service === 'sec-proxy'){
        PROXY_INFO = j;
        /* Installed is not the same as usable. A proxy with an empty allowlist,
           or a PHP build with no cURL, answers every fetch with an error — so
           it is reported as no route, and describeMode() says which of the two
           it is. Otherwise a run fails one URL at a time and the reason is
           buried in the log. */
        if (j.configured !== false && j.curl !== false) return (FETCH_MODE = 'proxy');
      }
    }
  } catch(e){}
  if (origin){
    try {
      const u = new URL(origin);
      if (u.origin === location.origin) return (FETCH_MODE = 'direct');
    } catch(e){}
  }
  return (FETCH_MODE = 'manual');
}

async function grab(url, mode){
  const t0 = performance.now();
  mode = mode || FETCH_MODE;
  if (mode === 'proxy'){
    const r = await fetch(PROXY_URL + '?url=' + encodeURIComponent(url), { cache:'no-store' });
    if (!r.ok) throw new Error('Proxy returned ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return { url, finalUrl: j.finalUrl || url, status: j.status, headers: j.headers || {},
             body: j.body || '', redirects: j.redirects || [], ms: j.ms != null ? j.ms : Math.round(performance.now()-t0),
             bytes: j.bytes || (j.body ? j.body.length : 0) };
  }
  const r = await fetch(url, { redirect:'follow', cache:'no-store' });
  const body = await r.text();
  const headers = {};
  try { r.headers.forEach((v,k) => headers[k.toLowerCase()] = v); } catch(e){}
  return { url, finalUrl: r.url || url, status: r.status, headers, body,
           redirects: r.redirected ? [{from:url, to:r.url, status:0}] : [],
           ms: Math.round(performance.now()-t0), bytes: body.length };
}

async function grabBytes(url){
  if (FETCH_MODE === 'proxy'){
    const r = await fetch(PROXY_URL + '?bin=1&url=' + encodeURIComponent(url), { cache:'no-store' });
    if (!r.ok) throw new Error('Proxy returned ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  const r = await fetch(url, { cache:'no-store' });
  return new Uint8Array(await r.arrayBuffer());
}

async function gunzip(bytes){
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress .gz files.');
  const ds = new DecompressionStream('gzip');
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder().decode(ab);
}

/* ============================================================
   SITEMAPS
   ============================================================ */
function parseSitemapXml(text, sourceUrl){
  const t = String(text || '');
  const isIndex = /<sitemapindex[\s>]/i.test(t);
  const blocks = t.match(isIndex ? /<sitemap[\s>][\s\S]*?<\/sitemap>/gi : /<url[\s>][\s\S]*?<\/url>/gi) || [];
  const grabTag = (b, tag) => {
    const m = b.match(new RegExp('<(?:\\w+:)?' + tag + '[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + tag + '>', 'i'));
    if (!m) return null;
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
               .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
               .trim();
  };
  const entries = blocks.map(b => ({
    loc: grabTag(b, 'loc'),
    lastmod: grabTag(b, 'lastmod'),
    changefreq: grabTag(b, 'changefreq'),
    priority: grabTag(b, 'priority'),
    images: (b.match(/<image:loc>([\s\S]*?)<\/image:loc>/gi) || []).length,
    hreflang: (b.match(/<xhtml:link[^>]*hreflang=/gi) || []).length
  })).filter(e => e.loc);
  return { type: isIndex ? 'index' : 'urlset', entries, source: sourceUrl || '', bytes: t.length,
           malformed: !blocks.length && t.trim().length > 0 };
}

async function loadSitemapTree(startUrl, onProgress, maxChildren){
  maxChildren = maxChildren || 60;
  const seen = new Set(), sitemaps = [], queue = [startUrl];
  let guard = 0;
  while (queue.length && guard++ < maxChildren){
    const u = queue.shift();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (onProgress) onProgress('Reading ' + u);
    let text;
    try {
      if (/\.gz($|\?)/i.test(u)) text = await gunzip(await grabBytes(u));
      else { const r = await grab(u); if (r.status >= 400) { sitemaps.push({ source:u, error:'HTTP ' + r.status, entries:[], type:'error' }); continue; } text = r.body; }
    } catch(e){ sitemaps.push({ source:u, error:e.message, entries:[], type:'error' }); continue; }
    const sm = parseSitemapXml(text, u);
    sitemaps.push(sm);
    if (sm.type === 'index') for (const e of sm.entries) queue.push(e.loc);
  }
  return sitemaps;
}

function flattenSitemaps(sitemaps){
  const urls = [];
  for (const sm of sitemaps){
    if (sm.type !== 'urlset') continue;
    for (const e of sm.entries) urls.push({ ...e, sitemap: sm.source });
  }
  return urls;
}

/* ============================================================
   ROBOTS.TXT
   ============================================================ */
function parseRobots(text){
  const lines = String(text||'').split(/\r?\n/);
  const out = { sitemaps: [], groups: [], raw: text || '' };
  let cur = null;
  for (let raw of lines){
    const line = raw.replace(/#.*$/,'').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0,i).trim().toLowerCase(), v = line.slice(i+1).trim();
    if (k === 'sitemap'){ out.sitemaps.push(v); continue; }
    if (k === 'user-agent'){
      if (!cur || cur.rules.length) { cur = { agents:[], rules:[] }; out.groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      continue;
    }
    if (!cur) continue;
    if (k === 'disallow' || k === 'allow') cur.rules.push({ type:k, path:v });
    if (k === 'crawl-delay') cur.crawlDelay = parseFloat(v);
  }
  return out;
}
function robotsAllows(robots, path, agent){
  if (!robots || !robots.groups.length) return true;
  agent = (agent || '*').toLowerCase();
  const g = robots.groups.find(x => x.agents.includes(agent)) || robots.groups.find(x => x.agents.includes('*'));
  if (!g) return true;
  let best = { len:-1, allow:true };
  for (const r of g.rules){
    if (r.path === '') continue;
    const p = r.path.replace(/\*/g,'');
    if (path.startsWith(p) && p.length > best.len) best = { len:p.length, allow: r.type === 'allow' };
  }
  return best.allow;
}

/* ============================================================
   PAGE EXTRACTION
   ============================================================ */
function textOf(el){ return el ? (el.textContent || '').replace(/\s+/g,' ').trim() : ''; }

function extractPage(res, origin, opts){
  opts = opts || {};
  const html = res.body || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = res.finalUrl || res.url;
  const abs = href => { try { return new URL(href, base).href; } catch(e){ return null; } };

  const titleEl = doc.querySelector('title');
  const metaDesc = doc.querySelector('meta[name="description" i]');
  const robotsMeta = [...doc.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]')].map(m => (m.getAttribute('content')||'').toLowerCase()).join(',');
  const canonEl = doc.querySelector('link[rel="canonical" i]');
  const h1s = [...doc.querySelectorAll('h1')].map(textOf).filter(Boolean);
  const h2s = [...doc.querySelectorAll('h2')].map(textOf).filter(Boolean);
  const h3s = [...doc.querySelectorAll('h3')].map(textOf).filter(Boolean);

  // links come from the whole document, because navigation is part of the link graph
  const originHost = (() => { try { return new URL(origin).hostname.replace(/^www\./,''); } catch(e){ return ''; } })();
  const links = { internal: [], externalCount: 0, nofollowCount: 0 };
  for (const a of doc.querySelectorAll('a[href]')){
    const href = a.getAttribute('href');
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    const u = abs(href);
    if (!u) continue;
    let host; try { host = new URL(u).hostname.replace(/^www\./,''); } catch(e){ continue; }
    const rel = (a.getAttribute('rel')||'').toLowerCase();
    if (rel.includes('nofollow')) links.nofollowCount++;
    if (host === originHost) links.internal.push({ url: normUrl(u), href: u, anchor: textOf(a).slice(0,120) });
    else links.externalCount++;
  }

  // body text comes from the main content region only, so navigation, headers and
  // footers do not inflate word counts, fake near-duplicates, or masquerade as
  // a page "mentioning" every item in its own menu
  const scope = doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.body;
  let bodyRaw = '';
  if (scope){
    const clone = scope.cloneNode(true);
    for (const el of clone.querySelectorAll('script,style,noscript,template,svg,nav,footer,[role="navigation"],[role="contentinfo"],[role="banner"]')) el.remove();
    bodyRaw = textOf(clone);
  }
  const bodyText = bodyRaw.toLowerCase();
  const words = bodyText ? bodyText.split(/\s+/).filter(w => w.length > 1) : [];

  // signals the AI Search readiness model reads: does the page answer quickly,
  // is it organised into passages, and does it carry evidence rather than assertion
  let firstPara = '', paraLens = [], listCount = 0, tableCount = 0, outbound = 0, quoteBlocks = 0;
  if (scope){
    const clone2 = scope.cloneNode(true);
    for (const el of clone2.querySelectorAll('script,style,noscript,template,svg,nav,footer,[role="navigation"],[role="contentinfo"]')) el.remove();
    const ps = [...clone2.querySelectorAll('p')].map(textOf).filter(t => t.length > 40);
    firstPara = ps[0] || '';
    paraLens = ps.map(t => t.split(/\s+/).length);
    listCount = clone2.querySelectorAll('ul,ol').length;
    tableCount = clone2.querySelectorAll('table').length;
    quoteBlocks = clone2.querySelectorAll('blockquote,q,cite').length;
    for (const a of clone2.querySelectorAll('a[href^="http"]')){
      try { if (new URL(a.getAttribute('href')).hostname.replace(/^www\./,'') !== originHost) outbound++; } catch(e){}
    }
  }
  const numberHits = (bodyRaw.match(/\b\d[\d,.]*\s?(%|per cent|percent|kg|km|mm|hours?|days?|weeks?|months?|years?|£|\$|€)?/g) || []).length;

  /* numberHits above counts every digit run, which includes phone numbers, SKUs
     and dates. The GEO paper's "statistics" lever is narrower than that: a
     figure that carries a unit and could be quoted back as a fact. statHits
     counts only those, so the readiness model is not fooled by a price list. */
  const statHits = (bodyRaw.match(
    /(?:[£$€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|billion|million|thousand))?)|(?:\b\d[\d,]*(?:\.\d+)?\s?(?:%|per cent|percent|percentage points?|x|×|kg|km|cm|mm|mph|kph|kwh|gb|mb|hours?|days?|weeks?|months?|years?)(?!\w))|(?:\b\d{1,3}(?:,\d{3})+\b)/gi
  ) || []).length;

  /* A quotation only carries GEO weight if a reader can see WHO said it, so an
     unattributed pull-quote does not count. The attribution cue has to sit
     close to the closing quote mark — anything further away is a coincidence. */
  const attributedQuotes = (bodyRaw.match(
    /[\u201c"][^\u201d"\n]{25,400}[\u201d"][^.\n]{0,80}?\b(said|says|according to|told|explains?|notes?|writes?|per|—|\u2013)\b/gi
  ) || []).length
   + (bodyRaw.match(
    /\b([Aa]ccording to|[Aa]s|[Pp]er)\s+[A-Z][\w&.'?!-]*(?:\s+[A-Z][\w&.'?!-]*){0,4}[,:]?\s*[\u201c"]/g
  ) || []).length;
  const yearHits = (bodyRaw.match(/\b(19|20)\d{2}\b/g) || []);
  const latestYear = yearHits.length ? Math.max(...yearHits.map(Number)) : null;

  const images = [...doc.querySelectorAll('img')].map(img => ({
    src: abs(img.getAttribute('src') || img.getAttribute('data-src') || '') || '',
    fetchpriority: img.getAttribute('fetchpriority') || '',
    alt: img.getAttribute('alt'),
    hasAlt: img.hasAttribute('alt'),
    loading: img.getAttribute('loading') || '',
    w: img.getAttribute('width'), h: img.getAttribute('height'),
    srcset: !!img.getAttribute('srcset')
  }));

  const ld = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json" i]')){
    try {
      const j = JSON.parse(s.textContent);
      const walk = o => { if (!o) return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object'){ if (o['@type']) ld.push(...[].concat(o['@type'])); if (o['@graph']) walk(o['@graph']); } };
      walk(j);
    } catch(e){ ld.push('INVALID_JSON'); }
  }

  const hreflang = [...doc.querySelectorAll('link[rel="alternate" i][hreflang]')]
    .map(l => ({ lang: l.getAttribute('hreflang'), href: abs(l.getAttribute('href')) }));

  const canonical = canonEl ? abs(canonEl.getAttribute('href')) : null;

  return {
    url: normUrl(res.finalUrl || res.url), raw: res.finalUrl || res.url, requested: res.url,
    status: res.status, redirects: res.redirects || [], ms: res.ms, bytes: res.bytes,
    title: titleEl ? textOf(titleEl) : '',
    metaDescription: metaDesc ? (metaDesc.getAttribute('content')||'').trim() : '',
    robotsMeta, noindex: /\bnoindex\b/.test(robotsMeta), nofollowPage: /\bnofollow\b/.test(robotsMeta),
    canonical: canonical ? normUrl(canonical) : null, canonicalRaw: canonical,
    selfCanonical: canonical ? normUrl(canonical) === normUrl(res.finalUrl || res.url) : null,
    h1: h1s[0] || '', h1Count: h1s.length, h2Count: h2s.length,
    headings: h2s.slice(0,40).concat(h3s.slice(0,40)),
    firstPara: firstPara.slice(0, 600),
    medianPara: paraLens.length ? paraLens.slice().sort((a,b)=>a-b)[paraLens.length>>1] : 0,
    paraCount: paraLens.length, listCount, tableCount, outboundCitations: outbound,
    quoteBlocks, attributedQuotes, statHits,
    numberHits, latestYear, contentAnalysed: true,
    wordCount: words.length,
    text: opts.keepText === false ? '' : bodyRaw.slice(0, 12000),
    shingles: shingleSig(words),
    internalLinks: links.internal, internalLinkCount: links.internal.length,
    externalLinkCount: links.externalCount, nofollowCount: links.nofollowCount,
    images, imgMissingAlt: images.filter(i => !i.hasAlt).length,
    imgNoDims: images.filter(i => !i.w || !i.h).length,
    schemaTypes: [...new Set(ld)],
    hreflang,
    lang: (doc.documentElement.getAttribute('lang')||'').trim(),
    hasViewport: !!doc.querySelector('meta[name="viewport" i]'),
    ogTitle: (doc.querySelector('meta[property="og:title" i]')||{}).content || '',
    contentType: (res.headers && (res.headers['content-type']||'')) || ''
  };
}

/* 64-bucket minhash over 5-word shingles, for near-duplicate detection */
function h32(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function shingleSig(words){
  if (!words || words.length < 12) return null;
  const sig = new Uint32Array(64).fill(0xffffffff);
  for (let i=0;i+5<=words.length;i++){
    const g = words.slice(i,i+5).join(' ');
    const base = h32(g);
    for (let k=0;k<64;k++){
      const v = (base ^ Math.imul(k+1, 0x9e3779b1)) >>> 0;
      if (v < sig[k]) sig[k] = v;
    }
  }
  return Array.from(sig);
}
function sigSim(a,b){
  if (!a || !b) return 0;
  let same = 0;
  for (let i=0;i<a.length;i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

/* ============================================================
   CRAWL
   ============================================================ */
async function crawlSite(opts){
  const { origin, seeds, limit, concurrency, robots, obeyRobots, onProgress, abort, keepText } = opts;
  const max = limit || 200, conc = concurrency || 4;
  const originHost = (() => { try { return new URL(origin).hostname.replace(/^www\./,''); } catch(e){ return ''; } })();
  const SKIP = /\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|mp3|woff2?|ttf|eot|dmg|exe)($|\?)/i;

  const queue = [], seen = new Set(), pages = [], errors = [];
  const push = (u, depth) => {
    let n; try { n = new URL(u).href; } catch(e){ return; }
    const key = normUrl(n);
    if (seen.has(key)) return;
    let host; try { host = new URL(n).hostname.replace(/^www\./,''); } catch(e){ return; }
    if (host !== originHost) return;
    if (SKIP.test(n)) return;
    if (obeyRobots && robots && !robotsAllows(robots, new URL(n).pathname, '*')) return;
    seen.add(key);
    queue.push({ url:n, depth });
  };
  (seeds && seeds.length ? seeds : [origin]).forEach(u => push(u, 0));

  let active = 0, done = 0, stop = false;
  await new Promise(resolve => {
    const pump = () => {
      if (abort && abort.stopped) stop = true;
      if (stop && active === 0) return resolve();
      if (stop || (!queue.length && active === 0)) return resolve();
      while (active < conc && queue.length && pages.length + active < max){
        const job = queue.shift();
        active++;
        grab(job.url).then(res => {
          if (res.status >= 200 && res.status < 400 && /html/i.test(res.headers['content-type'] || 'text/html')){
            const p = extractPage(res, origin, { keepText });
            p.depth = job.depth;
            pages.push(p);
            if (job.depth < 12) for (const l of p.internalLinks) push(l.href || (/^https?:/i.test(l.url) ? l.url : new URL(job.url).protocol + '//' + l.url), job.depth + 1);
          } else {
            pages.push({ url: normUrl(res.finalUrl || res.url), raw: res.url, requested: res.url, status: res.status,
                         redirects: res.redirects || [], ms: res.ms, bytes: res.bytes, depth: job.depth,
                         title:'', metaDescription:'', h1:'', h1Count:0, h2Count:0, wordCount:0,
                         internalLinks:[], internalLinkCount:0, externalLinkCount:0, images:[], imgMissingAlt:0, imgNoDims:0,
                         quoteBlocks:0, attributedQuotes:0, statHits:0,
                         schemaTypes:[], hreflang:[], shingles:null, notHtml:true });
          }
        }).catch(e => {
          errors.push({ url: job.url, error: e.message });
          pages.push({ url: normUrl(job.url), raw: job.url, requested: job.url, status: 0, error: e.message,
                       depth: job.depth, redirects:[], ms:0, bytes:0, title:'', metaDescription:'', h1:'', h1Count:0, h2Count:0,
                       wordCount:0, internalLinks:[], internalLinkCount:0, externalLinkCount:0, images:[], imgMissingAlt:0,
                       quoteBlocks:0, attributedQuotes:0, statHits:0,
                       imgNoDims:0, schemaTypes:[], hreflang:[], shingles:null });
        }).finally(() => {
          active--; done++;
          if (onProgress) onProgress(pages.length, max, queue.length);
          if (pages.length >= max){ stop = true; if (active === 0) resolve(); return; }
          pump();
        });
      }
      if (!queue.length && active === 0) resolve();
    };
    pump();
  });

  return { origin, pages, errors, at: Date.now(), mode: FETCH_MODE };
}

/* ---------- internal link graph ---------- */
function buildLinkGraph(pages, origin){
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const inlinks = new Map();
  for (const p of pages) inlinks.set(p.url, 0);
  for (const p of pages){
    const uniq = new Set(p.internalLinks.map(l => l.url));
    for (const u of uniq) if (inlinks.has(u)) inlinks.set(u, inlinks.get(u) + 1);
  }
  // depth by breadth-first search from the home page
  let home = normUrl(origin);
  if (!byUrl.has(home)){
    const cands = pages.filter(p => (p.url.split('/').length <= 2));
    home = cands.length ? cands[0].url : (pages[0] && pages[0].url);
  }
  const depth = new Map();
  if (home){
    depth.set(home, 0);
    const q = [home];
    while (q.length){
      const u = q.shift(), d = depth.get(u), p = byUrl.get(u);
      if (!p) continue;
      for (const l of new Set(p.internalLinks.map(x => x.url))){
        if (!byUrl.has(l) || depth.has(l)) continue;
        depth.set(l, d + 1); q.push(l);
      }
    }
  }
  for (const p of pages){
    p.inlinks = inlinks.get(p.url) || 0;
    p.clickDepth = depth.has(p.url) ? depth.get(p.url) : null;
  }
  return { home, reached: depth.size };
}

/* ---------- near-duplicate clusters ---------- */
function findDuplicates(pages, threshold){
  const th = threshold || 0.85;
  const cand = pages.filter(p => p.shingles && p.wordCount >= 120);
  const groups = [], used = new Set();
  for (let i=0;i<cand.length;i++){
    if (used.has(i)) continue;
    const grp = [cand[i]];
    for (let j=i+1;j<cand.length;j++){
      if (used.has(j)) continue;
      if (Math.abs(cand[i].wordCount - cand[j].wordCount) > cand[i].wordCount * 0.6) continue;
      if (sigSim(cand[i].shingles, cand[j].shingles) >= th){ grp.push(cand[j]); used.add(j); }
    }
    if (grp.length > 1){ used.add(i); groups.push(grp); }
  }
  return groups;
}

/* ============================================================
   TECHNICAL CHECKS
   ============================================================ */
const SEV_ORDER = { critical:0, serious:1, warning:2, notice:3 };

function technicalChecks(crawl, ctx){
  const pages = crawl.pages || [];
  const issues = [];
  const add = (severity, code, title, url, detail) => issues.push({ severity, code, title, url, detail });
  const sitemapUrls = new Set((ctx.sitemapUrls || []).map(u => normUrl(u.loc || u)));
  const gscPages = ctx.gscPages || new Map();

  const titles = new Map(), descs = new Map(), h1s = new Map();
  for (const p of pages){
    if (p.status === 0){ add('critical','fetch_failed','Page could not be fetched', p.raw, p.error || 'No response'); continue; }
    if (p.status >= 500) add('critical','http_5xx','Server error', p.raw, 'HTTP ' + p.status);
    else if (p.status >= 400) add('critical','http_4xx','Broken page', p.raw, 'HTTP ' + p.status + (p.inlinks ? `, linked from ${p.inlinks} internal page${p.inlinks>1?'s':''}` : ''));
    if ((p.redirects||[]).length > 1) add('serious','redirect_chain','Redirect chain', p.raw, `${p.redirects.length} hops before the final URL. Point the first link straight at the destination.`);
    if (p.notHtml || p.status >= 400 || p.status === 0) continue;

    if (p.noindex) add(sitemapUrls.has(p.url) ? 'critical' : 'notice','noindex','Page is set to noindex', p.raw,
      sitemapUrls.has(p.url) ? 'It is in the sitemap and also blocked from indexing. One of the two is wrong.' : 'Deliberate on many pages, so check this is intended.');
    if (!p.canonical) add('warning','canonical_missing','No canonical tag', p.raw, 'Add a self-referencing canonical unless this page is deliberately consolidated elsewhere.');
    else if (p.selfCanonical === false){
      const target = pages.find(x => x.url === p.canonical);
      if (target && target.status >= 400) add('critical','canonical_broken','Canonical points at a broken URL', p.raw, `Canonical target returns HTTP ${target.status}.`);
      else add('notice','canonical_other','Canonical points elsewhere', p.raw, 'Target: ' + p.canonical);
    }

    if (!p.title) add('critical','title_missing','Missing title', p.raw, 'Every indexable page needs one.');
    else {
      if (p.title.length > 65) add('warning','title_long','Title likely truncated', p.raw, `${p.title.length} characters. Google usually cuts around 60.`);
      if (p.title.length < 20) add('warning','title_short','Very short title', p.raw, `${p.title.length} characters.`);
      const k = p.title.toLowerCase();
      titles.set(k, (titles.get(k)||[]).concat(p.raw));
    }
    if (!p.metaDescription) add('warning','desc_missing','No meta description', p.raw, 'Google will write one for you, and it will usually be worse.');
    else {
      if (p.metaDescription.length > 165) add('notice','desc_long','Meta description likely truncated', p.raw, `${p.metaDescription.length} characters.`);
      const k = p.metaDescription.toLowerCase();
      descs.set(k, (descs.get(k)||[]).concat(p.raw));
    }
    if (p.h1Count === 0) add('warning','h1_missing','No H1', p.raw, 'The page has no top-level heading.');
    else if (p.h1Count > 1) add('notice','h1_multiple','More than one H1', p.raw, `${p.h1Count} H1 elements.`);
    if (p.h1) h1s.set(p.h1.toLowerCase(), (h1s.get(p.h1.toLowerCase())||[]).concat(p.raw));

    if (p.wordCount < 150) add('serious','thin','Very little content', p.raw, `${p.wordCount} words in the body.`);
    else if (p.wordCount < 300) add('notice','thin_soft','Short page', p.raw, `${p.wordCount} words.`);

    if (!p.imported && p.imgMissingAlt) add('warning','img_alt','Images with no alt attribute', p.raw, `${p.imgMissingAlt} of ${p.images.length} images.`);
    if (!p.imported && p.imgNoDims && p.images.length) add('notice','img_dims','Images without width and height', p.raw, `${p.imgNoDims} images, which invites layout shift.`);

    if (!p.imported && !p.hasViewport) add('serious','viewport','No viewport meta tag', p.raw, 'The page will render at desktop width on phones.');
    if (!p.imported && !p.lang) add('notice','lang','No lang attribute on <html>', p.raw, 'Assistive technology and Google both use it.');
    if (p.inlinks === 0 && p.clickDepth !== 0) add('serious','orphan','No internal links point here', p.raw,
      sitemapUrls.has(p.url) ? 'It is in the sitemap but nothing on the site links to it.' : 'Nothing found linking to this page during the crawl.');
    if (p.clickDepth != null && p.clickDepth > 3) add('notice','deep','Buried in the structure', p.raw, `${p.clickDepth} clicks from the home page.`);
    if (!p.imported && p.internalLinkCount === 0) add('warning','no_outlinks','Page links nowhere internally', p.raw, 'A dead end for both crawlers and readers.');
    if (!p.imported && p.bytes > 2_000_000) add('notice','heavy','Heavy page', p.raw, `${Math.round(p.bytes/1024)} KB of HTML.`);
    if (p.ms > 1500) add('warning','slow','Slow response', p.raw, `${p.ms} ms to first byte of the document.`);
    if (!p.imported && p.schemaTypes.includes('INVALID_JSON')) add('serious','schema_invalid','Structured data will not parse', p.raw, 'A JSON-LD block contains invalid JSON.');
    const rawPath = (() => { try { return new URL(p.raw).pathname; } catch(e){ return p.raw || ''; } })();
    if (/[A-Z]/.test(rawPath)) add('notice','url_case','Uppercase characters in the URL', p.raw, 'Invites duplicate URLs and split signals.');
    if (rawPath.includes('_')) add('notice','url_underscore','Underscores in the URL', p.raw, 'Hyphens are what Google reads as word separators.');
    if ((p.raw||'').length > 115) add('notice','url_long','Very long URL', p.raw, `${(p.raw||'').length} characters.`);
    if (sitemapUrls.size && !sitemapUrls.has(p.url) && p.status === 200 && !p.noindex)
      add('warning','not_in_sitemap','Indexable page missing from the sitemap', p.raw, 'Crawled and indexable, but not submitted.');
  }

  for (const [t, urls] of titles) if (urls.length > 1) add('serious','title_dupe','Duplicate title', urls[0], `${urls.length} pages share the title "${t.slice(0,70)}".`);
  for (const [d, urls] of descs) if (urls.length > 1) add('notice','desc_dupe','Duplicate meta description', urls[0], `${urls.length} pages share it.`);
  for (const [h, urls] of h1s) if (urls.length > 2) add('notice','h1_dupe','Duplicate H1', urls[0], `${urls.length} pages share the H1 "${h.slice(0,70)}".`);

  // soft 404: a URL that answers 200 with the home page's content
  const homeUrl = normUrl(ctx.origin || '');
  const home = pages.find(p => p.url === homeUrl && p.shingles);
  if (home){
    for (const p of pages){
      if (p === home || !p.shingles || p.status !== 200) continue;
      if (sigSim(home.shingles, p.shingles) >= 0.9)
        add('critical','soft_404','Soft 404: answers 200 with the home page', p.raw,
          'This URL returns a success status while serving the home page. Google indexes it as a real page, or wastes crawl budget deciding it is not one. Return a genuine 404 or 410.');
    }
  }

  for (const g of findDuplicates(pages)) add('serious','near_dupe','Near-duplicate content', g[0].raw, `${g.length} pages are more than 85% identical: ${g.slice(1,4).map(p=>p.raw).join(', ')}`);

  /* An answer engine that is disallowed cannot cite the site, however good the
     content is. This is nearly always accidental: a "block the AI scrapers"
     snippet copied from a blog post takes out the RETRIEVAL crawlers alongside
     the training ones, and the two are different decisions. Blocking training
     is a licensing choice and gets no finding here. */
  if (ctx.robots && typeof aiAgentAccess === 'function'){
    for (const a of aiAgentAccess(ctx.robots)){
      if (a.role !== 'retrieval' || a.state !== 'blocked') continue;
      add('serious', 'ai_agent_blocked', `${a.surface} is blocked in robots.txt`,
          (ctx.origin || '') + '/robots.txt',
          a.via === '*'
            ? `The blanket "User-agent: *" rule disallows everything, which includes ${a.ua}. This site cannot be cited in ${a.surface} answers.`
            : `A rule for ${a.ua} disallows the whole site. Blocking a retrieval crawler is a different decision from blocking a training crawler, and removes the site from ${a.surface} answers entirely.`);
    }
  }


  // sitemap-level checks
  const sm = ctx.sitemaps || [];
  const allEntries = ctx.sitemapUrls || [];
  if (sm.length){
    for (const s of sm){
      if (s.error) add('critical','sitemap_error','Sitemap could not be read', s.source, s.error);
      if (s.malformed) add('critical','sitemap_malformed','Sitemap has no readable URLs', s.source, 'The file was fetched but no <loc> entries were found.');
      if (s.type === 'urlset' && s.entries.length > 50000) add('critical','sitemap_toobig','Sitemap exceeds 50,000 URLs', s.source, `${s.entries.length} URLs. Split it and use a sitemap index.`);
      if (s.bytes > 50 * 1024 * 1024) add('serious','sitemap_bytes','Sitemap over the 50 MB limit', s.source, 'Split it.');
    }
    const locs = new Map();
    for (const e of allEntries){
      const n = normUrl(e.loc);
      locs.set(n, (locs.get(n)||0) + 1);
      if (!/^https:/i.test(e.loc)) add('warning','sitemap_http','Sitemap lists a non-HTTPS URL', e.loc, 'Submit the canonical HTTPS URL.');
      if (e.lastmod && isNaN(Date.parse(e.lastmod))) add('notice','sitemap_lastmod','Invalid lastmod value', e.loc, `"${e.lastmod}" is not a valid W3C date.`);
      if (e.lastmod && Date.parse(e.lastmod) > Date.now() + 864e5) add('notice','sitemap_future','lastmod is in the future', e.loc, e.lastmod);
      if (/[?&]/.test(e.loc)) add('notice','sitemap_params','Sitemap URL carries query parameters', e.loc, 'Usually a sign of duplicate URLs being submitted.');
    }
    for (const [u,c] of locs) if (c > 1) add('warning','sitemap_dupe','URL listed more than once in the sitemaps', u, `${c} occurrences.`);
    if (ctx.robots && ctx.robots.raw && !ctx.robots.sitemaps.length)
      add('warning','robots_no_sitemap','robots.txt does not declare a sitemap', ctx.origin + '/robots.txt', 'Add a Sitemap: line so crawlers can find it without guessing.');
    if (ctx.robots) for (const e of allEntries){
      let path; try { path = new URL(e.loc).pathname; } catch(err){ continue; }
      if (!robotsAllows(ctx.robots, path, '*')) add('critical','sitemap_blocked','Sitemap URL is blocked by robots.txt', e.loc, 'Submitted for indexing and disallowed at the same time.');
    }
    // cross-check against real performance
    if (gscPages.size){
      let never = 0, first = null;
      for (const e of allEntries){
        const n = normUrl(e.loc);
        const g = gscPages.get(n);
        if (!g || g.impr === 0){ never++; if (!first) first = e.loc; }
      }
      if (never) add('notice','sitemap_unseen','Sitemap URLs with no impressions', first || (ctx.origin||''),
        `${never} submitted URLs drew no impressions in the loaded Search Console period. Either they are new, or they are not worth submitting.`);
      let missing = 0, firstM = null;
      for (const [u,g] of gscPages) if (g.clicks > 0 && !sitemapUrls.has(u)){ missing++; if (!firstM) firstM = g.raw || u; }
      if (missing) add('warning','sitemap_missing_earners','Pages earning clicks are not in the sitemap', firstM || '',
        `${missing} URLs with clicks in Search Console are absent from the sitemaps.`);
    }
  }

  issues.sort((a,b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return issues;
}

function summariseIssues(issues){
  const s = { critical:0, serious:0, warning:0, notice:0, total: issues.length, byCode:{} };
  for (const i of issues){ s[i.severity]++; s.byCode[i.code] = (s.byCode[i.code]||0) + 1; }
  return s;
}

/* ============================================================
   HEALTH SCORE
   Six pillars. A pillar is only scored when the data it needs
   is actually loaded; otherwise it reads "not measured" and its
   weight is redistributed. An unmeasured pillar never quietly
   becomes a zero, and never quietly becomes a pass either.

   SCORE_MODEL is the version of this weighting. It travels with
   every saved run and every snapshot, because a score compared
   against a score from a different model is not a trend, it is
   an artefact — and a tool sold on evidence must not manufacture
   a rise by changing its own arithmetic.
   ============================================================ */

const SCORE_MODEL = 2;   // 1: five pillars. 2: AI answer readiness added, weights rebalanced.

const clamp01 = x => Math.max(0, Math.min(1, x));
const ratio = (good, total) => total ? good/total : null;
const logScale = (v, full) => clamp01(Math.log10(1 + Math.max(0,v)) / Math.log10(1 + full));

/* The weights say what this tool believes matters, so they are argued for
   rather than assumed. Search performance stays the largest single pillar
   because it is the only one measured against the client's own money. AI
   readiness enters at 12 rather than higher: the levers under it are properly
   evidenced, but the surfaces they feed are young and the retrieval studies
   disagree with each other by a factor of two. It comes out of on-page and
   off-page, not out of search — the observed pillar should not shrink to make
   room for an emerging one. */
const PILLARS = [
  { key:'crawl',    name:'Crawl and indexation', weight:18, needs:'a crawl' },
  { key:'onpage',   name:'On-page fundamentals', weight:17, needs:'a crawl' },
  { key:'topics',   name:'Topic coverage',       weight:19, needs:'Search Console queries' },
  { key:'search',   name:'Search performance',   weight:24, needs:'Search Console queries' },
  { key:'airead',   name:'AI answer readiness',  weight:12, needs:'a crawl' },
  { key:'offpage',  name:'Off-page',             weight:10, needs:'a Semrush backlinks export' }
];

function metric(label, value, detail, weight){
  return { label, value: value == null ? null : clamp01(value), detail, weight: weight || 1 };
}
function rollup(metrics){
  const live = metrics.filter(m => m.value != null);
  if (!live.length) return null;
  const wsum = live.reduce((s,m)=>s+m.weight,0);
  return live.reduce((s,m)=>s+m.value*m.weight,0) / wsum;
}

function scoreProject(ctx){
  const { crawl, issues, find, clusters, clusterStats, backlinks, curve, ctrAt } = ctx;
  const allPages = (crawl && crawl.pages) || [];          // includes 404s, 5xx and fetch failures
  const pages = allPages.filter(p => !p.notHtml);          // HTML documents we could actually read
  const out = { pillars: [], overall: null, measured: 0 };

  /* ---------- crawl and indexation ---------- */
  let crawlM = null;
  if (allPages.length){
    const ok = allPages.filter(p => p.status >= 200 && p.status < 300).length;
    const broken = allPages.filter(p => p.status >= 400 || p.status === 0).length;
    const canon = pages.filter(p => p.canonical).length;
    const orphan = allPages.filter(p => p.inlinks === 0 && p.clickDepth !== 0).length;
    const shallow = allPages.filter(p => p.clickDepth != null && p.clickDepth <= 3).length;
    const reached = allPages.filter(p => p.clickDepth != null).length;
    const smCrit = (issues||[]).filter(i => i.code.startsWith('sitemap_') && (i.severity==='critical'||i.severity==='serious')).length;
    crawlM = [
      metric('Pages returning 200', ratio(ok, allPages.length), `${ok} of ${allPages.length} crawled URLs answered 200. ${broken} did not.`, 3),
      metric('Canonical present', pages.length ? ratio(canon, pages.length) : null, `${canon} of ${pages.length} readable pages declare a canonical.`, 2),
      metric('Reachable by internal links', ratio(allPages.length - orphan, allPages.length), `${orphan} pages have no internal links pointing at them.`, 2),
      metric('Within three clicks', reached ? ratio(shallow, reached) : null, reached ? `${shallow} of ${reached} reachable pages sit within three clicks of home.` : 'No link graph could be built.', 1),
      metric('Sitemap integrity', smCrit ? clamp01(1 - smCrit/8) : (ctx.sitemapUrls && ctx.sitemapUrls.length ? 1 : null),
             smCrit ? `${smCrit} serious sitemap problems.` : (ctx.sitemapUrls && ctx.sitemapUrls.length ? 'No serious sitemap problems found.' : 'No sitemap loaded.'), 2)
    ];
  }

  /* ---------- on-page ---------- */
  let onpageM = null;
  if (pages.length){
    const live = pages.filter(p => p.status >= 200 && p.status < 300 && !p.notHtml);
    const n = live.length || 1;
    const titles = new Map(), descs = new Map();
    for (const p of live){
      if (p.title) titles.set(p.title.toLowerCase(), (titles.get(p.title.toLowerCase())||0)+1);
      if (p.metaDescription) descs.set(p.metaDescription.toLowerCase(), (descs.get(p.metaDescription.toLowerCase())||0)+1);
    }
    const dupTitle = [...titles.values()].filter(c=>c>1).reduce((s,c)=>s+c,0);
    const goodTitle = live.filter(p => p.title && p.title.length >= 20 && p.title.length <= 65).length;
    const hasDesc = live.filter(p => p.metaDescription).length;
    const oneH1 = live.filter(p => p.h1Count === 1).length;
    const notThin = live.filter(p => p.wordCount >= 300).length;
    const altOk = live.reduce((s,p)=>s + (p.images.length ? (p.images.length - p.imgMissingAlt)/p.images.length : 1), 0) / n;
    onpageM = [
      metric('Titles the right length', ratio(goodTitle, n), `${goodTitle} of ${n} titles are between 20 and 65 characters.`, 3),
      metric('Titles are unique', ratio(n - dupTitle, n), dupTitle ? `${dupTitle} pages share a title with another page.` : 'No duplicate titles.', 2),
      metric('Meta descriptions written', ratio(hasDesc, n), `${n - hasDesc} pages have none, so Google writes its own.`, 2),
      metric('Exactly one H1', ratio(oneH1, n), `${oneH1} of ${n} pages have a single H1.`, 1),
      metric('Body content substantial', ratio(notThin, n), `${n - notThin} pages carry under 300 words.`, 2),
      metric('Images carry alt text', altOk, 'Averaged across every image found in the crawl.', 1)
    ];
  }

  /* ---------- topic coverage ---------- */
  let topicsM = null;
  if (clusterStats && clusterStats.total){
    const s = clusterStats;
    const mapped = s.owned + s.split + s.weak;
    const gapKnown = s.missing + mapped;
    topicsM = [
      metric('Topics with a clear owning page', s.coverage,
             mapped ? `${s.owned} of ${mapped} mapped topics have one page taking 60% or more of the impressions.` : 'No page and query data, so ownership cannot be determined.', 3),
      metric('Topics not split across pages', mapped ? ratio(mapped - s.split, mapped) : null,
             `${s.split} topics are split between two or more of your own URLs.`, 2),
      metric('Competitor topics you cover', gapKnown ? ratio(mapped, gapKnown) : null,
             s.missing ? `${s.missing} topics where a competitor ranks top ten and you are absent.` : 'No uncovered competitor topics found in the gap export.', 2),
      metric('Topics ranking in the top ten', ctx.topicTop10 != null ? ctx.topicTop10 : null,
             'Share of topic impressions where your weighted position is ten or better.', 2)
    ];
  }

  /* ---------- search performance ---------- */
  let searchM = null;
  if (find && find.snapshot && find.snapshot.current.n){
    const c = find.snapshot.current, p = find.snapshot.previous;
    const rows = ctx.baseRows || [];
    let expected = 0, actual = 0, top10 = 0, totalImpr = 0;
    for (const r of rows){
      if (r.pos == null) continue;
      totalImpr += r.impr;
      if (r.pos <= 10.5) top10 += r.impr;
      expected += r.impr * ctrAt(curve, r.pos);
      actual += r.clicks;
    }
    const capture = expected ? clamp01(actual/expected) : null;
    const momentum = p ? clamp01(0.5 + (c.clicks - p.clicks) / Math.max(1, p.clicks) * 1.2) : null;
    const strikingShare = ctx.strikingImpr != null && totalImpr ? 1 - clamp01(ctx.strikingImpr/totalImpr) : null;
    searchM = [
      metric('Clicks against what the rankings should return', capture,
             capture == null ? '' : `You earn ${Math.round(actual).toLocaleString()} clicks where the positions you hold typically return about ${Math.round(expected).toLocaleString()}.`, 3),
      metric('Impressions in the top ten', totalImpr ? top10/totalImpr : null,
             `${Math.round((top10/(totalImpr||1))*100)}% of impressions come from positions ten or better.`, 3),
      metric('Momentum against the previous period', momentum,
             p ? `Clicks moved from ${Math.round(p.clicks).toLocaleString()} to ${Math.round(c.clicks).toLocaleString()}.` : 'No comparison period loaded.', 2),
      metric('Little left stranded just outside', strikingShare,
             ctx.strikingImpr != null ? `${Math.round(ctx.strikingImpr).toLocaleString()} impressions sit on rows ranking below position three with real headroom.` : '', 1)
    ];
  }

  /* ---------- off-page ---------- */
  let offM = null;
  if (backlinks && backlinks.total){
    const b = backlinks;
    offM = [
      metric('Referring domain base', logScale(b.refDomains, 750), `${b.refDomains.toLocaleString()} referring domains across ${b.total.toLocaleString()} links.`, 3),
      metric('Anchor text diversity', b.anchorDiversity, `The most common anchor accounts for ${Math.round((b.topAnchorShare||0)*100)}% of links.`, 2),
      metric('Followed link share', b.followRatio, `${Math.round((b.followRatio||0)*100)}% of links pass authority.`, 1),
      metric('Link retention', b.lost != null && (b.gained + b.lost) ? clamp01(b.gained/(b.gained + b.lost)) : null,
             b.lost != null ? `${b.gained.toLocaleString()} new against ${b.lost.toLocaleString()} lost in the export.` : 'The export has no new or lost columns.', 2),
      metric('Links spread across pages', b.targetSpread, `${b.targets.toLocaleString()} distinct pages receive links.`, 1)
    ];
  }

  /* ---------- AI answer readiness ---------- */
  const aiM = (typeof aiReadiness === 'function') ? aiReadiness(ctx, metric) : null;

  const sets = { crawl: crawlM, onpage: onpageM, topics: topicsM, search: searchM,
                 airead: aiM && aiM.length ? aiM : null, offpage: offM };
  let wsum = 0, acc = 0;
  for (const def of PILLARS){
    const ms = sets[def.key];
    const score = ms ? rollup(ms) : null;
    if (score != null){ wsum += def.weight; acc += score * def.weight; out.measured++; }
    out.pillars.push({ ...def, score: score == null ? null : Math.round(score*100), metrics: ms || [] });
  }
  out.overall = wsum ? Math.round(acc/wsum*100) : null;
  out.coverageNote = wsum < 100 ? `Scored on ${out.measured} of ${PILLARS.length} pillars, carrying ${wsum} of 100 available weight.` : `All ${PILLARS.length} pillars measured.`;
  out.model = SCORE_MODEL;
  return out;
}

function gradeOf(n){
  if (n == null) return { label:'Not scored', tone:'skip' };
  if (n >= 85) return { label:'Strong', tone:'pass' };
  if (n >= 70) return { label:'Solid', tone:'pass' };
  if (n >= 55) return { label:'Patchy', tone:'warn' };
  if (n >= 40) return { label:'Weak', tone:'warn' };
  return { label:'Poor', tone:'fail' };
}

/* ============================================================
   CLIENT REPORT
   A self-contained HTML file: no scripts, no external requests,
   opens anywhere, and prints (or "saves as PDF") to A4 with a
   cover page, running footers and no table split across a break.

   The logo travels inside the file as a data URI, because a
   report that fetches its own letterhead from the web is a
   report that arrives unbranded when it is opened offline, or
   in six months, or by a client behind a corporate proxy.
   ============================================================ */
function reportCss(){
  return `
:root{--ink:#12181f;--ink2:#4d5966;--ink3:#7d8894;--line:#e0e5eb;--bg:#fff;--soft:#f6f8fa;--brand:#0071e3;--red:#d03b3b;--amber:#b07d10;--green:#0ca30c;--gsc:#1a73e8;--smr:#e07b1a;--gen:#7c5cd6}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0 auto;padding:0 32px 72px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg);max-width:1080px;font-variant-numeric:tabular-nums}
h1{font-size:34px;letter-spacing:-.032em;margin:0 0 4px;font-weight:600}
h2{font-size:20px;letter-spacing:-.02em;margin:38px 0 12px;padding-bottom:7px;border-bottom:2px solid var(--ink);font-weight:600}
h3{font-size:15px;letter-spacing:-.01em;margin:22px 0 6px;font-weight:600}
p{margin:0 0 12px}
.lead{color:var(--ink2);margin:0 0 26px}

/* ---------- cover ---------- */
.cover{min-height:96vh;display:flex;flex-direction:column;padding-top:52px}
.cover .mark{height:38px;width:auto;display:block;margin-bottom:auto}
.cover .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink3);margin-bottom:10px}
.cover h1{font-size:46px;line-height:1.05;letter-spacing:-.035em;margin:0 0 10px}
.cover .sub{font-size:17px;color:var(--ink2);margin:0}
.coverscore{display:flex;gap:22px;align-items:flex-end;margin:34px 0 0;padding-top:26px;border-top:1px solid var(--line)}
.coverscore .big{font-size:82px;font-weight:600;letter-spacing:-.045em;line-height:.9}
.coverscore .of{font-size:12px;color:var(--ink3);letter-spacing:.06em;text-transform:uppercase}
.coverscore .grade{font-size:20px;font-weight:600;letter-spacing:-.02em}
.covermeta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 26px;margin-top:30px;padding-top:20px;border-top:1px solid var(--line);font-size:13px}
.covermeta div span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:2px}
.coverfoot{margin-top:34px;font-size:11.5px;color:var(--ink3);line-height:1.5}

/* ---------- body ---------- */
.hero{display:flex;gap:26px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:22px;background:var(--soft);margin-bottom:8px}
.big{font-size:60px;font-weight:600;letter-spacing:-.04em;line-height:1}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 4px}
.tile{border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile .k{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3)}
.tile .v{font-size:25px;font-weight:600;letter-spacing:-.02em}
.tile .d{font-size:12px;color:var(--ink2)}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);border-bottom:1px solid var(--line);padding:7px 9px}
td{padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sub{color:var(--ink3);font-size:12px}
.url{font-size:12px;color:var(--ink2);word-break:break-all;max-width:260px}
.m{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--ink2);border-bottom:1px dotted var(--line);padding:1px 0}
.pill{font-size:11px;border:1px solid var(--line);border-radius:5px;padding:2px 6px;white-space:nowrap;background:var(--soft)}
.sev{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.sev.critical{color:var(--red)}.sev.serious{color:#c2570f}.sev.warning{color:var(--amber)}.sev.notice{color:var(--ink3)}
.up{color:var(--green)}.down{color:var(--red)}.flat{color:var(--ink3)}
.tag{display:inline-block;font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;border-radius:4px;padding:2px 5px;border:1px solid currentColor}
.tag.obs{color:var(--gsc)}.tag.rep{color:var(--smr)}.tag.rec{color:var(--ink2)}.tag.gen{color:var(--gen)}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:10px 0 0;font-size:12px;color:var(--ink2)}
.legend div{display:flex;gap:7px;align-items:baseline}
.note{border-left:3px solid var(--brand);background:var(--soft);padding:11px 14px;border-radius:0 8px 8px 0;font-size:13px;color:var(--ink2);margin:12px 0}
.note.warn{border-left-color:var(--amber)}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink3);font-size:12px}
footer b{color:var(--ink2);font-weight:600}

/* ---------- print / save as PDF ---------- */
@page{size:A4;margin:14mm 12mm 16mm}
@media print{
  html,body{background:#fff}
  body{padding:0;max-width:none;font-size:10.5pt;line-height:1.45}
  .noprint{display:none !important}
  .cover{min-height:0;height:245mm;padding-top:0;break-after:page;page-break-after:always}
  .cover h1{font-size:34pt}
  .coverscore .big{font-size:58pt}
  h1{font-size:22pt}
  h2{font-size:13.5pt;margin:20pt 0 7pt;break-after:avoid;page-break-after:avoid}
  h3{break-after:avoid;page-break-after:avoid}
  table{font-size:8.6pt;break-inside:auto}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  .tiles{grid-template-columns:repeat(4,1fr);gap:6pt}
  .tile .v{font-size:15pt}
  .hero,.note,.legend{break-inside:avoid;page-break-inside:avoid}
  a{color:inherit;text-decoration:none}
}`;
}

function buildReport(ctx){
  const { cfg, score, find, issues, clusters, clusterStats, actions, crawl, runs, sitemapUrls } = ctx;
  const e = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const n = v => v == null ? '&mdash;' : Math.round(v).toLocaleString();
  const pc = v => v == null ? '&mdash;' : (v*100).toFixed(1) + '%';
  const at = ctx.at == null ? Date.now() : ctx.at;
  const date = new Date(at).toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});
  const c = find && find.snapshot ? find.snapshot.current : null;
  const p = find && find.snapshot ? find.snapshot.previous : null;
  const sum = issues ? issues.reduce((s,i)=>{ s[i.severity]=(s[i.severity]||0)+1; return s; }, {}) : {};
  const grade = score ? gradeOf(score.overall) : null;
  const logo = ctx.logo || '';
  const title = cfg.brand || cfg.domain || 'SEO report';

  /* A delta is only reported when both sides exist. "Unknown is not zero"
     holds in the client's copy of the numbers as firmly as it does on screen. */
  const delta = (now, before, lowerIsBetter, fmt) => {
    if (now == null || before == null) return '<span class="flat">no comparison period</span>';
    const d = now - before, better = lowerIsBetter ? d < 0 : d > 0;
    const cls = Math.abs(d) < 1e-12 ? 'flat' : better ? 'up' : 'down';
    return `<span class="${cls}">${d > 0 ? '+' : ''}${fmt(d)} vs previous</span>`;
  };

  const pillarRows = (score ? score.pillars : []).map(pl => `
    <tr><td><b>${e(pl.name)}</b><div class="sub">${pl.score==null ? 'Needs ' + e(pl.needs) : e(gradeOf(pl.score).label)}</div></td>
        <td class="num">${pl.score==null?'&mdash;':pl.score}</td>
        <td class="num">${pl.weight}%</td>
        <td>${(pl.metrics||[]).filter(m=>m.value!=null).map(m=>`<div class="m"><span>${e(m.label)}</span><b>${Math.round(m.value*100)}</b></div>`).join('') || '<span class="sub">Not measured</span>'}</td></tr>`).join('');

  const BASIS_TAG = { observed:'<span class="tag obs">observed</span>', reported:'<span class="tag rep">reported</span>',
                      recorded:'<span class="tag rec">recorded</span>', generated:'<span class="tag gen">generated</span>' };
  const actionRows = (actions||[]).slice(0,25).map((a,i) => `
    <tr><td class="num">${i+1}</td><td><span class="pill">${e(DECISION_LABEL[a.decision]||a.decision)}</span></td>
        <td>${e(a.targetRaw||a.target)}</td><td class="num">${n(a.impact)}</td><td>${e(a.effort)}</td>
        <td class="sub">${BASIS_TAG[a.basis]||''} ${e((a.evidence||[])[0]||'')}</td></tr>`).join('');

  const topicRows = (clusters||[]).slice(0,20).map(cl => `
    <tr><td>${e(cl.name)}</td><td class="num">${cl.size}</td><td class="num">${n(cl.impr)}</td>
        <td>${e(cl.status)}</td><td>${e(cl.owner ? cl.owner.raw || cl.owner.url : '')}</td><td class="num">${n(cl.opportunity)}</td></tr>`).join('');

  const issueRows = (issues||[]).slice(0,30).map(i => `
    <tr><td><span class="sev ${e(i.severity)}">${e(i.severity)}</span></td><td>${e(i.title)}</td>
        <td class="url">${e(i.url||'')}</td><td class="sub">${e(i.detail||'')}</td></tr>`).join('');

  const trend = (runs||[]).length > 1 ? `
    <h2>Movement across saved runs</h2>
    <p class="sub">Each row is a run recorded against this project on the date shown. These are your own baselines, not an estimate of history.</p>
    <table><thead><tr><th>Run</th><th class="num">Clicks</th><th class="num">Impressions</th><th class="num">Avg position</th><th class="num">Score</th></tr></thead><tbody>
    ${runs.slice(-8).map(r => `<tr><td>${new Date(r.at).toLocaleDateString()}</td><td class="num">${n(r.snapshot&&r.snapshot.clicks)}</td><td class="num">${n(r.snapshot&&r.snapshot.impr)}</td><td class="num">${r.snapshot&&r.snapshot.pos!=null?r.snapshot.pos.toFixed(1):'&mdash;'}</td><td class="num">${r.overall==null?'&mdash;':r.overall}</td></tr>`).join('')}
    </tbody></table>` : '';

  /* Where every number in the report came from, by name. A client who asks
     "where did this come from" should not have to ask twice. */
  const sources = (ctx.datasets||[]).length ? `
    <h3>Files this report was built from</h3>
    <table><thead><tr><th>File</th><th>Contents</th><th>Period</th><th class="num">Rows</th></tr></thead><tbody>
    ${ctx.datasets.map(d => `<tr><td>${e(d.name||'')}</td><td class="sub">${e((typeof KIND_LABEL !== 'undefined' && KIND_LABEL[d.kind]) || d.kind || '')}</td><td class="sub">${e(d.period||'current')}</td><td class="num">${d.rows?d.rows.length.toLocaleString():'&mdash;'}</td></tr>`).join('')}
    </tbody></table>` : '';

  /* An optional snapshot comparison, when the report is generated from the
     comparison view rather than from a single run. */
  const cmp = ctx.comparison;
  const cmpRow = m => `<tr><td>${e(m.label)}</td><td class="num">${m.a==null?'&mdash;':(m.kind==='pct'?pc(m.a):m.kind==='pos'?m.a.toFixed(1):n(m.a))}</td>
      <td class="num">${m.b==null?'&mdash;':(m.kind==='pct'?pc(m.b):m.kind==='pos'?m.b.toFixed(1):n(m.b))}</td>
      <td class="num ${m.direction==='better'?'up':m.direction==='worse'?'down':'flat'}">${m.delta==null?'&mdash;':(m.delta>0?'+':'')+(m.kind==='pct'?(m.delta*100).toFixed(2)+'pt':m.kind==='pos'?m.delta.toFixed(1):n(m.delta))}</td>
      <td class="sub">${e(m.note||'')}</td></tr>`;
  const comparison = cmp ? `
    <h2>${cmp.yearOverYear ? 'Year over year' : 'Period over period'}</h2>
    <p class="sub">${e(cmp.label)} &middot; ${cmp.days} days apart.</p>
    ${cmp.warnings.map(w => `<div class="note warn">${e(w)}</div>`).join('')}
    <table><thead><tr><th>Measure</th><th class="num">Earlier</th><th class="num">Later</th><th class="num">Change</th><th>Notes</th></tr></thead><tbody>
      ${cmpRow(Object.assign({}, cmp.overall))}
      ${Object.keys(cmp.totals).map(k => cmpRow(cmp.totals[k])).join('')}
    </tbody></table>
    ${cmp.actions ? `<h3>What moved on the action queue</h3>
      <p class="sub">${cmp.actions.closed.length} no longer appear, ${cmp.actions.opened.length} are new, ${cmp.actions.carried.length} carried over.</p>` : ''}` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)} &mdash; search evidence report, ${e(date)}</title>
<meta name="robots" content="noindex,nofollow">
<style>${reportCss()}</style></head><body>

<section class="cover">
  ${logo ? `<img class="mark" src="${e(logo)}" alt="Website Content Strategy">` : '<div class="mark"></div>'}
  <div class="eyebrow">Search evidence report</div>
  <h1>${e(title)}</h1>
  <p class="sub">Search performance and technical review for <b>${e(cfg.domain||'')}</b>${cfg.market||cfg.country?', '+e(cfg.market||cfg.country):''}.</p>
  <div class="coverscore">
    <div><div class="big">${score && score.overall != null ? score.overall : '&mdash;'}</div><div class="of">out of 100</div></div>
    <div><div class="grade">${e(grade ? grade.label : 'Not scored')}</div><div class="sub">${e(score ? score.coverageNote : 'No data loaded.')}</div></div>
  </div>
  <div class="covermeta">
    <div><span>Prepared</span>${e(date)}</div>
    <div><span>Property</span>${e(cfg.domain||'&mdash;')}</div>
    <div><span>Search type</span>${e(cfg.searchType||'web')}</div>
    <div><span>Device</span>${e(cfg.device||'all devices')}</div>
    ${ctx.projectName ? `<div><span>Project</span>${e(ctx.projectName)}</div>` : ''}
    <div><span>Evidence</span>${(ctx.datasets||[]).length} file${(ctx.datasets||[]).length===1?'':'s'}${crawl && crawl.pages ? `, ${crawl.pages.length} crawled URLs` : ''}</div>
  </div>
  <div class="coverfoot">
    Prepared with the Search Evidence Suite by Website Content Strategy. Every figure below is traceable to a named file
    or to a live crawl performed for this report; nothing is inferred to fill a gap.<br>
    &copy; ${new Date(at).getFullYear()} Syed.ai. All rights reserved.
  </div>
</section>

<h1>Summary</h1>
<p class="lead">Search performance and technical review for <b>${e(cfg.domain||'')}</b>. Prepared ${e(date)}.</p>

<div class="hero">
  <div><div class="big">${score && score.overall != null ? score.overall : '&mdash;'}</div><div class="sub">out of 100</div></div>
  <div><b>${e(grade ? grade.label : 'Not scored')}</b><div class="sub">${e(score ? score.coverageNote : '')}</div></div>
</div>

<div class="tiles">
  <div class="tile"><div class="k">Clicks</div><div class="v">${n(c&&c.clicks)}</div><div class="d">${delta(c&&c.clicks, p&&p.clicks, false, n)}</div></div>
  <div class="tile"><div class="k">Impressions</div><div class="v">${n(c&&c.impr)}</div><div class="d">${delta(c&&c.impr, p&&p.impr, false, n)}</div></div>
  <div class="tile"><div class="k">Click-through</div><div class="v">${pc(c&&c.ctr)}</div><div class="d">${delta(c&&c.ctr, p&&p.ctr, false, d => (d*100).toFixed(2)+' points')}</div></div>
  <div class="tile"><div class="k">Average position</div><div class="v">${c&&c.pos!=null?c.pos.toFixed(1):'&mdash;'}</div><div class="d">${delta(c&&c.pos, p&&p.pos, true, d => d.toFixed(2))}</div></div>
</div>

<div class="legend">
  <div><span class="tag obs">observed</span> measured by Search Console for this property</div>
  <div><span class="tag rep">reported</span> a third-party estimate, treated as a lead to verify</div>
  <div><span class="tag rec">recorded</span> crawled or entered by hand</div>
  <div><span class="tag gen">generated</span> written by a language model, never scored</div>
</div>

${comparison}

<h2>Where the score comes from</h2>
<table><thead><tr><th>Pillar</th><th class="num">Score</th><th class="num">Weight</th><th>Measures</th></tr></thead><tbody>${pillarRows}</tbody></table>
${score && score.overall != null && score.measured != null && (score.pillars||[]).some(pl => pl.score == null)
  ? `<div class="note">A pillar with no score was not measured. Its weight is redistributed across the pillars that were, so the number above is an honest score of what is known rather than a penalty for a missing file.</div>` : ''}

${trend}

<h2>What to do next</h2>
<p class="sub">Ranked by the clicks realistically in play over a period the length of the loaded export. Estimated rows come from third-party volume data and are tagged as reported.</p>
<table><thead><tr><th class="num">#</th><th>Decision</th><th>Target</th><th class="num">Est. clicks</th><th>Effort</th><th>Why</th></tr></thead><tbody>${actionRows || '<tr><td colspan="6" class="sub">No actions generated.</td></tr>'}</tbody></table>

${clusters && clusters.length ? `<h2>Topic coverage</h2>
<p class="sub">${clusterStats ? `${clusterStats.total} topics. ${clusterStats.owned} owned outright, ${clusterStats.split} split across pages, ${clusterStats.missing} held by competitors and absent here.` : ''}</p>
<table><thead><tr><th>Topic</th><th class="num">Queries</th><th class="num">Impressions</th><th>Status</th><th>Owning page</th><th class="num">Headroom</th></tr></thead><tbody>${topicRows}</tbody></table>` : ''}

${issues && issues.length ? `<h2>Technical findings</h2>
<p class="sub">${sum.critical||0} critical, ${sum.serious||0} serious, ${sum.warning||0} warnings, ${sum.notice||0} notices across ${crawl && crawl.pages ? crawl.pages.length : 0} crawled URLs${sitemapUrls && sitemapUrls.length ? ` and ${sitemapUrls.length} sitemap entries` : ''}.</p>
<table><thead><tr><th>Severity</th><th>Finding</th><th>URL</th><th>Detail</th></tr></thead><tbody>${issueRows}</tbody></table>` : ''}

${(score && (score.pillars||[]).some(pl => pl.key === 'airead' && pl.score != null) && typeof AI_EVIDENCE !== 'undefined')
  ? `<h2>What the AI readiness score rests on</h2>
<p class="sub">This is the one pillar measuring a surface nobody has documented, so the basis for every part of it is printed rather than asserted. A controlled experiment outranks an observed correlation, and what has been disproved is listed alongside what has not.</p>
<table><thead><tr><th>Evidence</th><th>Finding</th><th>Source</th><th>Sample</th></tr></thead><tbody>${
  AI_EVIDENCE.map(ev => `<tr><td><span class="tag">${e(ev.grade)}</span></td><td>${e(ev.claim)}</td><td>${e(ev.source)}</td><td class="sub">${e(ev.n)}</td></tr>`).join('')
}</tbody></table>
<div class="note">Graded <b>experiment</b> where a study changed pages and measured the result, <b>mechanism</b> where no study is needed because a blocked crawler simply cannot cite you, <b>weak</b> where the practice is widely recommended but untested, and <b>disproved</b> where a controlled study found no effect. Nothing graded weak or disproved carries meaningful weight in the score.</div>` : ''}

<h2>How to read this</h2>
<p class="sub">Search Console figures are observed: they are what Google recorded for this property under the filters applied at export. Semrush figures are modelled estimates and are treated as leads to verify, never as measurements. Click-through expectations use a curve fitted to this site's own data where there was enough of it, and a documented baseline curve otherwise. An em dash means not measured, which is not the same as zero. Nothing in this report is a ranking prediction.</p>
${sources}

<footer>
  <b>Search Evidence Suite</b> &middot; Website Content Strategy &middot; ${e(date)}<br>
  All analysis ran locally in a browser. No data left this machine to produce this report.<br>
  &copy; ${new Date(at).getFullYear()} Syed.ai. All rights reserved.
</footer>
</body></html>`;
}

/* ============================================================
   BACKLINK PROFILE
   Reads a Semrush backlinks export. Deliberately descriptive:
   it reports the shape of the link profile and leaves judgements
   about link quality to you, because no export contains enough
   to make that call honestly.
   ============================================================ */
/* Anchor classification lives here, at the top level, because two modules need it:
   this one for your own profile and 04l-profiles.js for the per-page comparison.
   Two copies would drift, and a competitor's anchor mix judged by a different rule
   from your own is a comparison that means nothing. */
function brandTokensOf(cfg){
  return String(cfg && cfg.brand || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
}
function classifyAnchor(a, brandTokens){
  a = String(a || '').toLowerCase();
  if (!a || a === '(empty)') return 'empty or image';
  if (/^https?:|^www\.|\.(com|org|net|co\.uk|io)\b/.test(a)) return 'naked URL';
  if (brandTokens && brandTokens.length && brandTokens.some(t => a.includes(t))) return 'branded';
  if (/\b(here|this|click|link|read more|website|site|more)\b/.test(a)) return 'generic';
  return 'descriptive';
}

function analyseBacklinks(datasets, cfg){
  const sets = datasets.filter(d => d.kind === 'semrush_backlinks');
  if (!sets.length) return null;

  const rows = [];
  for (const ds of sets){
    const h = ds.headers;
    const c = {
      src:    pick(h,'source url','source page url','page url','url from','source'),
      tgt:    pick(h,'target url','target page url','url to','target'),
      anchor: pick(h,'anchor','anchor text'),
      score:  pick(h,'page ascore','domain ascore','authority score','page score','domain score'),
      nofollow: pick(h,'nofollow'),
      sponsored: pick(h,'sponsored'), ugc: pick(h,'ugc'),
      type:   pick(h,'type'),
      first:  pick(h,'first seen','firstseen'), last: pick(h,'last seen','lastseen'),
      lost:   pick(h,'lost','lost date','deleted'), news: pick(h,'new','new date')
    };
    for (const r of ds.rows){
      const src = String(r[c.src]||'').trim();
      if (!src) continue;
      const nofollowRaw = String(r[c.nofollow]||'').trim().toLowerCase();
      rows.push({
        src, srcHost: hostOf(src),
        tgt: normUrl(r[c.tgt]||''), tgtRaw: String(r[c.tgt]||'').trim(),
        anchor: String(r[c.anchor]||'').trim(),
        score: num(r[c.score]),
        nofollow: nofollowRaw === 'true' || nofollowRaw === 'yes' || nofollowRaw === '1',
        type: String(r[c.type]||'').trim().toLowerCase(),
        first: r[c.first] ? String(r[c.first]).trim() : '',
        last:  r[c.last]  ? String(r[c.last]).trim()  : '',
        lost:  c.lost ? !!String(r[c.lost]||'').trim() : null,
        isNew: c.news ? !!String(r[c.news]||'').trim() : null
      });
    }
  }
  if (!rows.length) return null;

  const domains = new Map();
  for (const r of rows){
    if (!r.srcHost) continue;
    const d = domains.get(r.srcHost) || { host:r.srcHost, links:0, score:r.score, follow:0, targets:new Set(), anchors:new Set() };
    d.links++; if (!r.nofollow) d.follow++;
    if (r.score != null && (d.score == null || r.score > d.score)) d.score = r.score;
    if (r.tgt) d.targets.add(r.tgt);
    if (r.anchor) d.anchors.add(r.anchor.toLowerCase());
    domains.set(r.srcHost, d);
  }

  const anchors = new Map();
  for (const r of rows){
    const a = (r.anchor || '(empty)').toLowerCase().slice(0,90);
    anchors.set(a, (anchors.get(a)||0) + 1);
  }
  const anchorList = [...anchors.entries()].map(([anchor,count]) => ({ anchor, count, share: count/rows.length }))
                     .sort((a,b)=>b.count-a.count);

  const brandTokens = brandTokensOf(cfg);
  const host = hostOf(cfg && cfg.domain || '');
  const classify = a => classifyAnchor(a, brandTokens);
  const anchorTypes = {};
  for (const a of anchorList) anchorTypes[classify(a.anchor)] = (anchorTypes[classify(a.anchor)]||0) + a.count;

  const targets = new Map();
  for (const r of rows){ if (!r.tgt) continue; targets.set(r.tgt, (targets.get(r.tgt)||0)+1); }
  const targetList = [...targets.entries()].map(([url,count]) => ({ url, count })).sort((a,b)=>b.count-a.count);

  const domainList = [...domains.values()].map(d => ({ ...d, targets:d.targets.size, anchors:d.anchors.size }))
                     .sort((a,b) => (b.score||0) - (a.score||0) || b.links - a.links);

  // link velocity from first-seen dates
  const months = new Map();
  for (const r of rows){
    if (!r.first) continue;
    const t = Date.parse(r.first);
    if (isNaN(t)) continue;
    const k = new Date(t).toISOString().slice(0,7);
    const m = months.get(k) || { month:k, gained:0, lost:0 };
    m.gained++; months.set(k, m);
  }
  for (const r of rows){
    if (!r.lost || r.lost === true) continue;
    const t = Date.parse(r.lost);
    if (isNaN(t)) continue;
    const k = new Date(t).toISOString().slice(0,7);
    const m = months.get(k) || { month:k, gained:0, lost:0 };
    m.lost++; months.set(k, m);
  }
  const velocity = [...months.values()].sort((a,b) => a.month.localeCompare(b.month)).slice(-24);

  // if competitor backlink exports were loaded too, the target hosts differ
  const byTargetHost = new Map();
  for (const r of rows){
    const th = hostOf(r.tgt || '');
    if (!th) continue;
    const e = byTargetHost.get(th) || { host:th, links:0, domains:new Set() };
    e.links++; if (r.srcHost) e.domains.add(r.srcHost);
    byTargetHost.set(th, e);
  }
  const hostRows = [...byTargetHost.values()].map(e => ({ host:e.host, links:e.links, refDomains:e.domains.size, domains:e.domains }));
  const mine = hostRows.find(h => h.host === host) || null;
  const rivals = hostRows.filter(h => h.host !== host);
  let prospects = [];
  if (mine && rivals.length){
    const myDomains = mine.domains;
    const counts = new Map();
    for (const rv of rivals) for (const d of rv.domains){
      if (myDomains.has(d)) continue;
      const c = counts.get(d) || { host:d, rivals:new Set() };
      c.rivals.add(rv.host); counts.set(d, c);
    }
    prospects = [...counts.values()].map(c => {
      const info = domains.get(c.host);
      return { host:c.host, rivals:[...c.rivals], rivalCount:c.rivals.size, score: (info && info.score) || null };
    }).sort((a,b) => (b.rivalCount - a.rivalCount) || ((b.score||0) - (a.score||0))).slice(0, 120);
  }

  const gained = rows.filter(r => r.isNew).length;
  const lost = rows.filter(r => r.lost).length;
  const follow = rows.filter(r => !r.nofollow).length;
  const topShare = anchorList.length ? anchorList[0].share : 0;
  // effective number of distinct anchors, from the inverse Simpson index
  const hhi = anchorList.reduce((s,a) => s + a.share*a.share, 0);
  const diversity = Math.max(0, Math.min(1, (1/(hhi||1)) / Math.min(60, anchorList.length || 1)));

  return {
    total: rows.length,
    refDomains: domains.size,
    followRatio: rows.length ? follow/rows.length : 0,
    gained, lost: (rows.some(r => r.lost !== null) ? lost : null),
    anchors: anchorList.slice(0, 60),
    anchorTypes, topAnchorShare: topShare, anchorDiversity: diversity,
    targets: targets.size,
    targetSpread: Math.max(0, Math.min(1, Math.log10(1+targets.size)/Math.log10(1+120))),
    topTargets: targetList.slice(0, 30),
    domains: domainList.slice(0, 200),
    velocity, hostRows: hostRows.map(({domains, ...r}) => r), prospects,
    hasCompetitors: rivals.length > 0,
    avgScore: domainList.length ? domainList.reduce((s,d)=>s+(d.score||0),0)/domainList.length : null,
    ownHost: host,
    unlinkedEarners: []      // filled in by the caller, which has the Search Console page data
  };
}

/* ============================================================
   INTERNAL LINKING PLANNER
   The question this answers: which page already talks about a
   topic, in its own body copy, without linking to the page that
   owns that topic. Those are the links worth adding, because the
   sentence is already written and the relevance is already there.
   ============================================================ */

const LINK_STOP = new Set('the a an and or of for to in on at by with from is are was were be this that it as your our their you we they how what why when where near best top cost price guide services service company'.split(' '));

/* candidate phrases for a topic: the queries themselves, cleaned and deduped */
function topicPhrases(cluster, max){
  const seen = new Set(), out = [];
  const members = [...cluster.members].sort((a,b) => (b.impr||0) - (a.impr||0));
  for (const m of members){
    let p = String(m.queryRaw || m.query || '').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ').trim();
    if (!p) continue;
    const words = p.split(' ');
    if (words.length < 2 || words.length > 6) continue;
    if (words.every(w => LINK_STOP.has(w))) continue;
    if (seen.has(p)) continue;
    seen.add(p); out.push({ phrase: p, impr: m.impr || 0, words: words.length });
    if (out.length >= (max || 12)) break;
  }
  // the cluster name itself always counts
  const name = String(cluster.name||'').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ').trim();
  if (name && !seen.has(name) && name.split(' ').length >= 2) out.unshift({ phrase:name, impr: cluster.impr||0, words: name.split(' ').length });
  return out;
}

function sentenceAround(text, idx, len){
  const start = Math.max(0, text.lastIndexOf('.', idx) + 1);
  let end = text.indexOf('.', idx + len);
  if (end < 0 || end - start > 320) end = Math.min(text.length, idx + len + 140);
  return text.slice(start, end + 1).replace(/\s+/g,' ').trim();
}

/* ============================================================
   planInternalLinks({ crawl, clusters, gscPages, cfg })
   ============================================================ */
function planInternalLinks(ctx){
  const pages = ((ctx.crawl && ctx.crawl.pages) || []).filter(p => p.status >= 200 && p.status < 300 && !p.notHtml);
  const clusters = ctx.clusters || [];
  const gsc = ctx.gscPages || new Map();
  const out = { opportunities: [], orphanRescues: [], overLinked: [], stats: {}, hasText: false };
  if (!pages.length){ out.reason = 'No crawled pages. Run a crawl at the crawl stage, or import a crawler export.'; return out; }
  if (!clusters.length){ out.reason = 'No topics to link to yet. Topics come from a Search Console query export, so load one and run the analysis again.'; return out; }

  const withText = pages.filter(p => p.text && p.text.length > 200);
  out.hasText = withText.length > 0;
  if (!out.hasText){
    out.reason = pages.some(p => p.imported)
      ? 'The crawl was imported from a file, which carries no body text. Run a live crawl to plan internal links.'
      : 'No page text was stored during the crawl. Turn on "Keep page text" in the crawl settings and run it again.';
    return out;
  }

  // existing link graph, so we never suggest a link that already exists
  const linked = new Map();
  for (const p of pages) linked.set(p.url, new Set(p.internalLinks.map(l => l.url)));

  // pages that can host a link, with a weight from their own performance
  const hosts = withText.map(p => {
    const g = gsc.get(p.url);
    return { page: p, lower: p.text.toLowerCase(),
             clicks: g ? g.clicks : 0, impr: g ? g.impr : 0,
             weight: 1 + Math.log10(1 + (g ? g.clicks : 0)) + Math.log10(1 + (p.inlinks||0)) };
  });

  const targets = clusters.filter(c => c.owner && c.owner.url).slice(0, 120);
  const seenPair = new Set();

  for (const c of targets){
    const targetUrl = c.owner.url, targetRaw = c.owner.raw || c.owner.url;
    const phrases = topicPhrases(c, 10);
    if (!phrases.length) continue;
    for (const h of hosts){
      if (h.page.url === targetUrl) continue;
      const already = linked.get(h.page.url);
      if (already && already.has(targetUrl)) continue;
      let hit = null;
      for (const ph of phrases){
        const idx = h.lower.indexOf(ph.phrase);
        if (idx < 0) continue;
        if (!hit || ph.words > hit.ph.words) hit = { ph, idx };
      }
      if (!hit) continue;
      const key = h.page.url + '>' + targetUrl;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const context = sentenceAround(h.page.text, hit.idx, hit.ph.phrase.length);
      out.opportunities.push({
        from: h.page.url, fromRaw: h.page.raw, fromTitle: h.page.title,
        to: targetUrl, toRaw: targetRaw, topic: c.name,
        anchor: hit.ph.phrase, context,
        fromClicks: h.clicks, fromInlinks: h.page.inlinks || 0,
        targetHeadroom: c.opportunity || 0, targetInlinks: (pages.find(p => p.url === targetUrl) || {}).inlinks || 0,
        score: h.weight * (1 + Math.log10(1 + (c.opportunity || 0))) * (hit.ph.words >= 3 ? 1.25 : 1)
      });
    }
  }
  out.opportunities.sort((a,b) => b.score - a.score);

  // orphans: pages nothing links to, with whatever mentions exist elsewhere
  const orphans = pages.filter(p => (p.inlinks || 0) === 0 && p.clickDepth !== 0);
  for (const o of orphans){
    const terms = [];
    if (o.h1) terms.push(o.h1.toLowerCase());
    if (o.title) terms.push(o.title.toLowerCase().split(/[|–—-]/)[0].trim());
    const slug = (o.url.split('/').pop() || '').replace(/[-_]+/g,' ').replace(/\.\w+$/,'').toLowerCase();
    if (slug.split(' ').length >= 2) terms.push(slug);
    const sources = [];
    for (const h of hosts){
      if (h.page.url === o.url) continue;
      for (const t of terms){
        if (t.length < 8) continue;
        const idx = h.lower.indexOf(t);
        if (idx < 0) continue;
        sources.push({ from: h.page.url, fromRaw: h.page.raw, anchor: t, context: sentenceAround(h.page.text, idx, t.length), clicks: h.clicks });
        break;
      }
      if (sources.length >= 5) break;
    }
    out.orphanRescues.push({ url: o.url, raw: o.raw, title: o.title, depth: o.clickDepth,
      clicks: (gsc.get(o.url) || {}).clicks || 0, sources });
  }
  out.orphanRescues.sort((a,b) => (b.clicks - a.clicks) || (b.sources.length - a.sources.length));

  // pages carrying an unusual number of internal links
  const counts = pages.map(p => p.internalLinkCount || 0).filter(n => n > 0).sort((a,b)=>a-b);
  const median = counts.length ? counts[counts.length >> 1] : 0;
  const cap = Math.max(60, median * 3);
  out.overLinked = pages.filter(p => (p.internalLinkCount || 0) > cap)
    .map(p => ({ url:p.url, raw:p.raw, links:p.internalLinkCount, median }))
    .sort((a,b) => b.links - a.links);

  out.stats = {
    opportunities: out.opportunities.length,
    pagesWithText: withText.length,
    targets: targets.length,
    orphans: orphans.length,
    medianLinks: median,
    unlinkedTargets: targets.filter(c => ((pages.find(p => p.url === c.owner.url) || {}).inlinks || 0) === 0).length
  };
  return out;
}

/* ============================================================
   CONTENT BRIEFS
   Assembled from what is measured, not from what a model imagines.
   Every line traces to a loaded file.
   ============================================================ */
const QUESTION_RE = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b/i;

function buildBriefs(ctx){
  const { clusters, crawl, gscPages, links, cfg, gaps } = ctx;
  const pages = ((crawl && crawl.pages) || []).filter(p => p.status >= 200 && p.status < 300 && !p.notHtml);
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const owned = pages.filter(p => p.wordCount > 0).map(p => p.wordCount).sort((a,b)=>a-b);
  const siteMedianWords = owned.length ? owned[owned.length >> 1] : null;

  const briefs = [];
  const pick = (clusters || []).filter(c => c.status !== 'unmapped' || c.impr > 0);
  for (const c of pick.slice(0, 60)){
    const members = [...c.members].sort((a,b) => (b.impr||0) - (a.impr||0));
    const head = members[0];
    const questions = members.filter(m => QUESTION_RE.test(m.queryRaw || m.query)).slice(0, 12);
    const terms = new Map();
    for (const m of members){
      for (const w of tokens(m.query)) terms.set(w, (terms.get(w)||0) + (m.impr || 1));
    }
    const headTokens = new Set(tokens(head.queryRaw || head.query));
    const entities = [...terms.entries()].filter(([w]) => !headTokens.has(w))
      .sort((a,b)=>b[1]-a[1]).slice(0, 14).map(([w])=>w);

    const page = c.owner ? byUrl.get(c.owner.url) : null;
    const linkSources = links && links.opportunities
      ? links.opportunities.filter(o => c.owner && o.to === c.owner.url).slice(0, 6) : [];
    const gapRow = (gaps || []).find(g => g.keyword === (head.query || '').toLowerCase());

    briefs.push({
      id: c.id, topic: c.name, status: c.status, intent: c.intent,
      impr: c.impr, clicks: c.clicks, pos: c.pos, headroom: c.opportunity,
      target: head.queryRaw || head.query,
      targetStats: { impr: head.impr||0, clicks: head.clicks||0, pos: head.pos },
      supporting: members.slice(1, 25).map(m => ({ q: m.queryRaw || m.query, impr: m.impr, clicks: m.clicks, pos: m.pos })),
      questions: questions.map(m => m.queryRaw || m.query),
      entities,
      owner: c.owner ? { url: c.owner.raw || c.owner.url, share: c.owner.share } : null,
      competing: (c.urls || []).slice(1).filter(u => u.share >= .15).map(u => ({ url: u.raw || u.url, share: u.share })),
      page: page ? { title: page.title, titleLen: (page.title||'').length, desc: page.metaDescription,
                     descLen: (page.metaDescription||'').length, h1: page.h1, h1Count: page.h1Count,
                     words: page.wordCount, images: page.images.length, missingAlt: page.imgMissingAlt,
                     schema: page.schemaTypes, inlinks: page.inlinks, depth: page.clickDepth } : null,
      linkSources: linkSources.map(o => ({ from: o.fromRaw, anchor: o.anchor, context: o.context })),
      competitor: gapRow && gapRow.best ? { domain: gapRow.best.domain, pos: gapRow.best.pos, volume: gapRow.volume } : null,
      benchmarks: { siteMedianWords, currentWords: page ? page.wordCount : null }
    });
  }
  briefs.sort((a,b) => (b.headroom||0) - (a.headroom||0));
  return briefs;
}

function briefToMarkdown(b, cfg){
  const L = [];
  const pct = v => v == null ? '—' : Math.round(v*100) + '%';
  L.push(`# Brief: ${b.topic}`);
  L.push('');
  L.push(`**Domain:** ${cfg.domain || ''}${cfg.country ? '  ·  **Market:** ' + cfg.country : ''}  ·  **Generated:** ${new Date().toISOString().slice(0,10)}`);
  L.push('');
  L.push('> Every figure below was measured from the exports loaded in the console. Nothing here is estimated unless it says so.');
  L.push('');
  L.push('## The job');
  L.push(`- **Primary query:** ${b.target}`);
  L.push(`- **Dominant intent:** ${b.intent}`);
  L.push(`- **Topic status:** ${b.status}${b.status === 'split' ? ' — more than one of your pages is competing for it' : b.status === 'missing' ? ' — no page of yours covers it' : ''}`);
  L.push(`- **Current performance:** ${Math.round(b.impr).toLocaleString()} impressions, ${Math.round(b.clicks).toLocaleString()} clicks, weighted position ${b.pos == null ? 'n/a' : b.pos.toFixed(1)}`);
  L.push(`- **Modelled headroom:** about ${Math.round(b.headroom).toLocaleString()} additional clicks per period if the whole cluster moves one realistic tier up`);
  if (b.competitor) L.push(`- **Competitor benchmark:** ${b.competitor.domain} ranks ${b.competitor.pos} on an estimated ${Math.round(b.competitor.volume).toLocaleString()} monthly searches (Semrush estimate)`);
  L.push('');
  if (b.owner){
    L.push('## The page that owns this');
    L.push(`- **URL:** ${b.owner.url} (holds ${pct(b.owner.share)} of the topic's impressions)`);
    if (b.page){
      L.push(`- **Title:** ${b.page.title || '(none)'} — ${b.page.titleLen} characters`);
      L.push(`- **Meta description:** ${b.page.desc ? b.page.descLen + ' characters' : '(none, so Google writes its own)'}`);
      L.push(`- **H1:** ${b.page.h1 || '(none)'}${b.page.h1Count > 1 ? ` — ${b.page.h1Count} H1 elements on the page` : ''}`);
      L.push(`- **Body:** ${b.page.words.toLocaleString()} words${b.benchmarks.siteMedianWords ? `, against a site median of ${b.benchmarks.siteMedianWords.toLocaleString()}` : ''}`);
      L.push(`- **Images:** ${b.page.images === 0 ? 'none on the page' : b.page.images + (b.page.missingAlt ? `, ${b.page.missingAlt} with no alt text` : ', all with alt text')}`);
      L.push(`- **Structured data:** ${b.page.schema.length ? b.page.schema.join(', ') : 'none found'}`);
      L.push(`- **Internal links in:** ${b.page.inlinks}${b.page.depth != null ? `, ${b.page.depth} clicks from home` : ''}`);
    }
    L.push('');
  }
  if (b.competing.length){
    L.push('## Pages currently competing for the same topic');
    for (const u of b.competing) L.push(`- ${u.url} — ${pct(u.share)} of the topic's impressions`);
    L.push('');
    L.push('Decide which one owns it before writing. Consolidating usually beats improving both.');
    L.push('');
  }
  L.push('## Queries to cover');
  L.push('');
  L.push('| Query | Impressions | Clicks | Position |');
  L.push('|---|---:|---:|---:|');
  const t = b.targetStats || { impr:b.impr, clicks:b.clicks, pos:b.pos };
  L.push(`| **${b.target}** | ${Math.round(t.impr||0).toLocaleString()} | ${Math.round(t.clicks||0).toLocaleString()} | ${t.pos==null?'—':t.pos.toFixed(1)} |`);
  for (const s of b.supporting) L.push(`| ${s.q} | ${Math.round(s.impr||0).toLocaleString()} | ${Math.round(s.clicks||0).toLocaleString()} | ${s.pos==null?'—':s.pos.toFixed(1)} |`);
  L.push(`| **Cluster total** | **${Math.round(b.impr).toLocaleString()}** | **${Math.round(b.clicks).toLocaleString()}** | **${b.pos==null?'—':b.pos.toFixed(1)}** |`);
  L.push('');
  if (b.questions.length){
    L.push('## Questions real searchers used');
    for (const q of b.questions) L.push(`- ${q}`);
    L.push('');
    L.push('These are questions this site already receives impressions for, not invented FAQ filler. Answer them where they fit the page, and leave out the ones that do not.');
    L.push('');
  }
  if (b.entities.length){
    L.push('## Terms that recur across the cluster');
    L.push(b.entities.join(', '));
    L.push('');
    L.push('Word stems taken from the query set, ordered by impressions. Treat them as subjects to cover, not as strings to place a fixed number of times.');
    L.push('');
  }
  if (b.linkSources.length){
    L.push('## Internal links to add');
    L.push('');
    L.push('Pages that already discuss this topic in their own copy and do not yet link here:');
    L.push('');
    for (const s of b.linkSources){
      L.push(`- **From:** ${s.from}`);
      L.push(`  - Suggested anchor: \`${s.anchor}\``);
      L.push(`  - Existing sentence: "${s.context}"`);
    }
    L.push('');
  }
  L.push('## Before it ships');
  L.push('- Every claim traces to a source you can open. No source, no claim.');
  L.push('- List what this URL currently ranks for and protect anything in the top ten.');
  L.push('- Title under 65 characters, meta description under 160, one H1.');
  L.push('- Every image has a descriptive filename and purposeful alt text, or a deliberate empty alt.');
  L.push('- Baseline saved and a review date set before publishing, or the change cannot be measured later.');
  L.push('');
  return L.join('\n');
}

/* ============================================================
   MEDIA, STRUCTURED DATA, HREFLANG AND SERP FEATURES
   ============================================================ */

const GENERIC_FILENAME = /^(img|image|photo|pic|picture|dsc|dscn|screen|screenshot|untitled|final|copy|download|banner|hero|bg|background|asset|upload|file)[-_]?\d*$/i;
const CAMERA_FILENAME = /^(img|dsc|dscn|p|pxl|gopr|mvimg|photo)[-_]?\d{3,}$/i;

function analyseMedia(crawl, gscPages){
  const pages = ((crawl && crawl.pages) || []).filter(p => p.status >= 200 && p.status < 300 && !p.notHtml && !p.imported);
  if (!pages.length) return null;

  const images = [], bySrc = new Map();
  for (const p of pages){
    const g = gscPages ? gscPages.get(p.url) : null;
    (p.images || []).forEach((img, i) => {
      const src = img.src || '';
      let file = '', ext = '';
      try {
        const u = new URL(src, 'https://x.invalid');
        file = decodeURIComponent((u.pathname.split('/').pop() || ''));
      } catch(e){ file = src.split('/').pop() || ''; }
      const dot = file.lastIndexOf('.');
      if (dot > 0){ ext = file.slice(dot+1).toLowerCase().split(/[?#]/)[0]; file = file.slice(0, dot); }
      const rec = {
        src, file, ext, page: p.url, pageRaw: p.raw, pageClicks: g ? g.clicks : 0,
        alt: img.alt, hasAlt: img.hasAlt, altLen: (img.alt || '').length,
        loading: img.loading || '', fetchpriority: img.fetchpriority || '',
        w: img.w, h: img.h, srcset: !!img.srcset,
        first: i === 0,
        issues: []
      };
      if (!rec.hasAlt) rec.issues.push('no alt attribute');
      else if (rec.alt === '' ) rec.issues.push('deliberately empty alt');
      else {
        if (rec.altLen > 125) rec.issues.push('alt over 125 characters');
        if (rec.altLen < 4) rec.issues.push('alt is almost empty');
        const altNorm = String(rec.alt).toLowerCase().replace(/[^a-z0-9]+/g,'');
        const fileNorm = file.toLowerCase().replace(/[^a-z0-9]+/g,'');
        if (altNorm && fileNorm && altNorm === fileNorm) rec.issues.push('alt is just the filename');
      }
      if (CAMERA_FILENAME.test(file)) rec.issues.push('camera filename');
      else if (GENERIC_FILENAME.test(file)) rec.issues.push('generic filename');
      else if (/^[0-9a-f]{16,}$/i.test(file)) rec.issues.push('hash filename');
      if (file.length > 60) rec.issues.push('very long filename');
      if (/[A-Z]/.test(file)) rec.issues.push('uppercase in filename');
      if (/[_\s%]/.test(file)) rec.issues.push('underscores or spaces in filename');
      if (!rec.w || !rec.h) rec.issues.push('no width and height');
      if (!rec.srcset) rec.issues.push('no srcset');
      if (['jpg','jpeg','png','gif','bmp','tiff'].includes(ext)) rec.issues.push('older format, not webp or avif');
      if (rec.first && rec.loading === 'lazy') rec.issues.push('first image is lazy loaded, which delays the largest paint');
      images.push(rec);
      if (src) bySrc.set(src, (bySrc.get(src) || 0) + 1);
    });
  }
  if (!images.length) return { images: [], total: 0, pages: pages.length, empty: true };

  const count = k => images.filter(i => i.issues.includes(k)).length;
  const formats = {};
  for (const i of images) formats[i.ext || '(none)'] = (formats[i.ext || '(none)'] || 0) + 1;

  return {
    total: images.length, pages: pages.length, images,
    withoutAlt: images.filter(i => !i.hasAlt).length,
    emptyAlt: images.filter(i => i.hasAlt && i.alt === '').length,
    noDims: count('no width and height'),
    noSrcset: count('no srcset'),
    badFilename: images.filter(i => i.issues.some(x => /filename/.test(x))).length,
    oldFormat: count('older format, not webp or avif'),
    lazyFirst: count('first image is lazy loaded, which delays the largest paint'),
    formats,
    reused: [...bySrc.entries()].filter(([,n]) => n > 3).map(([src,n]) => ({ src, n })).sort((a,b)=>b.n-a.n).slice(0,20),
    worstPages: pages.map(p => ({ url:p.url, raw:p.raw, images:(p.images||[]).length, missingAlt:p.imgMissingAlt||0,
                                  clicks: gscPages && gscPages.get(p.url) ? gscPages.get(p.url).clicks : 0 }))
                     .filter(p => p.missingAlt > 0).sort((a,b) => (b.clicks - a.clicks) || (b.missingAlt - a.missingAlt)).slice(0,30)
  };
}

/* ---------- structured data ---------- */
function analyseSchema(crawl){
  const pages = ((crawl && crawl.pages) || []).filter(p => p.status >= 200 && p.status < 300 && !p.notHtml && !p.imported);
  if (!pages.length) return null;
  const types = new Map();
  let withSchema = 0, invalid = 0;
  for (const p of pages){
    const t = (p.schemaTypes || []).filter(x => x !== 'INVALID_JSON');
    if ((p.schemaTypes || []).includes('INVALID_JSON')) invalid++;
    if (t.length) withSchema++;
    for (const x of new Set(t)) types.set(x, (types.get(x) || 0) + 1);
  }
  const none = pages.filter(p => !(p.schemaTypes||[]).length);
  return {
    pages: pages.length, withSchema, invalid,
    coverage: pages.length ? withSchema/pages.length : 0,
    types: [...types.entries()].map(([type,count]) => ({ type, count })).sort((a,b)=>b.count-a.count),
    without: none.map(p => ({ url:p.url, raw:p.raw, title:p.title })).slice(0, 60)
  };
}

/* ---------- hreflang ---------- */
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
function analyseHreflang(crawl){
  const pages = ((crawl && crawl.pages) || []).filter(p => p.status >= 200 && p.status < 300 && !p.notHtml && !p.imported);
  const withTags = pages.filter(p => (p.hreflang || []).length);
  if (!withTags.length) return null;

  const byUrl = new Map(pages.map(p => [p.url, p]));
  const issues = [], clusters = [];
  let selfMissing = 0, noXDefault = 0, badCode = 0, noReturn = 0;

  for (const p of withTags){
    const tags = p.hreflang.map(t => ({ lang: (t.lang||'').trim(), href: t.href ? normUrl(t.href) : '', raw: t.href }));
    const langs = tags.map(t => t.lang);
    if (!langs.some(l => l.toLowerCase() === 'x-default')){ noXDefault++; issues.push({ severity:'notice', url:p.raw, issue:'No x-default', detail:'Nothing declared for visitors whose language matches none of the alternates.' }); }
    if (!tags.some(t => t.href === p.url)){ selfMissing++; issues.push({ severity:'serious', url:p.raw, issue:'No self-referencing hreflang', detail:'A page must list itself among its own alternates or the set is ignored.' }); }
    for (const t of tags){
      if (t.lang && t.lang.toLowerCase() !== 'x-default' && !LANG_RE.test(t.lang)){
        badCode++; issues.push({ severity:'serious', url:p.raw, issue:'Invalid hreflang code', detail:`"${t.lang}" is not a valid language or language-region code.` });
      }
      const other = byUrl.get(t.href);
      if (other && other !== p){
        const returns = (other.hreflang || []).some(x => x.href && normUrl(x.href) === p.url);
        if (!returns){
          noReturn++;
          issues.push({ severity:'critical', url:p.raw, issue:'Hreflang has no return tag', detail:`Points at ${t.raw}, which does not point back. Google discards one-way declarations.` });
        }
      }
    }
    clusters.push({ url:p.url, raw:p.raw, langs: tags.map(t => t.lang).filter(Boolean), count: tags.length });
  }
  return { pages: withTags.length, total: pages.length, issues, clusters,
           selfMissing, noXDefault, badCode, noReturn };
}

/* ---------- SERP features ---------- */
const FEATURE_ALIASES = {
  'featured snippet':'Featured snippet', 'people also ask':'People also ask', 'paa':'People also ask',
  'local pack':'Local pack', 'map pack':'Local pack', 'image pack':'Image pack', 'images':'Image pack',
  'video':'Video', 'videos':'Video', 'video carousel':'Video', 'reviews':'Reviews', 'review':'Reviews',
  'sitelinks':'Sitelinks', 'knowledge panel':'Knowledge panel', 'knowledge card':'Knowledge panel',
  'top stories':'Top stories', 'twitter':'Social', 'faq':'FAQ', 'ai overview':'AI overview',
  'shopping ads':'Shopping', 'instant answer':'Instant answer', 'related searches':'Related searches',
  'related products':'Shopping', 'popular products':'Shopping', 'things to know':'Things to know'
};
function normFeature(s){
  const k = String(s||'').trim().toLowerCase();
  if (!k) return null;
  if (FEATURE_ALIASES[k]) return FEATURE_ALIASES[k];
  for (const key of Object.keys(FEATURE_ALIASES)) if (k.includes(key)) return FEATURE_ALIASES[key];
  return k.replace(/\b\w/g, c => c.toUpperCase());
}

function analyseSerpFeatures(model, find, curve, ctrAtFn){
  const rows = model.smrPos.filter(r => r.features);
  if (!rows.length) return null;
  const gsc = new Map(model.gscQ.current.map(r => [r.query, r]));

  const featureCount = new Map(), owned = new Map();
  const items = [];
  for (const r of rows){
    const feats = [...new Set(String(r.features).split(/[,;|]/).map(normFeature).filter(Boolean))];
    if (!feats.length) continue;
    const g = gsc.get(r.keyword);
    for (const f of feats) featureCount.set(f, (featureCount.get(f) || 0) + 1);
    items.push({ keyword: r.keywordRaw || r.keyword, features: feats, pos: r.pos, volume: r.volume,
                 url: r.urlRaw || r.url, gscImpr: g ? g.impr : 0, gscClicks: g ? g.clicks : 0,
                 gscPos: g ? g.pos : null, gscCtr: g ? g.ctr : null });
  }
  if (!items.length) return null;

  // where a feature is present, you rank well, and the click-through is far below the curve
  const suppressed = [];
  for (const it of items){
    if (it.gscPos == null || it.gscPos > 10.5 || it.gscImpr < 50) continue;
    const exp = ctrAtFn(curve, it.gscPos);
    if (!exp) continue;
    const ratio = it.gscCtr / exp;
    if (ratio < 0.6) suppressed.push({ ...it, expected: exp, ratio, lost: Math.max(0, it.gscImpr * (exp - it.gscCtr)) });
  }
  suppressed.sort((a,b) => b.lost - a.lost);

  // a snippet or PAA is on the page and you are close enough to take it
  const targets = items.filter(it => {
    const f = it.features.join(' ');
    const near = (it.gscPos != null ? it.gscPos : it.pos);
    return /Featured snippet|People also ask|FAQ|Things to know/.test(f) && near != null && near >= 2 && near <= 9;
  }).sort((a,b) => (b.gscImpr || b.volume || 0) - (a.gscImpr || a.volume || 0));

  return {
    tracked: items.length,
    features: [...featureCount.entries()].map(([feature,count]) => ({ feature, count, share: count/items.length }))
              .sort((a,b)=>b.count-a.count),
    suppressed: suppressed.slice(0, 80),
    targets: targets.slice(0, 80),
    items
  };
}

/* ============================================================
   GOOGLE AI SEARCH
   Three separate kinds of evidence, deliberately never merged:

     OBSERVED    Search Console generative AI impressions. Google
                 telling you your URL appeared in a generative
                 experience. Page level only: the report carries no
                 query dimension and does not separate AI Overviews
                 from AI Mode.
     REPORTED    Semrush recording that an AI Overview appeared for
                 a tracked query, at the moment it crawled.
     RECORDED    An AI Overview you pasted in yourself, with the
                 sources it cited.

   Everything below keeps those apart and labels which one it used.
   ============================================================ */

const AI_DECISIONS = {
  protect:      { label:'Protect',        why:'Already earning generative impressions. Log the current version before anyone edits it.' },
  expand:       { label:'AI expand',      why:'Visible in generative results and carrying topics it does not yet cover well.' },
  recover:      { label:'AI recover',     why:'Generative impressions are falling against the previous period.' },
  opportunity:  { label:'AI opportunity', why:'AI Overviews appear for queries this page ranks for, and it has little or no generative visibility.' },
  organic:      { label:'Organic first',  why:'Not yet competitive in classic results. Conventional SEO comes before generative work.' },
  blocked:      { label:'Technical block',why:'Cannot participate in generative results as it stands.' },
  monitor:      { label:'Monitor',        why:'No action the evidence supports.' }
};

/* ------------------------------------------------------------
   ELIGIBILITY
   Google's stated requirement is ordinary Search eligibility:
   indexed, crawlable, snippet-eligible, not excluded. There is no
   separate markup requirement, so nothing here invents one.
   ------------------------------------------------------------ */
function aiEligibility(page, ctx){
  const checks = [];
  const add = (name, state, detail) => checks.push({ name, state, detail });
  if (!page) return { checks, state:'unknown', blockers:0 };

  add('Returns 200', page.status >= 200 && page.status < 300 ? 'pass' : 'fail', 'HTTP ' + (page.status || 'no response'));
  add('Indexable', page.noindex ? 'fail' : 'pass', page.noindex ? 'A robots meta tag says noindex.' : 'No noindex directive found.');
  add('Canonical consistent', page.canonical == null ? 'check' : (page.selfCanonical === false ? 'check' : 'pass'),
      page.canonical == null ? 'No canonical declared.' : (page.selfCanonical === false ? 'Canonical points at ' + page.canonical : 'Self-referencing.'));
  const rm = page.robotsMeta || '';
  add('Snippets permitted', /nosnippet/.test(rm) ? 'fail' : 'pass',
      /nosnippet/.test(rm) ? 'nosnippet blocks the text Google would draw on.' : 'No nosnippet directive.');
  const maxSnip = /max-snippet:\s*(-?\d+)/.exec(rm);
  add('max-snippet not restrictive', maxSnip && +maxSnip[1] >= 0 && +maxSnip[1] < 100 ? 'check' : 'pass',
      maxSnip ? 'max-snippet:' + maxSnip[1] : 'No max-snippet limit set.');
  add('Crawlable by robots.txt', ctx.robotsBlocked ? 'fail' : 'pass',
      ctx.robotsBlocked ? 'robots.txt disallows this path.' : 'Not disallowed.');
  add('Main content in the served HTML', (page.wordCount || 0) >= 120 ? 'pass' : 'check',
      (page.wordCount || 0) >= 120 ? `${page.wordCount} words read from the server response.`
        : `Only ${page.wordCount || 0} words in the served HTML. If the content is rendered by JavaScript, a first-pass crawler will not see it.`);
  const gate = (ctx.generativeControl || 'unknown');
  add('Search generative AI control', gate === 'excluded' ? 'fail' : gate === 'included' ? 'pass' : 'unknown',
      gate === 'excluded' ? 'This property is set to exclude itself from Google generative AI features.'
      : gate === 'included' ? 'Set to include, per the project settings.'
      : 'Not recorded. Check Search Console settings and set it on the project stage.');

  const blockers = checks.filter(c => c.state === 'fail').length;
  return { checks, blockers, state: blockers ? 'blocked' : checks.some(c => c.state === 'check' || c.state === 'unknown') ? 'partial' : 'eligible' };
}

/* ------------------------------------------------------------
   AI SEARCH READINESS
   An internal editorial metric, computed from the crawl. It is not
   a Google metric and it does not predict inclusion in anything.
   ------------------------------------------------------------ */
const READINESS_PARTS = [
  ['eligibility','Eligibility and technical access',20],
  ['task','Answers the task quickly',15],
  ['unique','Non-commodity information',15],
  ['evidence','Evidence and factual support',15],
  ['coverage','Covers the related subtopics',10],
  ['structure','Clear organisation and passages',10],
  ['fresh','Freshness where it matters',5],
  ['media','Relevant images or tables',5],
  ['links','Internal link support',5]
];
const clamp = x => Math.max(0, Math.min(1, x));

function readinessFor(page, cluster, elig, ctx){
  if (!page) return null;
  const parts = {};
  const notes = {};

  /* A crawl imported from a CSV carries URLs, status codes and sometimes titles, but never
     the body of the page. Everything below that reads the copy would score zero for every
     row, which would look like a verdict on the writing rather than an absence of evidence.
     Those components return null instead, the weights renormalise, and if too little is
     measurable the score is withheld altogether. */
  const readText = page.contentAnalysed === true;
  const NOTEXT = page.draft
    ? 'Nothing written yet. The components fill in as you type.'
    : 'The crawl did not capture page content, so this cannot be scored. Run a live crawl to score it.';

  /* Unpublished copy has nothing to be eligible. Scoring a draft zero on
     eligibility would be a verdict on writing that has not been crawled yet, so
     the component returns null and the weights renormalise, exactly as they do
     for a crawl that carries no page text. */
  if (elig && elig.checks){
    const failed = elig.checks.filter(c => c.state === 'fail').length;
    const unsure = elig.checks.filter(c => c.state === 'check' || c.state === 'unknown').length;
    parts.eligibility = clamp(1 - failed * 0.45 - unsure * 0.08);
    notes.eligibility = failed ? `${failed} blocking check${failed>1?'s':''} failed.` : unsure ? `${unsure} check${unsure>1?'s':''} could not be confirmed.` : 'All eligibility checks pass.';
  } else {
    parts.eligibility = null;
    notes.eligibility = 'Not applicable before publication. Eligibility is measured on the crawled page.';
  }

  // does an answer arrive before the reader has to work for it
  if (readText){
  const fp = page.firstPara || '';
  const fpWords = fp ? fp.split(/\s+/).length : 0;
  const answerish = fpWords >= 25 && fpWords <= 120;
  const h1HasTopic = cluster && page.h1 ? tokens(cluster.name).some(t => page.h1.toLowerCase().includes(t)) : false;
  parts.task = clamp((answerish ? .55 : fpWords ? .2 : 0) + (h1HasTopic ? .25 : 0) + (page.headings && page.headings.length >= 3 ? .2 : 0));
  notes.task = fpWords ? `Opening paragraph is ${fpWords} words${answerish ? ', which is a usable direct answer' : fpWords > 120 ? ', longer than an extractable answer' : ', probably too short to answer anything'}.` : 'No opening paragraph found.';

  // evidence rather than assertion
  const per100 = page.wordCount ? (page.numberHits || 0) / (page.wordCount / 100) : 0;
  parts.evidence = clamp((per100 >= 1.2 ? .5 : per100 >= .5 ? .3 : per100 > 0 ? .12 : 0)
                       + ((page.outboundCitations || 0) >= 3 ? .3 : (page.outboundCitations || 0) >= 1 ? .18 : 0)
                       + ((page.tableCount || 0) > 0 ? .2 : 0));
  notes.evidence = `${page.numberHits || 0} figures, ${page.outboundCitations || 0} outbound citations, ${page.tableCount || 0} tables.`;

  // things a model could not trivially reproduce: this is a proxy and says so
  const t = (page.text || '').toLowerCase();
  const firstHand = /\b(we |our |i |us )\b/.test(t);
  const caseish = /\b(case study|we tested|we reviewed|we analysed|we analyzed|in our experience|our data|we surveyed|we measured)\b/.test(t);
  parts.unique = clamp((caseish ? .5 : 0) + (firstHand ? .2 : 0) + ((page.tableCount||0) ? .15 : 0) + (per100 >= 1 ? .15 : 0));
  notes.unique = caseish ? 'Contains first-party study or experience language.'
    : firstHand ? 'Written in the first person, but no first-party evidence detected.'
    : 'Reads as commodity explanation. This is a text proxy, not a judgement about the content itself.';

  // does it cover the cluster it is meant to own
  if (cluster){
    const hay = (t + ' ' + (page.headings || []).join(' ') + ' ' + (page.title||'') ).toLowerCase();
    const covered = cluster.members.filter(m => {
      const q = (m.queryRaw || m.query || '').toLowerCase();
      const ws = q.split(/\s+/).filter(w => w.length > 3);
      return ws.length ? ws.every(w => hay.includes(w)) : hay.includes(q);
    }).length;
    parts.coverage = clamp(covered / Math.max(3, cluster.members.length));
    notes.coverage = `${covered} of ${cluster.members.length} queries in this topic appear in the page's own words.`;
  } else { parts.coverage = null; notes.coverage = 'No topic mapped to this page.'; }

  const mp = page.medianPara || 0;
  parts.structure = clamp(((page.headings||[]).length >= 3 ? .4 : (page.headings||[]).length ? .2 : 0)
                        + (mp > 0 && mp <= 90 ? .35 : mp ? .12 : 0)
                        + ((page.listCount||0) > 0 ? .25 : 0));
  notes.structure = `${(page.headings||[]).length} subheadings, median paragraph ${mp} words, ${page.listCount||0} lists.`;

  const yr = page.latestYear;
  const nowY = new Date().getFullYear();
  parts.fresh = yr == null ? null : clamp(1 - Math.max(0, nowY - yr) * 0.34);
  notes.fresh = yr == null ? 'No year mentioned in the copy, so freshness cannot be judged from the page.' : `Most recent year mentioned is ${yr}.`;

  const imgs = (page.images || []).length;
  parts.media = clamp((imgs >= 3 ? .6 : imgs ? .35 : 0) + ((page.tableCount||0) ? .4 : 0));
  notes.media = `${imgs} images, ${page.tableCount||0} tables.`;
  } else {
    for (const k of ['task','unique','evidence','coverage','structure','fresh','media']){
      parts[k] = null; notes[k] = NOTEXT;
    }
  }

  /* Nothing links to a page that does not exist yet. Every crawled page carries a
     number here — buildLinkGraph sets it, and an imported crawl defaults it — so
     null means a draft, and a draft is not penalised for links it cannot have. */
  if (page.inlinks == null){
    parts.links = null;
    notes.links = 'Not applicable before publication. Internal links are counted once the page is crawled.';
  } else {
    parts.links = clamp(Math.log10(1 + page.inlinks) / Math.log10(16));
    notes.links = `${page.inlinks} internal links point here.`;
  }

  let w = 0, acc = 0;
  const rows = READINESS_PARTS.map(([key, label, weight]) => {
    const v = parts[key];
    if (v != null){ w += weight; acc += v * weight; }
    return { key, label, weight, value: v, note: notes[key] };
  });
  /* Below half the weight there is not enough evidence to call it a score. Saying so is
     more useful than a number the reader would have to know not to trust. */
  const enough = w >= 50;
  return { score: enough ? Math.round(acc / w * 100) : null, rows, weightUsed: w,
           unscored: enough ? null : (readText ? 'Too few components could be measured on this page.' : NOTEXT) };
}

/* ------------------------------------------------------------
   THE MAIN PASS
   ------------------------------------------------------------ */
function analyseAiSearch(ctx){
  const { model, find, clusters, crawl, issues, robots, cfg, curve, ctrAtFn, serp } = ctx;
  const out = { available: false, visibility: null, opportunities: [], ctrGap: [], pages: [],
                fanout: [], observations: [], eligibility: null, gate: (cfg.generativeControl || 'unknown') };

  const pages = ((crawl && crawl.pages) || []).filter(p => !p.notHtml);
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const gscPages = new Map(model.gscP.current.map(r => [r.url, r]));
  const gscPrev  = new Map(model.gscP.previous.map(r => [r.url, r]));

  /* ---------- OBSERVED: generative AI impressions ---------- */
  const gp = model.genai.page;
  if (model.genaiLoaded){
    out.available = true;
    const cur = new Map(), prev = new Map();
    for (const r of gp.current) cur.set(r.url, (cur.get(r.url) || 0) + r.impr);
    for (const r of gp.previous) prev.set(r.url, (prev.get(r.url) || 0) + r.impr);
    const rows = [];
    for (const [u, impr] of cur){
      const before = prev.get(u) || 0;
      rows.push({ url:u, raw:(gp.current.find(r=>r.url===u)||{}).urlRaw || u, impr, before,
                  delta: impr - before, pct: before ? (impr-before)/before : null,
                  state: before === 0 ? 'new' : impr > before ? 'up' : impr < before ? 'down' : 'flat' });
    }
    for (const [u, before] of prev) if (!cur.has(u))
      rows.push({ url:u, raw:(gp.previous.find(r=>r.url===u)||{}).urlRaw || u, impr:0, before, delta:-before, pct:-1, state:'lost' });
    rows.sort((a,b) => b.impr - a.impr);

    const total = rows.reduce((s,r)=>s+r.impr,0), totalBefore = rows.reduce((s,r)=>s+r.before,0);
    const top = rows.slice(0, Math.max(1, Math.ceil(rows.length * .1))).reduce((s,r)=>s+r.impr,0);
    out.visibility = {
      total, totalBefore, delta: total - totalBefore,
      pct: totalBefore ? (total-totalBefore)/totalBefore : null,
      urls: rows.filter(r => r.impr > 0).length,
      newUrls: rows.filter(r => r.state === 'new').length,
      lostUrls: rows.filter(r => r.state === 'lost').length,
      concentration: total ? top/total : null,
      rows,
      hasPrevious: gp.previous.length > 0,
      byDevice: aggregateDim(model.genai.device),
      byCountry: aggregateDim(model.genai.country),
      byDate: [...model.genai.date.current].sort((a,b) => String(a.date).localeCompare(String(b.date)))
    };
  }

  /* ---------- REPORTED: which queries trigger an AI Overview ---------- */
  const aioQueries = new Map();
  for (const r of model.smrPos){
    if (!r.features) continue;
    const feats = String(r.features).split(/[,;|]/).map(s => s.trim().toLowerCase());
    if (!feats.some(f => /ai\s*overview|ai\s*mode|generative/.test(f))) continue;
    aioQueries.set(r.keyword, { keyword: r.keywordRaw || r.keyword, smrPos: r.pos, volume: r.volume, url: r.urlRaw || r.url });
  }
  out.aioQueryCount = aioQueries.size;

  /* ---------- query-level opportunity ---------- */
  const pageIndex = new Map();
  for (const r of model.gscPQ){
    if (r.period && r.period !== 'current') continue;
    if (!r.query || !r.url) continue;
    const e = pageIndex.get(r.query) || [];
    e.push(r); pageIndex.set(r.query, e);
  }
  const aiVisible = new Set((out.visibility ? out.visibility.rows.filter(r => r.impr > 0) : []).map(r => r.url));

  for (const g of model.gscQ.current){
    const hit = aioQueries.get(g.query);
    if (!hit) continue;
    let owner = null;
    const list = pageIndex.get(g.query);
    if (list && list.length){
      owner = list.reduce((a,b) => (b.impr > (a ? a.impr : -1) ? b : a), null);
    }
    const ownerUrl = owner ? owner.url : (hit.url ? normUrl(hit.url) : '');
    const visible = ownerUrl ? aiVisible.has(ownerUrl) : false;
    let priority, reason;
    if (!ownerUrl){ priority = 'medium'; reason = 'No page and query data, so the owning URL is unknown. Load a page × query export to resolve it.'; }
    else if (visible){ priority = 'protect'; reason = 'The owning page already draws generative impressions on this topic.'; }
    else if (g.pos != null && g.pos <= 10.5){ priority = 'high'; reason = 'You rank in the top ten and the page has no recorded generative visibility.'; }
    else if (g.pos != null && g.pos <= 20.5){ priority = 'medium'; reason = 'Close to the first page. Conventional position usually comes first.'; }
    else { priority = 'organic'; reason = 'Too far down for generative work to be the bottleneck. Fix the ranking first.'; }
    out.opportunities.push({ query: g.queryRaw || g.query, impr: g.impr, clicks: g.clicks, ctr: g.ctr, pos: g.pos,
      volume: hit.volume, ownerUrl, ownerRaw: owner ? owner.urlRaw : hit.url, aiVisible: visible, priority, reason });
  }
  const rank = { high:0, protect:1, medium:2, organic:3 };
  out.opportunities.sort((a,b) => (rank[a.priority] - rank[b.priority]) || (b.impr - a.impr));

  /* ---------- click-through gap on pages carrying an AI Overview ---------- */
  for (const g of model.gscQ.current){
    if (!aioQueries.has(g.query)) continue;
    if (g.pos == null || g.pos > 10.5 || g.impr < 50) continue;
    const exp = ctrAtFn(curve, g.pos);
    if (!exp) continue;
    const ratio = g.ctr / exp;
    if (ratio >= 0.6) continue;
    const other = serp && serp.items ? (serp.items.find(i => i.keyword.toLowerCase() === g.query) || {}).features : null;
    out.ctrGap.push({ query: g.queryRaw || g.query, pos: g.pos, impr: g.impr, ctr: g.ctr, expected: exp,
                      ratio, gap: Math.max(0, g.impr * (exp - g.ctr)),
                      otherFeatures: (other || []).filter(f => !/AI overview/i.test(f)) });
  }
  out.ctrGap.sort((a,b) => b.gap - a.gap);
  out.ctrGapTotal = out.ctrGap.reduce((s,x)=>s+x.gap,0);

  /* ---------- page level: visibility, readiness, decision ---------- */
  const clusterByOwner = new Map();
  for (const c of (clusters || [])) if (c.owner && c.owner.url && !clusterByOwner.has(c.owner.url)) clusterByOwner.set(c.owner.url, c);
  const oppByOwner = new Map();
  for (const o of out.opportunities){ if (!o.ownerUrl) continue; oppByOwner.set(o.ownerUrl, (oppByOwner.get(o.ownerUrl) || 0) + 1); }

  const visRows = out.visibility ? new Map(out.visibility.rows.map(r => [r.url, r])) : new Map();
  const candidates = new Set([...visRows.keys(), ...gscPages.keys(), ...byUrl.keys()]);
  for (const u of candidates){
    const page = byUrl.get(u) || null;
    const g = gscPages.get(u), gPrev = gscPrev.get(u), v = visRows.get(u);
    if (!page && !g && !v) continue;
    const robotsBlocked = (() => {
      if (!robots || !page) return false;
      try { return !robotsAllows(robots, new URL(page.raw).pathname, '*'); } catch(e){ return false; }
    })();
    const elig = page ? aiEligibility(page, { robotsBlocked, generativeControl: out.gate }) : { checks: [], blockers: 0, state:'unknown' };
    const cl = clusterByOwner.get(u) || null;
    const ready = page ? readinessFor(page, cl, elig, ctx) : null;
    const aioQ = oppByOwner.get(u) || 0;

    let decision;
    if (out.gate === 'excluded') decision = 'blocked';
    else if (page && elig.blockers) decision = 'blocked';
    else if (v && (v.state === 'down' || v.state === 'lost')) decision = 'recover';
    else if (v && v.impr > 0 && aioQ > 0 && ready && ready.score != null && ready.score < 70) decision = 'expand';
    else if (v && v.impr > 0) decision = 'protect';
    else if (aioQ > 0 && g && g.pos != null && g.pos <= 12) decision = 'opportunity';
    else if (aioQ > 0) decision = 'organic';
    else decision = 'monitor';

    out.pages.push({
      url: u, raw: (page && page.raw) || (g && g.urlRaw) || (v && v.raw) || u,
      webImpr: g ? g.impr : 0, webClicks: g ? g.clicks : 0, webPos: g ? g.pos : null,
      webDelta: g && gPrev ? g.clicks - gPrev.clicks : null,
      aiImpr: v ? v.impr : (out.available ? 0 : null), aiBefore: v ? v.before : null,
      aiDelta: v ? v.delta : null, aiState: v ? v.state : (out.available ? 'none' : 'unknown'),
      aioQueries: aioQ, readiness: ready ? ready.score : null, readinessRows: ready ? ready.rows : null,
      readinessUnscored: ready ? ready.unscored : null,
      eligibility: elig, cluster: cl ? cl.name : '', decision, crawled: !!page
    });
  }
  const dorder = { blocked:0, recover:1, opportunity:2, expand:3, protect:4, organic:5, monitor:6 };
  out.pages.sort((a,b) => (dorder[a.decision] - dorder[b.decision]) || ((b.aiImpr||0) - (a.aiImpr||0)) || (b.webImpr - a.webImpr));

  /* ---------- fan-out coverage ---------- */
  for (const c of (clusters || []).slice(0, 60)){
    if (!c.owner || !c.owner.url) continue;
    const page = byUrl.get(c.owner.url);
    if (!page) continue;
    const hay = ((page.text || '') + ' ' + (page.headings || []).join(' ')).toLowerCase();
    const missing = c.members.filter(m => {
      const q = (m.queryRaw || m.query || '').toLowerCase();
      const ws = q.split(/\s+/).filter(w => w.length > 3);
      return ws.length ? !ws.every(w => hay.includes(w)) : !hay.includes(q);
    });
    if (!missing.length) continue;
    out.fanout.push({ topic: c.name, url: c.owner.raw || c.owner.url, covered: c.members.length - missing.length,
      total: c.members.length, missing: missing.slice(0, 20).map(m => ({ q: m.queryRaw || m.query, impr: m.impr })),
      impr: c.impr });
  }
  out.fanout.sort((a,b) => (b.total - b.covered) * Math.log10(10+b.impr) - (a.total - a.covered) * Math.log10(10+a.impr));

  /* ---------- recorded observations ---------- */
  out.observations = (ctx.observations || []).slice();

  out.summary = {
    genaiLoaded: model.genaiLoaded,
    aioQueries: aioQueries.size,
    opportunitiesHigh: out.opportunities.filter(o => o.priority === 'high').length,
    ctrGapTotal: out.ctrGapTotal,
    blocked: out.pages.filter(p => p.decision === 'blocked').length,
    protect: out.pages.filter(p => p.decision === 'protect').length,
    recover: out.pages.filter(p => p.decision === 'recover').length,
    opportunity: out.pages.filter(p => p.decision === 'opportunity').length,
    medianReadiness: (() => {
      const r = out.pages.map(p => p.readiness).filter(x => x != null).sort((a,b)=>a-b);
      return r.length ? r[r.length >> 1] : null;
    })()
  };
  return out;
}

function aggregateDim(store){
  const rows = (store && store.current) || [];
  if (!rows.length) return null;
  const m = new Map();
  for (const r of rows){
    const k = (r.dim || r.date || '(unlabelled)').toString();
    m.set(k, (m.get(k) || 0) + r.impr);
  }
  const total = [...m.values()].reduce((s,v)=>s+v,0);
  return [...m.entries()].map(([k,v]) => ({ key:k, impr:v, share: total ? v/total : 0 })).sort((a,b)=>b.impr-a.impr);
}

/* ------------------------------------------------------------
   OBSERVATION PARSING
   The user pastes an AI Overview they saw, with its cited URLs.
   Nothing is scraped; this is a manual record with a timestamp.
   ------------------------------------------------------------ */
function parseObservation(text){
  const t = String(text || '');
  const get = (label) => {
    const re = new RegExp('^\\s*' + label + '\\s*:\\s*(.*)$', 'im');
    const m = re.exec(t);
    return m ? m[1].trim() : '';
  };
  const block = (label) => {
    const re = new RegExp('^\\s*' + label + '\\s*:[ \\t]*\\n?([\\s\\S]*?)(?=\\n[ \\t]*(?:query|date|country|device|ai overview present|ai overview response|cited urls|follow-up questions|people also ask|notes)[ \\t]*:|$(?![\\s\\S]))', 'im');
    const m = re.exec(t);
    return m ? m[1].trim() : '';
  };
  const urls = (block('cited urls') || t).match(/https?:\/\/[^\s"'<>)]+/g) || [];
  const query = get('query');
  if (!query && !urls.length) return null;
  /* Follow-ups and People Also Ask arrive as free lines. Strip bullets and numbering so the
     citation pack gets clean questions rather than list markup. */
  const lines = s => String(s || '').split('\n')
    .map(x => x.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, '').trim())
    .filter(x => x.length > 4);
  const presentRaw = get('ai overview present').toLowerCase();
  return {
    id: 'obs_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    query, date: get('date') || new Date().toISOString().slice(0,10),
    country: get('country'), device: get('device'),
    present: presentRaw ? !/^no|^false/.test(presentRaw) : true,
    response: block('ai overview response'),
    cited: [...new Set(urls)].map(u => ({ url:u, host: hostOf(u) })),
    followups: lines(block('follow-up questions')),
    paa: lines(block('people also ask')),
    notes: get('notes'), recordedAt: Date.now()
  };
}

function summariseObservations(obs, cfg){
  if (!obs || !obs.length) return null;
  const host = hostOf(cfg.domain || '');
  const domains = new Map();
  let mine = 0;
  for (const o of obs){
    for (const c of o.cited){
      const d = domains.get(c.host) || { host:c.host, cites:0, queries:new Set() };
      d.cites++; d.queries.add(o.query); domains.set(c.host, d);
      if (host && (c.host === host || c.host.endsWith('.' + host))) mine++;
    }
  }
  const list = [...domains.values()].map(d => ({ ...d, queries:d.queries.size })).sort((a,b)=>b.cites-a.cites);
  const totalCites = obs.reduce((s,o)=>s+o.cited.length,0);
  return {
    observations: obs.length, withOverview: obs.filter(o => o.present).length,
    totalCites, ourCites: mine, ourShare: totalCites ? mine/totalCites : 0,
    domains: list, weCited: obs.filter(o => o.cited.some(c => host && (c.host === host || c.host.endsWith('.'+host)))).length
  };
}

/* ============================================================
   AI CITATION PACK
   Turns one recorded AI Overview into a set of rewrite prompts
   aimed at being cited rather than at ranking.

   Three rules run through every pack here, and they are the
   reason this is not just a prompt library:

   1. Nothing is invented. Where a pack asks for first-party
      evidence the operator has not supplied, the prompt is
      required to emit a [SUPPLY: ...] placeholder instead of
      writing a plausible statistic. A fabricated "our analysis
      of 47 sites" is worse than no sentence at all, and it is
      exactly what a language model will produce if not told
      otherwise.
   2. Every slot says where its content came from, or that it is
      missing. A prompt built on an empty variable produces
      confident nonsense.
   3. Freshness is claimed only where something actually changed.
   ============================================================ */

/* ---------- which shape of overview is this ---------- */
const AIO_TYPES = {
  definition: { label:'Definition',  hint:'what / who / why / meaning' },
  howto:      { label:'How-to',      hint:'how to / steps / process' },
  comparison: { label:'Comparison',  hint:'vs / best / alternatives' },
  list:       { label:'List',        hint:'types of / examples / ideas' }
};

function queryIntent(q){
  const s = String(q || '').toLowerCase().trim();
  if (!s) return 'definition';
  if (/\b(vs\.?|versus|compared? to|or)\b/.test(s) || /^(best|top|cheapest|which)\b/.test(s)) return 'comparison';
  if (/^how (to|do|can|long|often|much)\b/.test(s) || /\b(steps?|process|guide|tutorial|procedure)\b/.test(s)) return 'howto';
  if (/\b(types?|kinds?|examples?|ideas|list|options)\b/.test(s) || /^\d+\s/.test(s)) return 'list';
  if (/^(what|who|why|when|where|is|are|does|do|can)\b/.test(s) || /\b(meaning|definition|explained)\b/.test(s)) return 'definition';
  return 'definition';
}

/* ---------- assemble everything a pack might need ---------- */
function citationContext(obs, ctx){
  const cfg = (ctx && ctx.cfg) || {};
  const ai  = (ctx && ctx.ai) || null;
  const crawl = (ctx && ctx.crawl) || null;
  const clusters = (ctx && ctx.clusters) || [];
  const today = new Date().toISOString().slice(0,10);
  const year  = new Date().getFullYear();
  const query = (obs && obs.query) || '';

  /* which page is meant to own this query */
  let owner = null, ownerRaw = '';
  if (ai && ai.opportunities){
    const hit = ai.opportunities.find(o => (o.query || '').toLowerCase() === query.toLowerCase());
    if (hit) ownerRaw = hit.ownerRaw || '';
  }
  if (!ownerRaw && clusters.length){
    const cl = clusters.find(c => (c.members || []).some(m => ((m.queryRaw || m.query || '')).toLowerCase() === query.toLowerCase()));
    if (cl && cl.owner) ownerRaw = cl.owner.raw || cl.owner.url || '';
  }
  if (ownerRaw && crawl && crawl.pages){
    const want = normUrl(ownerRaw);
    owner = crawl.pages.find(p => p.url === want) || null;
  }

  /* the topic this query belongs to, and the terms in it */
  const cluster = clusters.find(c => (c.members || []).some(m => ((m.queryRaw || m.query || '')).toLowerCase() === query.toLowerCase())) || null;
  const siblingQueries = cluster ? (cluster.members || []).map(m => m.queryRaw || m.query).filter(Boolean).slice(0, 30) : [];

  /* the page's own copy — only if a live crawl captured it */
  const hasText = !!(owner && owner.contentAnalysed && owner.text);
  const paras = hasText ? owner.text.split(/\n{2,}|(?<=\.)\s{2,}/).filter(s => s.trim().length > 40) : [];
  const firstTwo = hasText ? [owner.firstPara || paras[0] || '', paras[1] || ''].filter(Boolean).join('\n\n') : '';

  /* images on the owning page, for the image pack */
  const images = (owner && owner.images) ? owner.images.filter(Boolean).slice(0, 12) : [];

  /* SERP features Semrush reported for this query */
  let features = [];
  if (ctx && ctx.serp && Array.isArray(ctx.serp.items)){
    const hit = ctx.serp.items.find(it => String(it.keyword || '').toLowerCase() === query.toLowerCase());
    if (hit) features = hit.features || [];
  }

  const citedHosts = (obs && obs.cited || []).map(c => c.host).filter(Boolean);
  const ourHost = hostOf(cfg.domain || '');
  const weWereCited = citedHosts.some(h => h === ourHost || h.endsWith('.' + ourHost));

  return {
    query, today, year,
    type: queryIntent(query),
    entity: (cluster && cluster.name) || query,
    market: cfg.country || '', language: cfg.language || 'English',
    brand: cfg.brand || '', ourHost,
    snapshot: (obs && obs.response) || '',
    present: !!(obs && obs.present),
    cited: (obs && obs.cited) || [],
    citedHosts, weWereCited,
    followups: (obs && obs.followups) || [],
    paa: (obs && obs.paa) || [],
    notes: (obs && obs.notes) || '',
    observedAt: (obs && obs.date) || '',
    ownerRaw, owner, hasText,
    pageText: hasText ? owner.text.slice(0, 9000) : '',
    firstTwo,
    headings: (owner && owner.headings) || [],
    lastModified: (owner && owner.lastModified) || null,
    latestYear: (owner && owner.latestYear) || null,
    images, features, cluster, siblingQueries
  };
}

/* ---------- shared preamble: the honesty rules ---------- */
function packPreamble(c){
  const L = [];
  L.push('AI CITATION WORK — CONTEXT');
  L.push('');
  L.push(`TARGET QUERY: ${c.query}`);
  L.push(`OVERVIEW SHAPE: ${AIO_TYPES[c.type].label}`);
  L.push(`PRIMARY ENTITY: ${c.entity}`);
  L.push(`MARKET / LANGUAGE: ${c.market || 'not set'} / ${c.language}`);
  L.push(`PAGE THAT SHOULD OWN THIS: ${c.ownerRaw || 'NONE MAPPED — say so rather than guessing'}`);
  L.push(`TODAY: ${c.today}`);
  L.push('');
  L.push('THE GOAL');
  L.push('Not to rank first. To be one of the handful of sources the generative answer cites.');
  L.push('That is a question of definitional clarity and extractable passages, not keyword density.');
  L.push('');
  L.push('THREE RULES THAT OVERRIDE EVERY INSTRUCTION BELOW');
  L.push('1. Invent nothing. If a rewrite needs a statistic, a test result, a sample size or a');
  L.push('   first-party claim that is not supplied in this packet, write it as');
  L.push('   [SUPPLY: what is needed] and carry on. Never write a plausible number.');
  L.push('   A prompt asking for "In our test of X..." is asking for a TEMPLATE, not for you');
  L.push('   to decide what the test found.');
  L.push('2. Do not claim freshness that did not happen. A date change without a content change');
  L.push('   is the thing Google penalises. Only propose a new modified date where you are also');
  L.push('   proposing a substantive edit.');
  L.push('3. Keep the meaning. You may restructure, tighten and add evidence. You may not change');
  L.push('   what the page asserts to be true.');
  L.push('');
  L.push('RECORDED AI OVERVIEW');
  if (!c.present){
    L.push('  No overview appeared for this query when it was checked on ' + (c.observedAt || 'an unrecorded date') + '.');
    L.push('  Treat the rewrite as preparation, not as a response to an existing answer.');
  } else if (c.snapshot){
    L.push(`  Observed ${c.observedAt || 'date not recorded'}. Text as pasted:`);
    L.push(c.snapshot.split('\n').map(s => '    ' + s).join('\n'));
  } else {
    L.push('  An overview was recorded as present but its text was not pasted in.');
  }
  L.push('');
  L.push('SOURCES IT CITED');
  if (c.cited.length){
    for (const u of c.cited) L.push(`  ${u.host === c.ourHost ? '[US] ' : '     '}${u.url}`);
    L.push(c.weWereCited ? '  We are currently cited.' : '  We are NOT currently cited.');
  } else {
    L.push('  None recorded.');
  }
  L.push('');
  L.push('OUR PAGE');
  if (c.hasText){
    L.push(`  ${c.ownerRaw}`);
    if (c.headings.length) L.push('  Subheadings: ' + c.headings.slice(0,14).join(' | '));
    L.push('  Opening as it stands:');
    L.push((c.firstTwo || '(no opening paragraph found)').split('\n').map(s => '    ' + s).join('\n'));
  } else if (c.ownerRaw){
    L.push(`  ${c.ownerRaw} — the crawl did not capture this page's text.`);
    L.push('  Paste the current copy below this line before running the rewrite, or run a live crawl first.');
  } else {
    L.push('  No page is mapped to this query yet. Decide which page should own it before rewriting anything.');
  }
  if (c.siblingQueries.length){
    L.push('');
    L.push('OTHER QUERIES IN THIS TOPIC (the page should cover these too)');
    L.push('  ' + c.siblingQueries.join(' | '));
  }
  if (c.features.length){
    L.push('');
    L.push('SERP FEATURES REPORTED ON THIS QUERY: ' + c.features.join(', '));
  }
  return L.join('\n');
}

/* ---------- the packs ---------- */
const CITATION_PACKS = [

{ key:'open', name:'Opening rewrite', need:'page',
  what:'Rewrites the first 60 words into the shape this kind of overview actually quotes.',
  build: c => {
    const byType = {
      definition: [
        'Rewrite ONLY the opening of the page. Three sentences, nothing else.',
        '',
        `  Sentence 1 (45–60 words): [${c.entity}] is [category] that [core function] for [audience] by [mechanism].`,
        '  Sentence 2 (20–30 words): how it works, in two steps.',
        '  Sentence 3 (15–20 words): "Unlike [common misconception], it [differentiator]."'
      ],
      howto: [
        'Rewrite the opening and the first subheading as a citable procedure.',
        '',
        `  Opening (about 40 words): To ${c.query}, you need [three requirements]. It takes [time] and involves [N] steps.`,
        `  Then a subheading: Steps to ${c.query}`,
        '  Then an ordered list of 5–7 steps. Each step is one sentence and starts with a verb.',
        '  Step 1 names the tool or material. The last step states how you know it worked.'
      ],
      comparison: [
        'Rewrite the opening as a comparison with a quotable verdict.',
        '',
        `  Opening (about 35 words): ${c.query} depends on [the deciding factor]. [A] suits [case A], [B] suits [case B].`,
        '  Then a table with columns: Criteria | Option A | Option B | Better for.',
        '  Rows must include cost, time, skill needed, maintenance, and who it is for.',
        '  Close with one sentence a machine can lift whole: "For most [audience], [option] is better because..."'
      ],
      list: [
        'Rewrite the opening and subheadings as a citable list.',
        '',
        `  Opening (about 30 words): There are [N] main types of ${c.entity}: [name them in one sentence].`,
        '  Then one subheading per type.',
        '  Under each, the first sentence must define it: "[Type] is [definition], used for [use case]."',
        '  One concrete example per type.'
      ]
    };
    return [
      `PACK — OPENING REWRITE (${AIO_TYPES[c.type].label} shape)`,
      '',
      ...byType[c.type],
      '',
      'CONSTRAINTS',
      '  - Self-contained. If a machine shows only these sentences, the reader is served.',
      '  - No "In today\'s world", "In this article", "Understanding", "When it comes to".',
      '  - Include one verifiable fact, attributed in the text to a named source.',
      '    If you do not have one from the packet, write [SUPPLY: fact + source] — do not invent it.',
      `  - Name the year only if something genuinely changed recently. The page currently cites ${c.latestYear || 'no year'}.`,
      '',
      'OUTPUT',
      '  A table of OLD versus NEW for each sentence you change, then the final passage clean.'
    ].join('\n');
  }},

{ key:'gain', name:'Information gain', need:'competitor',
  what:'What the cited pages have that you do not, and what you can say that none of them can.',
  build: c => [
    'PACK — INFORMATION GAIN',
    '',
    'This is the pack that decides whether you deserve the citation. Everything else is formatting.',
    '',
    'INPUT YOU MUST PASTE IN',
    '  The body copy of the pages the overview cited, listed above. This console does not fetch',
    '  third-party pages for you. Open each cited URL, copy the main content, and paste it under',
    '  the heading CITED SOURCE 1, CITED SOURCE 2 and so on before running this.',
    '',
    'TASK',
    '  1. List three facts the cited sources carry that our page does not — an entity, a figure,',
    '     a step. Quote the sentence you found each one in.',
    '  2. List three things our page could say that none of them say. Each must be one of:',
    '     a first-hand test result, original data, a specific worked example with numbers,',
    '     or a genuine change since the cited pages were written.',
    '',
    'FOR EACH ITEM IN 2, WRITE THE PASSAGE TO INSERT',
    '  A subheading that describes the content rather than repeating the keyword.',
    '  Two or three sentences carrying at least one number.',
    '  An attribution line naming the basis of the claim.',
    '',
    'THE RULE THAT MATTERS HERE',
    '  You do not know what we have tested or measured. Write every first-party claim as a',
    '  template with [SUPPLY: ...] where the figure belongs — for example:',
    '    "In our analysis of [SUPPLY: how many sites, over what period], [SUPPLY: what was found]."',
    '  If we cannot fill it in, we do not publish it. An invented statistic is worse than a gap:',
    '  it is the one error that destroys the trust the rest of this work is trying to build.',
    '',
    'OUTPUT',
    '  For each addition: INSERT AFTER <which subheading> — then the passage.'
  ].join('\n')},

{ key:'faq', name:'Follow-up harvester', need:'followups',
  what:'Turns the follow-up questions and People Also Ask into answers built to be quoted.',
  build: c => [
    'PACK — FOLLOW-UP HARVESTER',
    '',
    'QUESTIONS RECORDED',
    c.followups.length ? c.followups.map(q => '  ' + q).join('\n') : '  (none recorded — add them to the observation, or paste them below)',
    '',
    'PEOPLE ALSO ASK',
    c.paa.length ? c.paa.map(q => '  ' + q).join('\n') : '  (none recorded)',
    '',
    'TASK',
    '  Deduplicate and cluster into at most eight questions. For each, write an answer shaped to',
    '  be lifted whole:',
    '    First sentence: the direct answer, under 25 words, opening with Yes, No, or a definition.',
    '    Second sentence: a supporting fact carrying a number.',
    '    Third sentence: the caveat, or what to do next.',
    '    45–65 words in total.',
    '  "It depends" is only allowed if the next clause says what it depends on.',
    '',
    '  Any number you cannot source from the packet is [SUPPLY: ...]. Do not estimate.',
    '',
    'OUTPUT',
    '  A. The question-and-answer section as HTML.',
    '  B. FAQPage JSON-LD covering the same questions.',
    '',
    'ONE THING TO TELL THE CLIENT ABOUT B',
    '  FAQPage markup no longer produces rich results for most sites — Google restricted them to',
    '  well-known authoritative government and health sources. Add it for machine readability if',
    '  you want, but do not sell it as a rich-result win, and do not expect stars in the SERP.'
  ].join('\n')},

{ key:'entity', name:'Entity gap', need:'competitor',
  what:'Entities every cited source mentions and you do not — and the two you own that they lack.',
  build: c => [
    'PACK — ENTITY AND FACT GAP',
    '',
    'INPUT YOU MUST PASTE IN',
    '  The body copy of the cited sources. Same as the information gain pack — this console does',
    '  not fetch them for you.',
    '',
    'TASK',
    '  1. Extract the entities each cited source names: organisations, standards, products,',
    '     methods, places, regulations, people.',
    '  2. Find the ones that appear in EVERY cited source but not on our page. Those are the',
    '     table stakes for this topic.',
    '  3. Find up to two entities our page carries that none of them do. Those are the reason to',
    '     cite us rather than them.',
    '',
    'FOR EACH MISSING ENTITY',
    '  The entity, one sentence introducing it naturally in context, and which subheading it goes',
    '  after. The sentence must be true of our page — if you cannot tell whether it is, say so.',
    '',
    'FOR EACH UNIQUE ENTITY',
    '  How to bring it into the first 200 words without breaking the opening you already rewrote.',
    '',
    'OUTPUT',
    '  A table: entity | missing or unique | sentence | insert after.'
  ].join('\n')},

{ key:'schema', name:'Schema', need:'page',
  what:'Article, FAQ and type-appropriate structured data, built from what is actually on the page.',
  build: c => [
    'PACK — STRUCTURED DATA',
    '',
    `For ${c.ownerRaw || '[the page that will own this query]'}, targeting "${c.query}".`,
    '',
    'GENERATE',
    '  1. Article, with author, publisher and about. Use the real author — if the packet does not',
    '     name one, write [SUPPLY: author name and profile URL] rather than inventing a byline.',
    '     A fabricated author is a trust problem, not a markup problem.',
    '  2. FAQPage, from the answers written in the follow-up pack.',
    c.type === 'howto' ? '  3. HowTo, matching the steps in the rewritten procedure.'
      : c.type === 'list' ? '  3. ItemList, matching the types in the rewritten list.'
      : '  3. BreadcrumbList, and any type genuinely warranted by the content.',
    '',
    'RULES',
    '  - Every value must exist on the page. Markup that describes content the reader cannot see',
    '    is a structured data violation, not a shortcut.',
    `  - dateModified: the page's own most recent date${c.lastModified ? ' is ' + c.lastModified : ' was not captured by the crawl'}.`,
    '    Set it to today ONLY as part of shipping a real edit. Changing the date alone to look',
    '    fresh is exactly what the guidelines call out, and it is detectable.',
    '  - Each block in its own script tag.',
    '',
    'OUTPUT',
    '  Three code blocks, ready to paste into the head.'
  ].join('\n')},

{ key:'image', name:'Image citation', need:'images',
  what:'Filenames, alt text and captions written to describe rather than to repeat the keyword.',
  build: c => [
    'PACK — IMAGES',
    '',
    'IMAGES ON THIS PAGE',
    c.images.length
      ? c.images.slice(0,12).map((im,i) => `  ${i+1}. ${im.src || '(no src)'}  alt: ${im.alt ? '"'+im.alt+'"' : 'MISSING'}`).join('\n')
      : '  (no images captured — run a live crawl, or list them below)',
    '',
    'FOR EACH IMAGE, REWRITE',
    '  Filename: primary-term-descriptive-differentiator-01.webp',
    '    Bad: IMG_1234.jpg, Screenshot.png, cooling-tower-cleaning-1.jpg',
    '    Good: cooling-tower-drift-eliminator-before-after.webp',
    '  Alt text, 95–115 characters, definitional: what it shows, in what context, for what purpose.',
    '    Bad: "image of chart", "cooling tower cleaning"',
    '    Good: "Drift eliminator before and after cleaning, showing scale removal on a 250 kW tower"',
    '  Title attribute: four to six words, different from the alt.',
    '  Caption: one visible sentence. Captions are read by people, which is the main reason to write them.',
    '',
    'RULES',
    '  - Alt text describes the image. If you cannot tell what an image shows from its filename and',
    '    surroundings, write [SUPPLY: what does this image show?] rather than guessing from the query.',
    '    Alt text that describes the wrong picture is an accessibility failure that outlives the SEO.',
    '  - Never keyword-stuff alt text. It is read aloud to people using screen readers.',
    '',
    'OUTPUT',
    '  CSV: old_filename, new_filename, old_alt, new_alt, title, caption'
  ].join('\n')},

{ key:'fresh', name:'Freshness', need:'page',
  what:'Where a real update would make the page more current than the sources being cited.',
  build: c => [
    'PACK — FRESHNESS, HONESTLY',
    '',
    `Most recent year mentioned in our copy: ${c.latestYear || 'none found'}.`,
    `Crawl-reported last modified: ${c.lastModified || 'not captured'}.`,
    '',
    'TASK',
    '  Find up to three places where the page states something that has actually changed, or',
    '  carries a figure old enough to be worth revisiting. For each one:',
    '    - Quote the sentence as it stands.',
    '    - Say what would need to be true for it to need updating.',
    '    - Write the replacement, with [SUPPLY: current figure] where a new number belongs.',
    '',
    'THEN, ONLY IF THERE IS SOMETHING REAL TO SAY',
    `  Draft a short "What changed in ${c.year}" passage of two or three sentences.`,
    '  If nothing in this topic has meaningfully changed, say so and write nothing. A section',
    '  announcing an update that did not happen is worse than an old page: it is an old page that',
    '  now also misleads the reader.',
    '',
    'DO NOT',
    '  - Propose changing a visible date without a corresponding content change.',
    '  - Add "Updated for [year]" to copy that was not updated.',
    '  - Replace a correct older figure with a vaguer recent-sounding one.',
    '',
    'OUTPUT',
    '  Old versus new for each change, and a one-line note on what evidence is still needed.'
  ].join('\n')}
];

/* ---------- build one pack, or all of them ---------- */
function buildCitationPack(obs, ctx, keys, opts){
  const c = citationContext(obs, ctx);
  /* The shape is detected from the query, but the operator saw the actual overview and we
     did not, so their choice wins. */
  if (opts && opts.type && AIO_TYPES[opts.type]) c.type = opts.type;
  const want = keys && keys.length ? CITATION_PACKS.filter(p => keys.includes(p.key)) : CITATION_PACKS;
  const parts = [packPreamble(c)];
  for (const p of want) parts.push('\n' + '─'.repeat(70) + '\n' + p.build(c));
  return { text: parts.join('\n'), context: c, packs: want.map(p => p.key) };
}

/* what a pack is missing before it can do useful work */
function packReadiness(c){
  return {
    page:       { ok: c.hasText,            why: c.ownerRaw ? 'The crawl carries no text for this page. Run a live crawl.' : 'No page is mapped to this query yet.' },
    competitor: { ok: false,                why: 'Needs the cited pages pasted in. This console does not fetch third-party pages.' },
    followups:  { ok: !!(c.followups.length || c.paa.length), why: 'No follow-up questions recorded on this observation.' },
    images:     { ok: !!c.images.length,    why: 'No images captured for this page.' }
  };
}

/* ============================================================
   DRAFT ANALYSIS
   The Live Editor scores copy that has not been published, so
   there is no DOM to read and no crawl to read it from. This
   module derives the same fields extractPage() derives from a
   page, from plain text or markdown instead.

   The contract is the field shape, not the parsing. readinessFor()
   in 04h-aisearch.js must run over the result of analyseDraft()
   unchanged. If the editor ever gets its own scoring logic, the
   editor and the audit will disagree about the same page in front
   of a client, which is the one failure this design exists to
   prevent. Every regex that produces a scored number here is the
   crawler's regex, copied rather than rewritten, for the same
   reason.

   Three fields are deliberately null rather than zero:

     inlinks        nothing links to a page that does not exist
     status/noindex there is no server response to read
     imgNoDims      markdown carries no width or height

   readinessFor() drops null components and renormalises the
   weights, so a draft is scored on the seven components that can
   be measured before publication and is never penalised for the
   two that cannot. Zero would be a verdict; null is the truth.
   ============================================================ */

/* A run of these begins a list item. Kept as one constant because
   the block splitter and the marker stripper must agree exactly. */
const DRAFT_LIST_RE = /^[ \t]{0,3}(?:[-*•+]\s+|\d+[.)]\s+)/;

/* Fenced code, removed line by line rather than with a regex: a lazy
   multiline match ends at the first line break it can, which strips the
   opening fence and leaves the code behind — where its version numbers
   read as figures and its constants read as years. */
function draftStripFences(src){
  const lines = src.split('\n');
  const out = [];
  let open = '';
  for (const l of lines){
    const m = /^[ \t]{0,3}(```+|~~~+)/.exec(l);
    if (m && !open){ open = m[1][0]; out.push(''); continue; }
    if (m && l.trim()[0] === open){ open = ''; out.push(''); continue; }
    out.push(open ? '' : l);
  }
  return out.join('\n');
}

/* A markdown table delimiter row: pipes, colons, dashes and space. */
function draftIsDelimRow(l){
  return /^[ \t]{0,3}[|\s:-]+$/.test(l) && /-{2,}/.test(l) && l.includes('-');
}

/* ------------------------------------------------------------
   BLOCK SPLITTING
   Line-based rather than blank-line-based, because real drafts
   run a heading straight into its paragraph and a paragraph
   straight into its list without the blank lines a strict
   markdown parser would want.
   ------------------------------------------------------------ */
function draftBlocks(src){
  const lines = src.split('\n');
  const out = [];
  let cur = null;
  const push = () => { if (cur && cur.lines.length) out.push(cur); cur = null; };

  for (let i = 0; i < lines.length; i++){
    const l = lines[i];

    if (!l.trim()){ push(); continue; }

    // ATX heading: always its own block, whatever surrounds it
    const atx = /^[ \t]{0,3}(#{1,6})\s+(.*)$/.exec(l);
    if (atx){
      push();
      out.push({ type:'heading', level: atx[1].length,
                 text: atx[2].replace(/\s*#*\s*$/, '').trim() });
      continue;
    }

    // Setext underline: promotes the single text line above it
    if (cur && cur.type === 'text' && cur.lines.length === 1 && /^[ \t]{0,3}(=+|-{2,})[ \t]*$/.test(l)){
      out.push({ type:'heading', level: l.trim()[0] === '=' ? 1 : 2, text: cur.lines[0].trim() });
      cur = null;
      continue;
    }

    // Table rows: only start a table where a delimiter row confirms one,
    // so a paragraph that merely contains a pipe is still a paragraph
    if (l.includes('|')){
      if (cur && cur.type === 'table'){ cur.lines.push(l); continue; }
      if (draftIsDelimRow(l) || draftIsDelimRow(lines[i+1] || '')){
        push(); cur = { type:'table', lines:[l] }; continue;
      }
    }

    if (DRAFT_LIST_RE.test(l)){
      if (!cur || cur.type !== 'list'){ push(); cur = { type:'list', lines:[] }; }
      cur.lines.push(l);
      continue;
    }

    // an indented line under a list item continues that item
    if (cur && cur.type === 'list' && /^[ \t]{2,}\S/.test(l)){ cur.lines.push(l); continue; }

    if (!cur || cur.type !== 'text'){ push(); cur = { type:'text', lines:[] }; }
    cur.lines.push(l);
  }
  push();

  /* A lone short line with no terminal punctuation, standing between blanks,
     is how most people write a subheading when they are not writing markdown. */
  return out.map(b => {
    if (b.type !== 'text' || b.lines.length !== 1) return b;
    const t = b.lines[0].trim();
    const looksLikeHeading = t.length > 0 && t.length < 80 &&
      !/[.!?,;:]$/.test(t) && /[A-Za-zÀ-ɏͰ-￿]/.test(t);
    return looksLikeHeading ? { type:'heading', level:2, text:t } : b;
  });
}

/* ------------------------------------------------------------
   INLINE SYNTAX
   Strips markdown to the words a reader would actually see, and
   collects the links and images on the way past. Syntax must go
   before anything counts words or figures: a URL full of digits
   would otherwise read as evidence.
   ------------------------------------------------------------ */
function draftStripInline(s, sink){
  let t = String(s == null ? '' : s);

  t = t.replace(/!\[([^\]]*)\]\(\s*<?([^)>\s]*)>?(?:\s+["'(][^)]*)?\s*\)/g, (m, alt, src) => {
    if (sink) sink.images.push({ alt: alt, src: src });
    return ' ';
  });

  t = t.replace(/\[([^\]]*)\]\(\s*<?([^)>\s]*)>?(?:\s+["'(][^)]*)?\s*\)/g, (m, txt, href) => {
    if (sink) sink.links.push({ href: href, anchor: txt.slice(0, 120) });
    return txt;
  });

  t = t.replace(/<((?:https?:)\/\/[^>\s]+)>/g, (m, href) => {
    if (sink) sink.links.push({ href: href, anchor: '' });
    return ' ';
  });

  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<>()[\]"']+)/g, (m, pre, href) => {
    if (sink) sink.links.push({ href: href, anchor: '' });
    return pre;
  });

  t = t.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
  t = t.replace(/`+([^`]*)`+/g, '$1');
  t = t.replace(/(\*\*\*|\*\*|\*|___|__|~~)/g, '');
  t = t.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2');
  return t;
}

/* Block text as a reader would see it, markdown removed. */
function draftBlockText(b, sink){
  if (b.type === 'heading') return draftStripInline(b.text, sink).trim();
  if (b.type === 'list'){
    return b.lines.map(l => draftStripInline(l.replace(DRAFT_LIST_RE, ''), sink).trim())
                  .filter(Boolean).join(' ');
  }
  if (b.type === 'table'){
    return b.lines.filter(l => !draftIsDelimRow(l))
      .map(l => draftStripInline(l, sink).split('|').map(c => c.trim()).filter(Boolean).join(' '))
      .filter(Boolean).join(' ');
  }
  return b.lines.map(l => draftStripInline(l.replace(/^[ \t]{0,3}>\s?/, ''), sink).trim())
                .filter(Boolean).join(' ');
}

function draftHost(u){
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return ''; }
}

/* ------------------------------------------------------------
   THE ANALYSER
   Returns an object shaped like a crawled page. Consumers must
   not have to know which one they were handed.
   ------------------------------------------------------------ */
function analyseDraft(raw, opts){
  opts = opts || {};
  const src = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');

  /* Fenced code is not prose. It is removed before any counting so a
     config block cannot pass itself off as evidence or structure. */
  const noFence = draftStripFences(src);

  const blocks = draftBlocks(noFence);
  const sink = { links: [], images: [] };
  const rendered = blocks.map(b => ({ block: b, text: draftBlockText(b, sink) }));

  /* ---- headings ---- */
  const headingBlocks = rendered.filter(r => r.block.type === 'heading' && r.text);
  let h1Index = headingBlocks.findIndex(r => r.block.level === 1);
  /* A draft whose title line is not marked up is still a draft with a title.
     If nothing is level 1 and the document opens on a heading, that heading is
     the H1 — which is what it would become once the page was published. */
  if (h1Index === -1 && headingBlocks.length && rendered[0] && rendered[0].block.type === 'heading') h1Index = 0;
  const h1 = opts.h1 != null ? String(opts.h1)
           : (h1Index >= 0 ? headingBlocks[h1Index].text : '');
  const rest = headingBlocks.filter((r, i) => i !== h1Index);
  const h2s = rest.filter(r => r.block.level <= 2).map(r => r.text);
  const h3s = rest.filter(r => r.block.level === 3).map(r => r.text);
  const headings = h2s.slice(0, 40).concat(h3s.slice(0, 40));

  /* ---- paragraphs ---- */
  /* The > 40 character floor is the crawler's, so that a one-line aside is not
     counted as a paragraph in one path and skipped in the other. */
  const paras = rendered.filter(r => r.block.type === 'text' && r.text.length > 40).map(r => r.text);
  const paraLens = paras.map(t => t.split(/\s+/).filter(Boolean).length);
  const firstPara = paras[0] || '';

  const listCount = blocks.filter(b => b.type === 'list').length;
  const tableCount = blocks.filter(b => b.type === 'table').length;

  /* ---- body text ---- */
  const bodyRaw = rendered.map(r => r.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const bodyText = bodyRaw.toLowerCase();
  const words = bodyText ? bodyText.split(/\s+/).filter(w => w.length > 1) : [];

  /* ---- figures and years: the crawler's regexes, copied verbatim ---- */
  const numberHits = (bodyRaw.match(/\b\d[\d,.]*\s?(%|per cent|percent|kg|km|mm|hours?|days?|weeks?|months?|years?|£|\$|€)?/g) || []).length;
  const yearHits = (bodyRaw.match(/\b(19|20)\d{2}\b/g) || []);
  const latestYear = yearHits.length ? Math.max(...yearHits.map(Number)) : null;

  /* ---- links ---- */
  const ownHost = draftHost(opts.origin || '');
  const httpLinks = sink.links.filter(l => /^https?:\/\//i.test(l.href));
  const external = httpLinks.filter(l => draftHost(l.href) !== ownHost || !ownHost);
  const internal = ownHost ? httpLinks.filter(l => draftHost(l.href) === ownHost) : [];
  const outbound = ownHost ? httpLinks.length - internal.length : httpLinks.length;

  /* ---- images ---- */
  /* Markdown always leaves an alt slot, so presence proves nothing and an empty
     alt is the real signal. This is the one place the draft path judges a field
     differently from the crawler, and it judges it more strictly. */
  const images = sink.images.map(im => ({
    src: im.src || '', fetchpriority: '', alt: im.alt,
    hasAlt: !!(im.alt && im.alt.trim()), loading: '',
    w: null, h: null, srcset: false
  }));

  return {
    /* identity — a draft has no URL until someone gives it one */
    url: opts.url || null, raw: opts.url || null, requested: null,

    /* server response — unknowable before publication */
    status: null, redirects: [], ms: null, bytes: bodyRaw.length,

    title: opts.title != null ? String(opts.title) : h1,
    metaDescription: opts.metaDescription != null ? String(opts.metaDescription) : '',
    robotsMeta: '', noindex: null, nofollowPage: null,
    canonical: null, canonicalRaw: null, selfCanonical: null,

    h1: h1, h1Count: h1 ? 1 : 0, h2Count: h2s.length,
    headings: headings,

    firstPara: firstPara.slice(0, 600),
    medianPara: paraLens.length ? paraLens.slice().sort((a, b) => a - b)[paraLens.length >> 1] : 0,
    paraCount: paraLens.length,
    listCount: listCount,
    tableCount: tableCount,
    outboundCitations: outbound,
    numberHits: numberHits,
    latestYear: latestYear,
    /* An empty editor has not written anything badly — it has not written
       anything. Claiming the copy was analysed would hand every component a
       zero and present that as a score. */
    contentAnalysed: words.length > 0,
    wordCount: words.length,
    text: bodyRaw.slice(0, 12000),
    shingles: (typeof shingleSig === 'function' ? shingleSig(words) : null),

    /* the link graph does not contain unpublished copy */
    internalLinks: internal.map(l => ({ url: l.href, href: l.href, anchor: l.anchor })),
    internalLinkCount: internal.length,
    externalLinkCount: external.length,
    nofollowCount: null,
    inlinks: null,
    clickDepth: null,

    images: images,
    imgMissingAlt: images.filter(i => !i.hasAlt).length,
    imgNoDims: null,

    schemaTypes: null, hreflang: null,
    lang: opts.lang != null ? String(opts.lang) : '',
    hasViewport: null, ogTitle: '', contentType: 'text/markdown',

    /* draft-only, for the editor: everything the coverage checklist and the
       component notes need to point at a place in the text */
    draft: true,
    blocks: rendered.map(r => ({ type: r.block.type, level: r.block.level || null, text: r.text }))
  };
}

/* ------------------------------------------------------------
   COVERAGE, BROKEN OUT
   readinessFor() already computes coverage as one number. The
   editor needs the same test per query so it can tick a checklist
   as the writer types. The matching rule below is character for
   character the one in readinessFor(), because a checklist that
   disagreed with the score above it would be worse than no
   checklist at all.
   ------------------------------------------------------------ */
function draftCoverage(page, cluster){
  if (!cluster || !cluster.members) return null;
  const hay = ((page.text || '') + ' ' + (page.headings || []).join(' ') + ' ' + (page.title || '')).toLowerCase();
  const rows = cluster.members.map(m => {
    const q = (m.queryRaw || m.query || '').toLowerCase();
    const ws = q.split(/\s+/).filter(w => w.length > 3);
    const covered = ws.length ? ws.every(w => hay.includes(w)) : hay.includes(q);
    return { query: m.queryRaw || m.query, impr: m.impr || 0, clicks: m.clicks || 0,
             covered: covered, missing: ws.filter(w => !hay.includes(w)) };
  });
  return { rows: rows, covered: rows.filter(r => r.covered).length, total: rows.length };
}

/* ============================================================
   PAGE IMPORT
   Turns a live page into editable draft text.

   The safety property is structural, not a filter list. Nothing
   fetched is ever inserted into this document, and no HTML is
   ever emitted. The page is parsed with DOMParser, which builds
   an inert document — scripts do not run, images do not load,
   stylesheets are not fetched — and this module then reads only
   text content and three attributes (href, alt, src), emitting
   markdown built from scratch. A blocklist can be evaded; a
   converter that never emits markup cannot carry markup through.

   Images are deliberately not imported. Hotlinking someone's
   binaries into a draft produces a page that breaks when they
   move a file, and an alt attribute copied from a page you did
   not write is not your alt text. The importer counts what it
   found and lists it so the writer re-adds the images they mean
   to use, at the sizes the image kit produces.
   ============================================================ */

/* Containers whose contents are chrome, not copy. Removed before conversion so
   navigation does not become a heading and a cookie banner does not become a
   paragraph. Mirrors the scope rules extractPage() already uses. */
const IMPORT_DROP = 'script,style,noscript,template,svg,canvas,iframe,object,embed,form,input,select,button,textarea,label,nav,footer,header,aside,dialog,' +
  '[role="navigation"],[role="contentinfo"],[role="banner"],[role="search"],[role="dialog"],[role="alert"],[aria-hidden="true"],[hidden]';

/* Only these become links. Anything else — javascript:, data:, vbscript:, a bare
   fragment — is emitted as its anchor text with no link at all. */
function importSafeHref(href, base){
  if (!href) return null;
  let u;
  try { u = new URL(href, base || undefined); } catch(e){ return null; }
  return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
}

function importText(el){ return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

/* Inline conversion. Reads the tree; writes markdown. Never passes markup along. */
function importInline(node, base, sink){
  let out = '';
  for (const ch of node.childNodes){
    if (ch.nodeType === 3){ out += ch.nodeValue.replace(/\s+/g, ' '); continue; }
    if (ch.nodeType !== 1) continue;
    const tag = ch.tagName.toLowerCase();
    if (tag === 'br'){ out += ' '; continue; }
    if (tag === 'img'){ sink.images.push(importImage(ch, base)); continue; }
    if (tag === 'a'){
      const txt = importInline(ch, base, sink).trim();
      const href = importSafeHref(ch.getAttribute('href'), base);
      if (!txt) continue;
      if (href){ sink.links.push(href); out += `[${txt.replace(/[[\]]/g, '')}](${href})`; }
      else { sink.strippedLinks++; out += txt; }
      continue;
    }
    if (tag === 'strong' || tag === 'b'){ const t = importInline(ch, base, sink).trim(); out += t ? `**${t}**` : ''; continue; }
    if (tag === 'em' || tag === 'i'){ const t = importInline(ch, base, sink).trim(); out += t ? `*${t}*` : ''; continue; }
    if (tag === 'code'){ const t = importText(ch); out += t ? '`' + t.replace(/`/g, '') + '`' : ''; continue; }
    out += importInline(ch, base, sink);
  }
  return out;
}

function importImage(el, base){
  const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
  let abs = '';
  try { abs = new URL(src, base || undefined).href; } catch(e){ abs = ''; }
  return { src: /^https?:/i.test(abs) ? abs : '',
           alt: el.getAttribute('alt'),
           w: el.getAttribute('width') || null, h: el.getAttribute('height') || null };
}

/* Markdown escaping for text that came from someone else's page: a line that
   happens to start with # or - must not silently become a heading or a list. */
function importEscape(s){
  return s.replace(/^(\s*)([#>]|\d+[.)]\s|[-*+]\s)/, '$1\\$2');
}

function importBlocks(root, base, sink){
  const out = [];
  const walk = el => {
    for (const ch of el.children){
      const tag = ch.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)){
        const t = importInline(ch, base, sink).replace(/\s+/g, ' ').trim();
        if (t) out.push('#'.repeat(+tag[1]) + ' ' + t);
        continue;
      }
      if (tag === 'p'){
        const t = importInline(ch, base, sink).replace(/\s+/g, ' ').trim();
        if (t) out.push(importEscape(t));
        continue;
      }
      if (tag === 'ul' || tag === 'ol'){
        const items = [];
        let n = 1;
        for (const li of ch.children){
          if (li.tagName.toLowerCase() !== 'li') continue;
          const t = importInline(li, base, sink).replace(/\s+/g, ' ').trim();
          if (t) items.push((tag === 'ol' ? (n++) + '. ' : '- ') + t);
        }
        if (items.length) out.push(items.join('\n'));
        continue;
      }
      if (tag === 'table'){
        const rows = [];
        for (const tr of ch.querySelectorAll('tr')){
          const cells = [...tr.children]
            .filter(c => /^t[hd]$/.test(c.tagName.toLowerCase()))
            .map(c => importInline(c, base, sink).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim());
          if (cells.length) rows.push(cells);
        }
        if (rows.length){
          const width = Math.max(...rows.map(r => r.length));
          const pad = r => { const c = r.slice(); while (c.length < width) c.push(''); return c; };
          const body = rows.map(pad);
          out.push('| ' + body[0].join(' | ') + ' |\n| ' + body[0].map(() => '---').join(' | ') + ' |' +
            (body.length > 1 ? '\n' + body.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n') : ''));
        }
        continue;
      }
      if (tag === 'blockquote'){
        const t = importInline(ch, base, sink).replace(/\s+/g, ' ').trim();
        if (t) out.push('> ' + t);
        continue;
      }
      if (tag === 'pre'){ sink.codeBlocks++; continue; }
      if (tag === 'img'){ sink.images.push(importImage(ch, base)); continue; }
      if (tag === 'figure'){
        for (const im of ch.querySelectorAll('img')) sink.images.push(importImage(im, base));
        const cap = ch.querySelector('figcaption');
        const t = cap ? importInline(cap, base, sink).replace(/\s+/g, ' ').trim() : '';
        if (t) out.push(importEscape(t));
        continue;
      }
      if (tag === 'br' || tag === 'hr') continue;

      /* A container: recurse. If it has no element children it is a text holder
         (a div used as a paragraph), so take its text. */
      if (ch.children.length) walk(ch);
      else {
        const t = importInline(ch, base, sink).replace(/\s+/g, ' ').trim();
        if (t.length > 1) out.push(importEscape(t));
      }
    }
  };
  walk(root);
  return out;
}

/* ------------------------------------------------------------
   THE IMPORTER
   html -> { markdown, title, images[], report }
   ------------------------------------------------------------ */
function htmlToDraft(html, opts){
  opts = opts || {};
  const base = opts.url || '';
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');

  const sink = { images: [], links: [], codeBlocks: 0, strippedLinks: 0 };
  const before = {
    scripts: doc.querySelectorAll('script').length,
    iframes: doc.querySelectorAll('iframe,object,embed').length,
    forms:   doc.querySelectorAll('form').length,
    styles:  doc.querySelectorAll('style,link[rel="stylesheet" i]').length,
    events:  [...doc.querySelectorAll('*')].filter(el =>
               [...el.attributes].some(a => /^on/i.test(a.name))).length
  };

  const titleEl = doc.querySelector('title');
  const title = titleEl ? importText(titleEl) : '';
  const metaDesc = doc.querySelector('meta[name="description" i]');

  /* Same scope rule as the crawler, so an imported page and a crawled one are
     read from the same region of the document. */
  const scope = doc.querySelector('main') || doc.querySelector('article') ||
                doc.querySelector('[role="main"]') || doc.body;
  if (!scope) return { markdown:'', title, h1:'', images:[], report: importReport(before, sink, 0) };

  const work = scope.cloneNode(true);
  for (const el of work.querySelectorAll(IMPORT_DROP)) el.remove();

  const h1El = work.querySelector('h1') || doc.querySelector('h1');
  const h1 = h1El ? importText(h1El) : '';

  let blocks = importBlocks(work, base, sink);

  /* If the page has no h1 in the content region, lead with the document title so
     the draft opens on a heading, the way analyseDraft expects a published page to. */
  if (!/^#\s/.test(blocks[0] || '') && (h1 || title)) blocks.unshift('# ' + (h1 || title));

  /* Collapse the runs of near-empty blocks a marketing page leaves behind. */
  blocks = blocks.filter((b, i) => b && (b.length > 1) && blocks.indexOf(b) === i);

  const markdown = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const uniqueImages = [];
  const seen = new Set();
  for (const im of sink.images){
    const k = im.src || ('noalt' + uniqueImages.length);
    if (seen.has(k)) continue;
    seen.add(k); uniqueImages.push(im);
  }

  return {
    markdown, title, h1,
    metaDescription: metaDesc ? (metaDesc.getAttribute('content') || '').trim() : '',
    images: uniqueImages,
    links: [...new Set(sink.links)],
    report: importReport(before, sink, uniqueImages.length)
  };
}

function importReport(before, sink, imageCount){
  const removed = [];
  if (before.scripts) removed.push(`${before.scripts} script block${before.scripts>1?'s':''}`);
  if (before.events)  removed.push(`${before.events} element${before.events>1?'s':''} with inline event handlers`);
  if (before.iframes) removed.push(`${before.iframes} iframe or embed${before.iframes>1?'s':''}`);
  if (before.forms)   removed.push(`${before.forms} form${before.forms>1?'s':''}`);
  if (before.styles)  removed.push(`${before.styles} stylesheet${before.styles>1?'s':''}`);
  if (sink.strippedLinks) removed.push(`${sink.strippedLinks} non-web link${sink.strippedLinks>1?'s':''} (javascript: or similar)`);
  if (sink.codeBlocks) removed.push(`${sink.codeBlocks} code block${sink.codeBlocks>1?'s':''}`);
  return { removed, imageCount,
           note: 'Nothing fetched was added to this page. The HTML was parsed into an inert document, ' +
                 'so no script ran and no stylesheet or image was requested, and only text was read out of it.' };
}

/* ============================================================
   LINK PROFILES, PAGE BY PAGE
   Compares the backlink profile of your page against the pages
   that outrank it, from Semrush backlink exports — one export
   per URL, dropped in like any other file.

   What this module can and cannot know, stated once:

   A browser can read a page's OUTBOUND links, because it can
   fetch the page. Nothing in a browser can read a page's INBOUND
   links, because that needs a crawl of the whole web. Every
   number here therefore comes out of an export and is REPORTED,
   never OBSERVED, and is drawn in Semrush orange for that reason.

   AUTHORITY. Semrush backlink exports carry an Authority Score
   for each LINKING page, not for the target. So the target's own
   score is not computed here and is not guessed: it is recorded
   by hand, from Semrush, and labelled RECORDED. What is computed
   from the export is the authority of the links themselves —
   the median score of the pages linking in and how many of them
   clear each tier. That is the more useful number anyway: it says
   what the profile is made of rather than summarising it in one
   digit.

   Authority Score is Semrush's metric. It is NOT Moz's Domain
   Authority or Page Authority, which come from a different index
   on a different scale. Nothing here may be labelled DA or PA.
   ============================================================ */

/* Semrush's Type column. Anything unrecognised is counted as other rather than
   forced into one of the four, so the ratios always sum to the link count. */
const LINK_TYPES = ['text', 'image', 'form', 'frame'];
const ASCORE_TIERS = [[60, '60+'], [40, '40–59'], [20, '20–39'], [0, 'under 20']];

function truthy(v){
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

/* Rows out of every semrush_backlinks dataset, flattened. Shares the column
   aliases analyseBacklinks() uses, because they read the same export. */
function backlinkRows(datasets){
  const out = [];
  for (const ds of datasets.filter(d => d.kind === 'semrush_backlinks')){
    const h = ds.headers;
    const c = {
      src:      pick(h,'source url','source page url','page url','url from','source'),
      tgt:      pick(h,'target url','target page url','url to','target'),
      anchor:   pick(h,'anchor','anchor text'),
      pageScore:pick(h,'page ascore','page score'),
      domScore: pick(h,'domain ascore','domain score','authority score'),
      nofollow: pick(h,'nofollow'), sponsored: pick(h,'sponsored'), ugc: pick(h,'ugc'),
      type:     pick(h,'type'),
      first:    pick(h,'first seen','firstseen'),
      lost:     pick(h,'lost','lost date','deleted')
    };
    for (const r of ds.rows){
      const src = String(r[c.src]||'').trim();
      const tgt = String(r[c.tgt]||'').trim();
      if (!src || !tgt) continue;
      out.push({
        src, srcHost: hostOf(src),
        tgt: normUrl(tgt), tgtRaw: tgt, tgtHost: hostOf(tgt),
        anchor: String(r[c.anchor]||'').trim(),
        pageScore: num(r[c.pageScore]),
        domScore: num(r[c.domScore]),
        nofollow: truthy(r[c.nofollow]),
        sponsored: truthy(r[c.sponsored]),
        ugc: truthy(r[c.ugc]),
        type: String(r[c.type]||'').trim().toLowerCase(),
        first: r[c.first] ? String(r[c.first]).trim() : '',
        lost: c.lost ? truthy(r[c.lost]) || !!String(r[c.lost]||'').trim() : null
      });
    }
  }
  return out;
}

/* Delegates to median() in 04-analyze.js rather than redefining it. Declaring a
   second median() here would not error — function declarations may be repeated —
   it would silently replace the one the scorecard and the model already use, and
   nothing would look wrong until a number was quietly different. Everything this
   adds is dropping nulls and rounding, which is what Authority Score needs. */
function medianInt(ns){
  const v = median((ns || []).filter(n => n != null));
  return v == null ? null : Math.round(v);
}

/* One profile from one set of rows, all pointing at the same target. */
function profileOf(key, raw, rows, brandTokens){
  const domains = new Map();
  const types = { text:0, image:0, form:0, frame:0, other:0 };
  const anchors = new Map();
  let follow = 0, nofollow = 0, sponsored = 0, ugc = 0;

  for (const r of rows){
    if (r.srcHost){
      const d = domains.get(r.srcHost) || { host:r.srcHost, links:0, score:null };
      d.links++;
      const sc = r.domScore != null ? r.domScore : r.pageScore;
      if (sc != null && (d.score == null || sc > d.score)) d.score = sc;
      domains.set(r.srcHost, d);
    }
    if (r.nofollow) nofollow++; else follow++;
    if (r.sponsored) sponsored++;
    if (r.ugc) ugc++;
    types[LINK_TYPES.includes(r.type) ? r.type : 'other']++;
    const a = (r.anchor || '(empty)').toLowerCase().slice(0, 90);
    anchors.set(a, (anchors.get(a) || 0) + 1);
  }

  const n = rows.length;
  const anchorList = [...anchors.entries()].map(([anchor, count]) => ({ anchor, count, share: count/n }))
                                           .sort((a,b) => b.count - a.count);
  const anchorTypes = {};
  for (const a of anchorList){
    const k = classifyAnchor(a.anchor, brandTokens);
    anchorTypes[k] = (anchorTypes[k] || 0) + a.count;
  }
  const hhi = anchorList.reduce((s,a) => s + a.share*a.share, 0);

  /* Authority of the links, per referring DOMAIN rather than per link, so one site
     with four hundred links does not decide the shape of the whole distribution. */
  const domainList = [...domains.values()];
  const scores = domainList.map(d => d.score).filter(s => s != null);
  const tiers = {};
  for (const [floor, label] of ASCORE_TIERS) tiers[label] = 0;
  for (const s of scores){
    for (const [floor, label] of ASCORE_TIERS){ if (s >= floor){ tiers[label]++; break; } }
  }

  return {
    key, raw, host: hostOf(raw),
    links: n,
    refDomains: domains.size,
    linksPerDomain: domains.size ? +(n / domains.size).toFixed(1) : null,
    follow, nofollow,
    followRatio: n ? follow / n : null,
    sponsored, ugc,
    types,
    textRatio:  n ? types.text  / n : null,
    imageRatio: n ? types.image / n : null,
    /* null, not 0, when the export carried no Type column at all: a missing column
       is not a profile with no image links in it. */
    hasTypes: (types.text + types.image + types.form + types.frame) > 0,
    sourceAuthority: scores.length
      ? { median: medianInt(scores), max: Math.max(...scores), n: scores.length, tiers }
      : null,
    anchors: anchorList.slice(0, 40),
    anchorTypes,
    topAnchorShare: anchorList.length ? anchorList[0].share : null,
    anchorDiversity: anchorList.length ? Math.max(0, Math.min(1, (1/(hhi||1)) / Math.min(60, anchorList.length))) : null,
    domains: domainList.sort((a,b) => (b.score||0) - (a.score||0) || b.links - a.links).slice(0, 60),
    domainSet: new Set(domains.keys()),
    recordedAuthority: null
  };
}

/* ------------------------------------------------------------
   THE PASS
   groupBy 'url' compares pages; 'host' compares whole sites.
   ------------------------------------------------------------ */
function linkProfiles(datasets, cfg, opts){
  opts = opts || {};
  const rows = backlinkRows(datasets || []);
  if (!rows.length) return null;

  const groupBy = opts.groupBy === 'host' ? 'host' : 'url';
  const brandTokens = brandTokensOf(cfg);
  const ownHost = hostOf(cfg && cfg.domain || '');
  const recorded = (cfg && cfg.linkAuthority) || {};
  const tagged = (cfg && cfg.linkTopics) || {};

  const groups = new Map();
  for (const r of rows){
    const key = groupBy === 'host' ? r.tgtHost : r.tgt;
    if (!key) continue;
    const g = groups.get(key) || { key, raw: groupBy === 'host' ? r.tgtHost : r.tgtRaw, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  const profiles = [...groups.values()]
    .map(g => profileOf(g.key, g.raw, g.rows, brandTokens))
    .map(p => Object.assign(p, {
      isOwn: !!ownHost && p.host === ownHost,
      recordedAuthority: recorded[p.key] != null ? recorded[p.key] : null,
      clusterId: tagged[p.key] || ''
    }))
    .sort((a,b) => b.refDomains - a.refDomains || b.links - a.links);

  /* A single export for one domain produces one target per URL it links to, which
     is dozens of thin profiles rather than a comparison. Saying so is more useful
     than rendering it. */
  const thin = profiles.filter(p => p.links < (opts.minLinks || 3)).length;

  return {
    groupBy,
    profiles,
    ownHost,
    hasOwn: profiles.some(p => p.isOwn),
    thin,
    totalRows: rows.length,
    evidence: 'REPORTED',
    note: 'Every figure here comes from a Semrush backlink export. Semrush reports what its crawl found, ' +
          'which is a sample of the web and not the whole of it, so treat these as comparable estimates ' +
          'rather than counts. Authority Score is Semrush\'s metric and is not Moz Domain or Page Authority.'
  };
}

/* ------------------------------------------------------------
   THE COMPARISON
   Only ever between profiles the user put in the same set, and
   only on measures both of them actually carry.
   ------------------------------------------------------------ */
function compareProfiles(profiles, ownKey){
  const own = profiles.find(p => p.key === ownKey) || profiles.find(p => p.isOwn);
  if (!own || profiles.length < 2) return null;
  const rivals = profiles.filter(p => p !== own);

  const med = (arr, f) => medianInt(arr.map(f).filter(v => v != null).map(v => v * 1000)) / 1000;
  const medInt = (arr, f) => medianInt(arr.map(f));

  const gaps = [];
  const add = (label, mine, theirs, fmtFn, higherIsBetter) => {
    if (mine == null || theirs == null || isNaN(theirs)) return;
    gaps.push({ label, mine, theirs, fmt: fmtFn,
                behind: higherIsBetter ? mine < theirs : mine > theirs,
                ratio: theirs ? mine / theirs : null });
  };

  add('Referring domains', own.refDomains, medInt(rivals, p => p.refDomains), 'int', true);
  add('Total backlinks', own.links, medInt(rivals, p => p.links), 'int', true);
  add('Follow share', own.followRatio, med(rivals, p => p.followRatio), 'pct', true);
  if (own.hasTypes && rivals.some(p => p.hasTypes)){
    add('Text-link share', own.textRatio, med(rivals.filter(p=>p.hasTypes), p => p.textRatio), 'pct', true);
    add('Image-link share', own.imageRatio, med(rivals.filter(p=>p.hasTypes), p => p.imageRatio), 'pct', false);
  }
  if (own.sourceAuthority && rivals.some(p => p.sourceAuthority)){
    add('Median authority of referring domains', own.sourceAuthority.median,
        medInt(rivals.filter(p=>p.sourceAuthority), p => p.sourceAuthority.median), 'int', true);
    add('Referring domains at Authority Score 40+',
        (own.sourceAuthority.tiers['60+']||0) + (own.sourceAuthority.tiers['40–59']||0),
        medInt(rivals.filter(p=>p.sourceAuthority), p => (p.sourceAuthority.tiers['60+']||0) + (p.sourceAuthority.tiers['40–59']||0)),
        'int', true);
  }
  add('Top anchor concentration', own.topAnchorShare, med(rivals, p => p.topAnchorShare), 'pct', false);

  /* Domains linking to rivals but not to you: the one genuinely actionable output
     of the whole comparison, because it is a list you can work through. */
  const counts = new Map();
  for (const rv of rivals) for (const d of rv.domainSet){
    if (own.domainSet.has(d)) continue;
    const c = counts.get(d) || { host: d, rivals: new Set(), score: null };
    c.rivals.add(rv.key);
    const info = rv.domains.find(x => x.host === d);
    if (info && info.score != null && (c.score == null || info.score > c.score)) c.score = info.score;
    counts.set(d, c);
  }
  const prospects = [...counts.values()]
    .map(c => ({ host: c.host, rivalCount: c.rivals.size, score: c.score }))
    .sort((a,b) => b.rivalCount - a.rivalCount || (b.score||0) - (a.score||0))
    .slice(0, 150);

  return { own, rivals, gaps, prospects,
           shared: prospects.filter(p => p.rivalCount === rivals.length).length };
}

/* ============================================================
   SEARCH CONSOLE CONNECTOR — the engine
   Pure request-building, pagination and error mapping. No fetch,
   no DOM, no tokens: the transport is passed in, so everything
   here is testable in node and the only untestable part of the
   connector is the OAuth handshake itself.

   Why this can exist in a browser-only app at all: Google's
   Identity Services token model issues an access token in the
   page and its REST endpoints are CORS-enabled, so the client's
   Search Console data goes from Google to their own tab and
   nowhere else. Nothing is proxied, and no refresh token is
   stored anywhere — the token dies with the session, which is
   the whole reason this is safe to ship in a tool that promises
   nothing is uploaded.

   The rows this produces are handed to jsonToMatrix() and then
   addTable(), the same path a dropped CSV takes. There is no
   second parser and no second classifier: an imported query
   table and an exported one become the same dataset kind, so
   every stage downstream cannot tell them apart and does not
   need to.
   ============================================================ */

const GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
/* The documented maximum for searchAnalytics.query. Asking for more is rejected. */
const GSC_ROW_LIMIT = 25000;

/* The dimension sets worth pulling, each named so classify() lands on the dataset
   kind the app already understands. searchAppearance is alone in its set because
   the API refuses to combine it with anything else. */
const GSC_PRESETS = [
  { key:'query',      dimensions:['query'],            label:'Queries',           kind:'gsc_query',      on:true },
  { key:'page',       dimensions:['page'],             label:'Pages',             kind:'gsc_page',       on:true },
  { key:'page_query', dimensions:['page','query'],     label:'Pages and queries', kind:'gsc_page_query', on:true },
  { key:'date',       dimensions:['date'],             label:'Dates',             kind:'gsc_date',       on:true },
  { key:'country',    dimensions:['country'],          label:'Countries',         kind:'gsc_country',    on:false },
  { key:'device',     dimensions:['device'],           label:'Devices',           kind:'gsc_device',     on:false },
  { key:'appearance', dimensions:['searchAppearance'], label:'Search appearance', kind:'gsc_appearance', on:false }
];

const gscQueryUrl = site => `${GSC_API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
const gscSitesUrl = () => `${GSC_API}/sites`;

function gscIso(d){ return new Date(d).toISOString().slice(0, 10); }

/* Search Console data settles over a couple of days. Asking up to today returns a
   thin tail that makes a period comparison look like a collapse, so the window ends
   two days back and dataState stays 'final'. The UI says so rather than hiding it. */
function gscDateRange(days, nowMs){
  const end = new Date((nowMs == null ? Date.now() : nowMs) - 2 * 864e5);
  const start = new Date(end.getTime() - (Math.max(1, days) - 1) * 864e5);
  return { startDate: gscIso(start), endDate: gscIso(end) };
}

/* The previous window of the same length, immediately before the current one, so a
   trend is a like-for-like comparison rather than two arbitrary ranges. */
function gscPreviousRange(range, days){
  const start = new Date(range.startDate + 'T00:00:00Z').getTime();
  const prevEnd = new Date(start - 864e5);
  const prevStart = new Date(prevEnd.getTime() - (Math.max(1, days) - 1) * 864e5);
  return { startDate: gscIso(prevStart), endDate: gscIso(prevEnd) };
}

function gscBody(o){
  const b = {
    startDate: o.startDate,
    endDate: o.endDate,
    dimensions: (o.dimensions || []).slice(),
    rowLimit: Math.min(Math.max(1, o.rowLimit || GSC_ROW_LIMIT), GSC_ROW_LIMIT),
    startRow: Math.max(0, o.startRow || 0),
    type: o.type || 'web',
    dataState: o.dataState || 'final'
  };
  const filters = [];
  if (o.country) filters.push({ dimension:'country', operator:'equals', expression:String(o.country).toLowerCase() });
  if (o.device)  filters.push({ dimension:'device',  operator:'equals', expression:String(o.device).toUpperCase() });
  if (filters.length) b.dimensionFilterGroups = [{ groupType:'and', filters }];
  return b;
}

/* ------------------------------------------------------------
   PAGINATION
   This endpoint has no page token: you ask for rowLimit rows at
   startRow, and a page shorter than rowLimit means you reached
   the end. Everything else is a guard against pulling forever.
   ------------------------------------------------------------ */
async function gscPageAll(fetchJson, site, opts){
  const maxRows  = opts.maxRows  || 100000;
  const maxPages = opts.maxPages || 20;
  const rows = [];
  let startRow = 0, pages = 0, meta = null;

  while (true){
    const body = gscBody(Object.assign({}, opts, { startRow }));
    const j = await fetchJson(gscQueryUrl(site), body);
    const got = (j && j.rows) || [];
    if (j && j.metadata) meta = j.metadata;
    rows.push(...got);
    pages++;
    if (got.length < body.rowLimit) break;
    startRow += got.length;
    if (rows.length >= maxRows || pages >= maxPages) break;
  }

  return {
    rows: rows.slice(0, maxRows),
    dimensions: (opts.dimensions || []).slice(),
    pages,
    truncated: rows.length > maxRows || pages >= maxPages,
    /* Google flags where a range stops being settled. Passing it on lets the stage
       say "the last two days are still filling in" instead of the user wondering. */
    firstIncomplete: (meta && (meta.first_incomplete_date || meta.firstIncompleteDate)) || null
  };
}

/* The response, shaped for jsonToMatrix(). Attaching the dimensions we actually
   requested matters: without them jsonToMatrix infers column names from the values,
   which is right most of the time and wrong exactly when a query looks like a URL. */
function gscToJson(result){
  return JSON.stringify({ rows: result.rows, dimensions: result.dimensions });
}

function gscDatasetName(preset, range, site){
  const host = String(site || '').replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `Search Console · ${preset.label} · ${range.startDate} to ${range.endDate}${host ? ' · ' + host : ''}`;
}

/* ------------------------------------------------------------
   PROPERTIES
   sites.list returns every property on the account, in no useful
   order. Float the project's own domain to the top and drop the
   ones the account cannot read data from.
   ------------------------------------------------------------ */
function gscPickSites(list, domain){
  const host = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
  const entries = ((list && list.siteEntry) || [])
    .filter(s => s && s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser')
    .map(s => {
      const h = s.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
      return { siteUrl: s.siteUrl, host: h, permission: s.permissionLevel,
               isDomainProperty: /^sc-domain:/.test(s.siteUrl),
               matches: !!host && (h === host || h.endsWith('.' + host) || host.endsWith('.' + h)) };
    });
  entries.sort((a, b) => (b.matches - a.matches) || a.host.localeCompare(b.host));
  return entries;
}

/* ------------------------------------------------------------
   ERRORS
   Every message says what the user can do about it. A raw
   Google error string on its own tells them nothing.
   ------------------------------------------------------------ */
function gscErrorMessage(status, body){
  const msg = (body && body.error && body.error.message) || '';
  if (status === 401)
    return 'The Google session has expired. Connect again — these tokens are deliberately short-lived and nothing is stored between sessions.';
  if (status === 403 && /insufficient|scope/i.test(msg))
    return 'That account is signed in but has not granted read access to Search Console. Connect again and accept the read-only permission.';
  if (status === 403 && /quota|rate/i.test(msg))
    return 'Google is limiting requests for this property. The per-site limit is 1,200 queries a minute; wait a moment and retry.';
  if (status === 403)
    return 'Google refused the request' + (msg ? ': ' + msg : '. The account may not have access to this property.');
  if (status === 404)
    return 'Google does not recognise that property. Pick it from the list rather than typing it — a URL-prefix property and a domain property are different things.';
  if (status === 429)
    return 'Rate limited by Google. The per-site limit is 1,200 queries a minute; wait a moment and retry.';
  if (status === 400)
    return 'Google rejected the request' + (msg ? ': ' + msg : '.') + ' Search appearance cannot be combined with other dimensions, which is the usual cause.';
  if (status >= 500)
    return 'Search Console returned a server error. That is on Google\'s side — retry in a minute.';
  return msg || ('Search Console returned HTTP ' + status + '.');
}

/* ============================================================
   AI ASSIST — bring your own key
   (c) 2026 Syed.ai. All rights reserved.

   THE ONE RULE THIS FILE EXISTS TO ENFORCE
   ----------------------------------------
   Nothing a language model writes is evidence. The whole product
   is built on three provenance classes that are never merged:

     OBSERVED   Search Console said it
     REPORTED   Semrush said it
     RECORDED   a human saw it and wrote it down

   This adds a fourth, GENERATED, and it is deliberately the only
   one that no score, pillar, gate or action rank can read. A model
   can explain a finding, rewrite a paragraph, or draft a summary.
   It cannot contribute a number, and it cannot make a page look
   better than the measurements say it is. Every prompt below says
   so to the model as well, because a model asked for a metric will
   invent one, and an invented metric in an SEO report is the exact
   failure this tool was built to avoid.

   WHY THE KEY CAN BE IN THE BROWSER
   ---------------------------------
   It is the CUSTOMER'S OWN key, entered by them, stored only in
   their browser, and sent only to the provider they chose. That is
   the "bring your own key" pattern, and it is the reason this can
   work with no server at all — unlike Semrush, whose key travels
   in a URL and therefore cannot ever be client-side.

   Anthropic supports it explicitly: the
   anthropic-dangerous-direct-browser-access header switches CORS
   on for exactly this case. The other providers are less settled,
   so nothing here asserts what they do — aiProbe() finds out at
   run time and the stage reports what it found. When a provider
   will not answer a browser, the optional server proxies it.

   The transport is injected, so all of this is testable in node.
   ============================================================ */

/* ---------- providers ---------- */

/* browserDirect:
     'yes'      documented and supported (Anthropic's header)
     'probe'    may work; find out by asking, do not claim
   Nothing in this table is a promise about a third party's CORS
   policy. aiProbe() is the source of truth at run time. */
const AI_PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    browserDirect: 'yes',
    keysAt: 'https://console.anthropic.com/settings/keys',
    keyHint: 'starts sk-ant-',
    defaultModel: 'claude-sonnet-4-5',
    modelsNote: 'Any model id your key can reach. Sonnet is the sensible default; Haiku is cheaper for explanations.',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    headers: key => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      /* This is what makes a browser call possible at all. The name is
         Anthropic's, and the "dangerous" in it refers to shipping YOUR key in
         a public page — not to a user entering their own. */
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: user }],
    }),
    parse: j => {
      const text = (j && Array.isArray(j.content) ? j.content : [])
        .filter(b => b && b.type === 'text').map(b => b.text).join('');
      const u = (j && j.usage) || {};
      return { text, inTokens: u.input_tokens ?? null, outTokens: u.output_tokens ?? null,
               stop: (j && j.stop_reason) || null };
    },
    errorOf: j => (j && j.error && (j.error.message || j.error.type)) || null,
  },

  openai: {
    id: 'openai',
    label: 'OpenAI',
    browserDirect: 'probe',
    keysAt: 'https://platform.openai.com/api-keys',
    keyHint: 'starts sk-',
    defaultModel: 'gpt-4.1-mini',
    modelsNote: 'Any chat model id your key can reach.',
    endpoint: () => 'https://api.openai.com/v1/chat/completions',
    headers: key => ({ 'content-type': 'application/json', authorization: 'Bearer ' + key }),
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    parse: j => {
      const c = j && j.choices && j.choices[0];
      const u = (j && j.usage) || {};
      return { text: (c && c.message && c.message.content) || '',
               inTokens: u.prompt_tokens ?? null, outTokens: u.completion_tokens ?? null,
               stop: (c && c.finish_reason) || null };
    },
    errorOf: j => (j && j.error && j.error.message) || null,
  },

  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    browserDirect: 'probe',
    keysAt: 'https://aistudio.google.com/apikey',
    keyHint: 'from AI Studio',
    defaultModel: 'gemini-2.5-flash',
    modelsNote: 'Any model id your key can reach. Flash is the cheap one.',
    /* The key goes in a header, not the query string. Putting it in the URL
       would land it in referrers and logs — the same mistake that makes the
       Semrush key impossible to use from a browser. */
    endpoint: model => 'https://generativelanguage.googleapis.com/v1beta/models/' +
                       encodeURIComponent(model) + ':generateContent',
    headers: key => ({ 'content-type': 'application/json', 'x-goog-api-key': key }),
    body: (model, system, user, maxTokens) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    }),
    parse: j => {
      const cand = j && j.candidates && j.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const u = (j && j.usageMetadata) || {};
      return { text: parts.map(p => p && p.text).filter(Boolean).join(''),
               inTokens: u.promptTokenCount ?? null, outTokens: u.candidatesTokenCount ?? null,
               stop: (cand && cand.finishReason) || null };
    },
    errorOf: j => (j && j.error && j.error.message) || null,
  },

  /* Anything that speaks the OpenAI chat shape: OpenRouter, Groq, Together, a
     local Ollama or llama.cpp. A local model means the draft never leaves the
     machine at all, which for some clients is the only acceptable answer. */
  compatible: {
    id: 'compatible',
    label: 'Other (OpenAI-compatible)',
    browserDirect: 'probe',
    keysAt: '',
    keyHint: 'whatever that service issues; blank is fine for a local model',
    defaultModel: '',
    modelsNote: 'Give the base URL and the model id. Works with OpenRouter, Groq, Together, Ollama and llama.cpp.',
    needsBaseUrl: true,
    endpoint: (model, baseUrl) => String(baseUrl || '').replace(/\/+$/, '') + '/chat/completions',
    headers: key => {
      const h = { 'content-type': 'application/json' };
      if (key) h.authorization = 'Bearer ' + key;
      return h;
    },
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    parse: j => AI_PROVIDERS.openai.parse(j),
    errorOf: j => AI_PROVIDERS.openai.errorOf(j),
  },
};

const AI_MAX_TOKENS = 2000;

/* ---------- keeping the key out of everything ---------- */

/* A key that reaches a toast, a console line, a saved run or a bug report is a
   key the customer has to rotate. Every string that could contain one goes
   through this first, and the tests assert it. */
function aiRedact(s, key){
  let out = String(s == null ? '' : s);
  const k = String(key || '');
  if (k.length >= 8){
    out = out.split(k).join('[key redacted]');
    /* Providers echo a truncated key back in some errors, so the first and
       last few characters are worth removing too. */
    const head = k.slice(0, 8), tail = k.slice(-6);
    if (head) out = out.split(head).join('[key]');
    if (tail) out = out.split(tail).join('[key]');
  }
  /* And a belt-and-braces sweep for anything key-shaped that arrived from
     somewhere else entirely. */
  return out.replace(/\b(sk-[A-Za-z0-9_\-]{12,}|AIza[A-Za-z0-9_\-]{20,})\b/g, '[key redacted]');
}

/* ---------- cost, honestly estimated ---------- */

/* Four characters per token is the rough English average. It is an estimate
   and every label that shows it says "about" — the provider's own dashboard is
   the only authority on what was actually billed. */
function aiTokenEstimate(text){
  const s = String(text || '');
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/* Prices change, so there is no built-in price table: the operator types the
   two numbers off their provider's pricing page and this does the arithmetic.
   A wrong number the user typed is better than a stale number we shipped. */
function aiCostEstimate(inTokens, outTokens, rates){
  const r = rates || {};
  const inRate = Number(r.inPerM), outRate = Number(r.outPerM);
  if (!isFinite(inRate) || !isFinite(outRate) || (!inRate && !outRate)) return null;
  return ((inTokens || 0) / 1e6) * inRate + ((outTokens || 0) / 1e6) * outRate;
}

/* ---------- the request ---------- */

function aiRequest(providerId, key, model, system, user, opts){
  const p = AI_PROVIDERS[providerId];
  if (!p) throw new Error('Unknown AI provider: ' + providerId);
  const o = opts || {};
  const m = String(model || p.defaultModel || '').trim();
  if (!m) throw new Error('No model id. ' + (p.modelsNote || ''));
  if (p.needsBaseUrl && !o.baseUrl) throw new Error('This provider needs a base URL, ending in /v1.');
  return {
    url: p.endpoint(m, o.baseUrl),
    headers: p.headers(key),
    body: p.body(m, system, user, o.maxTokens || AI_MAX_TOKENS),
  };
}

/* aiCall takes its transport so the whole path is testable without a network
   and without a key. fetchJson(url, {method, headers, body}) resolves to
   { status, json } or throws for a transport failure. */
async function aiCall(fetchJson, providerId, key, model, system, user, opts){
  const p = AI_PROVIDERS[providerId];
  const req = aiRequest(providerId, key, model, system, user, opts);
  let res;
  try {
    res = await fetchJson(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  } catch (e){
    /* A CORS refusal arrives here as a TypeError with no status — the browser
       will not tell a page why. Saying so plainly beats "failed to fetch". */
    throw new Error(aiRedact(aiTransportMessage(e, providerId), key));
  }
  const status = res && res.status;
  const json = res && res.json;
  if (status < 200 || status >= 300){
    const detail = (p && p.errorOf(json)) || '';
    throw new Error(aiRedact(aiErrorMessage(status, detail, providerId), key));
  }
  const parsed = p.parse(json);
  if (!parsed.text) throw new Error('The model returned nothing. Try a shorter input, or a different model id.');
  /* Tokens are only reported by some providers; an estimate is marked as one
     rather than quietly presented as a measurement. */
  const estimated = parsed.inTokens == null || parsed.outTokens == null;
  return {
    text: parsed.text,
    inTokens: parsed.inTokens != null ? parsed.inTokens : aiTokenEstimate(system + user),
    outTokens: parsed.outTokens != null ? parsed.outTokens : aiTokenEstimate(parsed.text),
    tokensEstimated: estimated,
    truncated: parsed.stop === 'max_tokens' || parsed.stop === 'length' || parsed.stop === 'MAX_TOKENS',
    provider: providerId,
    model: String(model || p.defaultModel),
  };
}

function aiTransportMessage(e, providerId){
  const p = AI_PROVIDERS[providerId] || {};
  const s = String((e && e.message) || e || '');
  if (/failed to fetch|networkerror|load failed|cors/i.test(s)){
    return p.browserDirect === 'yes'
      ? 'The request never left the browser. Check the key and that you are online.'
      : (p.label || providerId) + ' refused a request straight from a browser (a CORS block, which a page is not told the reason for). '
        + 'Use a provider that allows it, or route this through the companion server.';
  }
  return 'The request failed before it reached ' + (p.label || providerId) + ': ' + s;
}

function aiErrorMessage(status, detail, providerId){
  const p = AI_PROVIDERS[providerId] || {};
  const d = detail ? ' ' + detail : '';
  if (status === 401 || status === 403)
    return 'That key was rejected by ' + (p.label || providerId) + '.' + d + (p.keysAt ? ' Keys: ' + p.keysAt : '');
  if (status === 404)
    return 'No such model on this key. Check the model id.' + d;
  if (status === 429)
    return 'Rate limited or out of credit at ' + (p.label || providerId) + '. Wait, or top the account up.' + d;
  if (status === 400)
    return 'The provider rejected the request.' + d;
  if (status >= 500)
    return (p.label || providerId) + ' had a server error. Nothing was charged for a 5xx, and trying again usually works.' + d;
  return 'HTTP ' + status + ' from ' + (p.label || providerId) + '.' + d;
}

/* aiProbe answers one question — will this provider talk to this browser? —
   for as few tokens as the API will accept. */
async function aiProbe(fetchJson, providerId, key, model, opts){
  const t0 = Date.now();
  try {
    const r = await aiCall(fetchJson, providerId, key, model,
      'Reply with the single word: ready.', 'ready?',
      Object.assign({}, opts, { maxTokens: 16 }));
    return { ok: true, ms: Date.now() - t0, model: r.model,
             sample: r.text.trim().slice(0, 40) };
  } catch (e){
    return { ok: false, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

/* ============================================================
   PROMPTS
   Every job gets the same guard rails, because the failure mode
   is always the same: a model asked about SEO will happily
   produce search volumes, rankings and traffic estimates it has
   no way of knowing.
   ============================================================ */

const AI_SYSTEM = [
  'You are helping an SEO practitioner read and act on an audit that has already been measured.',
  '',
  'Absolute rules:',
  '1. Use ONLY the numbers given to you in the input. Never state a metric that is not there —',
  '   no search volumes, no difficulty scores, no traffic or ranking estimates, no competitor figures.',
  '2. If something needed to answer is missing, say which measurement is missing and stop. Do not fill the gap.',
  '3. Never claim a result. You are describing what was measured and what to do about it, not predicting.',
  '4. Do not invent client names, URLs, dates or quotations.',
  '5. Plain British English. Short sentences. No marketing language, no filler, no emoji.',
  '',
  'Your output is shown to the user as a suggestion and is labelled as generated. It is never treated',
  'as evidence and never changes a score, so write it as advice a person will edit, not as a finding.',
  '',
  'When advice touches being quoted by an answer engine, it must match the published evidence',
  'below, which comes from a controlled experiment (Aggarwal et al., GEO, KDD 2024, 10,000 queries)',
  'rather than from industry convention. Do not recommend anything not on this list as if it were',
  'proven, and never recommend the two marked as not working:',
  '  quote a named source            +40%   strongest measured lever',
  '  add concrete statistics         +32%',
  '  cite outside sources            +27%,  up to +115% for a page already ranking 4th-5th',
  '  write more fluently             +28%',
  '  keyword stuffing                 -8%   ACTIVELY HARMFUL, never recommend it',
  '  adding JSON-LD schema          none    a 1,885-page controlled study found no citation lift;',
  '                                         schema is worth having for rich results, not for AI citation',
  'If asked about llms.txt, say plainly that no published evidence shows it has any effect.',
].join('\n');

/* A compact, readable rendering of only the facts the job needs. Sending the
   whole model would cost more and tempt the thing to editorialise. */
function aiFactBlock(facts){
  const lines = [];
  for (const [k, v] of Object.entries(facts || {})){
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)){
      lines.push(k + ':');
      v.slice(0, 40).forEach(item => lines.push('  - ' + (typeof item === 'string' ? item : JSON.stringify(item))));
    } else if (typeof v === 'object'){
      lines.push(k + ': ' + JSON.stringify(v));
    } else {
      lines.push(k + ': ' + v);
    }
  }
  return lines.join('\n');
}

const AI_JOBS = {
  /* The beginner's job, and the reason a lot of people will buy this. */
  explain: {
    id: 'explain',
    label: 'Explain this in plain English',
    needs: 'a finding',
    outputKind: 'prose',
    build: ctx => ({
      system: AI_SYSTEM,
      user: [
        'Explain this audit finding to someone who does not work in SEO.',
        '',
        'Write exactly three short paragraphs, no headings:',
        '1. What was measured, in everyday words.',
        '2. Why it matters for this site specifically, using only the numbers below.',
        '3. What to do first, as one concrete action.',
        '',
        'THE FINDING',
        aiFactBlock(ctx.finding),
        ctx.site ? '\nSITE\n' + aiFactBlock(ctx.site) : '',
      ].join('\n'),
    }),
  },

  /* The citation pack already writes these prompts by hand for copy-pasting
     into a chat window. This runs them in place. */
  rewrite: {
    id: 'rewrite',
    label: 'Rewrite this section',
    needs: 'a draft and a weak component',
    outputKind: 'markdown',
    build: ctx => ({
      system: AI_SYSTEM,
      user: [
        'Rewrite the passage below so it answers the measured queries more directly.',
        'Keep the author\'s voice and the factual claims exactly as they are. Do not add facts,',
        'statistics or sources. Do not lengthen it by more than a third.',
        '',
        'Return only the rewritten passage as markdown, with no preamble.',
        '',
        'WHAT THE SCORE SAYS IS WEAK',
        aiFactBlock({ component: ctx.component, why: ctx.why }),
        '',
        'MEASURED QUERIES THIS PAGE SHOULD ANSWER',
        aiFactBlock({ queries: ctx.queries }),
        '',
        'THE PASSAGE',
        String(ctx.passage || ''),
      ].join('\n'),
    }),
  },

  critique: {
    id: 'critique',
    label: 'Read my draft against the data',
    needs: 'a draft',
    outputKind: 'list',
    build: ctx => ({
      system: AI_SYSTEM,
      user: [
        'Read this draft against the queries it is meant to answer.',
        'List at most six specific problems, each as one line beginning with a dash.',
        'For each, name the query or measurement it comes from. If the draft is fine on a point, do not mention it.',
        'Do not score it — a score already exists and yours would conflict with it.',
        '',
        'MEASURED QUERIES',
        aiFactBlock({ queries: ctx.queries }),
        '',
        ctx.score ? 'WHAT THE SCORER ALREADY FOUND\n' + aiFactBlock(ctx.score) + '\n' : '',
        'THE DRAFT',
        String(ctx.draft || '').slice(0, 24000),
      ].join('\n'),
    }),
  },

  /* What an agency actually sends a client. */
  narrative: {
    id: 'narrative',
    label: 'Write the client summary',
    needs: 'a completed run',
    outputKind: 'markdown',
    build: ctx => ({
      system: AI_SYSTEM,
      user: [
        'Write the opening summary of an SEO report for a client who is not technical.',
        '',
        'Structure: one short paragraph on where the site stands, then "What we found" as three to five',
        'bullets, then "What we are doing next" as three bullets in priority order.',
        'Every number must come from the input. Do not promise rankings or traffic.',
        'Where a measurement is missing, say it is not yet measured rather than leaving it out.',
        '',
        'THE RUN',
        aiFactBlock(ctx.run),
        '',
        'THE TOP ACTIONS ALREADY RANKED BY THE TOOL',
        aiFactBlock({ actions: ctx.actions }),
      ].join('\n'),
    }),
  },

  /* Cheap, low-risk, and it makes the topics stage far more readable. */
  label: {
    id: 'label',
    label: 'Name these topic clusters',
    needs: 'clusters',
    outputKind: 'list',
    build: ctx => ({
      system: AI_SYSTEM,
      user: [
        'Give each group of search queries below a short human name: two to five words, no title case,',
        'no invented product names. Return one line per group as "id: name" and nothing else.',
        '',
        aiFactBlock({ groups: ctx.clusters }),
      ].join('\n'),
    }),
  },
};

/* ============================================================
   PROVENANCE
   A generated result is a record like any other, except that it
   carries no measurements and is stamped so nothing downstream
   can mistake it for one.
   ============================================================ */

const AI_PROVENANCE = 'GENERATED';

function aiResultRecord(jobId, out, ctxLabel){
  return {
    provenance: AI_PROVENANCE,
    job: jobId,
    about: String(ctxLabel || ''),
    text: String((out && out.text) || ''),
    provider: (out && out.provider) || '',
    model: (out && out.model) || '',
    inTokens: (out && out.inTokens) || 0,
    outTokens: (out && out.outTokens) || 0,
    tokensEstimated: !!(out && out.tokensEstimated),
    truncated: !!(out && out.truncated),
    at: Date.now(),
    /* Read by the guard test. If this is ever false, something has started
       treating generated text as a measurement. */
    scores: false,
  };
}

/* aiIsEvidence exists so the answer is in one place and is always no.
   Anything that computes a score calls this before using a record. */
function aiIsEvidence(rec){
  return !!rec && rec.provenance !== AI_PROVENANCE && rec.scores !== false;
}

/* ============================================================
   SNAPSHOTS — a dated file you can still read in a year
   (c) 2026 Syed.ai. All rights reserved.

   The tool already saves a run every time the analysis is
   pressed, and already compares two of them. What it could not do
   is compare across TIME in the way the work actually happens:
   runs live in one browser's IndexedDB, so a baseline from last
   September is gone the moment you change laptop, clear site data
   or hand the project to a colleague.

   A snapshot fixes that. It is one small, self-describing JSON
   file per run, with the date and time in its name, holding
   everything needed to compare against it later: the score and
   every pillar, the search totals, the ranked actions, and — this
   is the part that matters — WHICH FILES produced it. A comparison
   between two numbers measured from different inputs is not a
   trend, and the only way to know is to record the inputs.

   THREE RULES, all of them the same rule the scorer follows.

   1. UNMEASURED IS NOT ZERO. If a pillar had no data in one of
      the two snapshots, the delta is null and carries a note
      saying so. It is never shown as a fall to zero, which is
      what a naive subtraction would report and what would have
      an operator apologising for a collapse that never happened.

   2. LOWER IS BETTER FOR POSITION. Every measure declares its own
      direction, so "improved" is computed rather than assumed.

   3. THE FILE SAYS WHAT IT IS. Format, version, when, from what.
      A file that cannot describe itself is not an archive, it is
      a blob you will not trust in eighteen months.
   ============================================================ */

const SNAP_FORMAT = 'search-evidence-suite/snapshot';
const SNAP_VERSION = 1;

/* ---------- time, written the way a filename wants it ---------- */

function snapIso(ms){
  return new Date(ms == null ? Date.now() : ms).toISOString();
}

/* 2026-09-03-1445. Sorts correctly in a file listing, which is the whole
   point of putting the date first. */
function snapStamp(ms){
  const d = new Date(ms == null ? Date.now() : ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
       + '-' + p(d.getHours()) + p(d.getMinutes());
}

function snapSlug(s){
  /* The project's domain field accepts a bare host OR a full URL, so
     everything from the first slash onwards is dropped before slugging.
     Without that, a filename carries a page path in it. */
  const host = String(s || '').trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .split(/[\/?#]/)[0];
  return host.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';
}

/* ---------- building one ---------- */

/* ctx is the same object the report builder takes, so a snapshot can never
   describe something the report does not. */
function buildSnapshot(ctx, opts){
  const o = opts || {};
  const at = o.at == null ? Date.now() : o.at;
  const cfg = ctx.cfg || {};
  const score = ctx.score || null;
  const find = ctx.find || null;
  const snap = find && find.snapshot ? find.snapshot : null;

  const totals = t => t ? {
    clicks: t.clicks == null ? null : t.clicks,
    impressions: t.impr == null ? null : t.impr,
    ctr: t.ctr == null ? null : t.ctr,
    position: t.pos == null ? null : t.pos,
    rows: t.n == null ? null : t.n,
  } : null;

  return {
    format: SNAP_FORMAT,
    version: SNAP_VERSION,
    exportedAt: snapIso(at),
    at,
    app: { name: 'Search Evidence Suite', build: o.build || '' },

    project: {
      name: o.projectName || '',
      domain: cfg.domain || '',
      brand: cfg.brand || '',
      market: cfg.market || cfg.country || '',
      searchType: cfg.searchType || '',
      device: cfg.device || '',
    },

    /* What the numbers below were measured from. Two snapshots taken from
       different report types are not comparable and this is what says so. */
    measurement: {
      basis: snap ? snap.basis : 'no',
      hasComparison: !!(find && find.hasComparison),
      curve: find && find.curveInfo ? find.curveInfo.source : null,
    },

    totals: totals(snap && snap.current),
    previousPeriod: totals(snap && snap.previous),
    /* The same window a year earlier, when it was imported. Null when it was
       not, which is different from "unchanged". */
    yearAgo: totals(snap && snap.yoy),

    score: score ? {
      overall: score.overall,
      /* Which weighting produced this number. Without it, a change to the
         pillar weights would show up months later as a client's score moving
         on its own, and nothing in the file would say why. */
      model: score.model != null ? score.model : 1,
      measuredPillars: score.measured,
      coverageNote: score.coverageNote || '',
      pillars: (score.pillars || []).map(p => ({
        key: p.key, name: p.name, weight: p.weight,
        score: p.score,                        // null when not measured — kept null
        needs: p.score == null ? (p.needs || '') : '',
      })),
    } : null,

    counts: {
      actions: ctx.actions ? ctx.actions.length : 0,
      issues: ctx.issues ? ctx.issues.length : 0,
      topics: ctx.clusters ? ctx.clusters.length : 0,
      pages: ctx.crawl && ctx.crawl.pages ? ctx.crawl.pages.length : 0,
      datasets: (o.datasets || []).length,
    },

    /* Enough of the queue to see what closed and what appeared, without
       carrying the whole model. */
    actions: (ctx.actions || []).slice(0, 100).map((a, i) => ({
      rank: i + 1,
      decision: a.decision || '',
      target: a.targetRaw || a.target || '',
      impact: a.impact == null ? null : Math.round(a.impact),
      effort: a.effort || '',
      basis: a.basis || '',
      evidence: (a.evidence || [])[0] || '',
    })),

    sources: (o.datasets || []).map(d => ({
      name: d.name || '', kind: d.kind || '', period: d.period || 'current',
      rows: d.rows ? d.rows.length : null,
    })),
  };
}

function snapshotFilename(snap){
  const host = snapSlug(snap && snap.project ? snap.project.domain : '');
  return host + '-snapshot-' + snapStamp(snap ? snap.at : null) + '.json';
}

/* ---------- reading one back ---------- */

function parseSnapshot(text){
  let obj;
  try { obj = JSON.parse(String(text || '')); }
  catch (e){ throw new Error('That file is not readable JSON.'); }
  if (!obj || typeof obj !== 'object') throw new Error('That file does not contain a snapshot.');
  if (obj.format !== SNAP_FORMAT){
    /* A project backup is a different, larger file and people will mix them
       up, so say which one they picked rather than "invalid". */
    if (obj.format === 'search-evidence-console/project')
      throw new Error('That is a whole-project backup, not a snapshot. Import it from the Project stage instead.');
    throw new Error('That file is not a Search Evidence Suite snapshot.');
  }
  if (!(obj.version <= SNAP_VERSION))
    throw new Error('That snapshot was written by a newer version of the tool (v' + obj.version + '). Update before importing it.');
  if (!obj.at || !obj.score) throw new Error('That snapshot is missing its date or its score.');
  return obj;
}

/* A saved run is a snapshot's smaller cousin; this lets the comparison treat
   the two identically instead of having two code paths. */
function runToSnapshot(run, cfg, projectName){
  return {
    format: SNAP_FORMAT, version: SNAP_VERSION,
    exportedAt: snapIso(run.at), at: run.at,
    app: { name: 'Search Evidence Suite', build: '' },
    project: { name: projectName || '', domain: (cfg && cfg.domain) || '', brand: '', market: '', searchType: '', device: '' },
    measurement: { basis: 'run', hasComparison: false, curve: null },
    totals: run.snapshot ? {
      clicks: run.snapshot.clicks, impressions: run.snapshot.impr,
      ctr: run.snapshot.ctr, position: run.snapshot.pos, rows: run.snapshot.n,
    } : null,
    previousPeriod: null,
    score: { overall: run.overall, measuredPillars: null, coverageNote: '',
             pillars: (run.pillars || []).map(p => ({ key: p.key, name: p.key, weight: null, score: p.score, needs: '' })) },
    counts: run.counts || {},
    actions: [],
    sources: [],
    fromSavedRun: true,
  };
}

/* ---------- comparing two ---------- */

/* Every measure declares whether up is good, because position is the one
   where it is not and a generic "delta > 0 means better" is simply wrong. */
const SNAP_MEASURES = [
  { key: 'clicks',      label: 'Clicks',           path: 'clicks',      lowerIsBetter: false, kind: 'int' },
  { key: 'impressions', label: 'Impressions',      path: 'impressions', lowerIsBetter: false, kind: 'int' },
  { key: 'ctr',         label: 'Click-through',    path: 'ctr',         lowerIsBetter: false, kind: 'pct' },
  { key: 'position',    label: 'Average position', path: 'position',    lowerIsBetter: true,  kind: 'pos' },
];

function snapDelta(a, b, lowerIsBetter){
  if (a == null || b == null)
    return { a, b, delta: null, pct: null, direction: 'unknown',
             note: a == null && b == null ? 'Not measured in either snapshot.'
                 : a == null ? 'Not measured in the earlier snapshot, so there is nothing to compare against.'
                 : 'Not measured in the later snapshot, so this cannot be compared.' };
  const delta = b - a;
  const pct = a === 0 ? null : delta / Math.abs(a);
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return { a, b, delta, pct,
           direction: Math.abs(delta) < 1e-12 ? 'flat' : better ? 'better' : 'worse', note: '' };
}

function compareSnapshots(x, y){
  /* Order by date, not by which argument came first: a user picking two files
     from a folder will pick them in whatever order they see them. */
  const [a, b] = (x.at <= y.at) ? [x, y] : [y, x];
  const days = Math.round((b.at - a.at) / 864e5);

  const warnings = [];
  const dom = s => (s.project && s.project.domain || '').toLowerCase();
  if (dom(a) && dom(b) && dom(a) !== dom(b))
    warnings.push('These snapshots are for different domains (' + dom(a) + ' and ' + dom(b) + '). Nothing below is a trend.');
  const basis = s => (s.measurement && s.measurement.basis) || '';
  if (basis(a) && basis(b) && basis(a) !== basis(b) && basis(a) !== 'run' && basis(b) !== 'run')
    warnings.push('One was measured from a ' + basis(a) + ' export and the other from a ' + basis(b) +
                  ' export. The totals are not like for like.');
  if (a.fromSavedRun || b.fromSavedRun)
    warnings.push('One side is a saved run rather than an exported snapshot, so it carries the score and the totals but not the action queue.');
  /* A score compared across two different weightings is not a trend. The
     traffic figures either side are still perfectly comparable, so the
     comparison goes ahead — but the score line says not to read it. */
  const model = s => (s.score && s.score.model != null) ? s.score.model : (s.score ? 1 : null);
  if (model(a) != null && model(b) != null && model(a) !== model(b))
    warnings.push('These were scored by different versions of the model (v' + model(a) + ' and v' +
                  model(b) + '), so the change in the score is partly arithmetic. The traffic figures below are unaffected.');

  const totals = {};
  for (const m of SNAP_MEASURES){
    const av = a.totals ? a.totals[m.path] : null;
    const bv = b.totals ? b.totals[m.path] : null;
    totals[m.key] = Object.assign({ label: m.label, kind: m.kind, lowerIsBetter: m.lowerIsBetter },
                                  snapDelta(av, bv, m.lowerIsBetter));
  }

  const sa = a.score || {}, sb = b.score || {};
  const overall = Object.assign({ label: 'Health score', kind: 'int', lowerIsBetter: false },
                                snapDelta(sa.overall == null ? null : sa.overall,
                                          sb.overall == null ? null : sb.overall, false));

  /* Pillars are matched by key, and a pillar present in one snapshot and
     absent from the other is reported as exactly that. */
  const keys = [];
  for (const p of (sa.pillars || [])) if (!keys.includes(p.key)) keys.push(p.key);
  for (const p of (sb.pillars || [])) if (!keys.includes(p.key)) keys.push(p.key);
  const pillars = keys.map(k => {
    const pa = (sa.pillars || []).find(p => p.key === k);
    const pb = (sb.pillars || []).find(p => p.key === k);
    const d = snapDelta(pa ? pa.score : null, pb ? pb.score : null, false);
    if (!d.note && !pa) d.note = 'Not present in the earlier snapshot.';
    /* Append what it would have needed rather than replacing the explanation:
       "not measured" says why there is no number, the needs text says how to
       get one, and both are worth having. */
    const needs = (pb && pb.score == null && pb.needs) || (pa && pa.score == null && pa.needs) || '';
    if (needs) d.note = (d.note ? d.note + ' ' : '') + 'Needs: ' + needs + '.';
    return Object.assign({ key: k, name: (pb && pb.name) || (pa && pa.name) || k,
                           weight: (pb && pb.weight) != null ? pb.weight : (pa && pa.weight) }, d);
  });

  /* What moved on the queue. Keyed on decision plus target, which is how the
     queue itself de-duplicates, so "the same action" means the same thing
     here as it does there. */
  const key = x => (x.decision || '') + '::' + (x.target || '');
  const aMap = new Map((a.actions || []).map(x => [key(x), x]));
  const bMap = new Map((b.actions || []).map(x => [key(x), x]));
  const closed = [...aMap.values()].filter(x => !bMap.has(key(x)));
  const opened = [...bMap.values()].filter(x => !aMap.has(key(x)));
  const carried = [...bMap.values()].filter(x => aMap.has(key(x))).map(x => {
    const was = aMap.get(key(x));
    return Object.assign({}, x, { wasRank: was.rank, rankMove: was.rank - x.rank });
  });

  const haveQueues = (a.actions || []).length > 0 && (b.actions || []).length > 0;

  return {
    from: a, to: b, days,
    label: new Date(a.at).toLocaleDateString() + ' → ' + new Date(b.at).toLocaleDateString(),
    yearOverYear: days >= 330 && days <= 400,
    overall, pillars, totals,
    actions: haveQueues ? { closed, opened, carried } : null,
    counts: {
      actions: snapDelta(a.counts ? a.counts.actions : null, b.counts ? b.counts.actions : null, true),
      issues: snapDelta(a.counts ? a.counts.issues : null, b.counts ? b.counts.issues : null, true),
      topics: snapDelta(a.counts ? a.counts.topics : null, b.counts ? b.counts.topics : null, false),
      pages: snapDelta(a.counts ? a.counts.pages : null, b.counts ? b.counts.pages : null, false),
    },
    warnings,
  };
}

/* ---------- windows ---------- */

/* The same length of window, one year earlier, shifted by 364 days rather
   than 365 so that Monday still lines up with Monday. Search traffic is
   strongly weekly, and a 365-day shift compares a Tuesday to a Wednesday and
   calls the difference a trend. */
function snapYearAgo(range, days){
  const shift = 364 * 864e5;
  const start = new Date(new Date(range.startDate + 'T00:00:00Z').getTime() - shift);
  const end = new Date(new Date(range.endDate + 'T00:00:00Z').getTime() - shift);
  const iso = d => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end), label: 'same window, 52 weeks earlier' };
}

/* ============================================================
   XLSX — a real Excel workbook, with no library
   (c) 2026 Syed.ai. All rights reserved.

   CSV was the only export, and CSV loses the two things that
   matter when you hand numbers to a client or a finance team: it
   holds one table, and it has no types, so a position of 4.0
   arrives as text in one locale and a date in another.

   An .xlsx file is a zip of XML. The zip writer already ships in
   this build (it is what packages the image bundle), so the whole
   format costs a few hundred lines of string building and no
   dependency at all. What is written here is the minimum a
   spreadsheet needs and nothing more: no styles, no themes, no
   calcChain. Excel, Numbers, LibreOffice and Google Sheets all
   open it.

   Two decisions worth knowing about:

   - Numbers are written as numbers and text as inline strings.
     There is no shared-string table, which costs some file size
     on a big sheet and removes an entire class of corruption
     (an index into a table that does not match the table).
   - A null is written as an EMPTY CELL, never as 0 and never as
     the word "null". The whole product refuses to turn an
     unmeasured value into a zero, and a spreadsheet is exactly
     where that lie would get summed.
   ============================================================ */

function xlsxEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* Control characters are not legal in XML at all and will make Excel
       declare the file corrupt rather than skip them. */
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/* 0 -> A, 25 -> Z, 26 -> AA. */
function xlsxCol(i){
  let s = '';
  i = Math.max(0, i | 0);
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}

function xlsxIsNumber(v){
  return typeof v === 'number' && isFinite(v);
}

/* A sheet name Excel will accept: 31 characters, and none of []:*?/\ */
function xlsxSheetName(name, fallback){
  let s = String(name == null ? '' : name).replace(/[\[\]:*?\/\\]/g, ' ').trim();
  if (!s) s = fallback || 'Sheet';
  return s.slice(0, 31);
}

/* rows is an array of arrays. The first row is treated as a header only in
   that it is frozen; nothing here interprets its contents. */
function xlsxSheetXml(rows, opts){
  const o = opts || {};
  const body = (rows || []).map((row, r) => {
    const cells = (row || []).map((v, c) => {
      const ref = xlsxCol(c) + (r + 1);
      if (v == null || v === '') return '';          // an empty cell, deliberately
      if (xlsxIsNumber(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');

  const widest = (rows || []).reduce((m, r) => Math.max(m, (r || []).length), 0);
  const dim = widest ? `<dimension ref="A1:${xlsxCol(widest - 1)}${Math.max(1, (rows || []).length)}"/>` : '';
  /* Freeze the header row and switch on the filter buttons: on a sheet of a
     hundred actions, both are the difference between a table and a wall. */
  const pane = o.freezeHeader === false ? '' :
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  const cols = (o.widths && o.widths.length)
    ? '<cols>' + o.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
    : '';
  const filter = (o.autoFilter === false || !widest || !(rows || []).length) ? '' :
    `<autoFilter ref="A1:${xlsxCol(widest - 1)}${rows.length}"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${dim}${pane}${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`;
}

/* sheets: [{ name, rows, widths?, freezeHeader?, autoFilter? }]
   Returns the entries the zip writer takes: { name, bytes }. */
function xlsxEntries(sheets){
  const list = (sheets || []).filter(s => s && s.rows);
  if (!list.length) throw new Error('A workbook needs at least one sheet.');

  /* Duplicate sheet names make Excel refuse the file outright, so they are
     de-duplicated here rather than trusted. */
  const used = new Set();
  const named = list.map((s, i) => {
    let n = xlsxSheetName(s.name, 'Sheet' + (i + 1));
    let k = 2;
    while (used.has(n.toLowerCase())) n = xlsxSheetName(n.slice(0, 28) + ' ' + k++, 'Sheet' + (i + 1));
    used.add(n.toLowerCase());
    return Object.assign({}, s, { name: n });
  });

  const enc = typeof TextEncoder !== 'undefined'
    ? (s => new TextEncoder().encode(s))
    : (s => Buffer.from(s, 'utf8'));   // node, for the tests

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${named.map((s, i) => `<sheet name="${xlsxEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n')}
</sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
</Relationships>`;

  const entries = [
    { name: '[Content_Types].xml', bytes: enc(contentTypes) },
    { name: '_rels/.rels', bytes: enc(rootRels) },
    { name: 'xl/workbook.xml', bytes: enc(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', bytes: enc(wbRels) },
  ];
  named.forEach((s, i) => {
    entries.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', bytes: enc(xlsxSheetXml(s.rows, s)) });
  });
  return entries;
}

/* The browser half: zip the entries with the writer that already exists.
   makeZip is declared in 05f-imagekit.js and is available at call time. */
async function makeXlsx(sheets){
  if (typeof makeZip !== 'function') throw new Error('The zip writer is not available.');
  return makeZip(xlsxEntries(sheets));
}

/* ---------- the workbook this product actually exports ---------- */

/* One sheet per question a client asks, in the order they ask them. Values
   are numbers where they are numbers, so a spreadsheet can sum and sort them
   without anyone retyping a column. */
function auditWorkbook(ctx, opts){
  const o = opts || {};
  const cfg = ctx.cfg || {};
  const score = ctx.score || null;
  const find = ctx.find || null;
  const cur = find && find.snapshot ? find.snapshot.current : null;
  const prev = find && find.snapshot ? find.snapshot.previous : null;

  const summary = [
    ['Search Evidence Suite — audit export'],
    [],
    ['Domain', cfg.domain || ''],
    ['Brand', cfg.brand || ''],
    ['Market', cfg.market || cfg.country || ''],
    ['Exported', new Date(o.at || Date.now()).toLocaleString()],
    [],
    ['Health score', score && score.overall != null ? score.overall : ''],
    ['Coverage', score ? score.coverageNote : ''],
    [],
    ['Measure', 'This period', 'Previous period'],
    ['Clicks', cur ? cur.clicks : '', prev ? prev.clicks : ''],
    ['Impressions', cur ? cur.impr : '', prev ? prev.impr : ''],
    ['Click-through', cur && cur.ctr != null ? Number((cur.ctr * 100).toFixed(2)) : '',
                      prev && prev.ctr != null ? Number((prev.ctr * 100).toFixed(2)) : ''],
    ['Average position', cur && cur.pos != null ? Number(cur.pos.toFixed(1)) : '',
                         prev && prev.pos != null ? Number(prev.pos.toFixed(1)) : ''],
    ['Rows measured', cur ? cur.n : '', prev ? prev.n : ''],
  ];

  const pillars = [['Pillar', 'Score', 'Weight %', 'Status', 'What it needs']].concat(
    (score ? score.pillars : []).map(p => [
      p.name, p.score == null ? '' : p.score, p.weight == null ? '' : p.weight,
      p.score == null ? 'Not measured' : 'Measured',
      p.score == null ? (p.needs || '') : '',
    ]));

  const actions = [['#', 'Do this', 'To this', 'Modelled impact', 'Effort', 'Basis', 'Evidence']].concat(
    (ctx.actions || []).map((a, i) => [
      i + 1,
      (typeof DECISION_LABEL !== 'undefined' && DECISION_LABEL[a.decision]) || a.decision || '',
      a.targetRaw || a.target || '',
      a.impact == null ? '' : Math.round(a.impact),
      a.effort || '', a.basis || '', (a.evidence || [])[0] || '',
    ]));

  const issues = [['Severity', 'Check', 'URL', 'Detail']].concat(
    (ctx.issues || []).map(i => [i.severity || '', i.title || '', i.url || '', i.detail || '']));

  const topics = [['Topic', 'Queries', 'Impressions', 'Status', 'Owning page', 'Opportunity']].concat(
    (ctx.clusters || []).map(c => [
      c.name || '', c.size == null ? '' : c.size, c.impr == null ? '' : c.impr,
      c.status || '', c.owner ? (c.owner.raw || c.owner.url || '') : '',
      c.opportunity == null ? '' : Math.round(c.opportunity),
    ]));

  const sources = [['File', 'Recognised as', 'Period', 'Rows']].concat(
    (o.datasets || []).map(d => [d.name || '', d.kind || '', d.period || 'current', d.rows ? d.rows.length : '']));

  const runs = [['When', 'Health', 'Clicks', 'Impressions', 'Average position', 'Actions', 'Issues']].concat(
    (ctx.runs || []).map(r => [
      new Date(r.at).toLocaleString(),
      r.overall == null ? '' : r.overall,
      r.snapshot ? r.snapshot.clicks : '',
      r.snapshot ? r.snapshot.impr : '',
      r.snapshot && r.snapshot.pos != null ? Number(r.snapshot.pos.toFixed(1)) : '',
      r.counts ? r.counts.actions : '', r.counts ? r.counts.issues : '',
    ]));

  return [
    { name: 'Summary', rows: summary, freezeHeader: false, autoFilter: false, widths: [26, 18, 18] },
    { name: 'Scorecard', rows: pillars, widths: [30, 9, 10, 14, 60] },
    { name: 'Action queue', rows: actions, widths: [5, 20, 46, 16, 9, 11, 70] },
    { name: 'Technical issues', rows: issues, widths: [11, 34, 46, 70] },
    { name: 'Topics', rows: topics, widths: [34, 9, 13, 13, 46, 13] },
    { name: 'Sources', rows: sources, widths: [40, 20, 11, 9] },
    { name: 'Run history', rows: runs, widths: [22, 9, 11, 13, 16, 10, 9] },
  ];
}

function xlsxFilename(cfg, at){
  const host = (typeof snapSlug === 'function') ? snapSlug(cfg && cfg.domain)
             : String((cfg && cfg.domain) || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const stamp = (typeof snapStamp === 'function') ? snapStamp(at) : new Date(at || Date.now()).toISOString().slice(0, 10);
  return host + '-audit-' + stamp + '.xlsx';
}

/* AI answer readiness — the sixth pillar.
   (c) 2026 Syed.ai. All rights reserved.

   Every other pillar in this tool scores things Google has told us it uses.
   This one scores something nobody has documented, so it is built the only
   honest way available: from published experiments, weighted by how good the
   experiment was, with the weak evidence marked weak and the disproved
   evidence left out entirely.

   The spine is the GEO paper (Aggarwal et al., KDD 2024, arXiv:2311.09735),
   because it is the only source here that INTERVENED rather than observed. It
   rewrote pages, served them through a real generative engine and a live
   Perplexity deployment, and measured the change against 10,000 queries. That
   is a different class of evidence from "pages that get cited tend to have X",
   which cannot separate the X from the fact that big sites do more of
   everything. Where the two disagree, the experiment wins.

   What the experiment found, as position-adjusted word count in the generated
   answer, with the Perplexity replication in brackets:

     quotations from named sources   +40%  [+22%]
     concrete statistics             +32%  [ +9%]
     citing outside sources          +27%  [  — ]   and up to +115% for pages
                                                    already ranking 4th-5th
     fluent, readable prose          +28%
     keyword stuffing                 -8%  [ -9%]   the one lever that HURT

   That last line is why this pillar can subtract. It is also the clearest
   single result in the literature: the technique the SEO industry sold for
   twenty years measurably reduces the chance of being quoted by a machine.

   What is deliberately NOT scored here, and why:

     Schema markup. Ahrefs tracked 1,885 pages that ADDED JSON-LD between
     August 2025 and March 2026 against 4,000 controls: AI Overviews -4.6%,
     AI Mode +2.4%, ChatGPT +2.2%, none of them a real effect. Cross-sectional
     studies that report "Article schema is cited 2.3x more often" are
     measuring which sites have schema, not what schema does. Schema earns its
     place in this product for rich results, which is where the evidence is —
     it is not an AI citation lever, and the model says so out loud.

     llms.txt. No published evidence of any effect. Absent, not zero-weighted.

     Freshness, except for news. The same 1,000-Overview analysis put the
     median cited page at fourteen months old. Recency is scored for news
     intent only, which this tool cannot determine from a crawl, so it is not
     scored at all.

   The retrieval side has moved fast enough that the pillar cannot be derived
   from rank. Ahrefs, February 2026, 863,000 SERPs and ~4M AI Overview URLs:
   38% of cited pages also appeared in the top ten, down from 76% in July
   2025. BrightEdge put the overlap at ~17% the same month; seoClarity found
   97% of Overviews cite at least one source from the top twenty. Those three
   cannot all be right, and this tool does not pretend to know which is — but
   every one of them says the same thing directionally: ranking top ten is no
   longer sufficient, and increasingly not necessary. So AI readiness is
   measured separately from search performance, and neither is allowed to
   stand in for the other. */

/* The record behind every metric, carried into the report so a client can see
   what the number rests on rather than being asked to trust it. */
const AI_EVIDENCE = [
  { key:'quotes', grade:'experiment',
    claim:'Adding quotations from named sources raised visibility 40% (22% on Perplexity).',
    source:'Aggarwal et al., GEO, KDD 2024', n:'10,000 queries', url:'https://arxiv.org/abs/2311.09735' },
  { key:'stats', grade:'experiment',
    claim:'Adding concrete statistics raised visibility 32%.',
    source:'Aggarwal et al., GEO, KDD 2024', n:'10,000 queries', url:'https://arxiv.org/abs/2311.09735' },
  { key:'cites', grade:'experiment',
    claim:'Citing outside sources raised visibility 27%, and up to 115% for pages ranking 4th-5th.',
    source:'Aggarwal et al., GEO, KDD 2024', n:'10,000 queries', url:'https://arxiv.org/abs/2311.09735' },
  { key:'stuffing', grade:'experiment',
    claim:'Keyword stuffing REDUCED visibility by 8% (9% on Perplexity).',
    source:'Aggarwal et al., GEO, KDD 2024', n:'10,000 queries', url:'https://arxiv.org/abs/2311.09735' },
  { key:'access', grade:'mechanism',
    claim:'A retrieval crawler that is disallowed cannot cite the page at all.',
    source:'Publisher robots.txt directives', n:'not a study — a gate', url:'' },
  { key:'passages', grade:'weak',
    claim:'Answer-shaped headings and passage structure are widely reported to help; no controlled test published.',
    source:'Practitioner analyses, contested', n:'observational', url:'' },
  { key:'schema', grade:'disproved',
    claim:'Adding JSON-LD moved AI citations by -4.6% to +2.4%, none significant. Not scored here.',
    source:'Ahrefs schema study, Aug 2025 - Mar 2026', n:'1,885 pages vs 4,000 controls',
    url:'https://ahrefs.com/blog/schema-ai-citations/' }
];

/* The crawlers worth knowing about, split by what they are FOR. Blocking a
   training crawler is a licensing decision a business is entitled to make and
   costs nothing in citations. Blocking a retrieval crawler removes the site
   from that assistant's answers outright, which is usually an accident —
   people copy a robots.txt snippet from a "block the AI scrapers" blog post
   and take out their own ChatGPT visibility with it. Only the retrieval row
   is scored; the training row is reported and left alone. */
const AI_AGENTS = [
  { ua:'OAI-SearchBot',   surface:'ChatGPT search',    role:'retrieval' },
  { ua:'ChatGPT-User',    surface:'ChatGPT browsing',  role:'retrieval' },
  { ua:'PerplexityBot',   surface:'Perplexity',        role:'retrieval' },
  { ua:'Claude-User',     surface:'Claude',            role:'retrieval' },
  { ua:'Google-Extended', surface:'Gemini grounding',  role:'retrieval' },
  { ua:'GPTBot',          surface:'OpenAI training',   role:'training'  },
  { ua:'ClaudeBot',       surface:'Anthropic training',role:'training'  },
  { ua:'CCBot',           surface:'Common Crawl',      role:'training'  },
  { ua:'Applebot-Extended', surface:'Apple training',  role:'training'  }
];

/* robots.txt matching is case-insensitive on the agent name and most specific
   group wins; a site with no rule for an agent has not blocked it, which is a
   different state from having allowed it, and the model keeps them apart. */
function aiAgentAccess(robots){
  const out = [];
  for (const a of AI_AGENTS){
    let state = 'unstated', via = null;
    if (robots && robots.groups && robots.groups.length){
      const lower = a.ua.toLowerCase();
      const exact = robots.groups.find(g => g.agents.some(x => String(x).toLowerCase() === lower));
      const star  = robots.groups.find(g => g.agents.some(x => String(x) === '*'));
      const g = exact || star;
      if (g){
        via = exact ? a.ua : '*';
        const blanket = (g.rules || []).some(r => r.type === 'disallow' && (r.path === '/' || r.path === ''));
        const anyAllow = (g.rules || []).some(r => r.type === 'allow');
        state = blanket && !anyAllow ? 'blocked' : (blanket ? 'partial' : 'allowed');
      }
    }
    out.push({ ...a, state, via });
  }
  return out;
}

/* Per-page signals. Everything here is read from what the crawl already
   collected, so a page that was imported rather than fetched reports null
   throughout rather than a flattering zero. */
const AI_STOPWORDS = new Set(('the a an and or but if then than that this these those of to in on at for with from by as is are was were be been being it its into over under about'
  + ' you your we our they their he she his her not no do does did have has had will would can could should may might must more most other some such own same so too very just').split(' '));

function pageAiSignals(p){
  if (!p || !p.contentAnalysed || p.wordCount < 60) return null;
  const per500 = p.wordCount / 500 || 1;
  const words = String(p.text || '').toLowerCase().split(/[^a-z0-9'-]+/).filter(w => w.length > 2 && !AI_STOPWORDS.has(w));

  /* Stuffing is measured on the term the page is TRYING to rank for, not on
     whichever word happens to be commonest. Ordinary prose about hard water
     will say "water" a lot; that is a subject, not a manipulation. What the
     GEO experiment penalised was repeating the target phrase past the point
     of sense, so the target is identified first — the most frequent content
     word that also appears in the title or the H1 — and only its density is
     judged. A page whose commonest word is nowhere in its own title is not
     stuffing, it is a table or a list. */
  const target = (String(p.title || '') + ' ' + String(p.h1 || '')).toLowerCase();
  let top = 0, topWord = '';
  if (words.length >= 120){
    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    for (const [w, c] of freq){
      if (c > top && target.includes(w)){ top = c; topWord = w; }
    }
  }
  const density = words.length >= 120 && topWord ? top / words.length : null;
  const heads = [p.h1, ...(p.headings || [])].filter(Boolean);
  const asks = heads.filter(h => /\?\s*$/.test(h) || /^(who|what|why|how|when|where|which|can|do|does|is|are|should|will)\b/i.test(h)).length;

  return {
    statsPer500:   (p.statHits || 0) / per500,
    quotes:        (p.attributedQuotes || 0) + Math.min(p.quoteBlocks || 0, 4),
    outbound:      p.outboundCitations || 0,
    questionHeads: asks,
    headings:      heads.length,
    structure:     (p.listCount || 0) + (p.tableCount || 0),
    leadAnswer:    p.firstPara ? p.firstPara.split(/\s+/).length : null,
    density, topWord, topCount: topWord ? top : null,
    /* Two conditions, because either alone is wrong. Density alone accuses
       short pages that mention their subject three times; a raw count alone
       accuses long, thorough pages. Five per cent of content words is roughly
       three times what unforced writing does, and ten occurrences is enough
       to rule out a short page tripping the ratio by accident. */
    stuffed: density != null && density > 0.05 && top >= 10
  };
}

/* The pillar. Each metric returns null when the crawl cannot answer it, and
   the renormalising rollup in the scorer handles the rest — an imported crawl
   with no body text scores nothing here rather than scoring badly. */
function aiReadiness(ctx, metric){
  const pages = ((ctx.crawl && ctx.crawl.pages) || [])
    .filter(p => p.status >= 200 && p.status < 300 && !p.notHtml && p.contentAnalysed);
  const sigs = pages.map(pageAiSignals).filter(Boolean);
  const access = aiAgentAccess(ctx.robots);
  const retrieval = access.filter(a => a.role === 'retrieval');
  const blocked = retrieval.filter(a => a.state === 'blocked');

  /* The access metric is the only one that can be answered without a crawl,
     because it comes from robots.txt. It is also the only one that is a gate
     rather than a nudge, so it carries the heaviest weight in the pillar. */
  const accessMetric = metric('Retrieval crawlers are allowed in',
    ctx.robots ? (retrieval.length - blocked.length) / retrieval.length : null,
    !ctx.robots ? 'No robots.txt was read, so crawler access is unknown.'
      : blocked.length ? `${blocked.map(a=>a.surface).join(', ')} cannot fetch this site, so ${blocked.length>1?'they':'it'} cannot cite it.`
      : `None of the ${retrieval.length} answer-engine crawlers are disallowed.`, 3);

  if (!sigs.length) return [accessMetric];

  const n = sigs.length;
  const share = f => sigs.filter(f).length / n;

  return [
    accessMetric,
    metric('Pages carrying quotable statistics', share(s => s.statsPer500 >= 2),
      `${Math.round(share(s => s.statsPer500 >= 2)*100)}% of pages carry two or more concrete figures per 500 words. Adding statistics raised visibility 32% in the GEO experiment.`, 3),
    metric('Pages quoting a named source', share(s => s.quotes >= 1),
      `${sigs.filter(s=>s.quotes>=1).length} of ${n} pages quote someone by name. The strongest single lever measured: +40%.`, 3),
    metric('Pages citing outside sources', share(s => s.outbound >= 2),
      `${Math.round(share(s => s.outbound >= 2)*100)}% of pages link out to at least two external sources. Worth up to +115% for pages already ranking fourth or fifth.`, 2),
    metric('Headings that ask the reader’s question', share(s => s.headings >= 2 && s.questionHeads >= 1),
      `${sigs.filter(s=>s.questionHeads>=1).length} of ${n} pages have at least one heading phrased as a question. Widely reported to help; no controlled test published, so this carries less weight than the measured levers.`, 1),
    metric('Free of keyword stuffing', 1 - share(s => s.stuffed),
      sigs.filter(s=>s.stuffed).length
        ? `${sigs.filter(s=>s.stuffed).length} pages repeat their target term above 4.5% of body words. Stuffing was the one technique the GEO experiment found actively HARMFUL, at -8%.`
        : 'No page over-repeats its target term.', 2)
  ];
}

/* ============================================================
   PERSISTENCE
   IndexedDB, one database, several projects. Everything a
   project holds (settings, parsed exports, crawls, run history)
   survives a reload, a browser restart and a machine reboot.
   Nothing leaves the browser.
   ============================================================ */
/* DB_VER 2 added the drafts store. The upgrade handler is a series of
   contains() guards, so an existing database gains the new store and keeps
   every project, dataset, crawl and run already in it. */
const DB_NAME = 'seo-suite', DB_VER = 2;
const STORES = ['projects','datasets','crawls','runs','drafts','meta'];
let _db = null, DB_OK = true;

function idb(){
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); }
    catch(e){ DB_OK = false; return rej(e); }
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', {keyPath:'id'});
      if (!db.objectStoreNames.contains('datasets')){
        const s = db.createObjectStore('datasets', {keyPath:'id'});
        s.createIndex('projectId','projectId',{unique:false});
      }
      if (!db.objectStoreNames.contains('crawls')){
        const s = db.createObjectStore('crawls', {keyPath:'id'});
        s.createIndex('projectId','projectId',{unique:false});
      }
      if (!db.objectStoreNames.contains('runs')){
        const s = db.createObjectStore('runs', {keyPath:'id'});
        s.createIndex('projectId','projectId',{unique:false});
      }
      if (!db.objectStoreNames.contains('drafts')){
        const s = db.createObjectStore('drafts', {keyPath:'id'});
        s.createIndex('projectId','projectId',{unique:false});
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'k'});
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = e => { DB_OK = false; rej(e.target.error); };
  });
}
function tx(store, mode){ return idb().then(db => db.transaction(store, mode).objectStore(store)); }
function wrap(req){ return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

const DBput  = (store, val) => tx(store,'readwrite').then(s => wrap(s.put(val)));
const DBget  = (store, key) => tx(store,'readonly').then(s => wrap(s.get(key)));
const DBdel  = (store, key) => tx(store,'readwrite').then(s => wrap(s.delete(key)));
const DBall  = (store)      => tx(store,'readonly').then(s => wrap(s.getAll()));
const DBby   = (store, pid) => tx(store,'readonly').then(s => wrap(s.index('projectId').getAll(pid)));
async function DBdelBy(store, pid){
  const rows = await DBby(store, pid);
  for (const r of rows) await DBdel(store, r.id);
  return rows.length;
}

const newId = p => (p||'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* ---------- project model ---------- */
function blankCfg(){
  return { domain:'', brand:'', country:'United States', market:'United States', gscCountry:'usa',
           semrushDb:'us', language:'English', searchType:'Web', device:'All devices',
           conversion:'', competitors:'', context:'', crawlLimit:200, clusterThreshold:0.38,
           generativeControl:'unknown', observations:[],
           /* recorded by hand from Semrush, per target: the export carries the authority of
              the LINKING pages, never the target's own. Keyed by normalised target URL. */
           linkAuthority:{}, linkTopics:{},
           /* the client ID identifies the user's own Google Cloud project; it is not a
              secret, and no token is ever stored alongside it */
           gscClientId:'', gscCountryFilter:'', gscDeviceFilter:'',
           /* null means this project has never chosen a tier, so the install
              default applies. See tierDefault() in 05k-simple.js. */
           simple:null };
}
async function listProjects(){
  const p = await DBall('projects');
  return p.sort((a,b) => (b.updated||0) - (a.updated||0));
}
async function createProject(name, cfg){
  const p = { id:newId('p'), name: name || 'Untitled project', created:Date.now(), updated:Date.now(), cfg: Object.assign(blankCfg(), cfg||{}) };
  await DBput('projects', p);
  await DBput('meta', {k:'active', v:p.id});
  return p;
}
async function saveProject(p){ p.updated = Date.now(); await DBput('projects', p); return p; }
async function deleteProject(id){
  await DBdelBy('datasets', id); await DBdelBy('crawls', id); await DBdelBy('runs', id); await DBdelBy('drafts', id);
  await DBdel('projects', id);
}
async function activeProjectId(){ const m = await DBget('meta','active'); return m && m.v; }
async function setActiveProject(id){ await DBput('meta', {k:'active', v:id}); }

/* ---------- datasets ---------- */
async function saveDataset(pid, d){
  const rec = { id: d.dbId || newId('d'), projectId: pid, name:d.name, kind:d.kind, source:d.source,
                period:d.period, headers:d.headers, rows:d.rows, domainCols:d.domainCols||null,
                mapped: !!d.mapped, addedAt: d.addedAt || Date.now() };
  d.dbId = rec.id;
  await DBput('datasets', rec);
  return rec.id;
}
const loadDatasets = pid => DBby('datasets', pid);
const deleteDataset = id => DBdel('datasets', id);

/* ---------- crawls and runs ---------- */
async function saveCrawl(pid, crawl){
  const rec = { id: crawl.dbId || newId('c'), projectId: pid, at: crawl.at || Date.now(),
                origin: crawl.origin, mode: crawl.mode, pages: crawl.pages, sitemaps: crawl.sitemaps,
                robots: crawl.robots, stats: crawl.stats };
  crawl.dbId = rec.id;
  await DBput('crawls', rec);
  return rec.id;
}
const loadCrawls = pid => DBby('crawls', pid).then(r => r.sort((a,b)=>b.at-a.at));
async function saveRun(pid, run){
  const rec = Object.assign({ id:newId('r'), projectId:pid, at:Date.now() }, run);
  await DBput('runs', rec);
  return rec;
}
const loadRuns = pid => DBby('runs', pid).then(r => r.sort((a,b)=>a.at-b.at));
const deleteRun = id => DBdel('runs', id);

/* ---------- drafts ----------
   A store of its own rather than a field on the project: drafts outnumber
   projects, and a writer working through a topic list will keep several open. */
async function saveDraft(pid, d){
  const rec = { id: d.id || newId('dr'), projectId: pid,
                title: d.title || '', text: d.text || '', clusterId: d.clusterId || '',
                created: d.created || Date.now(), updated: Date.now(),
                words: d.words || 0, score: d.score == null ? null : d.score };
  d.id = rec.id;
  await DBput('drafts', rec);
  return rec;
}
const loadDrafts = pid => DBby('drafts', pid).then(r => r.sort((a,b) => b.updated - a.updated));
const deleteDraft = id => DBdel('drafts', id);

/* ---------- portable backup ---------- */
async function exportProject(pid){
  const p = await DBget('projects', pid);
  return {
    format: 'search-evidence-console/project', version: 1, exportedAt: new Date().toISOString(),
    project: { name:p.name, created:p.created, cfg:p.cfg },
    datasets: (await loadDatasets(pid)).map(({projectId, id, ...rest}) => rest),
    crawls:   (await loadCrawls(pid)).map(({projectId, id, ...rest}) => rest),
    runs:     (await loadRuns(pid)).map(({projectId, id, ...rest}) => rest),
    drafts:   (await loadDrafts(pid)).map(({projectId, id, ...rest}) => rest)
  };
}
async function importProject(obj){
  if (!obj || obj.format !== 'search-evidence-console/project') throw new Error('That file is not a console project export.');
  const p = await createProject((obj.project && obj.project.name || 'Imported project'), obj.project && obj.project.cfg);
  for (const d of (obj.datasets||[])) await DBput('datasets', Object.assign({id:newId('d'), projectId:p.id}, d));
  for (const c of (obj.crawls||[]))   await DBput('crawls',   Object.assign({id:newId('c'), projectId:p.id}, c));
  for (const r of (obj.runs||[]))     await DBput('runs',     Object.assign({id:newId('r'), projectId:p.id}, r));
  for (const d of (obj.drafts||[]))   await DBput('drafts',   Object.assign({id:newId('dr'), projectId:p.id}, d));
  return p;
}

async function storageInfo(){
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage || 0, quota: e.quota || 0 };
  } catch(err){ return null; }
}

/* ============================================================
   UI LAYER
   ============================================================ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n==null ? '—' : (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n*10)/10).toLocaleString());
const fmtInt = n => n==null ? '—' : Math.round(n).toLocaleString();
const fmtPct = n => n==null ? '—' : (n*100).toFixed(1) + '%';
const fmtPos = n => n==null ? '—' : n.toFixed(1);
const signed = n => (n>0?'+':'') + fmtInt(n);

const FIELD_IDS = { domain:'cfgDomain', brand:'cfgBrand', country:'cfgCountry', language:'cfgLanguage',
                    searchType:'cfgSearchType', device:'cfgDevice', conversion:'cfgConversion',
                    competitors:'cfgCompetitors', context:'cfgContext', generativeControl:'cfgGenerative' };
let CFG = blankCfg();
let PROJECT = null, PROJECTS = [];
let DATASETS = [], MODEL = null, FIND = null, GATES = [], TARGET = 'claude', EVROWS = 40, FILTERS = [];
let CLUST = null, PAGEMAP = null, CRAWL = null, ISSUES = [], BACKLINKS = null, SCORE = null, RUNS = [];
let LINKPLAN = null, BRIEFS = null, MEDIA = null, SCHEMA = null, HREF = null, SERP = null;
let SITEMAPS = [], SITEMAP_URLS = [], ROBOTS = null;
let DL = null;

/* ---------- settings <-> form ---------- */
function fillForm(){
  for (const [k,id] of Object.entries(FIELD_IDS)){
    const el = document.getElementById(id); if (el && CFG[k] != null) el.value = CFG[k];
  }
  const cl = document.getElementById('crawlLimit'); if (cl) cl.value = CFG.crawlLimit || 200;
  const ct = document.getElementById('clusterTh'); if (ct){ ct.value = CFG.clusterThreshold || 0.38; $('#clusterThOut').textContent = (CFG.clusterThreshold||0.38).toFixed(2); }
  const cr = document.getElementById('crawlRoot');
  if (cr && !cr.value && CFG.domain) cr.value = /^https?:/i.test(CFG.domain) ? CFG.domain : 'https://' + hostOf(CFG.domain);
  syncChips();
}
function readCfg(){
  for (const [k,id] of Object.entries(FIELD_IDS)){
    const el = document.getElementById(id); if (el) CFG[k] = (el.value||'').trim();
  }
  const c = findCountry(CFG.country);
  CFG.market = CFG.country || '';
  CFG.gscCountry = c ? c.iso3 : '';
  CFG.semrushDb = c ? c.db : '';
  const cl = document.getElementById('crawlLimit'); if (cl) CFG.crawlLimit = Math.max(5, Math.min(5000, +cl.value || 200));
}
function saveCfg(){
  readCfg();
  if (PROJECT){ PROJECT.cfg = CFG; saveProject(PROJECT).then(refreshProjectUI).catch(()=>{}); }
  syncChips(); renderModules();
}

/* ---------- chrome ---------- */
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('on'), 2200); }
function syncChips(){
  const host = hostOf(CFG.domain||'');
  $('#chipDomain').innerHTML = host ? `<span class="dot gsc"></span><b>${esc(host)}</b>${CFG.market?' &middot; '+esc(CFG.market):''}` : '<span class="dot"></span>no domain set';
  $('#chipDomain').classList.toggle('on', !!host);
  $('#sub-setup').textContent = host || 'not set';
  const rows = DATASETS.reduce((a,d)=>a+d.rows.length,0);
  $('#chipFiles').innerHTML = DATASETS.length ? `<span class="dot smr"></span><b>${DATASETS.length}</b> file${DATASETS.length>1?'s':''} &middot; ${fmtInt(rows)} rows` : '<span class="dot"></span>no data loaded';
  $('#chipFiles').classList.toggle('on', DATASETS.length>0);
  $('#sub-data').textContent = DATASETS.length ? `${DATASETS.length} file${DATASETS.length>1?'s':''}` : '0 files';
  $('#rowCount').textContent = fmtInt(rows) + ' rows';
  const ready = DATASETS.length > 0 || !!(CRAWL && CRAWL.pages && CRAWL.pages.length) || SITEMAP_URLS.length > 0;
  $('#btnRun').disabled = !ready;
  $('#chipCurve').textContent = FIND ? (FIND.curveInfo.source === 'calibrated' ? `CTR curve: your data (${FIND.curveInfo.filled} ranks)` : 'CTR curve: baseline') : 'CTR curve: baseline';
  const cs = $('#chipScore');
  if (SCORE && SCORE.overall != null){
    const g = gradeOf(SCORE.overall);
    cs.classList.remove('hide');
    cs.dataset.tone = g.tone;
    cs.innerHTML = `<span class="hlabel">Health</span><b>${SCORE.overall}</b>`;
  } else cs.classList.add('hide');
  $('#sub-crawl').textContent = CRAWL ? `${CRAWL.pages.length} pages` : (SITEMAP_URLS.length ? `${SITEMAP_URLS.length} sitemap URLs` : 'not run');
  $('#sub-tech').textContent = ISSUES.length ? `${ISSUES.filter(i=>i.severity==='critical').length} critical` : (CRAWL ? 'clean' : 'no crawl');
  $('#sub-links').textContent = BACKLINKS ? `${fmtInt(BACKLINKS.refDomains)} domains` : 'no export';
  $('#sub-ilinks').textContent = LINKPLAN && LINKPLAN.hasText ? `${fmtInt(LINKPLAN.stats.opportunities)} to add` : (CRAWL ? 'no page text' : 'needs a crawl');
  $('#sub-media').textContent = MEDIA && MEDIA.total ? `${fmtInt(MEDIA.total)} images` : (CRAWL ? 'no image data' : 'needs a crawl');
  $('#sub-serp').textContent = SERP ? `${fmtInt(SERP.suppressed.length)} suppressed` : 'no export';
  $('#sub-briefs').textContent = BRIEFS && BRIEFS.length ? `${fmtInt(BRIEFS.length)} ready` : 'waiting';
  const aiSub = $('#sub-ai');
  if (aiSub) aiSub.textContent = AI ? (AI.available ? `${fmtInt(AI.visibility.total)} AI impr.` : (AI.aioQueryCount ? `${fmtInt(AI.aioQueryCount)} AIO queries` : 'no export')) : 'no export';
  $('#sub-topics').textContent = CLUST ? `${CLUST.clusters.length} topics` : 'waiting';
  $('#sub-score').textContent = SCORE && SCORE.overall != null ? `${SCORE.overall} / 100` : 'waiting';
  $('#sub-report').textContent = `${RUNS.length} run${RUNS.length===1?'':'s'}`;
  const gsub = $('#sub-gsc');
  if (gsub) gsub.textContent = (typeof GSC_TOKEN !== 'undefined' && GSC_TOKEN) ? 'connected' : (CFG.gscClientId ? 'ready' : 'not connected');
}
function go(id){
  $$('section.panel').forEach(s => s.classList.toggle('hide', s.id !== 'p-'+id));
  $$('.step').forEach(b => b.setAttribute('aria-current', String(b.dataset.go === id)));
  window.scrollTo({top:0, behavior:'instant'});
}
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

/* ---------- tooltip ---------- */
const tip = $('#tip');
function showTip(html, ev){
  tip.innerHTML = html; tip.classList.add('on');
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = x+'px'; tip.style.top = y+'px';
}
function hideTip(){ tip.classList.remove('on'); }

/* ============================================================
   FILE INTAKE
   ============================================================ */
let uid = 0;
async function ingestFiles(fileList){
  const files = Array.from(fileList);
  let added = 0, failed = [];
  for (const f of files){
    try {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.zip')){
        const entries = await readZip(await f.arrayBuffer());
        for (const e of entries){
          const n = e.name.split('/').pop();
          if (!n || n.startsWith('.') || n.startsWith('__')) continue;
          if (/\.json$/i.test(n)){
            const m = jsonToMatrix(new TextDecoder().decode(e.bytes));
            if (m && addTable(n + '  (from ' + f.name + ')', m)) added++;
            continue;
          }
          if (/\.(csv|tsv|txt)$/i.test(n)){
            const text = new TextDecoder().decode(e.bytes);
            if (/^filters?\.csv$/i.test(n)){
              const rows = parseDelimited(text).slice(1).filter(r => r[0]);
              if (rows.length) FILTERS.push({ file: f.name, pairs: rows.map(r => [r[0], r[1]]) });
              continue;
            }
            if (addTable(n + '  (from ' + f.name + ')', parseDelimited(text))) added++;
          } else if (/\.xlsx$/i.test(n)){
            for (const sh of await readXlsx(e.bytes.buffer)) if (addTable(n + ' · ' + sh.name, sh.rows)) added++;
          }
        }
      } else if (lower.endsWith('.xlsx')){
        for (const sh of await readXlsx(await f.arrayBuffer())) if (addTable(f.name + ' · ' + sh.name, sh.rows)) added++;
      } else if (lower.endsWith('.gz')){
        const text = await gunzipText(new Uint8Array(await f.arrayBuffer()));
        const m = /\.json\.gz$/i.test(lower) ? jsonToMatrix(text) : null;
        if (addTable(f.name.replace(/\.gz$/i,''), m || parseDelimited(text))) added++;
      } else if (lower.endsWith('.json') || lower.endsWith('.ndjson')){
        const m = jsonToMatrix(await f.text());
        if (!m) failed.push(f.name + ': no table could be found inside that JSON.');
        else if (addTable(f.name, m)) added++;
      } else {
        const text = await f.text();
        const m = /^\s*[[{]/.test(text) ? jsonToMatrix(text) : null;
        if (addTable(f.name, m || parseDelimited(text))) added++;
      }
    } catch(err){ failed.push(f.name + ': ' + err.message); }
  }
  renderLedger(); syncChips();
  if (failed.length) toast(failed[0]);
  else if (added) toast(added + ' table' + (added>1?'s':'') + ' loaded');
  else toast('Nothing readable in those files');
  if (added && DATASETS.length) { go('data'); }
}
function addTable(name, matrix){
  if (!matrix || matrix.length < 2) return false;
  // Search Console sometimes prefixes a title row; find the widest early row as the header
  let hi = 0;
  for (let i = 0; i < Math.min(4, matrix.length); i++) if (matrix[i].length > matrix[hi].length) hi = i;
  const headers = matrix[hi].map(h => String(h||'').trim());
  const body = matrix.slice(hi+1);
  const rows = body.map(r => { const o = {}; headers.forEach((h,i) => o[h] = r[i]); return o; });
  const cls = classify(headers, name);
  const d = { id: ++uid, name, headers, rows, kind: cls.kind, source: cls.source, domainCols: cls.domainCols, period: 'current', addedAt: Date.now() };
  DATASETS.push(d);
  persistDataset(d);
  return true;
}
function persistDataset(d){
  if (!PROJECT) return;
  saveDataset(PROJECT.id, d).then(refreshStorage).catch(e => console.warn('save failed', e));
}
const KINDS = ['gsc_query','gsc_page','gsc_page_query','gsc_date','gsc_country','gsc_device','gsc_appearance','semrush_positions','semrush_gap','semrush_tracking','semrush_audit','semrush_backlinks','unknown'];
function renderLedger(){
  $('#ledgerCard').style.display = DATASETS.length ? '' : 'none';
  const fc = $('#filterChips');
  if (fc) fc.innerHTML = FILTERS.flatMap(f => f.pairs).map(([k,v]) => `<span class="chip" title="Filter recorded in the export"><span class="dot gsc"></span>${esc(k)}: <b>${esc(v)}</b></span>`).join('');
  $('#ledger').innerHTML = DATASETS.map(d => {
    const badge = d.source === 'gsc' ? 'gsc' : d.source === 'semrush' ? 'smr' : 'unk';
    const badgeTxt = d.source === 'gsc' ? 'GSC' : d.source === 'semrush' ? 'SR' : '?';
    const periodOK = d.kind.startsWith('gsc');
    return `<div class="lrow${d.kind==='unknown'?' bad':''}">
      <span class="srcbadge ${badge}">${badgeTxt}</span>
      <div><div class="lname" title="${esc(d.name)}">${esc(d.name)}</div><div class="lmeta">${fmtInt(d.rows.length)} rows &middot; ${d.headers.length} columns</div></div>
      <select data-kind="${d.id}">${KINDS.map(k=>`<option value="${k}"${k===d.kind?' selected':''}>${esc(KIND_LABEL[k])}</option>`).join('')}</select>
      <select data-period="${d.id}"${periodOK?'':' disabled'}>${['current','previous','yoy'].map(p=>`<option value="${p}"${p===d.period?' selected':''}>${p==='current'?'Current period':p==='previous'?'Previous period':'Year over year'}</option>`).join('')}</select>
      <span class="row gap6">${d.kind==='unknown'||d.mapped?`<button class="btn sm" data-map="${d.id}">${d.mapped?'Remap':'Map columns'}</button>`:''}
      <button class="btn sm ghost" data-drop="${d.id}" aria-label="Remove file">&times;</button></span>
    </div>`;
  }).join('');
  $$('[data-kind]').forEach(s => s.onchange = e => { const d = DATASETS.find(x=>x.id==s.dataset.kind); d.kind = e.target.value; d.source = e.target.value.startsWith('gsc')?'gsc':e.target.value.startsWith('semrush')?'semrush':'unknown'; renderLedger(); });
  $$('[data-period]').forEach(s => s.onchange = e => { const d = DATASETS.find(x=>x.id==s.dataset.period); d.period = e.target.value; persistDataset(d); });
  $$('[data-map]').forEach(b => b.onclick = () => openMapper(b.dataset.map));
  $$('[data-drop]').forEach(b => b.onclick = () => {
    const d = DATASETS.find(x=>x.id==b.dataset.drop);
    if (d && d.dbId) deleteDataset(d.dbId).then(refreshStorage).catch(()=>{});
    DATASETS = DATASETS.filter(x=>x.id!=b.dataset.drop); renderLedger(); syncChips();
  });
}

/* drag and drop */
const dz = $('#dropzone');
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('hot'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('hot'); }));
dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length && !dz.contains(e.target)) ingestFiles(e.dataTransfer.files); });
$('#filePicker').addEventListener('change', e => { ingestFiles(e.target.files); e.target.value = ''; });

/* ============================================================
   TABLES
   ============================================================ */
let tableSeq = 0;
function makeTable(cols, rows, opts){
  opts = opts || {};
  const id = 't' + (++tableSeq);
  const limit = opts.limit || 25;
  const state = { sort: opts.sort || null, dir: opts.dir || 'desc', q: '', shown: limit };
  const host = document.createElement('div');
  host.className = 'stack gap10';

  const bar = document.createElement('div');
  bar.className = 'row wrap gap10';
  bar.innerHTML = `<input class="tfilter" placeholder="Filter ${esc(opts.noun||'rows')}…" style="flex:1;min-width:180px;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:7px;padding:7px 10px;font-size:13px">
    <span class="chip tcount"></span>` + (opts.action ? `<button class="btn sm tact">${esc(opts.action)}</button>` : '');
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  host.appendChild(bar); host.appendChild(wrap);
  if (opts.foot){ const f = document.createElement('p'); f.className='small dim'; f.innerHTML = opts.foot; host.appendChild(f); }

  function view(){
    let r = rows;
    if (state.q){ const q = state.q.toLowerCase(); r = r.filter(x => cols.some(c => String(c.get(x)??'').toLowerCase().includes(q))); }
    if (state.sort){
      const c = cols.find(c => c.key === state.sort);
      r = [...r].sort((a,b) => {
        const va = c.sortVal ? c.sortVal(a) : c.get(a), vb = c.sortVal ? c.sortVal(b) : c.get(b);
        const na = typeof va === 'number', nb = typeof vb === 'number';
        let d = (na&&nb) ? va-vb : String(va).localeCompare(String(vb));
        return state.dir === 'desc' ? -d : d;
      });
    }
    return r;
  }
  function draw(){
    const r = view(), slice = r.slice(0, state.shown);
    bar.querySelector('.tcount').textContent = `${fmtInt(r.length)} ${opts.noun||'rows'}`;
    wrap.innerHTML = !r.length ? `<div class="empty">${esc(opts.empty || 'Nothing here.')}</div>` : `<table>
      <thead><tr>${cols.map(c=>`<th class="${c.n?'n ':''}sortable" data-s="${c.key}">${esc(c.label)}${state.sort===c.key?` <span class="arr">${state.dir==='desc'?'▼':'▲'}</span>`:''}</th>`).join('')}</tr></thead>
      <tbody>${slice.map(x=>`<tr>${cols.map(c=>`<td class="${c.n?'n':''}">${c.html?c.html(x):esc(c.get(x))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      + (r.length > state.shown ? `<div style="padding:10px;text-align:center;border-top:1px solid var(--line)"><button class="btn sm tmore">Show ${Math.min(50, r.length-state.shown)} more of ${fmtInt(r.length)}</button></div>` : '');
    wrap.querySelectorAll('th.sortable').forEach(th => th.onclick = () => {
      if (state.sort === th.dataset.s) state.dir = state.dir === 'desc' ? 'asc' : 'desc';
      else { state.sort = th.dataset.s; state.dir = 'desc'; }
      draw();
    });
    const m = wrap.querySelector('.tmore'); if (m) m.onclick = () => { state.shown += 50; draw(); };
  }
  bar.querySelector('.tfilter').addEventListener('input', e => { state.q = e.target.value; state.shown = limit; draw(); });
  if (opts.action){ const b = bar.querySelector('.tact'); if (b) b.onclick = () => opts.onAction(view()); }
  draw();
  host.getRows = view;
  return host;
}

/* ============================================================
   CHARTS
   ============================================================ */
function chartDistribution(dist){
  const max = Math.max(1, ...dist.map(d=>d.impr));
  const W = 640, rowH = 34, padL = 62, padR = 96, H = dist.length*rowH + 34;
  const bars = dist.map((d,i) => {
    const y = i*rowH + 6, w = Math.max(2, (d.impr/max) * (W-padL-padR));
    return `<g class="mark" data-i="${i}">
      <rect x="${padL}" y="${y}" width="${w}" height="18" rx="4" fill="var(--gsc)"></rect>
      <rect x="${padL}" y="${y}" width="${W-padL-padR}" height="18" rx="4" fill="transparent"></rect>
      <text class="axis" x="${padL-8}" y="${y+13}" text-anchor="end">${d.label}</text>
      <text class="barlabel" x="${padL+w+8}" y="${y+13}">${fmtInt(d.impr)} impr</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Impressions by position band">
    ${bars}
    <text class="axlabel" x="${padL}" y="${H-6}">Position band &middot; impressions in the current period</text>
  </svg>`;
}
function chartMovers(rows){
  const top = rows.slice(0, 12);
  if (!top.length) return '<div class="empty">No movement large enough to chart.</div>';
  const max = Math.max(1, ...top.map(r => Math.abs(r.delta)));
  const W = 640, rowH = 26, padL = 250, padR = 70, mid = padL, avail = W - padL - padR, H = top.length*rowH + 30;
  const bars = top.map((r,i) => {
    const y = i*rowH + 4, w = Math.max(2, Math.abs(r.delta)/max * avail);
    const pos = r.delta >= 0;
    const label = (r.raw || r.key);
    return `<g class="mark" data-m="${i}">
      <text class="axis" x="${mid-10}" y="${y+12}" text-anchor="end">${esc(label.length>36?label.slice(0,35)+'…':label)}</text>
      <rect x="${mid}" y="${y}" width="${w}" height="15" rx="4" fill="${pos?'var(--div-pos)':'var(--div-neg)'}"></rect>
      <text class="barlabel" x="${mid+w+7}" y="${y+12}">${signed(r.delta)}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Largest click changes against the previous period">
    <line class="gridline" x1="${mid}" y1="0" x2="${mid}" y2="${H-24}"></line>
    ${bars}
    <text class="axlabel" x="${mid}" y="${H-6}">Click change against the previous period</text>
  </svg>`;
}

/* ============================================================
   RENDER: GATES
   ============================================================ */
const GATE_ICON = { pass:'✓', warn:'!', fail:'×', skip:'–' };
function renderGates(){
  const el = $('#gates');
  if (!GATES.length){ el.innerHTML = '<div class="empty">Load at least one export, then run the analysis.</div>'; return; }
  el.innerHTML = GATES.map(g => `<div class="gate ${g.state}"><span class="ico">${GATE_ICON[g.state]}</span><div><b>${esc(g.title)}</b><p>${esc(g.detail)}</p></div></div>`).join('');
  const fails = GATES.filter(g=>g.state==='fail').length, warns = GATES.filter(g=>g.state==='warn').length;
  $('#sub-checks').textContent = fails ? `${fails} blocking` : warns ? `${warns} warnings` : 'clean';
  $('#gateNote').innerHTML = fails
    ? `<div class="callout crit"><b>${fails} gate${fails>1?'s':''} failed.</b> The findings below still render, but treat anything that depends on a failed gate as unproven. Fix the input and run again.</div>`
    : warns ? `<div class="callout warn"><b>${warns} warning${warns>1?'s':''}.</b> Nothing is blocked, but each warning narrows what you can honestly claim from this data.</div>`
    : `<div class="callout"><b>All gates clear.</b> The inputs are internally consistent. That is not the same as complete: exports still reflect whatever filters you applied.</div>`;
}

/* ============================================================
   RENDER: FINDINGS
   ============================================================ */
function tile(k, v, d){
  return `<div class="tile"><span class="k">${esc(k)}</span><span class="v">${v}</span>${d?`<span class="d">${d}</span>`:''}</div>`;
}
function deltaBit(cur, prev, invert){
  if (prev == null || !isFinite(prev)) return '<span class="flat">no comparison period</span>';
  const d = cur - prev, pct = prev ? d/prev : 0;
  const good = invert ? d < 0 : d > 0;
  const cls = Math.abs(pct) < .005 ? 'flat' : good ? 'up' : 'down';
  const arrow = Math.abs(pct) < .005 ? '' : (d > 0 ? '▲' : '▼');
  return `<span class="${cls}">${arrow} ${signed(d)} (${(pct*100>0?'+':'')}${(pct*100).toFixed(1)}%)</span>`;
}

function renderFindings(){
  const F = FIND, host = $('#findingsBody');
  host.innerHTML = '';
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; host.appendChild(d); return d; };
  const addNode = n => host.appendChild(n);
  const sec = (kicker, title, sub) => add(`<div style="margin:28px 0 12px"><div class="eyebrow">${esc(kicker)}</div><h2 style="margin-top:5px">${esc(title)}</h2>${sub?`<p class="muted small" style="max-width:72ch;margin-top:5px">${sub}</p>`:''}</div>`);

  /* snapshot */
  const c = F.snapshot.current, p = F.snapshot.previous;
  add(`<div class="grid g4">
    ${tile('Clicks', fmtInt(c.clicks), deltaBit(c.clicks, p&&p.clicks))}
    ${tile('Impressions', fmtInt(c.impr), deltaBit(c.impr, p&&p.impr))}
    ${tile('Click-through rate', fmtPct(c.ctr), p ? `<span class="${c.ctr>=p.ctr?'up':'down'}">${c.ctr>=p.ctr?'▲':'▼'} ${((c.ctr-p.ctr)*100).toFixed(2)} points</span>` : '<span class="flat">no comparison period</span>')}
    ${tile('Average position', fmtPos(c.pos), p&&p.pos ? `<span class="${c.pos<=p.pos?'up':'down'}">${c.pos<=p.pos?'▲':'▼'} ${Math.abs(c.pos-p.pos).toFixed(2)}</span>` : '<span class="flat">no comparison period</span>')}
  </div>`);
  add(`<p class="small dim" style="margin-top:8px">Totals cover the ${fmtInt(c.n)} ${F.snapshot.basis} rows in your export, weighted by impressions for position. If the export hit the 1,000-row cap these are not site totals.</p>`);

  /* Year over year, when a year-ago window was imported. Shown as its own row
     rather than folded into the tiles above, because it is a different
     question from "versus last month" and the two often disagree. */
  if (F.snapshot.yoy){
    const y = F.snapshot.yoy;
    add(`<div class="callout" style="margin-top:14px"><b>Against the same window a year ago</b> (52 weeks earlier, so the weekdays line up):
      clicks ${fmtInt(y.clicks)} → ${fmtInt(c.clicks)} <span class="${c.clicks>=y.clicks?'up':'down'}">${c.clicks>=y.clicks?'▲':'▼'} ${fmtInt(Math.abs(c.clicks-y.clicks))}</span>,
      impressions ${fmtInt(y.impr)} → ${fmtInt(c.impr)} <span class="${c.impr>=y.impr?'up':'down'}">${c.impr>=y.impr?'▲':'▼'} ${fmtInt(Math.abs(c.impr-y.impr))}</span>,
      average position ${fmtPos(y.pos)} → ${fmtPos(c.pos)}${y.pos&&c.pos?` <span class="${c.pos<=y.pos?'up':'down'}">${c.pos<=y.pos?'▲':'▼'} ${Math.abs(c.pos-y.pos).toFixed(2)}</span>`:''}.
      A year-on-year move is the one that survives seasonality; a month-on-month move often is seasonality.</div>`);
  }

  if (F.branded && F.branded.n){
    add(`<div class="callout" style="margin-top:14px"><b>Branded traffic:</b> ${fmtInt(F.branded.clicks)} clicks, ${fmtPct(F.branded.share)} of the total, across ${fmtInt(F.branded.n)} queries containing your brand name. Branded demand mostly tracks marketing rather than SEO, so read the non-branded remainder as the real signal.</div>`);
  }

  /* charts */
  const chartRow = add(`<div class="grid ${F.hasComparison?'g2':''}" style="margin-top:20px">
    <div class="chartcard"><h4>Where the impressions sit</h4><p class="charthint">Impressions grouped by average position. A heavy 11 to 20 band is the cheapest place to look for clicks.</p><div id="chart1"></div></div>
    ${F.hasComparison?`<div class="chartcard"><h4>Biggest click movements</h4><p class="charthint">Change against the previous period, largest absolute movement first.</p><div id="chart2"></div>
      <div class="legend"><span><i class="swatch" style="background:var(--div-pos)"></i>gained clicks</span><span><i class="swatch" style="background:var(--div-neg)"></i>lost clicks</span></div></div>`:''}
  </div>`);
  $('#chart1').innerHTML = chartDistribution(F.distribution);
  $('#chart1').querySelectorAll('.mark').forEach(g => {
    const d = F.distribution[+g.dataset.i];
    g.addEventListener('mousemove', e => showTip(`<b>Position ${esc(d.label)}</b><div class="r"><span>Impressions</span><i>${fmtInt(d.impr)}</i></div><div class="r"><span>Clicks</span><i>${fmtInt(d.clicks)}</i></div><div class="r"><span>Click-through</span><i>${d.impr?fmtPct(d.clicks/d.impr):'—'}</i></div><div class="r"><span>Rows</span><i>${fmtInt(d.n)}</i></div>`, e));
    g.addEventListener('mouseleave', hideTip);
  });
  if (F.hasComparison){
    const movers = [...F.decay.slice(0,8), ...F.risers.slice(0,8)].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    $('#chart2').innerHTML = chartMovers(movers);
    $('#chart2').querySelectorAll('.mark').forEach(g => {
      const r = movers.slice(0,12)[+g.dataset.m];
      g.addEventListener('mousemove', e => showTip(`<b>${esc(r.raw||r.key)}</b><div class="r"><span>Clicks now</span><i>${fmtInt(r.clicks)}</i></div><div class="r"><span>Clicks before</span><i>${fmtInt(r.prevClicks)}</i></div><div class="r"><span>Impressions</span><i>${fmtInt(r.impr)} vs ${fmtInt(r.prevImpr)}</i></div><div class="r"><span>Position</span><i>${fmtPos(r.pos)}${r.prevPos?' vs '+fmtPos(r.prevPos):''}</i></div>`, e));
      g.addEventListener('mouseleave', hideTip);
    });
  }

  /* striking distance */
  sec('Finding 01','Within reach',
    `Rows ranking below the top three with real impression volume. The gain column models what reaching the target position would add, using ${F.curveInfo.source === 'calibrated' ? 'a click-through curve fitted to your own data' : 'a baseline click-through curve, because your export did not have enough rows to fit one'}. It is a model, not a promise.`);
  addNode(makeTable([
    {key:'k', label:'Query or page', get:r=>r.raw||r.key, html:r=>`<div class="trunc" title="${esc(r.raw||r.key)}">${esc(r.raw||r.key)}</div>${r.brandFlag?'<span class="tag">branded</span>':''}`},
    {key:'pos', label:'Position', n:1, get:r=>r.pos, html:r=>fmtPos(r.pos)},
    {key:'impr', label:'Impressions', n:1, get:r=>r.impr, html:r=>fmtInt(r.impr)},
    {key:'clicks', label:'Clicks', n:1, get:r=>r.clicks, html:r=>fmtInt(r.clicks)},
    {key:'ctr', label:'CTR', n:1, get:r=>r.ctr, html:r=>fmtPct(r.ctr)},
    {key:'target', label:'Target', n:1, get:r=>r.target},
    {key:'gain', label:'Est. clicks gained', n:1, get:r=>r.gain, html:r=>`<b>${fmtInt(r.gain)}</b>`}
  ], FIND.striking, {sort:'gain', noun:'opportunities', empty:'Nothing between position 3.5 and 40 with enough impressions to model.'}));

  /* ctr gap */
  sec('Finding 02','Ranking well, under-clicked',
    'Rows already in the top ten that earn well under the click-through rate their position usually returns. These are title, meta description and rich-result problems, not ranking problems, and they are the cheapest fix on the list.');
  addNode(makeTable([
    {key:'k', label:'Query or page', get:r=>r.raw||r.key, html:r=>`<div class="trunc" title="${esc(r.raw||r.key)}">${esc(r.raw||r.key)}</div>`},
    {key:'pos', label:'Position', n:1, get:r=>r.pos, html:r=>fmtPos(r.pos)},
    {key:'impr', label:'Impressions', n:1, get:r=>r.impr, html:r=>fmtInt(r.impr)},
    {key:'ctr', label:'Actual CTR', n:1, get:r=>r.ctr, html:r=>fmtPct(r.ctr)},
    {key:'exp', label:'Expected', n:1, get:r=>r.exp, html:r=>fmtPct(r.exp)},
    {key:'lost', label:'Clicks forgone', n:1, get:r=>r.lost, html:r=>`<b>${fmtInt(r.lost)}</b>`}
  ], FIND.ctrGap, {sort:'lost', noun:'rows', empty:'No top-ten row is materially under-clicking. Either your snippets are healthy or the sample is too small.'}));

  /* decay */
  if (F.hasComparison){
    sec('Finding 03','Losing ground',
      'Rows that lost at least a quarter of their clicks against the previous period. The cause column separates a ranking problem from a demand problem from a snippet problem, because the fix is different in each case.');
    addNode(makeTable([
      {key:'k', label:'Page or query', get:r=>r.raw||r.key, html:r=>`<div class="trunc ${r.type==='page'?'url':''}" title="${esc(r.raw||r.key)}">${esc(r.raw||r.key)}</div>`},
      {key:'cause', label:'Cause', get:r=>r.cause, html:r=>`<span class="pill ${r.cause==='Ranking loss'?'consolidate':r.cause==='Click-through fell at a stable rank'?'ctr':'refresh'}">${esc(r.cause)}</span>`},
      {key:'prevClicks', label:'Was', n:1, get:r=>r.prevClicks, html:r=>fmtInt(r.prevClicks)},
      {key:'clicks', label:'Now', n:1, get:r=>r.clicks, html:r=>fmtInt(r.clicks)},
      {key:'delta', label:'Change', n:1, get:r=>r.delta, html:r=>`<b class="down">${signed(r.delta)}</b>`},
      {key:'posMove', label:'Position move', n:1, get:r=>r.posMove==null?0:r.posMove, html:r=>r.posMove==null?'—':`<span class="${r.posMove>0?'down':'up'}">${r.posMove>0?'+':''}${r.posMove.toFixed(1)}</span>`}
    ], FIND.decay, {sort:'delta', dir:'asc', noun:'declines', empty:'Nothing lost a meaningful share of its clicks.'}));

    sec('Finding 04','Gaining ground',
      'Rows that grew. Two jobs here: capture what you changed so it can be repeated, and freeze the current version so nobody edits away a win by accident.');
    addNode(makeTable([
      {key:'k', label:'Page or query', get:r=>r.raw||r.key, html:r=>`<div class="trunc ${r.type==='page'?'url':''}" title="${esc(r.raw||r.key)}">${esc(r.raw||r.key)}</div>`},
      {key:'prevClicks', label:'Was', n:1, get:r=>r.prevClicks, html:r=>fmtInt(r.prevClicks)},
      {key:'clicks', label:'Now', n:1, get:r=>r.clicks, html:r=>fmtInt(r.clicks)},
      {key:'delta', label:'Change', n:1, get:r=>r.delta, html:r=>`<b class="up">${signed(r.delta)}</b>`},
      {key:'pos', label:'Position', n:1, get:r=>r.pos||99, html:r=>fmtPos(r.pos)}
    ], FIND.risers, {sort:'delta', noun:'gains', empty:'Nothing grew by a meaningful margin.'}));
  }

  /* cannibalisation */
  if (FIND.cannibal.length || MODEL.gscPQ.length){
    sec('Finding 05','Two pages, one query',
      'Detected from a page and query export, where Google shows more than one URL for the same query across the period. This is the only finding here that needs the API or BigQuery export; the standard report cannot produce it.');
    addNode(makeTable([
      {key:'q', label:'Query', get:r=>r.raw||r.query, html:r=>`<div class="trunc" title="${esc(r.raw||r.query)}">${esc(r.raw||r.query)}</div>`},
      {key:'impr', label:'Impressions', n:1, get:r=>r.impr, html:r=>fmtInt(r.impr)},
      {key:'n', label:'URLs', n:1, get:r=>r.urls.length},
      {key:'sev', label:'Split', get:r=>r.severity, html:r=>`<span class="pill ${r.severity==='high'?'consolidate':r.severity==='medium'?'refresh':'investigate'}">${r.urls.slice(0,3).map(u=>Math.round(u.share*100)+'%').join(' / ')}</span>`},
      {key:'urls', label:'Competing URLs', get:r=>r.urls.map(u=>u.url).join(' '), html:r=>r.urls.slice(0,3).map(u=>`<div class="trunc url small" title="${esc(u.raw||u.url)}">${esc(u.raw||u.url)} <span class="dim">${fmtPos(u.pos)}</span></div>`).join('')}
    ], FIND.cannibal, {sort:'impr', noun:'queries', empty:'No query is split across two URLs at meaningful volume.'}));
  } else {
    sec('Finding 05','Two pages, one query','');
    add(`<div class="card pad"><p class="muted small">Cannibalisation needs page and query on the same row, which the standard Search Console report does not export. Pull it from the Search Console API with <code>dimensions=page,query</code>, or from the BigQuery bulk export, then drop it in at stage 2.</p></div>`);
  }

  /* gap */
  if (FIND.gaps.length){
    sec('Finding 06','Competitor coverage you do not have',
      `From the Keyword Gap export. Every figure in this table is a Semrush estimate, drawn in orange throughout the console. Where your Search Console data already shows impressions for the same term, the verdict changes from create to refresh, because a page already exists and is being seen.`);
    addNode(makeTable([
      {key:'kw', label:'Keyword', get:r=>r.raw||r.keyword, html:r=>`<div class="trunc" title="${esc(r.raw||r.keyword)}">${esc(r.raw||r.keyword)}</div>`},
      {key:'verdict', label:'Verdict', get:r=>r.verdict, html:r=>`<span class="pill ${r.verdict.startsWith('Create')?'create':'refresh'}">${esc(r.verdict)}</span>`},
      {key:'vol', label:'Est. volume', n:1, get:r=>r.volume, html:r=>`<span style="color:var(--smr)">${fmtInt(r.volume)}</span>`},
      {key:'kd', label:'KD', n:1, get:r=>r.kd, html:r=>r.kd?Math.round(r.kd):'—'},
      {key:'comp', label:'Best competitor', get:r=>r.best.domain, html:r=>`${esc(r.best.domain)} <b class="mono">#${r.best.pos}</b>`},
      {key:'mine', label:'You', n:1, get:r=>r.myPos||999, html:r=>r.myPos?fmtPos(r.myPos):'—'},
      {key:'gsc', label:'Your impressions', n:1, get:r=>r.gscImpr, html:r=>r.gscImpr?`<span style="color:var(--gsc)">${fmtInt(r.gscImpr)}</span>`:'<span class="dim">none</span>'},
      {key:'est', label:'Est. clicks', n:1, get:r=>r.estClicks, html:r=>`<b>${fmtInt(r.estClicks)}</b>`}
    ], FIND.gaps, {sort:'est', noun:'gaps', empty:'No competitor holds a top-ten position on a keyword you are missing.'}));
  }

  /* reconciliation */
  if (FIND.reconcile.length){
    sec('Finding 07','Where the two sources disagree',
      'Semrush claims a top-ten position that your own Search Console data does not support. Usually a database or location mismatch, sometimes a modelling artefact. Either way it is a reason to check before you build a plan on it.');
    addNode(makeTable([
      {key:'kw', label:'Keyword', get:r=>r.raw||r.keyword, html:r=>`<div class="trunc" title="${esc(r.raw||r.keyword)}">${esc(r.raw||r.keyword)}</div>`},
      {key:'smr', label:'Semrush position', n:1, get:r=>r.smrPos, html:r=>`<span style="color:var(--smr)">${fmtPos(r.smrPos)}</span>`},
      {key:'vol', label:'Est. volume', n:1, get:r=>r.volume, html:r=>fmtInt(r.volume)},
      {key:'impr', label:'GSC impressions', n:1, get:r=>r.gscImpr, html:r=>`<span style="color:var(--gsc)">${fmtInt(r.gscImpr)}</span>`},
      {key:'note', label:'Why it is flagged', get:r=>r.note, html:r=>`<span class="small muted">${esc(r.note)}</span>`}
    ], FIND.reconcile, {sort:'vol', noun:'conflicts', empty:''}));
  }

  if (FIND.smrDrops.length){
    sec('Finding 08','Semrush rank drops','Positions that fell at least three places from the previous crawl. Estimated data, so confirm each one in Search Console before you spend time on it.');
    addNode(makeTable([
      {key:'kw', label:'Keyword', get:r=>r.keywordRaw||r.keyword, html:r=>`<div class="trunc">${esc(r.keywordRaw||r.keyword)}</div>`},
      {key:'prev', label:'Was', n:1, get:r=>r.prevPos},
      {key:'pos', label:'Now', n:1, get:r=>r.pos},
      {key:'drop', label:'Places lost', n:1, get:r=>r.drop, html:r=>`<b class="down">${r.drop}</b>`},
      {key:'vol', label:'Est. volume', n:1, get:r=>r.volume, html:r=>fmtInt(r.volume)},
      {key:'url', label:'URL', get:r=>r.urlRaw||r.url, html:r=>`<div class="trunc url small">${esc(r.urlRaw||r.url)}</div>`}
    ], FIND.smrDrops, {sort:'drop', noun:'drops', empty:''}));
  }

  $('#sub-findings').textContent = `${FIND.striking.length + FIND.ctrGap.length + FIND.decay.length + FIND.gaps.length} signals`;
}

/* ============================================================
   RENDER: ACTIONS
   ============================================================ */
function renderActions(){
  const host = $('#actionsBody');
  host.innerHTML = '';
  const A = FIND.actions;
  const byDec = d => A.filter(a => a.decision === d).length;
  const blocking = A.filter(a => a.band === 'blocking');
  const quick = A.filter(a => a.effort === 'Low' && a.impact >= 5).length;

  const head = document.createElement('div');
  head.innerHTML = `<div class="grid g4" style="margin-bottom:18px">
    ${tile('Actions queued', fmtInt(A.length), `<span class="flat">${fmtInt(quick)} are low effort</span>`)}
    ${tile('Blocking faults', fmtInt(blocking.length), blocking.length ? '<span class="down">fix before anything else</span>' : '<span class="flat">none</span>')}
    ${tile('Clicks in play', fmtInt(A.reduce((s,a)=>s+(a.basis==='observed'?a.impact:0),0)), '<span class="flat">from measured data only</span>')}
    ${tile('New pages', fmtInt(byDec('create')), '<span class="flat">estimated demand</span>')}
  </div>`;
  host.appendChild(head);

  if (blocking.length)
    host.appendChild(Object.assign(document.createElement('div'), {innerHTML:
      `<div class="callout crit" style="margin-bottom:14px"><b>${blocking.length} blocking technical fault${blocking.length===1?'':'s'} sit at the top of this list.</b> No amount of content work compensates for a page Google cannot fetch, read or index, so these are ordered above the click-opportunity rows regardless of estimated value.</div>`}));

  host.appendChild(makeTable([
    {key:'band', label:'', get:a=>a.band==='blocking'?0:1, html:a=>a.band==='blocking'?'<span class="band">blocking</span>':''},
    {key:'dec', label:'Decision', get:a=>a.decision, html:a=>`<span class="pill ${a.decision}">${esc(DECISION_LABEL[a.decision]||a.decision)}</span>`},
    {key:'target', label:'Target', get:a=>a.targetRaw||a.target, html:a=>`<div class="trunc" title="${esc(a.targetRaw||a.target)}">${esc(a.targetRaw||a.target)}</div><span class="tag">${esc(a.kind||'row')}</span>${a.urls?` <span class="tag">${fmtInt(a.urls)} URLs</span>`:''}`},
    {key:'impact', label:'Est. clicks', n:1, get:a=>a.impact, html:a=>a.kind==='technical'?'<span class="dim">—</span>':`<b>${fmtInt(a.impact)}</b>`},
    {key:'effort', label:'Effort', get:a=>a.effort},
    {key:'basis', label:'Basis', get:a=>a.basis, html:a=>`<span class="chip" style="font-size:10px;padding:2px 6px"><span class="dot ${a.basis==='observed'?'gsc':'smr'}"></span>${a.basis}</span>`},
    {key:'ev', label:'Evidence', get:a=>a.evidence.join(' '), html:a=>`<div class="small muted" style="max-width:500px">${a.evidence.map(esc).join('<br>')}</div>`}
  ], A, {sort:null, noun:'actions', limit:20, action:'Download queue as CSV',
        onAction: rows => downloadCsv('action-queue.csv', rows.map(a => ({
          band: a.band||'opportunity', decision: DECISION_LABEL[a.decision]||a.decision,
          target: a.targetRaw||a.target, type: a.kind||'', severity: a.severity||'',
          urls_affected: a.urls||'', est_clicks: a.kind==='technical'?'':a.impact,
          effort: a.effort, basis: a.basis, evidence: a.evidence.join(' | ')
        }))),
        foot: 'Blocking rows come from the crawl and are ordered first. Everything below is ordered by the clicks realistically in play for a period the length of your export. Observed rows come from Search Console; estimated rows come from third-party volume and are labelled. Ranking by this column is a starting order, not a business priority.',
        empty:'Nothing surfaced. Load more exports, or run a crawl.'}));

  $('#sub-actions').textContent = `${A.length} queued`;
}

/* ============================================================
   EXPORT
   ============================================================ */
function toCsv(rows){
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const q = v => { const s = String(v==null?'':v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => q(r[c])).join(',')).join('\n');
}
// true only when served from your own web server, checked at call time
const isHosted = () => (typeof claude === 'undefined' || !claude || typeof claude.use !== 'function');
async function saveFile(filename, data, mime){
  if (!isHosted()){
    if (DL === null) { try { DL = await claude.use('downloads'); } catch(e){ DL = undefined; } }
    if (DL){
      try { await DL.save({ filename, data }); toast('Saved ' + filename); return; }
      catch(e){ /* viewer declined or unavailable */ }
    }
  } else {
    try {
      const url = URL.createObjectURL(new Blob([data], { type: (mime || 'text/plain') + ';charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
      toast('Downloading ' + filename); return;
    } catch(e){ /* fall through */ }
  }
  try { await navigator.clipboard.writeText(typeof data === 'string' ? data : ''); toast('Download unavailable here, copied to clipboard instead'); }
  catch(e){ toast('Could not save the file'); }
}
function downloadCsv(name, rows){ saveFile(name, toCsv(rows), 'text/csv'); }

$('#evRows').oninput = e => { EVROWS = +e.target.value; $('#evRowsOut').textContent = EVROWS; renderModules(); };
[['tgtClaude','claude'],['tgtGPT','gpt'],['tgtGeneric','generic']].forEach(([id,val]) => {
  document.getElementById(id).onclick = () => {
    TARGET = val;
    ['tgtClaude','tgtGPT','tgtGeneric'].forEach(x => document.getElementById(x).setAttribute('aria-pressed', String(x===id)));
    renderModules();
  };
});
/* ============================================================
   SUITE UI: projects, crawl, scorecard, topics, technical,
   backlinks, report, coverage map, and the run pipeline.
   ============================================================ */

/* ---------- countries ---------- */
function populateCountries(){
  const sel = $('#cfgCountry');
  sel.innerHTML = COUNTRIES.map(c => `<option value="${esc(c.name)}">${esc(c.name)}${c.iso3?` — ${c.iso3.toUpperCase()}`:''}</option>`).join('');
  sel.onchange = () => {
    const c = findCountry(sel.value);
    if (c){
      const lang = $('#cfgLanguage');
      if (!lang.value.trim()) lang.value = c.lang;
      $('#countryHint').textContent = c.iso3
        ? `Search Console exports this as "${c.iso3}". Match it with the Semrush "${c.db}" database.`
        : 'No country filter. Make sure your exports are unfiltered too.';
    }
    saveCfg();
  };
}

/* ---------- projects ---------- */
async function refreshProjectUI(){
  PROJECTS = await listProjects();
  const sel = $('#projectSel');
  sel.innerHTML = PROJECTS.map(p => `<option value="${esc(p.id)}"${PROJECT && p.id===PROJECT.id?' selected':''}>${esc(p.name)}</option>`).join('');
  $('#projectList').innerHTML = PROJECTS.map(p => `
    <div class="prow${PROJECT && p.id===PROJECT.id?' on':''}">
      <div><b>${esc(p.name)}</b><div class="pmeta">${esc(p.cfg.domain||'no domain')} · updated ${new Date(p.updated).toLocaleDateString()}</div></div>
      <button class="btn sm ghost" data-open="${esc(p.id)}">${PROJECT && p.id===PROJECT.id?'current':'open'}</button>
      <button class="btn sm ghost" data-rename="${esc(p.id)}">rename</button>
    </div>`).join('');
  $$('[data-open]').forEach(b => b.onclick = () => openProject(b.dataset.open));
  $$('[data-rename]').forEach(b => b.onclick = async () => {
    const p = PROJECTS.find(x => x.id === b.dataset.rename);
    const name = prompt('Project name', p.name);
    if (name && name.trim()){ p.name = name.trim(); await saveProject(p); if (PROJECT && PROJECT.id===p.id) PROJECT.name = p.name; refreshProjectUI(); }
  });
  refreshStorage();
}
async function refreshStorage(){
  const info = await storageInfo();
  if (!info || !info.quota){ $('#storageText').textContent = 'This browser does not report a storage quota.'; return; }
  const pct = info.used / info.quota;
  $('#storageBar').style.width = Math.max(1, Math.min(100, pct*100)).toFixed(1) + '%';
  $('#storageBar').parentElement.className = 'meter' + (pct > .9 ? ' crit' : pct > .7 ? ' warn' : '');
  $('#storageText').textContent = `${(info.used/1048576).toFixed(1)} MB used of about ${(info.quota/1048576).toFixed(0)} MB available to this site.`;
}
function resetAnalysis(){
  MODEL = null; FIND = null; GATES = []; CLUST = null; PAGEMAP = null; ISSUES = []; BACKLINKS = null; SCORE = null;
  LINKPLAN = null; BRIEFS = null; MEDIA = null; SCHEMA = null; HREF = null; SERP = null; AI = null;
  renderGates();
  ['findingsBody','actionsBody','scoreBody','topicsBody','linksBody','ilinksBody','mediaBody','serpBody','briefsBody','aiBody'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '<div class="card"><div class="empty">Run the analysis to populate this stage.</div></div>';
  });
  $('#techBody').innerHTML = '<div class="card"><div class="empty">Run a crawl at stage 3, or drop a sitemap or crawler export in at stage 2.</div></div>';
  /* The draft itself is the writer's work and survives; only the topic picker is
     cleared, because the clusters it listed no longer exist. */
  if (typeof refreshEditor === 'function') refreshEditor();
  if (typeof runProfiles === 'function') runProfiles();
  if (typeof renderGsc === 'function') renderGsc();
}
async function openProject(id){
  PROJECT = PROJECTS.find(p => p.id === id) || (await listProjects()).find(p => p.id === id);
  if (!PROJECT) return;
  await setActiveProject(id);
  CFG = Object.assign(blankCfg(), PROJECT.cfg || {});
  const ds = await loadDatasets(id);
  uid = 0;
  DATASETS = ds.map(d => ({ id: ++uid, dbId: d.id, name:d.name, headers:d.headers, rows:d.rows, kind:d.kind,
                            source:d.source, domainCols:d.domainCols, period:d.period, mapped:d.mapped, addedAt:d.addedAt }));
  const crawls = await loadCrawls(id);
  CRAWL = crawls[0] || null;
  if (CRAWL){ SITEMAPS = CRAWL.sitemaps || []; SITEMAP_URLS = flattenSitemaps(SITEMAPS); ROBOTS = CRAWL.robots || null; }
  else { SITEMAPS = []; SITEMAP_URLS = []; ROBOTS = null; }
  RUNS = await loadRuns(id);
  OBSERVATIONS = (PROJECT.cfg && PROJECT.cfg.observations) || [];
  FILTERS = [];
  resetAnalysis();
  fillForm(); renderLedger(); renderCrawlSummary(); renderReportPanel(); renderExportPanel(); renderMap(); renderModules(); renderGuide(); renderAi(); syncChips();
  await refreshEditor({ reloadDrafts: true });
  await refreshProjectUI();
  toast('Opened ' + PROJECT.name);
}
async function initProjects(){
  try {
    PROJECTS = await listProjects();
    if (!PROJECTS.length){ await createProject('First project'); PROJECTS = await listProjects(); }
    const active = await activeProjectId();
    await openProject((active && PROJECTS.some(p=>p.id===active)) ? active : PROJECTS[0].id);
  } catch(e){
    DB_OK = false;
    toast('This browser blocked local storage, so nothing will be saved between visits.');
    PROJECT = { id:'mem', name:'Unsaved project', cfg: blankCfg() };
    CFG = PROJECT.cfg; fillForm();
  }
}

/* ---------- crawl ---------- */
const ABORT = { stopped:false };
function describeMode(){
  const el = $('#fetchModeText');
  if (FETCH_MODE === 'proxy') el.innerHTML = '<b class="tone-pass">Proxy available.</b> ' + (PROXY_INFO && PROXY_INFO.engine === 'go' ? 'The server' : 'proxy.php') + ' answered next to this page, so the console can fetch any domain it allows'
      + (PROXY_INFO && PROXY_INFO.hosts ? ', and ' + PROXY_INFO.hosts + ' ' + (PROXY_INFO.hosts === 1 ? 'domain is' : 'domains are') + ' allowed.' : '. Add domains to its allowlist before crawling a new client.');
  else if (PROXY_INFO && PROXY_INFO.configured === false) el.innerHTML = '<b class="tone-warn">Proxy installed, but not switched on.</b> proxy.php answered, and its allowlist is empty, so it would refuse every page. Open the file on your host, add your domains to <span class="mono">$ALLOWED_HOSTS</span>, and check again.';
  else if (PROXY_INFO && PROXY_INFO.curl === false) el.innerHTML = '<b class="tone-warn">Proxy installed, but this host has no cURL.</b> Without it the proxy cannot pin the address it checked, so it refuses to fetch. Enable the cURL extension in your hosting control panel, then check again.';
  else if (FETCH_MODE === 'direct') el.innerHTML = '<b class="tone-warn">Same-origin only.</b> No proxy responded, but this console is served from the domain you are auditing, so it can crawl that domain and nothing else.';
  else el.innerHTML = '<b class="tone-skip">No fetch route.</b> Nothing can be crawled from here: no proxy.php responded and the target is on another origin. Upload proxy.php and add the domain to its allowlist, or paste the sitemap and drop a crawler export in at stage 2.';
}
async function detectMode(){
  readCfg();
  const root = ($('#crawlRoot').value || '').trim() || (CFG.domain ? 'https://' + hostOf(CFG.domain) : '');
  await detectFetchMode(root);
  describeMode();
  return FETCH_MODE;
}
function crawlRootUrl(){
  let v = ($('#crawlRoot').value || '').trim();
  if (!v && CFG.domain) v = 'https://' + hostOf(CFG.domain);
  if (v && !/^https?:/i.test(v)) v = 'https://' + v.replace(/^\/+/,'');
  return v;
}
async function fetchSitemapsAndRobots(root){
  const origin = new URL(root).origin;
  let robotsTxt = '';
  try { const r = await grab(origin + '/robots.txt'); if (r.status < 400) robotsTxt = r.body; } catch(e){}
  ROBOTS = robotsTxt ? parseRobots(robotsTxt) : null;
  const candidates = (ROBOTS && ROBOTS.sitemaps.length) ? ROBOTS.sitemaps : [origin + '/sitemap.xml', origin + '/sitemap_index.xml'];
  const found = [];
  for (const u of candidates){
    const tree = await loadSitemapTree(u, msg => $('#crawlStatus').textContent = msg);
    for (const t of tree) if (!t.error || candidates.length === 1) found.push(t);
    if (found.some(t => t.entries && t.entries.length)) break;
  }
  SITEMAPS = found;
  SITEMAP_URLS = flattenSitemaps(found);
  return { robots: ROBOTS, sitemaps: SITEMAPS, urls: SITEMAP_URLS };
}
async function doCrawl(sitemapOnly){
  readCfg();
  const root = crawlRootUrl();
  if (!root){ toast('Set a domain first'); go('setup'); return; }
  await detectMode();
  if (FETCH_MODE === 'manual'){ toast('No fetch route available. See the box on the right.'); return; }

  ABORT.stopped = false;
  $('#crawlProgress').classList.remove('hide');
  $('#btnStopCrawl').classList.remove('hide');
  $('#btnCrawl').disabled = true; $('#btnSitemapOnly').disabled = true;
  $('#crawlBar').style.width = '2%';
  $('#crawlStatus').textContent = 'Reading robots.txt and sitemaps…';

  try {
    await fetchSitemapsAndRobots(root);
    if (sitemapOnly){
      CRAWL = CRAWL && CRAWL.pages ? { ...CRAWL, sitemaps: SITEMAPS, robots: ROBOTS } : { origin: root, pages: [], sitemaps: SITEMAPS, robots: ROBOTS, at: Date.now(), mode: FETCH_MODE };
      if (PROJECT) await saveCrawl(PROJECT.id, CRAWL);
      $('#crawlStatus').textContent = `${SITEMAP_URLS.length} URLs across ${SITEMAPS.length} sitemap file${SITEMAPS.length===1?'':'s'}.`;
    } else {
      const limit = CFG.crawlLimit || 200;
      const seeds = ($('#crawlSitemapFirst').checked && SITEMAP_URLS.length)
        ? SITEMAP_URLS.slice(0, limit).map(u => u.loc) : [root];
      const res = await crawlSite({
        origin: root, seeds, limit, concurrency: 4, robots: ROBOTS,
        obeyRobots: $('#crawlObeyRobots').checked, abort: ABORT,
        keepText: $('#crawlKeepText').checked,
        onProgress: (done, max, queued) => {
          $('#crawlBar').style.width = Math.min(100, done/max*100).toFixed(1) + '%';
          $('#crawlStatus').textContent = `${done} of up to ${max} pages fetched, ${queued} queued`;
        }
      });
      buildLinkGraph(res.pages, root);
      CRAWL = { ...res, sitemaps: SITEMAPS, robots: ROBOTS };
      if (PROJECT) await saveCrawl(PROJECT.id, CRAWL);
      $('#crawlStatus').textContent = `Done. ${res.pages.length} pages, ${res.errors.length} failed.`;
    }
    renderCrawlSummary(); syncChips(); renderMap(); refreshStorage();
    toast(sitemapOnly ? 'Sitemap read' : 'Crawl complete');
  } catch(e){
    $('#crawlStatus').textContent = 'Stopped: ' + e.message;
    toast(e.message);
  } finally {
    $('#btnStopCrawl').classList.add('hide');
    $('#btnCrawl').disabled = false; $('#btnSitemapOnly').disabled = false;
  }
}
function parsePasted(){
  const txt = $('#pasteXml').value.trim();
  if (!txt){ toast('Nothing pasted'); return; }
  if (/<urlset|<sitemapindex/i.test(txt)){
    const sm = parseSitemapXml(txt, 'pasted');
    if (sm.type === 'index'){ toast('That is a sitemap index. Paste one of the child sitemaps, or use the crawler.'); }
    SITEMAPS = SITEMAPS.filter(s => s.source !== 'pasted').concat([sm]);
    SITEMAP_URLS = flattenSitemaps(SITEMAPS);
    toast(`${sm.entries.length} URLs read from the pasted sitemap`);
  } else if (/user-agent\s*:/i.test(txt)){
    ROBOTS = parseRobots(txt);
    toast(`robots.txt read: ${ROBOTS.groups.length} groups, ${ROBOTS.sitemaps.length} sitemaps declared`);
  } else { toast('That does not look like sitemap XML or a robots.txt'); return; }
  CRAWL = CRAWL || { origin: crawlRootUrl(), pages: [], at: Date.now(), mode:'manual' };
  CRAWL.sitemaps = SITEMAPS; CRAWL.robots = ROBOTS;
  if (PROJECT) saveCrawl(PROJECT.id, CRAWL).then(refreshStorage).catch(()=>{});
  renderCrawlSummary(); syncChips(); renderMap();
}

/* Screaming Frog style export -> crawl pages */
function sfToPages(ds){
  const h = ds.headers;
  const c = { addr:pick(h,'address'), status:pick(h,'status code'), title:pick(h,'title 1','title'),
              desc:pick(h,'meta description 1','meta description'), h1:pick(h,'h1-1','h1'),
              words:pick(h,'word count'), canon:pick(h,'canonical link element 1','canonical'),
              index:pick(h,'indexability'), reason:pick(h,'indexability status'),
              inlinks:pick(h,'inlinks','unique inlinks'), depth:pick(h,'crawl depth'),
              size:pick(h,'size (bytes)','size'), ms:pick(h,'response time'), type:pick(h,'content type','content') };
  return ds.rows.map(r => {
    const url = String(r[c.addr]||'').trim();
    if (!url) return null;
    const title = String(r[c.title]||'').trim();
    const ms = num(r[c.ms]);
    return { url: normUrl(url), raw:url, requested:url, status: num(r[c.status]) || 0,
      redirects:[], ms: ms != null ? Math.round(ms*1000) : 0, bytes: num(r[c.size]) || 0,
      title, metaDescription: String(r[c.desc]||'').trim(),
      robotsMeta:'', noindex: /non-indexable/i.test(String(r[c.index]||'')) && /noindex/i.test(String(r[c.reason]||'')),
      canonical: r[c.canon] ? normUrl(r[c.canon]) : null,
      selfCanonical: r[c.canon] ? normUrl(r[c.canon]) === normUrl(url) : null,
      h1: String(r[c.h1]||'').trim(), h1Count: r[c.h1] ? 1 : 0, h2Count: 0,
      wordCount: num(r[c.words]) || 0, shingles:null,
      internalLinks: [], internalLinkCount: 0, externalLinkCount: 0,
      images: [], imgMissingAlt: 0, imgNoDims: 0, schemaTypes: [], hreflang: [],
      lang:'', hasViewport:true, inlinks: num(r[c.inlinks]) || 0,
      clickDepth: num(r[c.depth]), notHtml: !/html/i.test(String(r[c.type]||'text/html')), imported:true };
  }).filter(Boolean);
}

function renderCrawlSummary(){
  const host = $('#crawlSummary');
  const pages = (CRAWL && CRAWL.pages) || [];
  if (!pages.length && !SITEMAP_URLS.length){ host.innerHTML = ''; return; }
  const ok = pages.filter(p => p.status >= 200 && p.status < 300).length;
  const bad = pages.filter(p => p.status >= 400 || p.status === 0).length;
  const noidx = pages.filter(p => p.noindex).length;
  const orph = pages.filter(p => p.inlinks === 0 && p.clickDepth !== 0).length;
  host.innerHTML = `<div class="grid g4">
    ${tile('Pages crawled', fmtInt(pages.length), `<span class="flat">${CRAWL && CRAWL.mode ? CRAWL.mode + ' route' : ''}</span>`)}
    ${tile('Answering 200', fmtInt(ok), bad ? `<span class="down">${bad} broken</span>` : '<span class="flat">none broken</span>')}
    ${tile('Sitemap URLs', fmtInt(SITEMAP_URLS.length), `<span class="flat">${SITEMAPS.length} file${SITEMAPS.length===1?'':'s'}</span>`)}
    ${tile('Not indexable', fmtInt(noidx), `<span class="flat">${orph} orphaned</span>`)}
  </div>
  <div class="callout" style="margin-top:14px">Crawl data is saved with the project. Run the analysis to turn it into technical findings and to fold it into the score.</div>`;
}

/* ---------- scorecard ---------- */
function dial(score){
  const r = 58, circ = 2*Math.PI*r, pct = (score||0)/100;
  const tone = gradeOf(score).tone;
  const col = tone === 'pass' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : tone === 'fail' ? 'var(--crit)' : 'var(--ink-3)';
  return `<div class="dial"><svg width="132" height="132" viewBox="0 0 132 132">
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-pct)}"/>
  </svg><div class="val">${score==null?'&mdash;':score}</div></div>`;
}
function renderScore(){
  const host = $('#scoreBody');
  if (!SCORE){ host.innerHTML = '<div class="card"><div class="empty">Run the analysis to populate this stage.</div></div>'; return; }
  const g = gradeOf(SCORE.overall);
  host.innerHTML = `
    <div class="scorehero">
      ${dial(SCORE.overall)}
      <div>
        <div class="eyebrow">Overall health</div>
        <h2 style="margin:4px 0 6px">${esc(g.label)}</h2>
        <p class="muted small" style="max-width:60ch">${esc(SCORE.coverageNote)} Each pillar below opens to show exactly which measurements produced it, so nothing here is a black box.</p>
      </div>
    </div>
    <div class="stack gap10" style="margin-top:16px">
      ${SCORE.pillars.map((p,i) => {
        const pg = gradeOf(p.score);
        return `<div class="pillar${i===0?' open':''}">
          <button class="pillarhead" aria-expanded="${i===0}">
            <div><b>${esc(p.name)}</b><div class="small dim">${p.score==null ? 'Needs ' + esc(p.needs) : esc(pg.label) + ' · ' + p.metrics.filter(m=>m.value!=null).length + ' measurements'}</div></div>
            <div class="pillarscore tone-${pg.tone}">${p.score==null?'&mdash;':p.score}</div>
            <div class="small dim mono" style="text-align:right">${p.weight}%</div>
          </button>
          <div class="pillarbody">
            ${p.metrics.length ? p.metrics.map(m => `
              <div class="submetric">
                <div><div class="lab">${esc(m.label)}</div><div class="det">${esc(m.detail||'')}</div></div>
                <div class="meter${m.value==null?'':(m.value<.5?' crit':m.value<.75?' warn':'')}"><i style="width:${m.value==null?0:Math.round(m.value*100)}%"></i></div>
                <div class="n">${m.value==null?'<span class="dim">n/a</span>':Math.round(m.value*100)}</div>
              </div>`).join('')
              : `<p class="small dim" style="padding:10px 0">Not measured. This pillar needs ${esc(p.needs)}.</p>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  host.querySelectorAll('.pillarhead').forEach(b => b.onclick = () => {
    const open = b.closest('.pillar').classList.toggle('open');
    b.setAttribute('aria-expanded', String(open));
  });
}

/* ---------- topics ---------- */
function renderTopics(){
  const host = $('#topicsBody');
  if (!CLUST){ host.innerHTML = '<div class="card"><div class="empty">Run the analysis to populate this stage.</div></div>'; return; }
  const s = CLUST.stats;
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };

  add(`<div class="grid g4">
    ${tile('Topics found', fmtInt(s.total), `<span class="flat">from ${fmtInt(MODEL.gscQ.current.length)} queries</span>`)}
    ${tile('Owned outright', fmtInt(s.owned), `<span class="flat">${s.coverage==null?'no page data':Math.round(s.coverage*100)+'% of mapped topics'}</span>`)}
    ${tile('Split across pages', fmtInt(s.split), s.split?'<span class="down">competing with yourself</span>':'<span class="flat">none</span>')}
    ${tile('Held by competitors', fmtInt(s.missing), '<span class="flat">from the gap export</span>')}
  </div>`);

  if (s.unmapped === s.total && s.total)
    add(`<div class="callout warn" style="margin-top:14px"><b>No page and query export loaded.</b> Topics are grouped by vocabulary alone, and no page can be assigned an owner. Pull a page and query table from the Search Console API or BigQuery to unlock ownership, splits and dilution.</div>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Topic map</div><h2 style="margin-top:5px">Every topic and its owning page</h2>
    <p class="muted small" style="max-width:74ch;margin-top:5px">Headroom is the clicks the topic would add if each member query moved one realistic tier up the results. Split means two or more of your own URLs each take a fifth or more of the topic's impressions.</p></div>`);

  host.appendChild(makeTable([
    {key:'name', label:'Topic', get:c=>c.name, html:c=>`<div class="trunc" title="${esc(c.name)}">${esc(c.name)}</div><span class="tag">${esc(c.intent)}</span>${c.source==='semrush'?' <span class="tag" style="color:var(--smr)">estimated</span>':''}`},
    {key:'status', label:'Status', get:c=>c.status, html:c=>`<span class="pill ${c.status}">${esc(c.status)}</span>`},
    {key:'size', label:'Queries', n:1, get:c=>c.size},
    {key:'impr', label:'Impressions', n:1, get:c=>c.impr, html:c=>c.impr?fmtInt(c.impr):(c.volume?`<span style="color:var(--smr)">${fmtInt(c.volume)} est. vol</span>`:'—')},
    {key:'clicks', label:'Clicks', n:1, get:c=>c.clicks, html:c=>fmtInt(c.clicks)},
    {key:'pos', label:'Position', n:1, get:c=>c.pos==null?999:c.pos, html:c=>fmtPos(c.pos)},
    {key:'owner', label:'Owning page', get:c=>c.owner?c.owner.url:'', html:c=>c.owner?`<div class="trunc url small" title="${esc(c.owner.raw||c.owner.url)}">${esc(c.owner.raw||c.owner.url)}</div><span class="dim mono" style="font-size:10px">${Math.round(c.owner.share*100)}% of the topic</span>`:(c.bestCompetitor?`<span class="small" style="color:var(--smr)">${esc(c.bestCompetitor.domain)} at #${c.bestCompetitor.pos}</span>`:'<span class="dim">—</span>')},
    {key:'opp', label:'Headroom', n:1, get:c=>c.opportunity, html:c=>`<b>${fmtInt(c.opportunity)}</b>`}
  ], CLUST.clusters, {sort:'impr', noun:'topics', limit:20, action:'Download topics as CSV',
      onAction: rows => downloadCsv('topics.csv', rows.map(c => ({
        topic:c.name, status:c.status, intent:c.intent, queries:c.size, impressions:c.impr, clicks:c.clicks,
        position: c.pos==null?'':c.pos.toFixed(1), owning_page: c.owner?(c.owner.raw||c.owner.url):'',
        owner_share: c.owner?Math.round(c.owner.share*100)+'%':'', headroom: Math.round(c.opportunity),
        member_queries: c.members.slice(0,25).map(m=>m.queryRaw||m.query).join(' | ')
      }))),
      empty:'No topics could be formed.'}));

  if (PAGEMAP && PAGEMAP.length){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">The reverse view</div><h2 style="margin-top:5px">What each page is being asked to do</h2>
      <p class="muted small" style="max-width:74ch;margin-top:5px">A page owning several topics across different intents is usually trying to be a hub and a landing page at once. That is the most common reason a page ranks for everything at position twelve and nothing at position three.</p></div>`);
    host.appendChild(makeTable([
      {key:'url', label:'Page', get:p=>p.raw||p.url, html:p=>`<div class="trunc url" title="${esc(p.raw||p.url)}">${esc(p.raw||p.url)}</div>`},
      {key:'verdict', label:'Verdict', get:p=>p.verdict, html:p=>`<span class="pill ${p.verdict==='focused'?'owned':p.verdict==='diluted'?'split':'weak'}">${esc(p.verdict)}</span>`},
      {key:'distinct', label:'Topics owned', n:1, get:p=>p.distinct},
      {key:'contested', label:'Also competing on', n:1, get:p=>p.contested.length},
      {key:'intents', label:'Intents', get:p=>p.intents.join(', '), html:p=>p.intents.map(i=>`<span class="tag">${esc(i)}</span>`).join(' ')},
      {key:'impr', label:'Impressions', n:1, get:p=>p.impr, html:p=>fmtInt(p.impr)},
      {key:'opp', label:'Headroom', n:1, get:p=>p.opportunity, html:p=>fmtInt(p.opportunity)}
    ], PAGEMAP, {sort:'impr', noun:'pages', limit:15, empty:'No page and query data, so pages cannot be mapped.'}));
  }
}

/* ---------- technical ---------- */
function renderTech(){
  const host = $('#techBody');
  const pages = (CRAWL && CRAWL.pages) || [];
  if (!ISSUES.length && !pages.length && !SITEMAP_URLS.length){
    host.innerHTML = '<div class="card"><div class="empty">Run a crawl at stage 3, or drop a sitemap or crawler export in at stage 2.</div></div>'; return;
  }
  const s = summariseIssues(ISSUES);
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };

  add(`<div class="grid g4">
    ${tile('Critical', fmtInt(s.critical), '<span class="flat">blocks indexing or breaks pages</span>')}
    ${tile('Serious', fmtInt(s.serious), '<span class="flat">costs traffic</span>')}
    ${tile('Warnings', fmtInt(s.warning), '<span class="flat">worth fixing</span>')}
    ${tile('Notices', fmtInt(s.notice), '<span class="flat">housekeeping</span>')}
  </div>`);

  const byCode = Object.entries(s.byCode).map(([code,count]) => {
    const first = ISSUES.find(i => i.code === code);
    return { code, count, severity:first.severity, title:first.title, detail:first.detail };
  }).sort((a,b) => SEV_ORDER[a.severity]-SEV_ORDER[b.severity] || b.count-a.count);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Grouped</div><h2 style="margin-top:5px">Findings by type</h2></div>`);
  host.appendChild(makeTable([
    {key:'sev', label:'Severity', get:i=>SEV_ORDER[i.severity], html:i=>`<span class="sev ${i.severity}">${i.severity}</span>`},
    {key:'title', label:'Finding', get:i=>i.title, html:i=>`<b>${esc(i.title)}</b><div class="small dim">${esc(i.detail||'').slice(0,110)}</div>`},
    {key:'count', label:'URLs', n:1, get:i=>i.count, html:i=>`<b>${fmtInt(i.count)}</b>`},
    {key:'code', label:'Code', get:i=>i.code, html:i=>`<span class="tag">${esc(i.code)}</span>`}
  ], byCode, {sort:'count', noun:'finding types', limit:15, empty:'No technical findings.'}));

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Every occurrence</div><h2 style="margin-top:5px">Issue list</h2></div>`);
  host.appendChild(makeTable([
    {key:'sev', label:'Severity', get:i=>SEV_ORDER[i.severity], html:i=>`<span class="sev ${i.severity}">${i.severity}</span>`},
    {key:'title', label:'Finding', get:i=>i.title, html:i=>esc(i.title)},
    {key:'url', label:'URL', get:i=>i.url||'', html:i=>`<div class="trunc url small" title="${esc(i.url||'')}">${esc(i.url||'')}</div>`},
    {key:'detail', label:'Detail', get:i=>i.detail||'', html:i=>`<span class="small muted">${esc(i.detail||'')}</span>`}
  ], ISSUES, {sort:'sev', dir:'asc', noun:'issues', limit:25, action:'Download issues as CSV',
      onAction: rows => downloadCsv('technical-issues.csv', rows.map(i => ({severity:i.severity, code:i.code, finding:i.title, url:i.url, detail:i.detail}))),
      empty:'No issues found.'}));

  if (pages.length){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Crawled inventory</div><h2 style="margin-top:5px">Every page the crawler saw</h2></div>`);
    host.appendChild(makeTable([
      {key:'url', label:'URL', get:p=>p.raw||p.url, html:p=>`<div class="trunc url" title="${esc(p.raw||p.url)}">${esc(p.raw||p.url)}</div>`},
      {key:'status', label:'Status', n:1, get:p=>p.status, html:p=>`<span class="${p.status>=400||p.status===0?'down':''}">${p.status||'err'}</span>`},
      {key:'title', label:'Title', get:p=>p.title, html:p=>`<div class="trunc small" title="${esc(p.title)}">${esc(p.title||'—')}</div><span class="dim mono" style="font-size:10px">${p.title?p.title.length+' chars':''}</span>`},
      {key:'words', label:'Words', n:1, get:p=>p.wordCount, html:p=>fmtInt(p.wordCount)},
      {key:'depth', label:'Depth', n:1, get:p=>p.clickDepth==null?99:p.clickDepth, html:p=>p.clickDepth==null?'—':p.clickDepth},
      {key:'inlinks', label:'Inlinks', n:1, get:p=>p.inlinks||0},
      {key:'idx', label:'Indexable', get:p=>p.noindex?'no':'yes', html:p=>p.noindex?'<span class="pill split">noindex</span>':'<span class="pill owned">yes</span>'},
      {key:'ms', label:'Response', n:1, get:p=>p.ms, html:p=>p.ms?p.ms+' ms':'—'}
    ], pages, {sort:'depth', dir:'asc', noun:'pages', limit:20, action:'Download crawl as CSV',
        onAction: rows => downloadCsv('crawl.csv', rows.map(p => ({url:p.raw||p.url, status:p.status, title:p.title,
          title_length:(p.title||'').length, meta_description:p.metaDescription, h1:p.h1, words:p.wordCount,
          depth:p.clickDepth, inlinks:p.inlinks, indexable:p.noindex?'no':'yes', canonical:p.canonical||'',
          images:p.images.length, images_missing_alt:p.imgMissingAlt, response_ms:p.ms, bytes:p.bytes,
          schema:(p.schemaTypes||[]).join(' ')}))),
        empty:'No pages crawled.'}));
  }

  if (SITEMAPS.length){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Sitemaps</div><h2 style="margin-top:5px">What was submitted</h2></div>`);
    host.appendChild(makeTable([
      {key:'src', label:'Sitemap', get:s=>s.source, html:s=>`<div class="trunc url small">${esc(s.source)}</div>`},
      {key:'type', label:'Type', get:s=>s.type},
      {key:'n', label:'Entries', n:1, get:s=>s.entries.length, html:s=>fmtInt(s.entries.length)},
      {key:'kb', label:'Size', n:1, get:s=>s.bytes||0, html:s=>s.bytes?Math.round(s.bytes/1024)+' KB':'—'},
      {key:'err', label:'State', get:s=>s.error||'ok', html:s=>s.error?`<span class="sev critical">${esc(s.error)}</span>`:'<span class="sev notice">read</span>'}
    ], SITEMAPS, {sort:'n', noun:'sitemap files', limit:10, empty:''}));
  }
}

/* ---------- backlinks ---------- */
function renderLinks(){
  const host = $('#linksBody');
  if (!BACKLINKS){ host.innerHTML = '<div class="card"><div class="empty">Load a Semrush backlinks export at stage 2.</div></div>'; return; }
  const b = BACKLINKS;
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  add(`<div class="grid g4">
    ${tile('Referring domains', fmtInt(b.refDomains), `<span class="flat">${fmtInt(b.total)} links total</span>`)}
    ${tile('Followed', fmtPct(b.followRatio), `<span class="flat">${fmtInt(Math.round(b.total*b.followRatio))} pass authority</span>`)}
    ${tile('Pages receiving links', fmtInt(b.targets), '<span class="flat">deeper is usually healthier</span>')}
    ${tile('New against lost', b.lost==null ? '&mdash;' : `${fmtInt(b.gained)} / ${fmtInt(b.lost)}`, b.lost==null?'<span class="flat">export has no new or lost columns</span>':(b.gained>=b.lost?'<span class="up">net positive</span>':'<span class="down">net negative</span>'))}
  </div>`);
  const types = Object.entries(b.anchorTypes).sort((a,b2)=>b2[1]-a[1]);
  add(`<div class="card pad" style="margin-top:16px"><div class="eyebrow" style="margin-bottom:8px">Anchor text mix</div>
    <div class="row wrap gap8">${types.map(([t,c]) => `<span class="chip"><b>${esc(t)}</b> ${fmtInt(c)} · ${Math.round(c/b.total*100)}%</span>`).join('')}</div>
    <p class="small dim" style="margin-top:10px">The single most common anchor carries ${Math.round(b.topAnchorShare*100)}% of all links. A profile dominated by one exact phrase is the pattern that gets scrutinised; a profile dominated by the brand name rarely is.</p></div>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Sources</div><h2 style="margin-top:5px">Referring domains</h2></div>`);
  host.appendChild(makeTable([
    {key:'host', label:'Domain', get:d=>d.host, html:d=>`<div class="trunc">${esc(d.host)}</div>`},
    {key:'score', label:'Authority', n:1, get:d=>d.score||0, html:d=>d.score==null?'—':Math.round(d.score)},
    {key:'links', label:'Links', n:1, get:d=>d.links},
    {key:'follow', label:'Followed', n:1, get:d=>d.follow},
    {key:'targets', label:'Pages hit', n:1, get:d=>d.targets},
    {key:'anchors', label:'Distinct anchors', n:1, get:d=>d.anchors}
  ], b.domains, {sort:'score', noun:'domains', limit:15, empty:''}));

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Anchors</div><h2 style="margin-top:5px">Most used anchor text</h2></div>`);
  host.appendChild(makeTable([
    {key:'a', label:'Anchor', get:a=>a.anchor, html:a=>`<div class="trunc">${esc(a.anchor)}</div>`},
    {key:'c', label:'Links', n:1, get:a=>a.count},
    {key:'s', label:'Share', n:1, get:a=>a.share, html:a=>fmtPct(a.share)}
  ], b.anchors, {sort:'c', noun:'anchors', limit:15, empty:''}));

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Targets</div><h2 style="margin-top:5px">Which pages the links point at</h2></div>`);
  host.appendChild(makeTable([
    {key:'u', label:'Page', get:t=>t.url, html:t=>`<div class="trunc url">${esc(t.url)}</div>`},
    {key:'c', label:'Links', n:1, get:t=>t.count}
  ], b.topTargets, {sort:'c', noun:'pages', limit:12, empty:''}));
  renderLinkExtras(host);
}

/* ---------- report and history ---------- */
function trendChart(runs, key, label){
  const pts = runs.filter(r => r.snapshot && r.snapshot[key] != null);
  if (pts.length < 2) return `<div class="empty small">Two saved runs are needed before a trend can be drawn. You have ${pts.length}.</div>`;
  const W = 560, H = 150, padL = 46, padR = 12, padT = 12, padB = 26;
  const vals = pts.map(r => r.snapshot[key]);
  const invert = key === 'pos';
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max){ min -= 1; max += 1; }
  const x = i => padL + (i/(pts.length-1))*(W-padL-padR);
  const y = v => padT + (1 - (v-min)/(max-min))*(H-padT-padB) * (invert ? -1 : 1) + (invert ? (H-padB) - padT : 0);
  const yy = v => invert ? padT + ((v-min)/(max-min))*(H-padT-padB) : padT + (1-(v-min)/(max-min))*(H-padT-padB);
  const d = pts.map((r,i) => `${i?'L':'M'}${x(i).toFixed(1)},${yy(r.snapshot[key]).toFixed(1)}`).join(' ');
  const area = d + ` L${x(pts.length-1).toFixed(1)},${H-padB} L${padL},${H-padB} Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} across saved runs">
    <line class="gridline" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}"></line>
    <line class="gridline" x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}"></line>
    <text class="axis" x="${padL-6}" y="${padT+8}" text-anchor="end">${fmtInt(invert?min:max)}</text>
    <text class="axis" x="${padL-6}" y="${H-padB}" text-anchor="end">${fmtInt(invert?max:min)}</text>
    <path class="area" d="${area}"></path><path class="line" d="${d}"></path>
    ${pts.map((r,i)=>`<circle class="pt mark" cx="${x(i).toFixed(1)}" cy="${yy(r.snapshot[key]).toFixed(1)}" r="4" data-i="${i}"></circle>`).join('')}
    <text class="axlabel" x="${padL}" y="${H-6}">${esc(new Date(pts[0].at).toLocaleDateString())}</text>
    <text class="axlabel" x="${W-padR}" y="${H-6}" text-anchor="end">${esc(new Date(pts[pts.length-1].at).toLocaleDateString())}</text>
  </svg>`;
}
function renderReportPanel(){
  const host = $('#reportBody');
  host.innerHTML = `
    <div class="grid g2">
      <div class="chartcard"><h4>Clicks across saved runs</h4><p class="charthint">One point per run you have saved against this project.</p>${trendChart(RUNS,'clicks','Clicks')}</div>
      <div class="chartcard"><h4>Average position across saved runs</h4><p class="charthint">Lower is better, so the line rising means positions improving.</p>${trendChart(RUNS,'pos','Average position')}</div>
    </div>
    <div style="margin:26px 0 12px"><div class="eyebrow">History</div><h2 style="margin-top:5px">Saved runs</h2>
      <p class="muted small" style="max-width:70ch;margin-top:5px">A run is saved every time you press Run analysis. That is what makes movement measurable later: the baseline is recorded rather than remembered.</p></div>
    <div id="runTable"></div>`;
  const rows = [...RUNS].reverse();
  $('#runTable').appendChild(makeTable([
    {key:'at', label:'When', get:r=>r.at, html:r=>new Date(r.at).toLocaleString()},
    {key:'score', label:'Health', n:1, get:r=>r.overall==null?-1:r.overall, html:r=>r.overall==null?'—':`<b>${r.overall}</b>`},
    {key:'clicks', label:'Clicks', n:1, get:r=>r.snapshot?r.snapshot.clicks:0, html:r=>fmtInt(r.snapshot&&r.snapshot.clicks)},
    {key:'impr', label:'Impressions', n:1, get:r=>r.snapshot?r.snapshot.impr:0, html:r=>fmtInt(r.snapshot&&r.snapshot.impr)},
    {key:'pos', label:'Avg position', n:1, get:r=>r.snapshot&&r.snapshot.pos!=null?r.snapshot.pos:999, html:r=>r.snapshot&&r.snapshot.pos!=null?r.snapshot.pos.toFixed(1):'—'},
    {key:'acts', label:'Actions', n:1, get:r=>r.counts?r.counts.actions:0},
    {key:'iss', label:'Issues', n:1, get:r=>r.counts?r.counts.issues:0},
    {key:'del', label:'', get:()=>'', html:r=>`<button class="btn sm ghost" data-delrun="${esc(r.id)}">remove</button>`}
  ], rows, {sort:'at', noun:'runs', limit:12, empty:'No runs saved yet. Press Run analysis.'}));
  $$('[data-delrun]').forEach(b => b.onclick = async () => {
    await deleteRun(b.dataset.delrun);
    RUNS = await loadRuns(PROJECT.id);
    renderReportPanel(); renderExportPanel(); syncChips();
  });
}
function reportContext(){
  return { cfg: CFG, score: SCORE, find: FIND, issues: ISSUES, clusters: CLUST ? CLUST.clusters : [],
           clusterStats: CLUST ? CLUST.stats : null, actions: FIND ? FIND.actions : [], crawl: CRAWL,
           runs: RUNS, sitemapUrls: SITEMAP_URLS };
}

/* ---------- coverage map ---------- */
const CAPABILITIES = [
  ['Search performance baseline','Clicks, impressions, click-through and impression-weighted position, with period comparison.','Search Console Queries or Pages export', () => MODEL && (MODEL.gscQ.current.length || MODEL.gscP.current.length)],
  ['Self-calibrated CTR curve','Expected click-through by rank, fitted to this site rather than an industry average.','200+ query rows with positions', () => FIND && FIND.curveInfo.source === 'calibrated'],
  ['Striking distance','Rows below the top three with impression volume and modelled headroom.','Search Console queries or pages', () => FIND && FIND.striking.length],
  ['Snippet underperformance','Top-ten rows earning well under the curve for their rank.','Search Console queries or pages', () => FIND && FIND.ctrGap.length],
  ['Decay and momentum','Declines split into ranking loss, demand drop and click-through loss.','The same report exported for a previous period', () => FIND && FIND.hasComparison],
  ['Cannibalisation','Queries served by more than one of your URLs.','Page and query export from the API or BigQuery', () => MODEL && MODEL.gscPQ.length],
  ['Keyword clustering','Queries grouped into topics by vocabulary and by shared serving URL.','Search Console queries', () => CLUST && CLUST.clusters.length],
  ['Content mapping','An owning page per topic, plus split, weak and missing verdicts.','Page and query export', () => CLUST && CLUST.stats.owned + CLUST.stats.split > 0],
  ['Page dilution','Pages carrying several topics across conflicting intents.','Page and query export', () => PAGEMAP && PAGEMAP.length],
  ['Competitor gap','Topics where a competitor ranks top ten and you are absent.','Semrush Keyword Gap export', () => FIND && FIND.gaps.length],
  ['Observed versus estimated','Where Semrush claims a rank your own data does not support.','Semrush positions and Search Console queries', () => FIND && FIND.reconcile.length],
  ['Sitemap audit','Limits, lastmod validity, duplicates, non-HTTPS, blocked and unseen URLs.','A sitemap, fetched or pasted', () => SITEMAP_URLS.length],
  ['robots.txt audit','Groups, rules, declared sitemaps and conflicts with what is submitted.','robots.txt, fetched or pasted', () => ROBOTS],
  ['Live crawl','Status, redirects, titles, canonicals, headings, word counts, images and schema.','proxy.php, same-origin hosting, or a Screaming Frog export', () => CRAWL && CRAWL.pages.length],
  ['Internal link graph','Inlink counts, click depth from home and orphan detection.','A live crawl', () => CRAWL && CRAWL.pages.some(p => p.internalLinkCount > 0)],
  ['Duplicate detection','Duplicate titles and descriptions, plus near-duplicate body content.','A live crawl', () => ISSUES.some(i => i.code === 'near_dupe' || i.code === 'title_dupe')],
  ['Internal link planner','Pages that mention a topic in their own copy and do not link to the page that owns it.','A live crawl with page text kept', () => LINKPLAN && LINKPLAN.hasText],
  ['Orphan rescue','For each orphaned page, where on the site its subject is already mentioned.','A live crawl', () => LINKPLAN && LINKPLAN.orphanRescues.length],
  ['Content briefs','A brief per topic assembled from measured queries, the owning page and its on-page state.','Search Console queries, better with a crawl', () => BRIEFS && BRIEFS.length],
  ['Image audit','Filenames, alt state, dimensions, formats and reuse across pages.','A live crawl', () => MEDIA && MEDIA.total],
  ['Structured data','Coverage by type, and JSON-LD that will not parse.','A live crawl', () => SCHEMA],
  ['Hreflang audit','Return-tag reciprocity, invalid codes, self-reference and x-default.','A live crawl of a multi-language site', () => HREF],
  ['SERP feature diagnosis','Where you rank well but something above you takes the click.','Semrush positions with the SERP features column', () => SERP && SERP.suppressed.length],
  ['Snippet targets','Queries carrying a snippet or People also ask where you already rank two to nine.','Semrush positions with SERP features', () => SERP && SERP.targets.length],
  ['Link velocity','Links first seen and lost by month.','A backlinks export with date columns', () => BACKLINKS && BACKLINKS.velocity && BACKLINKS.velocity.length > 1],
  ['Competitor link gap','Domains linking to competitors and not to you.','Backlink exports for competitors as well as you', () => BACKLINKS && BACKLINKS.prospects && BACKLINKS.prospects.length],
  ['AI visibility','Which pages actually appeared in Google generative experiences.','Search Console Generative AI export', () => AI && AI.available],
  ['AI Overview opportunities','Queries that trigger an overview where you rank but do not appear.','Semrush positions with SERP features, plus Search Console queries', () => AI && AI.opportunities.length],
  ['AI eligibility gate','Per page: indexable, crawlable, snippet-eligible, not excluded.','A live crawl', () => AI && AI.pages.some(p => p.eligibility && p.eligibility.checks.length)],
  ['AI Search readiness','An editorial readiness score per page, every component shown.','A live crawl plus topics', () => AI && AI.pages.some(p => p.readiness != null)],
  ['Fan-out coverage','Member queries the owning page never addresses in its own words.','A live crawl plus topics', () => AI && AI.fanout.length],
  ['AI Overview citations','A dated record of overviews you saw and the sources they cited.','Observations you paste in yourself', () => OBSERVATIONS && OBSERVATIONS.length],
  ['Column mapper','Any unrecognised file, mapped by hand and remembered.','A file the classifier could not place', () => DATASETS.some(d => d.mapped)],
  ['Run comparison','Two saved runs placed side by side, measure by measure.','Two saved runs', () => RUNS.length >= 2],
  ['Backlink profile','Referring domains, anchor mix, follow ratio, new against lost.','Semrush backlinks export', () => BACKLINKS],
  ['Health score','Five weighted pillars with every sub-measurement exposed.','Any of the above', () => SCORE && SCORE.overall != null],
  ['Run history','Movement across your own saved baselines.','Two or more saved runs', () => RUNS.length >= 2],
  ['Client report','A self-contained HTML report you can send or print.','A completed run', () => !!SCORE],
  ['Prompt pack','Nineteen chained prompts pre-filled with the computed evidence.','Project settings, plus data for the evidence blocks', () => !!MODEL]
];
function renderMap(){
  const cards = CAPABILITIES.map(([name, what, needs, test]) => {
    let live = false;
    try { live = !!test(); } catch(e){ live = false; }
    const cls = live ? 'live' : 'idle';
    return `<div class="cap ${cls}"><span class="state">${live?'running':'waiting'}</span><b>${esc(name)}</b>
      <span class="small muted">${esc(what)}</span><span class="need">needs: ${esc(needs)}</span></div>`;
  }).join('');
  const live = CAPABILITIES.filter(([,,,t]) => { try { return !!t(); } catch(e){ return false; } }).length;
  $('#mapBody').innerHTML = `
    <div class="grid g4" style="margin-bottom:18px">
      ${tile('Capabilities running', `${live} / ${CAPABILITIES.length}`, '<span class="flat">on the data loaded now</span>')}
      ${tile('Exports loaded', fmtInt(DATASETS.length), '<span class="flat">across all report types</span>')}
      ${tile('Pages crawled', fmtInt((CRAWL&&CRAWL.pages||[]).length), '<span class="flat">' + (FETCH_MODE || 'route not checked') + '</span>')}
      ${tile('Saved runs', fmtInt(RUNS.length), '<span class="flat">this project</span>')}
    </div>
    <div class="capgrid">${cards}</div>
    <div class="callout" style="margin-top:18px"><b>Reading this map.</b> Nothing here is hidden behind a paywall or a plan tier. A grey card is waiting on one specific file, named on the card. The three that unlock the most are a previous-period export, a page and query table, and a crawl.</div>`;
}

/* ---------- actions from the new engines ---------- */
function augmentActions(){
  if (!FIND) return;
  const extra = [];
  const seen = new Set(FIND.actions.map(a => a.decision + '::' + a.target));
  const push = a => { const k = a.decision + '::' + a.target; if (seen.has(k)) return; seen.add(k); extra.push(a); };

  if (CLUST) for (const c of CLUST.clusters){
    if (c.status === 'split' && c.owner)
      push({ target:c.name, targetRaw:c.name, kind:'topic', decision:'consolidate', impact: c.opportunity || c.impr*0.02,
             effort:'Medium', basis:'observed', band:'opportunity',
             evidence:[`Topic "${c.name}" (${c.size} queries, ${fmtInt(c.impr)} impressions) is split across ${c.urls.filter(u=>u.share>=.2).length} of your URLs. Lead page holds only ${Math.round(c.owner.share*100)}%.`] });
    else if (c.status === 'missing' && c.bestCompetitor)
      push({ target:c.name, targetRaw:c.name, kind:'topic', decision:'create', impact: c.opportunity,
             effort:'High', basis:'estimated', band:'opportunity',
             evidence:[`No page covers this topic. ${c.bestCompetitor.domain} ranks ${c.bestCompetitor.pos} and the cluster carries about ${fmtInt(c.volume||0)} estimated monthly searches across ${c.size} keywords.`] });
    else if (c.status === 'weak' && c.impr > 200)
      push({ target:c.name, targetRaw:c.name, kind:'topic', decision:'refresh', impact: c.opportunity,
             effort:'Medium', basis:'observed', band:'opportunity',
             evidence:[`No page takes a clear lead on this topic: the best URL holds ${Math.round((c.owner?c.owner.share:0)*100)}% of ${fmtInt(c.impr)} impressions.`] });
  }
  if (PAGEMAP) for (const p of PAGEMAP.filter(x => x.verdict === 'diluted').slice(0,15))
    push({ target:p.raw||p.url, targetRaw:p.raw||p.url, kind:'page', decision:'refresh', impact: p.opportunity*0.4,
           effort:'Medium', basis:'observed', band:'opportunity',
           evidence:[`This page owns ${p.distinct} topics across ${p.intents.length} different intents (${p.intents.join(', ')}). Splitting it usually beats stretching it.`] });

  if (LINKPLAN && LINKPLAN.hasText){
    const byTarget = new Map();
    for (const o of LINKPLAN.opportunities){
      const e = byTarget.get(o.to) || { to:o.toRaw, topic:o.topic, n:0, best:o };
      e.n++; byTarget.set(o.to, e);
    }
    for (const e of [...byTarget.values()].sort((a,b)=>b.n-a.n).slice(0, 25))
      push({ target:e.to, targetRaw:e.to, kind:'internal links', decision:'refresh', impact: e.n * 0.5,
             effort:'Low', basis:'observed', band:'opportunity',
             evidence:[`${e.n} page${e.n===1?'':'s'} already mention this topic without linking here. First: ${e.best.fromRaw}, anchor "${e.best.anchor}".`] });
  }
  if (SERP) for (const x of SERP.suppressed.slice(0, 20))
    push({ target:x.keyword, targetRaw:x.keyword, kind:'query', decision:'ctr', impact:x.lost,
           effort:'Low', basis:'observed', band:'opportunity',
           evidence:[`Ranks ${x.gscPos.toFixed(1)} but earns ${(x.gscCtr*100).toFixed(1)}% against ${(x.expected*100).toFixed(1)}% expected, on a result page carrying ${x.features.join(' and ')}. Check what is taking the click before rewriting.`] });
  if (HREF) for (const i of HREF.issues.filter(x => x.severity === 'critical').slice(0, 10))
    push({ target:i.url, targetRaw:i.url, kind:'technical', decision:'fix', impact:0, effort:'Low',
           basis:'observed', band:'blocking', severity:'critical', evidence:[i.issue + '. ' + i.detail] });

  if (AI){
    if (AI.gate === 'excluded')
      push({ target:'Search generative AI control', targetRaw:'Search generative AI control', kind:'technical',
             decision:'fix', impact:0, effort:'Low', basis:'observed', band:'blocking', severity:'critical',
             evidence:['This property is set to exclude itself from Google generative AI features. No content work can produce generative visibility while that stands.'] });
    for (const p of AI.pages.filter(x => x.decision === 'blocked').slice(0, 15))
      push({ target:p.raw, targetRaw:p.raw, kind:'technical', decision:'fix', impact:0, effort:'Low',
             basis:'observed', band:'blocking', severity:'critical',
             evidence:['Cannot participate in generative results: ' + p.eligibility.checks.filter(c2=>c2.state==='fail').map(c2=>c2.name.toLowerCase()).join(', ') + '.'] });
    for (const p of AI.pages.filter(x => x.decision === 'recover').slice(0, 15))
      push({ target:p.raw, targetRaw:p.raw, kind:'page', decision:'refresh', impact:(p.webClicks||0)*0.2, effort:'Medium',
             basis:'observed', band:'opportunity',
             evidence:[`Generative impressions ${p.aiBefore==null?'':'fell from ' + fmtInt(p.aiBefore) + ' to ' + fmtInt(p.aiImpr) + ' '}against the previous period. Check what changed on the page and on the result.`] });
    for (const o of AI.opportunities.filter(x => x.priority === 'high').slice(0, 20))
      push({ target:o.ownerRaw || o.query, targetRaw:o.ownerRaw || o.query, kind:'query', decision:'refresh',
             impact:(o.impr||0) * 0.01, effort:'Medium', basis:'observed', band:'opportunity',
             evidence:[`An AI Overview appears for "${o.query}" and you rank ${o.pos==null?'':o.pos.toFixed(1)} with ${fmtInt(o.impr)} impressions, but this page has no recorded generative visibility.`] });
  }

  const grouped = new Map();
  for (const i of ISSUES){
    if (i.severity === 'notice') continue;
    const g = grouped.get(i.code) || { code:i.code, title:i.title, severity:i.severity, urls:[] };
    g.urls.push(i.url);
    grouped.set(i.code, g);
  }
  for (const g of grouped.values())
    push({ target:'tech:' + g.code, targetRaw:g.title, kind:'technical', decision:'fix',
           impact: 0, effort: g.urls.length > 20 ? 'Medium' : 'Low', basis:'observed',
           band: g.severity === 'critical' ? 'blocking' : 'opportunity', severity:g.severity, urls:g.urls.length,
           evidence:[`${g.urls.length} URL${g.urls.length===1?'':'s'} affected. First: ${g.urls[0]||''}`] });

  for (const a of FIND.actions) if (!a.band) a.band = 'opportunity';
  FIND.actions = FIND.actions.concat(extra);
  FIND.actions.sort((a,b) => {
    const ba = a.band === 'blocking' ? 0 : 1, bb = b.band === 'blocking' ? 0 : 1;
    if (ba !== bb) return ba - bb;
    return (b.impact||0) - (a.impact||0);
  });
}

/* ============================================================
   THE RUN
   ============================================================ */
async function run(){
  readCfg();
  if (!DATASETS.length && !(CRAWL && CRAWL.pages.length)){ toast('Load an export or run a crawl first'); go('data'); return; }
  $('#btnRun').disabled = true;
  try {
    MODEL = buildModel(DATASETS);

    // a Screaming Frog style export stands in for a crawl
    const sf = DATASETS.filter(d => d.kind === 'sf_crawl');
    if (sf.length && (!CRAWL || !CRAWL.pages.length)){
      const pages = sf.flatMap(sfToPages);
      CRAWL = { origin: crawlRootUrl() || ('https://' + hostOf(CFG.domain)), pages, sitemaps: SITEMAPS, robots: ROBOTS, at: Date.now(), mode: 'imported' };
    }

    GATES = runGates(MODEL, CFG, DATASETS, FILTERS);
    if (CFG.gscCountry && MODEL.gscCountry.length){
      const tot = MODEL.gscCountry.reduce((s,r)=>s+r.impr,0);
      const mine = MODEL.gscCountry.filter(r => H(r.dim) === CFG.gscCountry || H(r.dim) === H(CFG.country)).reduce((s,r)=>s+r.impr,0);
      const share = tot ? mine/tot : 0;
      GATES.push({ state: share > .8 ? 'pass' : share > .4 ? 'warn' : 'fail', title:'Country matches the export',
        detail: `${Math.round(share*100)}% of impressions in the Countries export come from ${CFG.country}. ` +
                (share > .8 ? 'The Semrush database to match is ' + (CFG.semrushDb||'n/a').toUpperCase() + '.'
                            : 'Either change the country here, or re-export with the country filter applied.') });
    }
    FIND = analyse(MODEL, CFG);

    // topics
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
    const brandTokens = String(CFG.brand||'').toLowerCase().split(/\s+/).filter(t => t.length > 2);
    CLUST = clusterQueries(MODEL.gscQ.current, {
      threshold: CFG.clusterThreshold || 0.38,
      pageIndex: pageIndex.size ? pageIndex : null,
      intents, brandTokens, curve: FIND.curve, ctrAt
    });
    CLUST.clusters = addGapClusters(CLUST.clusters, FIND.gaps, { brandTokens });
    CLUST.stats = summariseClusters(CLUST.clusters);
    PAGEMAP = mapPages(CLUST.clusters);

    // technical
    const gscPageMap = new Map();
    for (const r of MODEL.gscP.current) gscPageMap.set(r.url, { impr:r.impr, clicks:r.clicks, raw:r.urlRaw });
    ISSUES = (CRAWL || SITEMAP_URLS.length)
      ? technicalChecks(CRAWL || { pages: [] }, { sitemaps: SITEMAPS, sitemapUrls: SITEMAP_URLS, robots: ROBOTS,
          gscPages: gscPageMap, origin: crawlRootUrl() })
      : [];

    BACKLINKS = analyseBacklinks(DATASETS, CFG);
    if (BACKLINKS){
      const linked = new Set(BACKLINKS.topTargets.map(t => t.url));
      BACKLINKS.unlinkedEarners = [...gscPageMap.entries()]
        .filter(([u,g]) => g.clicks >= 5 && !linked.has(u))
        .map(([u,g]) => ({ url:u, raw:g.raw || u, clicks:g.clicks, impr:g.impr }))
        .sort((a,b) => b.clicks - a.clicks).slice(0, 40);
    }

    LINKPLAN = planInternalLinks({ crawl: CRAWL, clusters: CLUST.clusters, gscPages: gscPageMap, cfg: CFG });
    BRIEFS = buildBriefs({ clusters: CLUST.clusters, crawl: CRAWL, gscPages: gscPageMap, links: LINKPLAN, cfg: CFG, gaps: FIND.gaps });
    MEDIA  = analyseMedia(CRAWL, gscPageMap);
    SCHEMA = analyseSchema(CRAWL);
    HREF   = analyseHreflang(CRAWL);
    SERP   = analyseSerpFeatures(MODEL, FIND, FIND.curve, ctrAt);
    AI     = analyseAiSearch({ model: MODEL, find: FIND, clusters: CLUST.clusters, crawl: CRAWL, issues: ISSUES,
                               robots: ROBOTS, cfg: CFG, curve: FIND.curve, ctrAtFn: ctrAt, serp: SERP,
                               observations: OBSERVATIONS });

    const topicImpr = CLUST.clusters.reduce((s,c)=>s+c.impr,0);
    const topicTop10 = topicImpr ? CLUST.clusters.filter(c => c.pos != null && c.pos <= 10.5).reduce((s,c)=>s+c.impr,0)/topicImpr : null;
    SCORE = scoreProject({
      crawl: CRAWL, issues: ISSUES, find: FIND, clusters: CLUST.clusters, clusterStats: CLUST.stats,
      backlinks: BACKLINKS, curve: FIND.curve, ctrAt,
      baseRows: MODEL.gscQ.current.length ? MODEL.gscQ.current : MODEL.gscP.current,
      strikingImpr: FIND.striking.reduce((s,r)=>s+r.impr,0),
      sitemapUrls: SITEMAP_URLS, topicTop10
    });

    augmentActions();

    renderGates(); renderScore(); renderFindings(); renderTopics(); renderInternalLinks();
    renderTech(); renderMedia(); renderSerp(); renderAi(); renderLinks(); renderActions(); runProfiles();
    BRIEF_SEL = 0; renderBriefs(); renderModules(); renderMap(); refreshEditor(); syncChips();

    if (PROJECT && DB_OK){
      const rec = await saveRun(PROJECT.id, {
        snapshot: FIND.snapshot.current, overall: SCORE.overall,
        pillars: SCORE.pillars.map(p => ({ key:p.key, score:p.score })),
        counts: { actions: FIND.actions.length, issues: ISSUES.length, topics: CLUST.clusters.length,
                  datasets: DATASETS.length, pages: (CRAWL&&CRAWL.pages||[]).length }
      });
      RUNS.push(rec);
      renderReportPanel(); renderExportPanel(); refreshStorage(); syncChips();
    }
    $$('.step').forEach(b => { if (['checks','score','findings','topics','actions','prompts','report'].includes(b.dataset.go)) b.dataset.state = 'done'; });
    go('score');
    toast('Analysis complete');
  } catch(e){
    console.error(e);
    toast('Analysis failed: ' + e.message);
  } finally {
    $('#btnRun').disabled = !DATASETS.length && !(CRAWL && CRAWL.pages.length);
  }
}

/* ---------- modal ---------- */
function showModal(title, html){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hide');
}
$('#modalClose').onclick = () => $('#modal').classList.add('hide');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hide'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.add('hide'); });

/* ---------- bindings ---------- */
$('#btnRun').onclick = run;
$('#btnRun2').onclick = run;
$('#btnSaveCfg').onclick = () => { saveCfg(); toast('Project saved'); };
$('#projectSel').onchange = e => openProject(e.target.value);
$('#btnNewProject').onclick = async () => {
  const name = prompt('Name this project', 'New project');
  if (!name) return;
  const p = await createProject(name.trim());
  await refreshProjectUI(); await openProject(p.id); go('setup');
};
$('#btnDupProject').onclick = async () => {
  if (!PROJECT) return;
  readCfg();
  const p = await createProject(PROJECT.name + ' (copy)', CFG);
  for (const d of DATASETS) await saveDataset(p.id, { ...d, dbId: null });
  await refreshProjectUI(); await openProject(p.id);
  toast('Duplicated with its data');
};
/* Both of these now live in 05l-export.js: deleting offers a backup first and
   makes you type the project name, and the backup filename carries the date so
   a folder of them sorts itself. */
$('#btnDeleteProject').onclick = () => confirmDeleteProject();
$('#btnExportProject').onclick = () => backupProject();
$('#importProject').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const p = await importProject(JSON.parse(await f.text()));
    await refreshProjectUI(); await openProject(p.id);
    toast('Project imported');
  } catch(err){ toast(err.message); }
  e.target.value = '';
};
$('#btnCompareRuns').onclick = openCompare;
$('#btnCopyBrief').onclick = () => {
  if (!BRIEFS || !BRIEFS.length){ toast('Run the analysis first'); return; }
  navigator.clipboard.writeText(briefToMarkdown(BRIEFS[BRIEF_SEL], CFG)).then(()=>toast('Brief copied'), ()=>toast('Copy blocked by the browser'));
};
$('#btnDownloadBriefs').onclick = () => {
  if (!BRIEFS || !BRIEFS.length){ toast('Run the analysis first'); return; }
  const md = [`# Content briefs — ${CFG.domain||''}`, '', `Generated ${new Date().toISOString().slice(0,10)} from the exports loaded in the console.`, '', `${BRIEFS.length} topics, ordered by modelled headroom.`, '']
    .concat(BRIEFS.map(b => '\n---\n\n' + briefToMarkdown(b, CFG))).join('\n');
  saveFile((hostOf(CFG.domain)||'site').replace(/[^a-z0-9]+/gi,'-') + '-content-briefs.md', md, 'text/markdown');
};
const genSel = document.getElementById('cfgGenerative');
if (genSel) genSel.addEventListener('change', () => { CFG.generativeControl = genSel.value; saveCfg(); });
$('#btnCrawl').onclick = () => doCrawl(false);
$('#btnSitemapOnly').onclick = () => doCrawl(true);
$('#btnStopCrawl').onclick = () => { ABORT.stopped = true; toast('Stopping after the current requests'); };
$('#btnRecheckMode').onclick = () => detectMode().then(m => toast('Route: ' + m));
$('#btnParsePaste').onclick = parsePasted;
$('#btnClearPaste').onclick = () => { $('#pasteXml').value = ''; };
$('#clusterTh').oninput = e => {
  $('#clusterThOut').textContent = (+e.target.value).toFixed(2);
  CFG.clusterThreshold = +e.target.value;
};
$('#clusterTh').onchange = () => { saveCfg(); if (MODEL) run(); };
$('#btnPreviewReport').onclick = () => {
  if (!SCORE){ toast('Run the analysis first'); return; }
  const html = buildReport(exportContext());
  showModal('Report preview', `<iframe sandbox="allow-same-origin" srcdoc="${esc(html)}"></iframe>`);
};
$('#btnDownloadReport').onclick = () => {
  if (!SCORE){ toast('Run the analysis first'); return; }
  const ctx = exportContext();
  saveFile(reportFilename(ctx), buildReport(ctx), 'text/html');
};
$('#btnSavePdfTop').onclick = () => saveReportPdf();
$('#btnExportSnapTop').onclick = () => exportSnapshot();
$('#btnCompareSnapsTop').onclick = () => openCompare();
['cfgDomain','cfgBrand','cfgLanguage','cfgSearchType','cfgDevice','cfgConversion','cfgCompetitors','cfgContext','crawlLimit'].forEach(id => {
  const el = document.getElementById(id); if (el) el.addEventListener('change', saveCfg);
});
/* ============================================================
   RENDERERS FOR THE ADDED STAGES, AND THE POLISH LAYER
   ============================================================ */

/* stage numbers are generated from the rail, so they never drift */
/* Numbers the rail and each panel's eyebrow. Called again by applyTier(),
   because in Simple mode eleven stages are shown and saying "stage 7 of 24" would
   be counting the ones the user cannot see. */
function numberStages(){
  const all = $$('.step[data-go]');
  const shown = all.filter(b => !b.hidden);
  shown.forEach((b, i) => {
    const n = b.querySelector('.stepnum');
    if (n) n.textContent = String(i + 1);
    const panel = document.getElementById('p-' + b.dataset.go);
    if (!panel) return;
    const eye = panel.querySelector('.panelhead .eyebrow');
    if (eye) eye.textContent = `Stage ${i + 1} of ${shown.length}`;
  });
  /* A hidden stage keeps its own number so that switching back to Pro does not
     briefly show a blank one. */
  all.filter(b => b.hidden).forEach(b => {
    const panel = document.getElementById('p-' + b.dataset.go);
    const eye = panel && panel.querySelector('.panelhead .eyebrow');
    if (eye && !eye.textContent.trim()) eye.textContent = 'Stage';
  });
}

/* an empty state that also offers the way out of it */
function emptyState(message, action){
  return `<div class="card"><div class="empty">
    <p style="max-width:52ch;margin:0 auto 12px">${esc(message)}</p>
    ${action ? `<button class="btn" data-go="${action.go}">${esc(action.label)}</button>` : ''}
  </div></div>`;
}
function bindEmptyStates(root){
  (root || document).querySelectorAll('.empty [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

/* ============================================================
   INTERNAL LINKS
   ============================================================ */
function renderInternalLinks(){
  const host = $('#ilinksBody');
  if (!LINKPLAN){ host.innerHTML = emptyState('Run the analysis once a crawl and a Search Console export are loaded.', {go:'crawl', label:'Go to the crawl'}); bindEmptyStates(host); return; }
  if (!LINKPLAN.hasText){
    host.innerHTML = emptyState(LINKPLAN.reason || 'No page text is available, so mentions cannot be found.', {go:'crawl', label:'Crawl settings'});
    bindEmptyStates(host); return;
  }
  const s = LINKPLAN.stats;
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };

  add(`<div class="grid g4">
    ${tile('Links to add', fmtInt(s.opportunities), '<span class="flat">mention exists, link does not</span>')}
    ${tile('Pages searched', fmtInt(s.pagesWithText), `<span class="flat">against ${fmtInt(s.targets)} topic pages</span>`)}
    ${tile('Orphans to rescue', fmtInt(s.orphans), s.orphans ? '<span class="down">nothing links to them</span>' : '<span class="flat">none</span>')}
    ${tile('Median links per page', fmtInt(s.medianLinks), LINKPLAN.overLinked.length ? `<span class="down">${LINKPLAN.overLinked.length} well above it</span>` : '<span class="flat">no outliers</span>')}
  </div>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Ready to place</div><h2 style="margin-top:5px">Every unlinked mention</h2>
    <p class="muted small" style="max-width:76ch;margin-top:5px">The sentence shown is the one already on the source page. Link the highlighted phrase in it. Ranked by how much authority and traffic the source page carries, and how much headroom the destination has.</p></div>`);

  host.appendChild(makeTable([
    {key:'from', label:'Add the link on', get:o=>o.fromRaw, html:o=>`<div class="trunc url" title="${esc(o.fromRaw)}">${esc(o.fromRaw)}</div><span class="dim mono" style="font-size:10px">${fmtInt(o.fromClicks)} clicks · ${fmtInt(o.fromInlinks)} inlinks</span>`},
    {key:'to', label:'Pointing at', get:o=>o.toRaw, html:o=>`<div class="trunc url" title="${esc(o.toRaw)}">${esc(o.toRaw)}</div><span class="tag">${esc(o.topic)}</span>`},
    {key:'anchor', label:'Anchor', get:o=>o.anchor, html:o=>`<code>${esc(o.anchor)}</code>`},
    {key:'ctx', label:'Sentence already on the page', get:o=>o.context, html:o=>{
      const i = o.context.toLowerCase().indexOf(o.anchor);
      const c = i < 0 ? esc(o.context)
        : esc(o.context.slice(0,i)) + '<mark>' + esc(o.context.slice(i, i+o.anchor.length)) + '</mark>' + esc(o.context.slice(i+o.anchor.length));
      return `<div class="small muted" style="max-width:460px">${c}</div>`;
    }},
    {key:'score', label:'Priority', n:1, get:o=>o.score, html:o=>o.score.toFixed(1)}
  ], LINKPLAN.opportunities, {sort:'score', noun:'link opportunities', limit:20, action:'Download as CSV',
      onAction: rows => downloadCsv('internal-links.csv', rows.map(o => ({
        add_link_on:o.fromRaw, pointing_at:o.toRaw, topic:o.topic, anchor:o.anchor,
        existing_sentence:o.context, source_clicks:o.fromClicks, priority:Math.round(o.score*10)/10 }))),
      foot:'Only pages the crawler could read are searched, and only links that do not already exist are suggested. A page is never suggested as a link to itself.',
      empty:'Every topic page is already linked from every page that mentions it. That is unusual and good.'}));

  if (LINKPLAN.orphanRescues.length){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Orphan rescue</div><h2 style="margin-top:5px">Pages nothing links to</h2>
      <p class="muted small" style="max-width:74ch;margin-top:5px">An orphan can still be in the sitemap and still rank, but it receives no internal authority and no crawl path. Where another page already mentions its subject, that is where the link belongs.</p></div>`);
    host.appendChild(makeTable([
      {key:'url', label:'Orphaned page', get:o=>o.raw, html:o=>`<div class="trunc url" title="${esc(o.raw)}">${esc(o.raw)}</div><span class="dim small">${esc(o.title||'')}</span>`},
      {key:'clicks', label:'Clicks', n:1, get:o=>o.clicks, html:o=>fmtInt(o.clicks)},
      {key:'n', label:'Possible sources', n:1, get:o=>o.sources.length},
      {key:'src', label:'Where it is already mentioned', get:o=>o.sources.map(s=>s.from).join(' '), html:o=>o.sources.length
        ? o.sources.slice(0,3).map(s=>`<div class="trunc url small" title="${esc(s.fromRaw)}">${esc(s.fromRaw)} <span class="dim">as “${esc(s.anchor)}”</span></div>`).join('')
        : '<span class="dim small">No page mentions its title or subject, so a link needs writing rather than placing.</span>'}
    ], LINKPLAN.orphanRescues, {sort:'clicks', noun:'orphans', limit:12, empty:''}));
  }
  if (LINKPLAN.overLinked.length){
    add(`<div class="callout warn" style="margin-top:22px"><b>${LINKPLAN.overLinked.length} page${LINKPLAN.overLinked.length===1?'':'s'} carry far more internal links than the rest of the site.</b>
      ${esc(LINKPLAN.overLinked.slice(0,3).map(p=>`${p.raw} (${p.links})`).join(', '))}. Against a median of ${LINKPLAN.stats.medianLinks}. Usually a mega-menu or an archive page. Not a fault in itself, but every link on the page shares the same finite attention.</div>`);
  }
}

/* ============================================================
   BRIEFS
   ============================================================ */
let BRIEF_SEL = 0;
function renderBriefs(){
  const host = $('#briefsBody');
  if (!BRIEFS || !BRIEFS.length){ host.innerHTML = emptyState('Briefs are built from topics, so load a Search Console query export and run the analysis.', {go:'data', label:'Load exports'}); bindEmptyStates(host); return; }
  BRIEF_SEL = Math.min(BRIEF_SEL, BRIEFS.length - 1);
  const b = BRIEFS[BRIEF_SEL];
  host.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card" style="max-height:70vh;overflow:auto">
        <div style="padding:10px 12px;border-bottom:1px solid var(--line)"><input id="briefFilter" placeholder="Filter topics…" style="width:100%;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:7px;padding:7px 9px;font-size:13px"></div>
        <div id="briefList"></div>
      </div>
      <div class="card pad" style="min-height:400px">
        <div class="row wrap gap8" style="margin-bottom:12px">
          <div class="grow"><div class="eyebrow">Brief ${BRIEF_SEL+1} of ${BRIEFS.length}</div><h3 style="margin-top:4px">${esc(b.topic)}</h3></div>
          <span class="pill ${esc(b.status)}">${esc(b.status)}</span>
          <span class="tag">${esc(b.intent)}</span>
        </div>
        <pre class="prompt" id="briefText" style="max-height:60vh">${esc(briefToMarkdown(b, CFG))}</pre>
      </div>
    </div>`;
  const draw = (q) => {
    const list = BRIEFS.map((x,i) => ({x,i})).filter(({x}) => !q || x.topic.toLowerCase().includes(q));
    $('#briefList').innerHTML = list.map(({x,i}) => `
      <button class="brieflink${i===BRIEF_SEL?' on':''}" data-brief="${i}">
        <span class="bt">${esc(x.topic)}</span>
        <span class="bm"><span class="pill ${esc(x.status)}">${esc(x.status)}</span> ${fmtInt(x.impr)} impr · ${fmtInt(x.headroom)} headroom</span>
      </button>`).join('') || '<div class="empty small">Nothing matches.</div>';
    $$('[data-brief]').forEach(el => el.onclick = () => { BRIEF_SEL = +el.dataset.brief; renderBriefs(); });
  };
  draw('');
  $('#briefFilter').addEventListener('input', e => draw(e.target.value.toLowerCase()));
}

/* ============================================================
   MEDIA, SCHEMA, HREFLANG
   ============================================================ */
function renderMedia(){
  const host = $('#mediaBody');
  if (!MEDIA && !SCHEMA && !HREF){
    host.innerHTML = emptyState('Image, markup and language detail comes from a live crawl. An imported crawler export does not carry it.', {go:'crawl', label:'Run a crawl'});
    bindEmptyStates(host); return;
  }
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };

  if (MEDIA && MEDIA.total){
    add(`<div class="grid g4">
      ${tile('Images found', fmtInt(MEDIA.total), `<span class="flat">across ${fmtInt(MEDIA.pages)} pages</span>`)}
      ${tile('No alt attribute', fmtInt(MEDIA.withoutAlt), MEDIA.withoutAlt ? '<span class="down">invisible to screen readers</span>' : '<span class="flat">none</span>')}
      ${tile('Filename problems', fmtInt(MEDIA.badFilename), '<span class="flat">generic, camera or hashed names</span>')}
      ${tile('Older formats', fmtInt(MEDIA.oldFormat), '<span class="flat">jpg, png or gif rather than webp</span>')}
    </div>`);
    add(`<div class="card pad" style="margin-top:14px"><div class="row wrap gap8">
      <span class="chip"><b>${fmtInt(MEDIA.emptyAlt)}</b> deliberately empty alt</span>
      <span class="chip"><b>${fmtInt(MEDIA.noDims)}</b> without width and height</span>
      <span class="chip"><b>${fmtInt(MEDIA.noSrcset)}</b> without srcset</span>
      <span class="chip"><b>${fmtInt(MEDIA.lazyFirst)}</b> lazy-loaded first image</span>
      ${Object.entries(MEDIA.formats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([f,n])=>`<span class="chip">${esc(f)} <b>${fmtInt(n)}</b></span>`).join('')}
    </div>
    <p class="small dim" style="margin-top:9px">An empty alt is a decision, not a fault: decorative images should have one. A missing alt attribute is a fault. The two are counted separately for that reason.</p></div>`);

    add(`<div style="margin:26px 0 12px"><div class="eyebrow">Every image</div><h2 style="margin-top:5px">Image inventory</h2></div>`);
    host.appendChild(makeTable([
      {key:'file', label:'File', get:i=>i.file+'.'+i.ext, html:i=>`<div class="trunc" title="${esc(i.src)}"><code>${esc(i.file)}.${esc(i.ext||'')}</code></div>`},
      {key:'alt', label:'Alt text', get:i=>i.alt||'', html:i=>i.hasAlt ? (i.alt === '' ? '<span class="tag">empty, decorative</span>' : `<div class="trunc small" title="${esc(i.alt)}">${esc(i.alt)}</div>`) : '<span class="sev critical">missing</span>'},
      {key:'page', label:'On page', get:i=>i.pageRaw, html:i=>`<div class="trunc url small" title="${esc(i.pageRaw)}">${esc(i.pageRaw)}</div>`},
      {key:'clicks', label:'Page clicks', n:1, get:i=>i.pageClicks, html:i=>fmtInt(i.pageClicks)},
      {key:'issues', label:'Problems', get:i=>i.issues.join(' '), html:i=>i.issues.length ? i.issues.map(x=>`<span class="tag">${esc(x)}</span>`).join(' ') : '<span class="dim small">none</span>'}
    ], MEDIA.images, {sort:'clicks', noun:'images', limit:20, action:'Download image audit',
        onAction: rows => downloadCsv('images.csv', rows.map(i => ({ file:i.file+'.'+i.ext, src:i.src, page:i.pageRaw,
          page_clicks:i.pageClicks, alt:i.alt==null?'(missing)':i.alt, alt_length:i.altLen, width:i.w||'', height:i.h||'',
          srcset:i.srcset?'yes':'no', loading:i.loading, problems:i.issues.join('; ') }))),
        empty:'No images found.'}));

    if (MEDIA.reused.length)
      add(`<div class="callout" style="margin-top:18px"><b>Reused across many pages:</b> ${MEDIA.reused.slice(0,4).map(r=>`<code>${esc(r.src.split('/').pop())}</code> on ${r.n} pages`).join(', ')}. Shared assets like logos are fine and should usually carry an empty alt. A shared photograph doing different work on each page needs different alt text on each.</div>`);
  }

  if (SCHEMA){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Structured data</div><h2 style="margin-top:5px">What the markup declares</h2></div>`);
    add(`<div class="grid g3">
      ${tile('Pages with markup', `${fmtInt(SCHEMA.withSchema)} / ${fmtInt(SCHEMA.pages)}`, `<span class="flat">${Math.round(SCHEMA.coverage*100)}% coverage</span>`)}
      ${tile('Distinct types', fmtInt(SCHEMA.types.length), '<span class="flat">' + esc(SCHEMA.types.slice(0,3).map(t=>t.type).join(', ')) + '</span>')}
      ${tile('Invalid JSON-LD', fmtInt(SCHEMA.invalid), SCHEMA.invalid ? '<span class="down">will not be read at all</span>' : '<span class="flat">all blocks parse</span>')}
    </div>`);
    if (SCHEMA.types.length){
      host.appendChild(makeTable([
        {key:'t', label:'Type', get:t=>t.type, html:t=>`<code>${esc(t.type)}</code>`},
        {key:'c', label:'Pages', n:1, get:t=>t.count},
        {key:'s', label:'Share of crawled pages', n:1, get:t=>t.count/SCHEMA.pages, html:t=>fmtPct(t.count/SCHEMA.pages)}
      ], SCHEMA.types, {sort:'c', noun:'types', limit:12, empty:''}));
    }
    add(`<p class="small dim" style="margin-top:10px">This reports what is present. It does not validate against Google's requirements for a given rich result, and it cannot: that needs the Rich Results Test against the rendered page. Markup that contradicts what a reader sees is a manual-action risk, so check the visible page too.</p>`);
  }

  if (HREF){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Hreflang</div><h2 style="margin-top:5px">Language and region declarations</h2></div>`);
    add(`<div class="grid g4">
      ${tile('Pages declaring alternates', fmtInt(HREF.pages), `<span class="flat">of ${fmtInt(HREF.total)} crawled</span>`)}
      ${tile('Missing return tags', fmtInt(HREF.noReturn), HREF.noReturn ? '<span class="down">one-way, so discarded</span>' : '<span class="flat">all reciprocal</span>')}
      ${tile('Invalid codes', fmtInt(HREF.badCode), '<span class="flat">not valid language or region</span>')}
      ${tile('No x-default', fmtInt(HREF.noXDefault), '<span class="flat">no fallback declared</span>')}
    </div>`);
    if (HREF.issues.length) host.appendChild(makeTable([
      {key:'sev', label:'Severity', get:i=>SEV_ORDER[i.severity], html:i=>`<span class="sev ${i.severity}">${i.severity}</span>`},
      {key:'issue', label:'Issue', get:i=>i.issue, html:i=>esc(i.issue)},
      {key:'url', label:'URL', get:i=>i.url, html:i=>`<div class="trunc url small">${esc(i.url)}</div>`},
      {key:'d', label:'Detail', get:i=>i.detail, html:i=>`<span class="small muted">${esc(i.detail)}</span>`}
    ], HREF.issues, {sort:'sev', dir:'asc', noun:'hreflang issues', limit:15, empty:''}));
  } else if (MEDIA){
    add(`<p class="small dim" style="margin-top:22px">No hreflang tags were found in the crawl, which is correct for a single-language site.</p>`);
  }
}

/* ============================================================
   SERP FEATURES
   ============================================================ */
function renderSerp(){
  const host = $('#serpBody');
  if (!SERP){ host.innerHTML = emptyState('This reads the SERP features column of a Semrush Organic Positions export. Keep that column when you export.', {go:'data', label:'Load exports'}); bindEmptyStates(host); return; }
  host.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  const lost = SERP.suppressed.reduce((s,x)=>s+x.lost,0);

  add(`<div class="grid g4">
    ${tile('Queries with features', fmtInt(SERP.tracked), '<span class="flat">from the Semrush export</span>')}
    ${tile('Distinct features', fmtInt(SERP.features.length), '<span class="flat">' + esc(SERP.features.slice(0,2).map(f=>f.feature).join(', ')) + '</span>')}
    ${tile('Ranking well, under-clicked', fmtInt(SERP.suppressed.length), '<span class="down">something above you takes the click</span>')}
    ${tile('Clicks going elsewhere', fmtInt(lost), '<span class="flat">estimated, on those queries</span>')}
  </div>`);

  add(`<div class="card pad" style="margin-top:14px"><div class="eyebrow" style="margin-bottom:8px">Features present across your tracked queries</div>
    <div class="row wrap gap8">${SERP.features.map(f=>`<span class="chip"><span class="dot smr"></span>${esc(f.feature)} <b>${fmtInt(f.count)}</b> · ${Math.round(f.share*100)}%</span>`).join('')}</div></div>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Diagnosis</div><h2 style="margin-top:5px">Ranking well underneath something else</h2>
    <p class="muted small" style="max-width:76ch;margin-top:5px">Top-ten positions whose click-through is under 60% of what that rank normally returns, on queries where Semrush recorded a feature. This is the difference between a ranking problem and a result-page problem, and the fix is completely different.</p></div>`);
  host.appendChild(makeTable([
    {key:'kw', label:'Query', get:x=>x.keyword, html:x=>`<div class="trunc" title="${esc(x.keyword)}">${esc(x.keyword)}</div>`},
    {key:'f', label:'Features on the page', get:x=>x.features.join(','), html:x=>x.features.map(f=>`<span class="tag">${esc(f)}</span>`).join(' ')},
    {key:'pos', label:'Your position', n:1, get:x=>x.gscPos, html:x=>fmtPos(x.gscPos)},
    {key:'impr', label:'Impressions', n:1, get:x=>x.gscImpr, html:x=>fmtInt(x.gscImpr)},
    {key:'ctr', label:'Your CTR', n:1, get:x=>x.gscCtr, html:x=>fmtPct(x.gscCtr)},
    {key:'exp', label:'Expected', n:1, get:x=>x.expected, html:x=>fmtPct(x.expected)},
    {key:'lost', label:'Clicks forgone', n:1, get:x=>x.lost, html:x=>`<b>${fmtInt(x.lost)}</b>`}
  ], SERP.suppressed, {sort:'lost', noun:'queries', limit:15, action:'Download as CSV',
      onAction: rows => downloadCsv('serp-suppressed.csv', rows.map(x=>({query:x.keyword, features:x.features.join('; '),
        position:x.gscPos, impressions:x.gscImpr, ctr:x.gscCtr, expected_ctr:x.expected, clicks_forgone:Math.round(x.lost)}))),
      foot:'Semrush records features at crawl time and Search Console records your clicks over the whole period, so these two sources describe slightly different moments. Treat a row as a reason to look at the live result page, not as proof.',
      empty:'No top-ten query is materially under-clicking on a feature-carrying result page.'}));

  add(`<div style="margin:30px 0 12px"><div class="eyebrow">Opportunity</div><h2 style="margin-top:5px">Snippets and questions within reach</h2>
    <p class="muted small" style="max-width:76ch;margin-top:5px">A featured snippet or People also ask block is on the page and you already rank between two and nine. Those are the positions snippets are usually taken from.</p></div>`);
  host.appendChild(makeTable([
    {key:'kw', label:'Query', get:x=>x.keyword, html:x=>`<div class="trunc">${esc(x.keyword)}</div>`},
    {key:'f', label:'Feature', get:x=>x.features.join(','), html:x=>x.features.filter(f=>/Snippet|also ask|FAQ|Things/.test(f)).map(f=>`<span class="tag">${esc(f)}</span>`).join(' ')},
    {key:'pos', label:'Position', n:1, get:x=>x.gscPos!=null?x.gscPos:x.pos, html:x=>fmtPos(x.gscPos!=null?x.gscPos:x.pos)},
    {key:'impr', label:'Impressions', n:1, get:x=>x.gscImpr, html:x=>x.gscImpr?fmtInt(x.gscImpr):`<span style="color:var(--smr)">${fmtInt(x.volume)} est. vol</span>`},
    {key:'url', label:'Ranking URL', get:x=>x.url||'', html:x=>`<div class="trunc url small">${esc(x.url||'')}</div>`}
  ], SERP.targets, {sort:'impr', noun:'targets', limit:15, empty:'No snippet-carrying query sits in the range worth targeting.'}));
}

/* ============================================================
   BACKLINK ADDITIONS
   ============================================================ */
function renderLinkExtras(host){
  if (!BACKLINKS) return;
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };

  if (BACKLINKS.velocity && BACKLINKS.velocity.length > 1){
    const v = BACKLINKS.velocity, max = Math.max(1, ...v.map(m => Math.max(m.gained, m.lost)));
    const W = 640, H = 130, padL = 34, padB = 26, bw = (W - padL - 10) / v.length;
    add(`<div class="chartcard" style="margin-top:22px"><h4>Links first seen, by month</h4>
      <p class="charthint">From the first-seen and lost dates in the export. Only as complete as the export's history.</p>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Links gained and lost by month">
        <line class="gridline" x1="${padL}" y1="${H-padB}" x2="${W-6}" y2="${H-padB}"></line>
        ${v.map((m,i) => {
          const gh = (m.gained/max)*(H-padB-14), lh = (m.lost/max)*(H-padB-14);
          const x = padL + i*bw;
          return `<g class="mark" data-v="${i}">
            <rect x="${(x+1).toFixed(1)}" y="${(H-padB-gh).toFixed(1)}" width="${Math.max(2,bw*0.42).toFixed(1)}" height="${gh.toFixed(1)}" rx="2" fill="var(--div-pos)"></rect>
            <rect x="${(x+1+bw*0.48).toFixed(1)}" y="${(H-padB-lh).toFixed(1)}" width="${Math.max(2,bw*0.42).toFixed(1)}" height="${lh.toFixed(1)}" rx="2" fill="var(--div-neg)"></rect>
          </g>`;
        }).join('')}
        <text class="axis" x="${padL-6}" y="14" text-anchor="end">${max}</text>
        <text class="axlabel" x="${padL}" y="${H-6}">${esc(v[0].month)}</text>
        <text class="axlabel" x="${W-6}" y="${H-6}" text-anchor="end">${esc(v[v.length-1].month)}</text>
      </svg>
      <div class="legend"><span><i class="swatch" style="background:var(--div-pos)"></i>first seen</span><span><i class="swatch" style="background:var(--div-neg)"></i>lost</span></div></div>`);
    host.querySelectorAll('[data-v]').forEach(g => {
      const m = BACKLINKS.velocity[+g.dataset.v];
      g.addEventListener('mousemove', e => showTip(`<b>${esc(m.month)}</b><div class="r"><span>First seen</span><i>${fmtInt(m.gained)}</i></div><div class="r"><span>Lost</span><i>${fmtInt(m.lost)}</i></div>`, e));
      g.addEventListener('mouseleave', hideTip);
    });
  }

  if (BACKLINKS.hasCompetitors && BACKLINKS.hostRows.length > 1){
    add(`<div style="margin:26px 0 12px"><div class="eyebrow">Comparison</div><h2 style="margin-top:5px">You against the exports you loaded beside you</h2>
      <p class="muted small" style="max-width:74ch;margin-top:5px">More than one target host appears in the backlink files, so competitor exports were loaded too. Counts reflect what is in those files, not the whole web.</p></div>`);
    host.appendChild(makeTable([
      {key:'h', label:'Domain', get:h=>h.host, html:h=>`${esc(h.host)}${h.host===BACKLINKS.ownHost?' <span class="tag">you</span>':''}`},
      {key:'d', label:'Referring domains', n:1, get:h=>h.refDomains, html:h=>fmtInt(h.refDomains)},
      {key:'l', label:'Links', n:1, get:h=>h.links, html:h=>fmtInt(h.links)}
    ], BACKLINKS.hostRows, {sort:'d', noun:'domains', limit:10, empty:''}));

    if (BACKLINKS.prospects.length){
      add(`<div style="margin:26px 0 12px"><div class="eyebrow">Link gap</div><h2 style="margin-top:5px">Sites linking to them and not to you</h2>
        <p class="muted small" style="max-width:74ch;margin-top:5px">A domain linking to several competitors is demonstrably willing to link in this space. That is a prospect list, not a guarantee, and it says nothing about whether the link would be a good one.</p></div>`);
      host.appendChild(makeTable([
        {key:'h', label:'Domain', get:p=>p.host, html:p=>`<div class="trunc">${esc(p.host)}</div>`},
        {key:'n', label:'Competitors it links to', n:1, get:p=>p.rivalCount},
        {key:'r', label:'Which', get:p=>p.rivals.join(', '), html:p=>p.rivals.map(r=>`<span class="tag">${esc(r)}</span>`).join(' ')},
        {key:'s', label:'Authority', n:1, get:p=>p.score||0, html:p=>p.score==null?'—':Math.round(p.score)}
      ], BACKLINKS.prospects, {sort:'n', noun:'prospects', limit:15, action:'Download prospects',
          onAction: rows => downloadCsv('link-prospects.csv', rows.map(p=>({domain:p.host, competitors_linked:p.rivals.join('; '), competitor_count:p.rivalCount, authority:p.score||''}))),
          empty:''}));
    }
  }

  if (BACKLINKS.unlinkedEarners && BACKLINKS.unlinkedEarners.length){
    add(`<div style="margin:26px 0 12px"><div class="eyebrow">Unsupported</div><h2 style="margin-top:5px">Pages earning clicks with no links pointing at them</h2>
      <p class="muted small" style="max-width:74ch;margin-top:5px">These pages already perform without external support. They are usually the easiest to move, and the most obvious targets for any outreach you do.</p></div>`);
    host.appendChild(makeTable([
      {key:'u', label:'Page', get:p=>p.raw, html:p=>`<div class="trunc url" title="${esc(p.raw)}">${esc(p.raw)}</div>`},
      {key:'c', label:'Clicks', n:1, get:p=>p.clicks, html:p=>fmtInt(p.clicks)},
      {key:'i', label:'Impressions', n:1, get:p=>p.impr, html:p=>fmtInt(p.impr)}
    ], BACKLINKS.unlinkedEarners, {sort:'c', noun:'pages', limit:12, empty:''}));
  }
}

/* ============================================================
   RUN COMPARISON
   ============================================================ */
/* compareRuns() used to live here. It compared two saved runs and nothing
   else. It is replaced by openCompare() in 05l-export.js, which compares saved
   runs AND exported snapshot files, orders the two sides by date rather than by
   which dropdown they came from, and warns when the two were measured from
   different exports instead of quietly reporting the difference as a trend. */

/* ============================================================
   POLISH: keyboard, print, guards
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === '/'){
    const vis = $$('section.panel:not(.hide) .tfilter')[0];
    if (vis){ e.preventDefault(); vis.focus(); }
  }
  if (e.key === 'g' || e.key === 'G'){
    const steps = $$('.step[data-go]');
    const cur = steps.findIndex(s => s.getAttribute('aria-current') === 'true');
    const next = steps[(cur + (e.shiftKey ? -1 + steps.length : 1)) % steps.length];
    if (next) go(next.dataset.go);
  }
});

if (typeof window !== 'undefined') window.addEventListener('beforeprint', () => {
  $$('section.panel').forEach(s => s.classList.remove('hide'));
  $$('.mod, .pillar, details.ref').forEach(el => el.classList.add('open'));
  $$('details.ref').forEach(d => d.open = true);
});
if (typeof window !== 'undefined') window.addEventListener('afterprint', () => {
  const cur = $$('.step[data-go]').find(s => s.getAttribute('aria-current') === 'true');
  if (cur) go(cur.dataset.go);
});
/* ============================================================
   AI SEARCH STAGE, DATA GUIDE, COLUMN MAPPER
   ============================================================ */
let AI = null, AI_VIEW = 'visibility', OBSERVATIONS = [];

const EV = { observed:'<span class="evtag observed">observed</span>',
             reported:'<span class="evtag reported">reported</span>',
             recorded:'<span class="evtag recorded">recorded</span>' };

/* ---------- visibility ---------- */
function aiViewVisibility(host){
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  if (!AI.available){
    add(`<div class="callout warn"><b>No generative AI export loaded, which is not the same as no visibility.</b>
      The Search Console Generative AI report is the only source that tells you whether your pages actually appeared in a
      generative experience. Until one is loaded this stage shows the query-level evidence only, and every page reads
      "unknown" rather than zero. The export path is on the Getting the data stage.</div>`);
    const b = add(`<div style="margin-top:14px"><button class="btn" data-go="guide">How to export it</button></div>`);
    bindEmptyStates(b); b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => go(x.dataset.go));
    return;
  }
  const v = AI.visibility;
  add(`<div class="grid g4">
    ${tile('Generative AI impressions', fmtInt(v.total), v.hasPrevious ? deltaBit(v.total, v.totalBefore) : '<span class="flat">no previous period loaded</span>')}
    ${tile('Pages appearing', fmtInt(v.urls), `<span class="flat">${fmtInt(v.newUrls)} new, ${fmtInt(v.lostUrls)} lost</span>`)}
    ${tile('Concentration', v.concentration==null?'—':fmtPct(v.concentration), '<span class="flat">share held by the top tenth of pages</span>')}
    ${tile('AI Overview queries', fmtInt(AI.aioQueryCount), '<span class="flat">recorded by Semrush</span>')}
  </div>`);
  add(`<p class="small dim" style="margin-top:9px">${EV.observed} This report counts impressions inside Google's generative features. It carries no query dimension and does not separate AI Overviews from AI Mode, so nothing below claims to. There are no AI clicks here because the report does not provide them; any tool showing you AI click-through is modelling it.</p>`);

  if (v.byDevice || v.byCountry){
    add(`<div class="grid g2" style="margin-top:16px">
      ${v.byDevice ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">By device</div><div class="row wrap gap8">${v.byDevice.map(d=>`<span class="chip">${esc(d.key)} <b>${fmtInt(d.impr)}</b> · ${Math.round(d.share*100)}%</span>`).join('')}</div></div>` : ''}
      ${v.byCountry ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">By country</div><div class="row wrap gap8">${v.byCountry.slice(0,10).map(d=>`<span class="chip">${esc(d.key)} <b>${fmtInt(d.impr)}</b> · ${Math.round(d.share*100)}%</span>`).join('')}</div></div>` : ''}
    </div>`);
  }

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Page level</div><h2 style="margin-top:5px">Which pages Google is using</h2></div>`);
  host.appendChild(makeTable([
    {key:'url', label:'Page', get:r=>r.raw, html:r=>`<div class="trunc url" title="${esc(r.raw)}">${esc(r.raw)}</div>`},
    {key:'impr', label:'AI impressions', n:1, get:r=>r.impr, html:r=>`<b>${fmtInt(r.impr)}</b>`},
    {key:'before', label:'Previous', n:1, get:r=>r.before, html:r=>v.hasPrevious?fmtInt(r.before):'—'},
    {key:'delta', label:'Change', n:1, get:r=>r.delta, html:r=>v.hasPrevious?`<span class="${r.delta>0?'up':r.delta<0?'down':'flat'}">${signed(r.delta)}</span>`:'—'},
    {key:'state', label:'State', get:r=>r.state, html:r=>`<span class="pill ${r.state==='new'?'owned':r.state==='lost'?'split':r.state==='down'?'weak':'investigate'}">${esc(r.state)}</span>`}
  ], v.rows, {sort:'impr', noun:'pages', limit:20, action:'Download AI visibility',
      onAction: rows => downloadCsv('ai-visibility.csv', rows.map(r=>({page:r.raw, ai_impressions:r.impr, previous:r.before, change:r.delta, state:r.state}))),
      empty:'The export contained no rows.'}));
}

/* ---------- opportunities ---------- */
function aiViewOpps(host){
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  if (!AI.opportunities.length){
    host.innerHTML = ''; host.appendChild(Object.assign(document.createElement('div'), {innerHTML:
      emptyState('No query in your Search Console export was recorded by Semrush as carrying an AI Overview. Keep the SERP features column when you export Organic Positions.', {go:'guide', label:'How to export it'})}));
    bindEmptyStates(host); return;
  }
  const high = AI.opportunities.filter(o => o.priority === 'high');
  add(`<div class="grid g4">
    ${tile('AI Overview queries', fmtInt(AI.opportunities.length), '<span class="flat">where you also have impressions</span>')}
    ${tile('High priority', fmtInt(high.length), high.length?'<span class="down">ranking well, no generative visibility</span>':'<span class="flat">none</span>')}
    ${tile('Already appearing', fmtInt(AI.opportunities.filter(o=>o.aiVisible).length), '<span class="flat">protect these</span>')}
    ${tile('Click-through gap', fmtInt(AI.ctrGapTotal), '<span class="flat">modelled, on those result pages</span>')}
  </div>`);
  add(`<p class="small dim" style="margin-top:9px">${EV.reported} Feature presence comes from Semrush at the moment it crawled; ${EV.observed} position and impressions come from your own Search Console period. The two describe different moments, so a row is a reason to look at the live result page, not proof.</p>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Query level</div><h2 style="margin-top:5px">Where AI Overviews appear and you are positioned to be useful</h2></div>`);
  host.appendChild(makeTable([
    {key:'q', label:'Query', get:o=>o.query, html:o=>`<div class="trunc" title="${esc(o.query)}">${esc(o.query)}</div>`},
    {key:'p', label:'Priority', get:o=>o.priority, html:o=>`<span class="pill ${esc(o.priority)}">${esc(o.priority)}</span>`},
    {key:'impr', label:'Impressions', n:1, get:o=>o.impr, html:o=>fmtInt(o.impr)},
    {key:'pos', label:'Position', n:1, get:o=>o.pos==null?999:o.pos, html:o=>fmtPos(o.pos)},
    {key:'own', label:'Owning page', get:o=>o.ownerRaw||'', html:o=>o.ownerRaw?`<div class="trunc url small" title="${esc(o.ownerRaw)}">${esc(o.ownerRaw)}</div>`:'<span class="dim">unknown</span>'},
    {key:'vis', label:'AI visible', get:o=>o.aiVisible?1:0, html:o=>AI.available?(o.aiVisible?'<span class="pill owned">yes</span>':'<span class="pill unmapped">no</span>'):'<span class="dim">unknown</span>'},
    {key:'why', label:'Why', get:o=>o.reason, html:o=>`<span class="small muted">${esc(o.reason)}</span>`}
  ], AI.opportunities, {sort:'impr', noun:'queries', limit:20, action:'Download opportunities',
      onAction: rows => downloadCsv('ai-opportunities.csv', rows.map(o=>({query:o.query, priority:o.priority, impressions:o.impr,
        clicks:o.clicks, position:o.pos, owning_page:o.ownerRaw||'', ai_visible:AI.available?(o.aiVisible?'yes':'no'):'unknown', reason:o.reason}))),
      empty:''}));

  if (AI.ctrGap.length){
    add(`<div style="margin:30px 0 12px"><div class="eyebrow">Click-through</div><h2 style="margin-top:5px">Gap on result pages carrying an AI Overview</h2>
      <p class="muted small" style="max-width:76ch;margin-top:5px">Read this as a modelled gap on pages where an overview was observed, not as clicks the overview took. Ads, video, People also ask and the local pack sit on the same result pages and take clicks too.</p></div>`);
    host.appendChild(makeTable([
      {key:'q', label:'Query', get:x=>x.query, html:x=>`<div class="trunc">${esc(x.query)}</div>`},
      {key:'pos', label:'Position', n:1, get:x=>x.pos, html:x=>fmtPos(x.pos)},
      {key:'impr', label:'Impressions', n:1, get:x=>x.impr, html:x=>fmtInt(x.impr)},
      {key:'ctr', label:'Your CTR', n:1, get:x=>x.ctr, html:x=>fmtPct(x.ctr)},
      {key:'exp', label:'Expected', n:1, get:x=>x.expected, html:x=>fmtPct(x.expected)},
      {key:'other', label:'Also on the page', get:x=>x.otherFeatures.join(','), html:x=>x.otherFeatures.length?x.otherFeatures.map(f=>`<span class="tag">${esc(f)}</span>`).join(' '):'<span class="dim small">nothing else recorded</span>'},
      {key:'gap', label:'Modelled gap', n:1, get:x=>x.gap, html:x=>`<b>${fmtInt(x.gap)}</b>`}
    ], AI.ctrGap, {sort:'gap', noun:'queries', limit:15, empty:''}));
  }
}

/* ---------- page readiness ---------- */
function aiViewPages(host){
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  if (AI.gate === 'excluded'){
    add(`<div class="callout crit"><b>Blocked. This property is set to exclude itself from Google's generative AI features.</b>
      Nothing you do to the content will change that while the setting stands. Change it in Search Console, or change the
      project setting if it was recorded here in error. Everything below is suspended.</div>`);
    return;
  }
  const s = AI.summary;
  add(`<div class="grid g4">
    ${tile('Median readiness', s.medianReadiness==null?'—':s.medianReadiness,
      s.medianReadiness==null?'<span class="flat">needs a live crawl</span>':'<span class="flat">internal editorial metric</span>')}
    ${tile('Protect', fmtInt(s.protect), '<span class="flat">already appearing</span>')}
    ${tile('Opportunity', fmtInt(s.opportunity), '<span class="flat">positioned but absent</span>')}
    ${tile('Technically blocked', fmtInt(s.blocked), s.blocked?'<span class="down">cannot participate</span>':'<span class="flat">none</span>')}
  </div>`);
  add(`<div class="callout warn" style="margin-top:14px"><b>Readiness is our metric, not Google's.</b>
    It is computed from the crawl: eligibility, whether an answer arrives early, evidence density, subtopic coverage,
    organisation, freshness, media and internal links. It is not a Google ranking signal, it does not predict inclusion in
    an AI Overview, and no third-party tool has access to anything that would. Treat it as an editorial checklist with numbers on it.</div>`);

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">Page by page</div><h2 style="margin-top:5px">Web visibility, AI visibility, decision</h2></div>`);
  const t = makeTable([
    {key:'url', label:'Page', get:p=>p.raw, html:p=>`<div class="trunc url" title="${esc(p.raw)}">${esc(p.raw)}</div>${p.cluster?`<span class="tag">${esc(p.cluster)}</span>`:''}`},
    {key:'wi', label:'Web impr.', n:1, get:p=>p.webImpr, html:p=>fmtInt(p.webImpr)},
    {key:'wp', label:'Web pos.', n:1, get:p=>p.webPos==null?999:p.webPos, html:p=>fmtPos(p.webPos)},
    {key:'ai', label:'AI impr.', n:1, get:p=>p.aiImpr==null?-1:p.aiImpr, html:p=>p.aiImpr==null?'<span class="dim">unknown</span>':fmtInt(p.aiImpr)},
    {key:'ad', label:'AI change', n:1, get:p=>p.aiDelta==null?0:p.aiDelta, html:p=>p.aiDelta==null?'—':`<span class="${p.aiDelta>0?'up':p.aiDelta<0?'down':'flat'}">${signed(p.aiDelta)}</span>`},
    {key:'q', label:'AIO queries', n:1, get:p=>p.aioQueries},
    {key:'r', label:'Readiness', n:1, get:p=>p.readiness==null?-1:p.readiness,
      html:p=>p.readiness!=null ? `<b>${p.readiness}</b>`
        : p.readinessUnscored ? `<span class="dim" title="${esc(p.readinessUnscored)}">not scored</span>`
        : '<span class="dim">no crawl</span>'},
    {key:'d', label:'Decision', get:p=>p.decision, html:p=>`<span class="pill ai${esc(p.decision)}">${esc((AI_DECISIONS[p.decision]||{}).label||p.decision)}</span>`},
    {key:'x', label:'', get:()=>'', html:p=>p.readinessRows?`<button class="btn sm ghost" data-aipage="${esc(p.url)}">detail</button>`:''}
  ], AI.pages, {sort:null, noun:'pages', limit:20, action:'Download the page table',
      onAction: rows => downloadCsv('ai-pages.csv', rows.map(p=>({page:p.raw, web_impressions:p.webImpr, web_clicks:p.webClicks,
        web_position:p.webPos, ai_impressions:p.aiImpr==null?'unknown':p.aiImpr, ai_change:p.aiDelta==null?'':p.aiDelta,
        aio_queries:p.aioQueries, readiness:p.readiness==null?'':p.readiness, decision:(AI_DECISIONS[p.decision]||{}).label||p.decision}))),
      foot:'Sorted by decision, most urgent first. Technically blocked pages sit above everything because content work cannot reach them.',
      empty:'Nothing to show.'});
  host.appendChild(t);
  host.querySelectorAll('[data-aipage]').forEach(btn => btn.onclick = () => showPageDetail(btn.dataset.aipage));

  add(`<div class="card pad" style="margin-top:18px"><div class="eyebrow" style="margin-bottom:8px">What each decision means</div>
    <div class="grid g2">${Object.entries(AI_DECISIONS).map(([k,v])=>`<div style="padding:6px 0"><span class="pill ai${k}">${esc(v.label)}</span> <span class="small muted">${esc(v.why)}</span></div>`).join('')}</div></div>`);
}

function showPageDetail(url){
  const p = AI.pages.find(x => x.url === url);
  if (!p) return;
  const rows = p.readinessRows || [];
  showModal('AI readiness · ' + (p.raw || url), `<div style="padding:16px">
    <div class="row wrap gap8" style="margin-bottom:12px">
      <span class="chip">readiness <b>${p.readiness==null?'not scored':p.readiness}</b></span>
      ${p.readinessUnscored?`<span class="small dim">${esc(p.readinessUnscored)}</span>`:''}
      <span class="chip">web impressions <b>${fmtInt(p.webImpr)}</b></span>
      <span class="chip">AI impressions <b>${p.aiImpr==null?'unknown':fmtInt(p.aiImpr)}</b></span>
      <span class="pill ai${esc(p.decision)}">${esc((AI_DECISIONS[p.decision]||{}).label||p.decision)}</span>
    </div>
    <div class="eyebrow" style="margin:14px 0 6px">Eligibility</div>
    <div>${p.eligibility.checks.map(c=>`<div class="gate-row ${c.state}"><span class="ic">${c.state==='pass'?'✓':c.state==='fail'?'×':c.state==='check'?'!':'?'}</span>
      <div><b>${esc(c.name)}</b><div class="small dim">${esc(c.detail)}</div></div>
      <span class="small dim mono">${esc(c.state)}</span></div>`).join('')}</div>
    <div class="eyebrow" style="margin:18px 0 6px">Readiness components</div>
    <div>${rows.map(r=>`<div class="submetric">
        <div><div class="lab">${esc(r.label)}</div><div class="det">${esc(r.note||'')}</div></div>
        <div class="meter${r.value==null?'':(r.value<.5?' crit':r.value<.75?' warn':'')}"><i style="width:${r.value==null?0:Math.round(r.value*100)}%"></i></div>
        <div class="n">${r.value==null?'<span class="dim">n/a</span>':Math.round(r.value*100)}</div>
      </div>`).join('')}</div>
    <p class="small dim" style="margin-top:14px">Weights: ${READINESS_PARTS.map(([,l,w])=>esc(l)+' '+w).join(', ')}. Components with no data are dropped and the remaining weights renormalised, so a page is never punished for something that could not be measured.</p>
  </div>`);
}

/* ---------- fan-out ---------- */
function aiViewFanout(host){
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  add(`<div class="callout"><b>Fan-out is a coverage question, not a page-count question.</b>
    Google assembles a generative answer by running related searches around the original query. The useful response is to
    cover the related tasks properly on the page that owns the topic, not to publish one thin page per variation. This
    table shows queries inside a topic that the owning page never actually addresses in its own words.</div>`);
  if (!AI.fanout.length){
    add(`<div class="card" style="margin-top:14px"><div class="empty">Every topic's owning page already covers its member queries, or there is no crawl to compare against.</div></div>`);
    return;
  }
  add(`<div style="margin:22px 0 12px"><h2>Subtopics the owning page does not cover</h2></div>`);
  host.appendChild(makeTable([
    {key:'t', label:'Topic', get:f=>f.topic, html:f=>`<div class="trunc">${esc(f.topic)}</div>`},
    {key:'u', label:'Owning page', get:f=>f.url, html:f=>`<div class="trunc url small">${esc(f.url)}</div>`},
    {key:'c', label:'Covered', n:1, get:f=>f.covered/f.total, html:f=>`${f.covered} / ${f.total}`},
    {key:'i', label:'Topic impressions', n:1, get:f=>f.impr, html:f=>fmtInt(f.impr)},
    {key:'m', label:'Not addressed', get:f=>f.missing.map(m=>m.q).join(' '), html:f=>`<div class="small muted" style="max-width:460px">${f.missing.slice(0,6).map(m=>esc(m.q)).join('<br>')}${f.missing.length>6?`<br><span class="dim">and ${f.missing.length-6} more</span>`:''}</div>`}
  ], AI.fanout, {sort:'i', noun:'topics', limit:15, action:'Download fan-out gaps',
      onAction: rows => downloadCsv('fanout-gaps.csv', rows.flatMap(f=>f.missing.map(m=>({topic:f.topic, owning_page:f.url, uncovered_query:m.q, impressions:m.impr})))),
      foot:"A query counts as covered when all its meaningful words appear in the page's body text or headings. That is a text match, not a judgement about whether the page answers it well.",
      empty:''}));
}

/* ---------- citations ---------- */
function aiViewCitations(host){
  const add = h => { const d = document.createElement('div'); d.innerHTML = h; host.appendChild(d); return d; };
  const S = summariseObservations(OBSERVATIONS, CFG);
  add(`<div class="callout"><b>Nothing here is scraped.</b> ${EV.recorded} Google does not publish which sources an AI Overview
    cited, and no export contains it. So this is a manual record: you look at the overview, paste it in with the URLs it cited,
    and the console keeps it with a date against the project. That record is what the research prompts then work from.</div>`);
  if (!S){
    add(`<div class="card" style="margin-top:14px"><div class="empty">
      <p style="max-width:56ch;margin:0 auto 12px">No observations recorded yet. Search one of your high-priority queries, and if an AI Overview appears, paste it in with the URLs it cited.</p>
      <button class="btn primary" id="obsEmpty">Record an AI Overview</button></div></div>`);
    const b = host.querySelector('#obsEmpty'); if (b) b.onclick = addObservation;
    return;
  }
  add(`<div class="grid g4">
    ${tile('Overviews recorded', fmtInt(S.observations), `<span class="flat">${fmtInt(S.withOverview)} had an overview present</span>`)}
    ${tile('Sources cited', fmtInt(S.totalCites), `<span class="flat">across ${fmtInt(S.domains.length)} domains</span>`)}
    ${tile('Times you were cited', fmtInt(S.ourCites), S.ourCites?'<span class="up">you appear</span>':'<span class="down">not cited yet</span>')}
    ${tile('Your citation share', fmtPct(S.ourShare), `<span class="flat">of the sources you recorded</span>`)}
  </div>`);
  add(`<div style="margin:24px 0 12px"><div class="eyebrow">Who Google is using</div><h2 style="margin-top:5px">Cited domains</h2></div>`);
  host.appendChild(makeTable([
    {key:'h', label:'Domain', get:d=>d.host, html:d=>`${esc(d.host)}${CFG.domain && d.host===hostOf(CFG.domain)?' <span class="tag">you</span>':''}`},
    {key:'c', label:'Citations', n:1, get:d=>d.cites},
    {key:'q', label:'Queries', n:1, get:d=>d.queries}
  ], S.domains, {sort:'c', noun:'domains', limit:15, empty:''}));

  add(`<div style="margin:26px 0 12px"><div class="eyebrow">The record</div><h2 style="margin-top:5px">Overviews you have captured</h2></div>`);
  const wrap = document.createElement('div');
  wrap.innerHTML = OBSERVATIONS.map(o => `<div class="obs">
    <div class="row wrap gap8"><h4 class="grow">${esc(o.query || '(no query recorded)')}</h4>
      <span class="chip">${esc(o.date)}</span>${o.country?`<span class="chip">${esc(o.country)}</span>`:''}${o.device?`<span class="chip">${esc(o.device)}</span>`:''}
      <span class="pill ${o.present?'owned':'unmapped'}">${o.present?'overview present':'no overview'}</span>
      <button class="btn sm" data-pack="${esc(o.id)}">Citation pack</button>
      <button class="btn sm ghost" data-delobs="${esc(o.id)}">remove</button></div>
    ${o.packGeneratedAt?`<div class="small dim" style="margin-top:6px">Citation pack generated ${new Date(o.packGeneratedAt).toISOString().slice(0,10)}. Record this query again after the rewrite ships to see whether it changed anything.</div>`:''}
    ${o.response?`<p class="small muted" style="margin-top:8px;max-width:80ch">${esc(o.response.slice(0,420))}${o.response.length>420?'…':''}</p>`:''}
    <div class="cited">${o.cited.map(c=>`<span class="chip"><span class="dot ${CFG.domain&&c.host===hostOf(CFG.domain)?'good':'smr'}"></span>${esc(c.host)}</span>`).join('')}</div>
  </div>`).join('');
  host.appendChild(wrap);
  wrap.querySelectorAll('[data-delobs]').forEach(b => b.onclick = async () => {
    OBSERVATIONS = OBSERVATIONS.filter(o => o.id !== b.dataset.delobs);
    if (PROJECT){ PROJECT.cfg.observations = OBSERVATIONS; await saveProject(PROJECT); }
    renderAi();
  });
  wrap.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => openCitationPack(b.dataset.pack));

  /* Same query recorded more than once is the only before-and-after evidence that exists here,
     so it gets its own view rather than being buried in the list. */
  const byQuery = new Map();
  for (const o of OBSERVATIONS){
    const k = (o.query || '').toLowerCase().trim();
    if (!k) continue;
    if (!byQuery.has(k)) byQuery.set(k, []);
    byQuery.get(k).push(o);
  }
  const repeated = [...byQuery.entries()].filter(([, v]) => v.length > 1);
  if (repeated.length){
    add(`<div style="margin:28px 0 12px"><div class="eyebrow">Before and after</div>
      <h2 style="margin-top:5px">Queries you have checked more than once</h2>
      <p class="small muted" style="max-width:70ch;margin-top:6px">One observation is a snapshot. Two of the same query, either side of a rewrite, is the closest thing to evidence that the work changed anything. This is still a sample of one, on a surface that varies by user and by day, so read it as a signal rather than a result.</p></div>`);
    const tl = document.createElement('div');
    tl.innerHTML = repeated.map(([k, list]) => {
      const rows = list.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)));
      return `<div class="obs"><h4>${esc(rows[0].query)}</h4>
        <div class="row wrap gap8" style="margin-top:8px">${rows.map(o => {
          const ours = o.cited.some(c => CFG.domain && (c.host === hostOf(CFG.domain) || c.host.endsWith('.' + hostOf(CFG.domain))));
          return `<span class="chip"><span class="dot ${ours?'good':'smr'}"></span>${esc(o.date)} · ${ours?'cited':'not cited'} · ${o.cited.length} source${o.cited.length===1?'':'s'}${o.packGeneratedAt?' · pack run':''}</span>`;
        }).join('')}</div></div>`;
    }).join('');
    host.appendChild(tl);
  }
}

/* ---------- citation pack ---------- */
function openCitationPack(obsId){
  const o = OBSERVATIONS.find(x => x.id === obsId);
  if (!o) return;
  const ctx = { cfg: CFG, ai: AI, crawl: CRAWL, clusters: (CLUST && CLUST.clusters) || [], serp: SERP };
  const c = citationContext(o, ctx);
  const ready = packReadiness(c);
  /* Everything is on by default. A missing input is worth flagging, but it is not a reason to
     withhold the pack — the prompt still carries the instruction and tells the operator exactly
     what to paste in. Silently unticking the opening rewrite, which is the one that matters most,
     was worse than showing it with a warning attached. */
  const state = new Set(CITATION_PACKS.map(p => p.key));

  showModal('Citation pack · ' + (o.query || 'observation'), `<div style="padding:16px">
    <div class="row wrap gap8" style="margin-bottom:12px">
      <span class="chip">shape <b>${esc(AIO_TYPES[c.type].label)}</b></span>
      <span class="chip">${c.weWereCited ? 'currently cited' : 'not currently cited'}</span>
      <span class="chip">${c.ownerRaw ? 'owning page mapped' : 'no owning page'}</span>
    </div>
    <p class="small muted" style="max-width:74ch">The shape was detected from the query wording (<span class="mono">${esc(AIO_TYPES[c.type].hint)}</span>) and decides which opening rewrite you get. Change it if the overview you saw was actually a different shape.</p>
    <label class="field" style="max-width:280px;margin:10px 0 16px"><span>Overview shape</span>
      <select id="packType">${Object.entries(AIO_TYPES).map(([k,v])=>`<option value="${k}"${k===c.type?' selected':''}>${esc(v.label)}</option>`).join('')}</select></label>
    <div class="eyebrow" style="margin-bottom:8px">Packs to include</div>
    <div id="packList">${CITATION_PACKS.map(p => {
      const r = ready[p.need] || { ok:true };
      return `<label class="gate-row ${r.ok?'pass':'check'}" style="cursor:pointer">
        <input type="checkbox" data-pack-key="${p.key}" ${state.has(p.key)?'checked':''} style="margin-top:3px">
        <div><b>${esc(p.name)}</b><div class="small dim">${esc(p.what)}</div>
        ${r.ok?'':`<div class="small" style="color:var(--warn)">${esc(r.why)}</div>`}</div>
      </label>`;
    }).join('')}</div>
    <div class="row gap8" style="margin-top:16px">
      <button class="btn primary" id="packCopy">Copy pack</button>
      <button class="btn" id="packDownload">Download</button>
      <button class="btn ghost" id="packClose">Close</button>
      <div class="grow"></div><span class="small dim" id="packSize"></span>
    </div>
    <div class="eyebrow" style="margin:18px 0 6px">Preview</div>
    <pre id="packPreview" class="mono" style="max-height:38vh;overflow:auto;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:11.5px;white-space:pre-wrap"></pre>
  </div>`);

  const build = () => {
    const keys = [...document.querySelectorAll('[data-pack-key]')].filter(i => i.checked).map(i => i.dataset.packKey);
    const res = buildCitationPack(o, ctx, keys, { type: document.getElementById('packType').value });
    document.getElementById('packPreview').textContent = res.text;
    document.getElementById('packSize').textContent = keys.length + ' pack' + (keys.length===1?'':'s') + ' · ' + Math.round(res.text.length/1000) + 'k characters';
    return res;
  };
  let current = build();
  document.querySelectorAll('[data-pack-key]').forEach(i => i.onchange = () => { current = build(); });
  document.getElementById('packType').onchange = () => { current = build(); };
  document.getElementById('packClose').onclick = () => $('#modal').classList.add('hide');
  const mark = async () => {
    o.packGeneratedAt = Date.now();
    if (PROJECT){ PROJECT.cfg.observations = OBSERVATIONS; await saveProject(PROJECT).catch(()=>{}); }
  };
  document.getElementById('packCopy').onclick = async () => {
    await mark();
    navigator.clipboard.writeText(current.text).then(()=>toast('Citation pack copied'), ()=>toast('Copy blocked by the browser'));
  };
  document.getElementById('packDownload').onclick = async () => {
    await mark();
    const name = 'citation-pack-' + (o.query||'query').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40) + '.txt';
    saveFile(name, current.text, "text/plain");
    toast('Downloaded');
  };
}

/* ---------- rules ---------- */
const AI_ANTIPATTERNS = [
  ['llms.txt for Google', 'Google has said it does not use it for Search. Publish one if another tool wants it, but not as an AI Overview tactic.'],
  ['A special "AI schema"', 'There is no such markup. Structured data helps machines parse a page generally; it is not an entry requirement for generative results.'],
  ['Chopping content into tiny "AI chunks"', 'Passage-level retrieval does not require you to break a page into fragments. It makes the page worse to read and does not make it more extractable.'],
  ['One page per fan-out variation', 'Publishing a page for every related query Google might run is how a site ends up with scaled content abuse, which is a policy problem, not a ranking tactic.'],
  ['Rewriting everything into robotic question and answer', 'Question headings help where people ask questions. Converting an entire site into Q and A helps nobody.'],
  ['Exact-match long-tail stuffing', 'Google resolves meaning, not strings. Repetition costs readability and buys nothing.'],
  ['Manufactured Reddit or forum mentions', 'Inauthentic mentions are not a visibility strategy, and they are the kind of thing that gets cleaned up retroactively.'],
  ['Schema on everything, for AI Overviews', 'Add structured data where it describes the page honestly. Adding it everywhere in the hope of generative inclusion is cargo cult.'],
  ['Claiming a change guarantees inclusion', 'Nobody outside Google can promise that, including this tool. Any output here that sounds like a guarantee is a bug.']
];
function aiViewRules(host){
  host.innerHTML = `
    <div class="callout"><b>This tool will not recommend any of the following, and neither should anything else.</b>
      They are the tactics that circulate whenever a new surface appears. Most are harmless waste; a few are policy risks.</div>
    <div style="margin:22px 0 12px"><h2>Not recommended, and why</h2></div>
    <div class="tablewrap"><table><thead><tr><th style="width:32%">Do not</th><th>Why</th></tr></thead><tbody>
      ${AI_ANTIPATTERNS.map(([a,b]) => `<tr><td><b>${esc(a)}</b></td><td class="small muted">${esc(b)}</td></tr>`).join('')}
    </tbody></table></div>
    <div style="margin:28px 0 12px"><h2>What is left, which is the actual work</h2></div>
    <div class="grid g2">
      <div class="card pad"><b class="small">Answer the task, early</b><p class="small muted" style="margin-top:6px">A self-contained answer in the opening paragraph, before the preamble. The readiness metric measures whether one exists.</p></div>
      <div class="card pad"><b class="small">Contribute something a model cannot</b><p class="small muted" style="margin-top:6px">Original data, real examples, first-hand experience, screenshots, pricing you actually charge, a decision framework you actually use.</p></div>
      <div class="card pad"><b class="small">Substantiate claims</b><p class="small muted" style="margin-top:6px">Figures with sources and dates. Content that is citable gets cited; content that asserts gets summarised away.</p></div>
      <div class="card pad"><b class="small">Cover the related tasks properly</b><p class="small muted" style="margin-top:6px">On the page that owns the topic. The fan-out view lists which member queries the owning page never addresses.</p></div>
      <div class="card pad"><b class="small">Stay eligible</b><p class="small muted" style="margin-top:6px">Indexable, crawlable, snippet-eligible, not excluded by the generative control. The eligibility gate checks all of it per page.</p></div>
      <div class="card pad"><b class="small">Measure afterwards</b><p class="small muted" style="margin-top:6px">Generative impressions against a saved baseline at 7, 14, 28, 56 and 90 days. Every run here is a baseline.</p></div>
    </div>
    <p class="small dim" style="margin-top:18px">Generative results still run on Google's ordinary ranking and retrieval. There is no separate set of requirements to satisfy, which is why this stage measures the same things the rest of the suite does and simply asks a different question of them.</p>`;
}

/* ---------- shell ---------- */
function renderAi(){
  const host = $('#aiBody');
  if (!AI){ host.innerHTML = emptyState('Run the analysis to populate this stage.', {go:'data', label:'Load exports'}); bindEmptyStates(host); return; }
  host.innerHTML = '';
  ({ visibility: aiViewVisibility, opps: aiViewOpps, pages: aiViewPages,
     fanout: aiViewFanout, citations: aiViewCitations, rules: aiViewRules }[AI_VIEW] || aiViewVisibility)(host);
  $$('#aiViews [data-aiview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aiview === AI_VIEW)));
}
$$('#aiViews [data-aiview]').forEach(b => b.onclick = () => { AI_VIEW = b.dataset.aiview; renderAi(); });

const OBS_TEMPLATE = `Query:
Date: ${new Date().toISOString().slice(0,10)}
Country:
Device:
AI Overview present: Yes
AI Overview response:


Cited URLs:


Follow-up questions:


People also ask:


Notes: `;

function addObservation(){
  showModal('Record an AI Overview', `<div style="padding:16px">
    <p class="small muted" style="margin-bottom:10px">Search the query yourself, then paste what you see. Fill in what you have and leave the rest; only the query and the cited URLs really matter. Any URLs anywhere in the text are picked up. The follow-up questions and People Also Ask feed the citation pack, so they are worth the extra thirty seconds.</p>
    <textarea id="obsText" style="width:100%;min-height:260px;font-family:var(--mono);font-size:12px;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;padding:11px">${esc(OBS_TEMPLATE)}</textarea>
    <div class="row gap8" style="margin-top:12px"><button class="btn primary" id="obsSave">Save observation</button>
      <button class="btn ghost" id="obsCancel">Cancel</button>
      <div class="grow"></div><span class="small dim">Stored with this project, in this browser.</span></div>
  </div>`);
  $('#obsCancel').onclick = () => $('#modal').classList.add('hide');
  $('#obsSave').onclick = async () => {
    const o = parseObservation($('#obsText').value);
    if (!o){ toast('Needs at least a query or a cited URL'); return; }
    OBSERVATIONS.push(o);
    if (PROJECT){ PROJECT.cfg.observations = OBSERVATIONS; await saveProject(PROJECT).catch(()=>{}); }
    $('#modal').classList.add('hide');
    AI_VIEW = 'citations';
    if (AI) AI.observations = OBSERVATIONS;
    renderAi(); go('ai'); syncChips();
    toast('Observation recorded');
  };
}
$('#btnAddObs').onclick = addObservation;

$('#btnAiPacket').onclick = () => {
  if (!AI){ toast('Run the analysis first'); return; }
  navigator.clipboard.writeText(aiResearchPacket()).then(()=>toast('Research packet copied'), ()=>toast('Copy blocked by the browser'));
};

function aiResearchPacket(){
  const L = [];
  const host = hostOf(CFG.domain||'');
  L.push('GOOGLE AI SEARCH EVIDENCE PACKET');
  L.push(`Domain: ${host}   Market: ${CFG.country||''}   Generated: ${new Date().toISOString().slice(0,10)}`);
  L.push('');
  L.push('EVIDENCE TYPES USED BELOW');
  L.push('  OBSERVED  = Google Search Console generative AI impressions (page level only, no query dimension,');
  L.push('              does not separate AI Overviews from AI Mode).');
  L.push('  REPORTED  = Semrush recorded an AI Overview on this query when it crawled.');
  L.push('  RECORDED  = an AI Overview a human pasted in, with the sources it cited.');
  L.push('Do not merge them. Do not infer why Google chose a source.');
  L.push('');
  L.push('GENERATIVE AI CONTROL: ' + (AI.gate || 'unknown'));
  if (AI.available){
    const v = AI.visibility;
    L.push('');
    L.push('OBSERVED VISIBILITY');
    L.push(`  total generative impressions ${Math.round(v.total)}` + (v.hasPrevious ? `, previous period ${Math.round(v.totalBefore)}, change ${v.delta>0?'+':''}${Math.round(v.delta)}` : ', no previous period loaded'));
    L.push(`  pages appearing ${v.urls}, new ${v.newUrls}, lost ${v.lostUrls}`);
    L.push('  top pages:');
    for (const r of v.rows.slice(0,15)) L.push(`    ${r.raw}\t${r.impr}\t${r.state}`);
  } else {
    L.push('');
    L.push('OBSERVED VISIBILITY: no Search Console generative AI export loaded. Treat page-level AI visibility as unknown, not zero.');
  }
  L.push('');
  L.push('REPORTED AI OVERVIEW QUERIES (top by impressions)');
  L.push('  query\timpressions\tclicks\tposition\towning_page\tai_visible\tpriority');
  for (const o of AI.opportunities.slice(0,40))
    L.push(`  ${o.query}\t${o.impr}\t${o.clicks}\t${o.pos==null?'':o.pos.toFixed(1)}\t${o.ownerRaw||''}\t${AI.available?(o.aiVisible?'yes':'no'):'unknown'}\t${o.priority}`);
  if (AI.ctrGap.length){
    L.push('');
    L.push('CLICK-THROUGH GAP ON RESULT PAGES CARRYING AN OVERVIEW (modelled, not attributed)');
    L.push('  query\tposition\timpressions\tctr\texpected_ctr\tmodelled_gap\tother_features');
    for (const x of AI.ctrGap.slice(0,25))
      L.push(`  ${x.query}\t${x.pos.toFixed(1)}\t${x.impr}\t${(x.ctr*100).toFixed(2)}%\t${(x.expected*100).toFixed(2)}%\t${Math.round(x.gap)}\t${x.otherFeatures.join(' ')}`);
  }
  if (AI.fanout.length){
    L.push('');
    L.push('SUBTOPICS THE OWNING PAGE DOES NOT ADDRESS');
    for (const f of AI.fanout.slice(0,12)) L.push(`  ${f.topic} (${f.url}) covered ${f.covered}/${f.total}: ${f.missing.slice(0,8).map(m=>m.q).join(' | ')}`);
  }
  L.push('');
  L.push('PAGE DECISIONS');
  L.push('  page\tweb_impr\tweb_pos\tai_impr\treadiness\tdecision');
  for (const p of AI.pages.slice(0,30))
    L.push(`  ${p.raw}\t${p.webImpr}\t${p.webPos==null?'':p.webPos.toFixed(1)}\t${p.aiImpr==null?'unknown':p.aiImpr}\t${p.readiness==null?'':p.readiness}\t${(AI_DECISIONS[p.decision]||{}).label||p.decision}`);
  const blocked = AI.pages.filter(p => p.decision === 'blocked');
  if (blocked.length){
    L.push('');
    L.push('TECHNICALLY BLOCKED, CONTENT WORK CANNOT REACH THESE');
    for (const p of blocked.slice(0,15))
      L.push(`  ${p.raw}: ${p.eligibility.checks.filter(c=>c.state==='fail').map(c=>c.name+' — '+c.detail).join('; ')}`);
  }
  if (OBSERVATIONS.length){
    L.push('');
    L.push('RECORDED AI OVERVIEWS');
    for (const o of OBSERVATIONS.slice(0,10)){
      L.push(`  QUERY: ${o.query}  (${o.date}${o.country?', '+o.country:''}${o.device?', '+o.device:''})`);
      if (o.response) L.push(`    RESPONSE: ${o.response.replace(/\s+/g,' ').slice(0,900)}`);
      L.push(`    CITED: ${o.cited.map(c=>c.url).join(' | ')}`);
    }
  }
  L.push('');
  L.push('PROJECT CONTEXT');
  L.push(`  brand: ${CFG.brand||''}   conversion: ${CFG.conversion||''}`);
  if (CFG.context) L.push('  ' + CFG.context.replace(/\n/g,'\n  '));
  L.push('');
  L.push('Use this with module 20, 21 and 22 of the prompt pack, in that order.');
  return L.join('\n');
}

/* ============================================================
   COLUMN MAPPER
   ============================================================ */
const MAP_FIELDS = [
  ['query','Query or keyword'], ['page','Page or URL'], ['clicks','Clicks'], ['impr','Impressions'],
  ['ctr','Click-through rate'], ['pos','Position'], ['date','Date'], ['country','Country'], ['device','Device'],
  ['volume','Search volume'], ['kd','Keyword difficulty'], ['features','SERP features'], ['intent','Intent'],
  ['ignore','— ignore —']
];
const MAP_KINDS = ['gsc_query','gsc_page','gsc_page_query','gsc_date','gsc_country','gsc_device',
  'gsc_genai_page','gsc_genai_date','gsc_genai_country','gsc_genai_device',
  'semrush_positions','semrush_gap','semrush_tracking','semrush_audit','semrush_backlinks','sf_crawl'];

function openMapper(id){
  const d = DATASETS.find(x => x.id == id);
  if (!d) return;
  const sample = c => { const v = (d.rows.find(r => String(r[c]||'').trim()) || {})[c]; return v == null ? '' : String(v).slice(0,42); };
  const guess = c => {
    const h = H(c);
    for (const k of ['query','page','clicks','impr','ctr','pos','date','country','device'])
      if (ALIAS[k] && ALIAS[k].some(a => h === a || h.startsWith(a))) return k;
    if (/volume/.test(h)) return 'volume';
    if (/difficulty|^kd/.test(h)) return 'kd';
    if (/serp feature/.test(h)) return 'features';
    if (/intent/.test(h)) return 'intent';
    return 'ignore';
  };
  showModal('Map the columns · ' + d.name, `<div style="padding:16px">
    <p class="small muted" style="margin-bottom:12px">This file was not recognised automatically. Tell the console what kind of report it is and which column holds what. The mapping is remembered with the file.</p>
    <label class="field" style="max-width:340px;margin-bottom:14px"><span>What kind of report is this</span>
      <select id="mapKind">${MAP_KINDS.map(k=>`<option value="${k}"${k===d.kind?' selected':''}>${esc(KIND_LABEL[k]||k)}</option>`).join('')}</select></label>
    <div class="eyebrow" style="margin-bottom:6px">Columns found in the file</div>
    <div style="max-height:46vh;overflow:auto">
      ${d.headers.map((c,i)=>`<div class="maprow">
        <div><div class="cx">${esc(c || '(unnamed column ' + (i+1) + ')')}</div><span class="sample">${esc(sample(c))}</span></div>
        <select data-mapcol="${esc(c)}">${MAP_FIELDS.map(([v,l])=>`<option value="${v}"${v===guess(c)?' selected':''}>${esc(l)}</option>`).join('')}</select>
      </div>`).join('')}
    </div>
    <div class="row gap8" style="margin-top:14px"><button class="btn primary" id="mapSave">Apply mapping</button>
      <button class="btn ghost" id="mapCancel">Cancel</button></div>
  </div>`);
  $('#mapCancel').onclick = () => $('#modal').classList.add('hide');
  $('#mapSave').onclick = () => {
    const kind = $('#mapKind').value;
    const map = {};
    $$('[data-mapcol]').forEach(s => { if (s.value !== 'ignore') map[s.value] = s.dataset.mapcol; });
    // rewrite the headers into names the rest of the pipeline already understands
    const canon = { query:'Query', page:'Page', clicks:'Clicks', impr:'Impressions', ctr:'CTR', pos:'Position',
                    date:'Date', country:'Country', device:'Device', volume:'Search Volume',
                    kd:'Keyword Difficulty', features:'SERP Features by Keyword', intent:'Keyword Intents' };
    const rename = new Map();
    for (const [field, col] of Object.entries(map)) if (canon[field]) rename.set(col, canon[field]);
    if (rename.size){
      d.headers = d.headers.map(c => rename.get(c) || c);
      d.rows = d.rows.map(r => { const o = {}; for (const k of Object.keys(r)) o[rename.get(k) || k] = r[k]; return o; });
    }
    d.kind = kind;
    d.source = kind.startsWith('gsc') ? 'gsc' : kind.startsWith('semrush') ? 'semrush' : kind === 'sf_crawl' ? 'sf' : 'unknown';
    d.mapped = true;
    persistDataset(d);
    $('#modal').classList.add('hide');
    renderLedger(); syncChips();
    toast('Mapping applied. Run the analysis again.');
  };
}

/* ============================================================
   GETTING THE DATA
   ============================================================ */
const GUIDE = [
  { src:'gsc', title:'Search Console — Performance, Search results',
    unlocks:'Everything on the search side: the baseline, striking distance, snippet gaps, topics, decay.',
    steps:[
      'Open Search Console and pick the exact property. A domain property and a URL-prefix property are different datasets.',
      'Performance → Search results.',
      'Set <b>Search type</b> first (Web, Image, Video, News). Everything after this inherits it.',
      'Set the date range. 28 days is the usual working window.',
      'Apply any country or device filter you intend to analyse under, and write it down. An export without its filters cannot be compared to anything later.',
      'Click <b>Export</b> (top right) → <b>Download CSV</b>. You get a ZIP.',
      'Drop the ZIP into this console whole. Queries, Pages, Countries, Devices, Dates and the filter sheet are read out of it in one go.',
      'For a comparison, change the range to the previous period, export again, and set that file to <b>Previous period</b> in the file list.'
    ],
    note:'Report exports cap at about 1,000 rows and follow whatever filters and grouping are active. That is fine for a first read and wrong for anything long-tail.' },

  { src:'gsc', title:'Search Console — Generative AI report',
    unlocks:'The AI Search stage: which of your pages actually appeared in Google generative experiences.',
    steps:[
      'In Search Console, open the Performance section and look for the generative AI report alongside Search results and Discover.',
      'Set the date range, then export the same way: <b>Export</b> → <b>Download CSV</b>.',
      'Export the current period and the previous period separately, and label the second <b>Previous period</b> here.',
      'Drop them in. The console recognises them by shape: an impressions column with a page, date, country or device dimension and no clicks or position columns.'
    ],
    note:'This report is rolling out and not every property has it yet. It is page level: there is no query dimension, and it does not separate AI Overviews from AI Mode. If your property does not have it, the AI stage says visibility is unknown rather than zero, which is the honest reading.' },

  { src:'gsc', title:'Search Console API — page and query together',
    unlocks:'Topic ownership, cannibalisation, page dilution, and the internal link planner\'s targets. The single most valuable file you can add.',
    steps:[
      'The standard report cannot export page and query on the same row. The API can.',
      'Use the Search Analytics API with <code>dimensions=["page","query"]</code>, one day per request, paging at 25,000 rows.',
      'Or set up the BigQuery bulk export: Search Console → Settings → Bulk data export. The first export is prospective and can take up to 48 hours, so set it up before you need it.',
      'Save the result as CSV or JSON. This console reads a raw Search Analytics API response directly, including the <code>{ "rows": [{ "keys": [...] }] }</code> shape.'
    ],
    note:'Without this file, topics still form from vocabulary alone but no page can be assigned an owner, and several stages say so plainly.' },

  { src:'smr', title:'Semrush — Organic Research, Positions',
    unlocks:'Estimated volume and difficulty, rank changes, and the SERP features that drive the AI Search and SERP stages.',
    steps:[
      'Semrush → Organic Research → enter the domain → <b>Positions</b> tab.',
      'Pick the database that matches your country. It must match the country set on the project stage.',
      'Apply any intent, position or subfolder filters you want, then <b>Export</b> (top right) → CSV or Excel.',
      'Keep the <b>SERP Features by Keyword</b> column. It is what tells this console which queries carry an AI Overview.',
      'Repeat for each competitor if you want a comparison.'
    ],
    note:'Volume, difficulty and traffic are modelled estimates for one database and location. They are drawn in orange throughout the console for that reason.' },

  { src:'smr', title:'Semrush — Keyword Gap',
    unlocks:'Topics a competitor holds and you do not, and the create-or-refresh verdict on each.',
    steps:[
      'Semrush → Keyword Gap.',
      'Enter your domain first, then up to four competitors.',
      'Choose the database matching your market and the <b>Organic</b> keyword type.',
      'Export the <b>Missing</b>, <b>Weak</b> and <b>Untapped</b> views separately, not merged.',
      'Keep the per-domain position columns. The console finds your column by matching the domain on the project stage.'
    ],
    note:'If the gap file has no column matching your domain, the data gate fails that check and tells you which columns it did find.' },

  { src:'smr', title:'Semrush — Backlinks',
    unlocks:'The link profile, anchor mix, velocity, and the competitor link gap.',
    steps:[
      'Semrush → Backlink Analytics → enter the domain → <b>Backlinks</b> tab.',
      'Apply follow, new, lost, authority or anchor filters as needed.',
      'Export above the table, CSV or Excel.',
      'Keep the anchor, authority score, first seen, new and lost columns. Velocity and the anchor mix depend on them.',
      'To get the competitor link gap, export competitor backlinks too and drop them in alongside yours. The console splits them by target host on its own.'
    ] },

  { src:'smr', title:'Semrush — Site Audit, Crawled Pages',
    unlocks:'A technical inventory when you cannot run the built-in crawler.',
    steps:[
      'Semrush → Site Audit → open the project → <b>Crawled Pages</b>.',
      'Export with <b>absolute URLs</b> selected.',
      'Drop it in. It fills the technical stage, though it carries no body text, so the internal link planner and image audit still need a live crawl.'
    ] },

  { src:'other', title:'Screaming Frog or Sitebulb',
    unlocks:'The technical stage without needing the built-in crawler or proxy.php.',
    steps:[
      'Crawl the site as usual.',
      'Export <b>internal_all.csv</b> (Screaming Frog: Internal tab → Export).',
      'Keep Address, Status Code, Title 1, Meta Description 1, H1-1, Word Count, Canonical Link Element 1, Indexability, Inlinks and Crawl Depth.',
      'Drop it in. It is recognised as a crawl automatically.'
    ],
    note:'A crawler export carries no page text or image detail. The internal link planner, the media audit and the AI readiness score need the built-in crawler for those.' },

  { src:'other', title:'Anything else',
    unlocks:'Whatever you map it to.',
    steps:[
      'CSV, TSV, XLSX, ZIP, JSON, newline-delimited JSON and .gz are all read directly.',
      'Search Console exports in any interface language are recognised: the column names are matched against aliases in a dozen languages.',
      'If a file still comes up as <b>Unrecognised</b>, press <b>Map columns</b> next to it and tell the console what each column holds.',
      'The mapping is saved with the file and travels with the project export.'
    ] }
];

/* ------------------------------------------------------------------
   WHICH FILES YOU ACTUALLY NEED

   Twenty-odd accepted exports reads, to a new user, as twenty-odd
   things to go and fetch. Almost none of them are needed. This is the
   honest ordering: one file gets you a score, three get you most of
   the tool, and everything after that buys a specific named stage.

   `gsc` marks the rows the Connect Search Console stage fetches for
   you. If it is connected, those rows need no download at all — which
   is the whole argument for spending ten minutes on the OAuth setup.
   ------------------------------------------------------------------ */
const NEEDS = [
  { tier:'must',  file:'Search Console — Queries',
    gsc:true,  why:'The baseline. Without it there is no score, because there is nothing observed to score.',
    stages:'Everything' },
  { tier:'should', file:'Search Console — Pages',
    gsc:true,  why:'Which URLs earn the clicks. Comes free in the same ZIP as Queries.',
    stages:'Page-level findings, decay by page' },
  { tier:'should', file:'The previous period, or the same window last year',
    gsc:true,  why:'One export tells you where you stand. Two tell you which way you are going, which is the only thing anyone acts on.',
    stages:'Trend, decay, momentum, year over year' },
  { tier:'should', file:'A crawl — the built-in one, or Screaming Frog',
    gsc:false, why:'The built-in crawler needs proxy.php or same-origin hosting. It is the only source of on-page state.',
    stages:'Technical, on-page, internal links, media, schema' },
  { tier:'nice',  file:'Search Console — page and query on one row (API or BigQuery)',
    gsc:true,  why:'The single most valuable addition, and the one the export UI will not give you. The connector will.',
    stages:'Topic ownership, cannibalisation, page dilution' },
  { tier:'nice',  file:'Search Console — Generative AI report',
    gsc:true,  why:'Observed AI visibility. Without it that stage reads unknown, which is not the same as zero.',
    stages:'AI Search' },
  { tier:'nice',  file:'Semrush — Organic positions',
    gsc:false, why:'Estimated volume, difficulty and the SERP features column. Leads to verify, never measurements.',
    stages:'SERP features, snippet targets, reconciliation' },
  { tier:'nice',  file:'Semrush — Keyword gap',
    gsc:false, why:'Topics a competitor holds and you do not.',
    stages:'Competitor gap' },
  { tier:'nice',  file:'Semrush — Backlinks',
    gsc:false, why:'Referring domains, anchors, velocity.',
    stages:'Off-page pillar, link gap, page link profiles' },
];

const NEED_TIER = {
  must:   { label:'Start here',  note:'One file. Nothing works without it.' },
  should: { label:'Worth it',    note:'Cheap to add and each one changes what the tool can say.' },
  nice:   { label:'When needed', note:'Each buys one named stage. Skip any of them and that stage says so instead of guessing.' },
};

function renderNeeds(){
  const connected = typeof GSC_TOKEN !== 'undefined' && !!GSC_TOKEN;
  const rows = t => NEEDS.filter(x => x.tier === t).map(x => `
    <tr>
      <td><b>${esc(x.file)}</b>${x.gsc ? `<div class="small" style="color:var(--gsc)">${connected
            ? 'Already covered — the connector fetches this'
            : 'No download needed if you connect Search Console'}</div>` : ''}</td>
      <td class="small">${esc(x.why)}</td>
      <td class="small dim">${esc(x.stages)}</td>
    </tr>`).join('');
  return `
    ${connected ? `<div class="callout"><b>Search Console is connected</b>, so six of the nine rows below need no download at all —
      including the page-and-query table the export screen will not give you. Only the crawl and the Semrush files are still manual.</div>`
      : `<div class="callout"><b>Before you download anything:</b> six of the nine rows below can be fetched for you.
      <button class="btn sm" data-go="gsc" style="margin-left:6px">Connect Search Console</button>
      It needs a Google OAuth client ID of your own — about ten minutes, once — and after that the exports come straight in.</div>`}
    ${['must','should','nice'].map(t => `
      <div style="margin:22px 0 8px"><div class="eyebrow">${esc(NEED_TIER[t].label)}</div>
        <p class="muted small" style="margin-top:4px">${esc(NEED_TIER[t].note)}</p></div>
      <div class="tablewrap"><table><thead><tr><th style="width:30%">File</th><th style="width:40%">Why</th><th>What it unlocks</th></tr></thead>
        <tbody>${rows(t)}</tbody></table></div>`).join('')}
    <div class="callout warn" style="margin-top:18px"><b>Nothing here is mandatory except the first row.</b>
      A stage with no data says <b>not measured</b> and drops out of the score, with its weight shared across the pillars that were
      measured. It is never scored as a zero. That is why a project with one file gets an honest score out of what it knows, rather
      than a bad score for files you did not have.</div>`;
}

function renderGuide(){
  const bySrc = { gsc:'Search Console', smr:'Semrush', other:'Other tools' };
  const groups = ['gsc','smr','other'];
  $('#guideBody').innerHTML = `
    <div style="margin-bottom:8px"><div class="eyebrow">First question</div>
      <h2 style="margin-top:5px">Which files do you actually need?</h2></div>
    ${renderNeeds()}
    <div style="margin:34px 0 12px"><div class="eyebrow">Click paths</div>
      <h2 style="margin-top:5px">Where to click, for every export it reads.</h2></div>
    <div class="grid g3" style="margin-bottom:22px">
      ${tile('Exports read', String(GUIDE.length), '<span class="flat">only the first is required</span>')}
      ${tile('File formats', '7', '<span class="flat">csv, tsv, xlsx, zip, json, ndjson, gz</span>')}
      ${tile('Export languages', '12+', '<span class="flat">column names matched by alias</span>')}
    </div>
    ${groups.map(g => `
      <div style="margin:26px 0 12px"><div class="eyebrow">${esc(bySrc[g])}</div></div>
      ${GUIDE.filter(x => x.src === g).map(x => `
        <details class="ref"><summary>${esc(x.title)}</summary><div>
          <p class="small" style="color:var(--brand-ink);font-weight:600;margin-bottom:10px">Unlocks: <span style="color:var(--ink-2);font-weight:400">${esc(x.unlocks)}</span></p>
          ${x.steps.map((s,i)=>`<div class="guide-step"><i>${i+1}</i><div>${s}</div></div>`).join('')}
          ${x.note ? `<div class="callout warn" style="margin-top:12px">${esc(x.note)}</div>` : ''}
        </div></details>`).join('')}
    `).join('')}
    <div class="callout" style="margin-top:22px"><b>A note on filters.</b> Every Search Console export inherits whatever filters were
    active when you pressed Export, and the file does not record them beyond the filter sheet in the ZIP. Set the country and search
    type on the project stage to match what you actually exported: the data gate checks the country against your Countries export and
    tells you when they disagree.</div>`;
}

function guideChecklist(){
  const tierLines = ['SEARCH EVIDENCE SUITE — EXPORT CHECKLIST', '(c) Syed.ai', '',
    'WHICH FILES YOU ACTUALLY NEED', '=============================', ''];
  for (const t of ['must', 'should', 'nice']){
    tierLines.push(NEED_TIER[t].label.toUpperCase() + ' — ' + NEED_TIER[t].note, '');
    for (const x of NEEDS.filter(x => x.tier === t))
      tierLines.push('  [ ] ' + x.file + (x.gsc ? '   (no download needed if Search Console is connected)' : ''),
                     '        ' + x.why, '        Unlocks: ' + x.stages, '');
  }
  tierLines.push('Only the first row is required. Anything missing reads "not measured"',
                 'and drops out of the score rather than scoring zero.', '', '');
  return tierLines
    .concat(['CLICK PATHS', '===========', ''])
    .concat(GUIDE.flatMap(x => [`## ${x.title}`, `Unlocks: ${x.unlocks}`,
      ...x.steps.map((s,i) => `  ${i+1}. ${s.replace(/<[^>]+>/g,'')}`),
      ...(x.note ? ['  Note: ' + x.note] : []), '']))
    .join('\n');
}
$('#btnCopyChecklist').onclick = () => navigator.clipboard.writeText(guideChecklist())
  .then(()=>toast('Checklist copied'), ()=>toast('Copy blocked by the browser'));
/* ============================================================
   IMAGE KIT AND EXPORT BUNDLE
   Images are added by the writer, never pulled from an imported
   page. Each one is decoded, resized to a responsive ladder,
   re-encoded, and named from the draft and its own alt text.

   Re-encoding through a canvas is also what makes an uploaded
   file safe to ship: the export contains pixels this browser
   drew, not the bytes that arrived. An SVG carrying script, a
   JPEG carrying a malformed EXIF block, a PNG with a payload in
   a private chunk — none of it survives being rasterised and
   written back out. Location EXIF goes with it, which matters
   more often than people expect on client photography.

   Alt text is never invented. An image without it exports with
   an empty alt attribute and is listed as needing one.
   ============================================================ */

const IMG_WIDTHS = [480, 960, 1440];
const IMG_QUALITY = 0.82;
const IMG_MAX_BYTES = 25 * 1024 * 1024;

let IMGS = [];
let _imgSeq = 0;

function slug(s, max){
  return String(s || '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-').filter(Boolean).slice(0, max || 8).join('-');
}

/* ---------- CRC32, for the zip central directory ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflateRaw(bytes){
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const ab = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    const out = new Uint8Array(ab);
    return out.length < bytes.length ? out : null;
  } catch(e){ return null; }
}

/* A minimal zip writer: local headers, central directory, EOCD. Text is
   deflated where the browser can; images are stored, because a JPEG or WebP is
   already compressed and deflating it wastes time to gain nothing. */
async function makeZip(entries){
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;

  for (const e of entries){
    const nameBytes = enc.encode(e.name);
    const raw = e.bytes instanceof Uint8Array ? e.bytes : enc.encode(String(e.bytes));
    const packed = e.store ? null : await deflateRaw(raw);
    const body = packed || raw;
    const method = packed ? 8 : 0;
    const crc = crc32(raw);

    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);           // UTF-8 names
    dv.setUint16(8, method, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x2181, true); // fixed timestamp
    dv.setUint32(14, crc, true);
    dv.setUint32(18, body.length, true);
    dv.setUint32(22, raw.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    parts.push(lfh, body);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x2181, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += lfh.length + body.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, eocd], { type:'application/zip' });
}

/* ---------- optimisation ---------- */
function newCanvas(w, h){
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function encodeCanvas(canvas, type, quality){
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise(res => canvas.toBlob(res, type, quality));
}

async function optimiseImage(file){
  if (file.size > IMG_MAX_BYTES) throw new Error(`${file.name} is over ${Math.round(IMG_MAX_BYTES/1048576)} MB.`);
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch(e){ throw new Error(`${file.name} is not an image this browser can read.`); }

  const ow = bmp.width, oh = bmp.height;
  /* Never upscale: a 600px image asked to fill 1440 is a blurry 1440px image and
     a bigger download. The ladder is capped at the width actually supplied. */
  let widths = IMG_WIDTHS.filter(w => w <= ow);
  if (!widths.length) widths = [ow];
  else if (widths[widths.length - 1] < ow && ow < IMG_WIDTHS[IMG_WIDTHS.length - 1]) widths.push(ow);
  widths = [...new Set(widths)].sort((a, b) => a - b);

  /* WebP where the browser will encode it, JPEG otherwise. Checked by asking for
     one pixel and reading back what came out, rather than sniffing the browser. */
  const probe = newCanvas(1, 1);
  probe.getContext('2d').fillRect(0, 0, 1, 1);
  const probeBlob = await encodeCanvas(probe, 'image/webp', 0.8);
  const type = probeBlob && probeBlob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const ext  = type === 'image/webp' ? 'webp' : 'jpg';

  const renditions = [];
  for (const w of widths){
    const h = Math.round(oh * (w / ow));
    const cv = newCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await encodeCanvas(cv, type, IMG_QUALITY);
    renditions.push({ w, h, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  bmp.close && bmp.close();

  return { id: 'i' + (++_imgSeq), original: file.name, originalW: ow, originalH: oh,
           originalBytes: file.size, type, ext, renditions, alt: '', caption: '' };
}

/* Names are built from the draft, so a folder of exports stays sorted by page,
   and from the alt text, so the filename says what the picture is — which is the
   only part of a filename a search engine can read.

   Words the draft title already contributed are dropped from the second half,
   because "cooling-tower-cleaning-cost-a-cooling-tower-during-the" says the same
   thing twice and then runs out of room before reaching the part that
   distinguishes one picture from another. */
const IMG_STOPWORDS = new Set(['a','an','the','of','in','on','at','to','for','and','or','with','is','are','this','that','it','its','as','by','from']);
function imgFileName(im, i){
  const base = slug(EDRAFT.title || (ED_PAGE && ED_PAGE.h1) || 'draft', 6);
  const used = new Set(base.split('-'));
  const fromAlt = slug(im.alt, 24).split('-')
    .filter(w => w && !IMG_STOPWORDS.has(w) && !used.has(w))
    .slice(0, 4).join('-');
  const fromFile = slug(im.original.replace(/\.[a-z0-9]+$/i, ''), 4);
  const what = fromAlt || (fromFile.length > 1 ? fromFile : '') || ('image-' + (i + 1));
  return `${base ? base + '-' : ''}${what}`;
}

async function addImageFiles(files){
  const errs = [];
  for (const f of files){
    try { IMGS.push(await optimiseImage(f)); }
    catch(e){ errs.push(e.message); }
  }
  if (errs.length) toast(errs[0]);
  renderImageKit();
  edSubLabel();
}

/* ---------- the export bundle ---------- */
function imgSnippet(im, i){
  const name = imgFileName(im, i);
  const biggest = im.renditions[im.renditions.length - 1];
  const srcset = im.renditions.map(r => `images/${name}-${r.w}w.${im.ext} ${r.w}w`).join(', ');
  return {
    markdown: `![${im.alt || ''}](images/${name}-${biggest.w}w.${im.ext})`,
    html: `<img src="images/${name}-${biggest.w}w.${im.ext}"\n     srcset="${srcset}"\n     sizes="(max-width: 800px) 100vw, 800px"\n` +
          `     width="${biggest.w}" height="${biggest.h}"\n     alt="${(im.alt || '').replace(/"/g, '&quot;')}"\n     loading="lazy" decoding="async">`
  };
}

async function exportBundle(){
  const enc = new TextEncoder();
  const base = slug(EDRAFT.title || (ED_PAGE && ED_PAGE.h1) || 'draft', 6) || 'draft';
  const entries = [];

  entries.push({ name: `${base}/draft.md`, bytes: enc.encode(EDRAFT.text || '') });

  const lines = [`# ${EDRAFT.title || (ED_PAGE && ED_PAGE.h1) || 'Draft'} — image manifest`, ''];
  if (!IMGS.length) lines.push('No images were added to this draft.');

  IMGS.forEach((im, i) => {
    const name = imgFileName(im, i);
    for (const r of im.renditions)
      entries.push({ name: `${base}/images/${name}-${r.w}w.${im.ext}`, bytes: r.bytes, store: true });
    const sn = imgSnippet(im, i);
    const out = im.renditions.reduce((s, r) => s + r.bytes.length, 0);
    lines.push(`## ${name}`, '',
      `- Source file: ${im.original} (${im.originalW}×${im.originalH}, ${(im.originalBytes/1024).toFixed(0)} KB)`,
      `- Exported: ${im.renditions.map(r => r.w + 'w').join(', ')} as ${im.ext.toUpperCase()}, ${(out/1024).toFixed(0)} KB total`,
      `- Alt text: ${im.alt ? im.alt : '**MISSING — write one before this page goes live.**'}`,
      '', '```html', sn.html, '```', '', 'Markdown:', '', '```', sn.markdown, '```', '');
  });

  lines.push('---', '',
    'Every file here was re-encoded by the browser that exported it, so the bytes are pixels drawn from the',
    'decoded image and carry no metadata from the original — no EXIF, no location, no embedded payload.',
    '', 'Widths are capped at the width of the file supplied: nothing is upscaled, because an upscaled image is',
    'a blurry image and a bigger download.');
  entries.push({ name: `${base}/images/MANIFEST.md`, bytes: enc.encode(lines.join('\n')) });

  const blob = await makeZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${base}-bundle.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Bundle exported · ${entries.length} files`);
}

/* ---------- UI ---------- */
function renderImageKit(){
  const host = $('#edImagesBody');
  if (!host) return;
  const missing = IMGS.filter(im => !im.alt.trim()).length;
  const saved = IMGS.reduce((s, im) => s + im.originalBytes - im.renditions.reduce((t, r) => t + r.bytes.length, 0), 0);

  $('#edImgCount').textContent = IMGS.length
    ? `${IMGS.length} image${IMGS.length>1?'s':''}${missing ? ` · ${missing} without alt text` : ''}${saved > 0 ? ` · ${(saved/1024).toFixed(0)} KB saved` : ''}`
    : 'none added';

  if (!IMGS.length){
    host.innerHTML = `<div class="empty" style="padding:22px">
      <p style="max-width:56ch;margin:0 auto">Drop images here, or use Add images. Each one is resized to ${IMG_WIDTHS.join(', ')} pixels wide where the original allows it, re-encoded, and named from this draft and the alt text you write for it.</p>
      <p class="small dim" style="max-width:56ch;margin:10px auto 0">Imported pages never bring their images with them. Someone else's alt text is not yours, and a hotlinked file breaks the day they move it.</p></div>`;
    return;
  }

  host.innerHTML = IMGS.map((im, i) => {
    const name = imgFileName(im, i);
    const out = im.renditions.reduce((s, r) => s + r.bytes.length, 0);
    const pct = im.originalBytes ? Math.round((1 - out / im.originalBytes) * 100) : 0;
    return `<div class="imgrow">
      <div class="imgthumb"><img src="${URL.createObjectURL(new Blob([im.renditions[0].bytes], {type:im.type}))}" alt=""></div>
      <div class="grow">
        <div class="mono small">${esc(name)}-<span class="dim">{${im.renditions.map(r=>r.w).join('|')}}</span>w.${im.ext}</div>
        <div class="small dim" style="margin:2px 0 6px">${im.originalW}×${im.originalH} · ${(im.originalBytes/1024).toFixed(0)} KB in, ${(out/1024).toFixed(0)} KB out across ${im.renditions.length} width${im.renditions.length>1?'s':''}${pct>0?` · ${pct}% smaller`:''}</div>
        <input class="imgalt" data-imgalt="${im.id}" type="text" value="${esc(im.alt)}"
          placeholder="Alt text — what the picture shows, in a sentence. Also names the file." autocomplete="off">
        ${im.alt.trim() ? '' : '<div class="small" style="color:var(--warn);margin-top:4px">No alt text yet. It will export with an empty alt attribute and be flagged in the manifest.</div>'}
      </div>
      <button class="btn sm ghost" data-imgdel="${im.id}" title="Remove">Remove</button>
    </div>`;
  }).join('');

  host.querySelectorAll('[data-imgalt]').forEach(inp => {
    inp.addEventListener('input', () => {
      const im = IMGS.find(x => x.id === inp.dataset.imgalt);
      if (im) im.alt = inp.value;
    });
    inp.addEventListener('change', () => renderImageKit());
  });
  host.querySelectorAll('[data-imgdel]').forEach(b => b.onclick = () => {
    IMGS = IMGS.filter(x => x.id !== b.dataset.imgdel);
    renderImageKit(); edSubLabel();
  });
}
/* ============================================================
   LIVE EDITOR
   Draft copy, scored live by the same engine that scores crawled
   pages. There is deliberately no scoring logic in this file: it
   takes what the writer typed, hands it to analyseDraft() to get
   the crawled-page field shape, and hands that to readinessFor().
   If a number here ever disagrees with the AI Search stage, the
   bug is in one of those two, not in the editor.

   The score is an editorial checklist with numbers on it. It does
   not gate anything, nothing is submitted anywhere, and the copy
   in the panel says so.
   ============================================================ */

let EDRAFT = { text:'', title:'', clusterId:'' };
let ED_PAGE = null, ED_SCORE = null, ED_COV = null;
let _edTimer = null, _edLastMs = 0;

/* One debounce, not two.

   The spec anticipated that coverage over a large topic would be slow enough to
   need its own longer timer. Measured, it is not: a 4,000-word draft against a
   600-query topic recomputes in about five milliseconds, and the cost is capped
   because analyseDraft only keeps the first 12,000 characters of body text, the
   same cap the crawler uses. So one timer, and a measured backoff rather than an
   assumed one — if a recompute ever does cross the budget, the interval doubles
   itself and the timing is on screen where it can be seen. */
const ED_DEBOUNCE = 180;
const ED_BUDGET_MS = 12;
let _edInterval = ED_DEBOUNCE;

function edCluster(){
  if (!CLUST || !CLUST.clusters || !CLUST.clusters.length) return null;
  return CLUST.clusters.find(c => c.id === EDRAFT.clusterId) || null;
}

function edSchedule(){
  clearTimeout(_edTimer);
  _edTimer = setTimeout(edRecompute, _edInterval);
}

function edRecompute(){
  const t0 = (performance && performance.now) ? performance.now() : Date.now();
  const cluster = edCluster();

  ED_PAGE  = analyseDraft(EDRAFT.text, { title: EDRAFT.title || undefined, origin: CFG.domain || '' });
  ED_SCORE = readinessFor(ED_PAGE, cluster, null, {});
  ED_COV   = draftCoverage(ED_PAGE, cluster);

  _edLastMs = ((performance && performance.now) ? performance.now() : Date.now()) - t0;
  if (_edLastMs > ED_BUDGET_MS && _edInterval < 900) _edInterval = Math.min(900, _edInterval * 2);

  edRenderScore();
  edRenderStats();
  edSubLabel();
}

function edSubLabel(){
  const el = $('#sub-editor');
  if (!el) return;
  el.textContent = !ED_PAGE || !ED_PAGE.wordCount ? 'no draft'
    : ED_SCORE && ED_SCORE.score != null ? `${fmtInt(ED_PAGE.wordCount)} words · ${ED_SCORE.score}`
    : `${fmtInt(ED_PAGE.wordCount)} words`;
}

function edRenderStats(){
  const p = ED_PAGE;
  if (!p || !p.wordCount){ $('#edStats').textContent = 'empty'; $('#edTiming').textContent = ''; return; }
  const bits = [
    `${fmtInt(p.wordCount)} words`,
    `${p.paraCount} paragraph${p.paraCount===1?'':'s'}`,
    `${p.headings.length} subheading${p.headings.length===1?'':'s'}`,
    `${p.listCount} list${p.listCount===1?'':'s'}`,
    `${p.tableCount} table${p.tableCount===1?'':'s'}`,
    `${p.numberHits} figure${p.numberHits===1?'':'s'}`,
    `${p.outboundCitations} citation${p.outboundCitations===1?'':'s'}`
  ];
  $('#edStats').textContent = bits.join('  ·  ');
  $('#edTiming').textContent = `scored in ${_edLastMs.toFixed(1)} ms`;
}

/* ------------------------------------------------------------
   THE SCORE PANEL
   Same dial as the scorecard, same submetric rows as the AI
   readiness detail, so a draft and a published page are read the
   same way by eye as well as by the engine.
   ------------------------------------------------------------ */
function edRenderScore(){
  const host = $('#edScore');
  if (!host) return;
  const s = ED_SCORE, p = ED_PAGE, cluster = edCluster();

  if (!p || !p.wordCount){
    host.innerHTML = `<div class="card pad">
      <div class="eyebrow">AI Search readiness</div>
      <p class="small muted" style="margin-top:8px">Nothing written yet. The components fill in as you type.</p>
      ${CLUST ? '' : '<p class="small dim" style="margin-top:10px">Run the analysis first and your topics appear in the picker above, so the draft can be scored for coverage against the queries you actually have evidence for.</p>'}
    </div>`;
    return;
  }

  const rows = s.rows || [];
  const measured = rows.filter(r => r.value != null).length;
  const na = rows.filter(r => r.value == null);

  host.innerHTML = `
    <div class="card pad">
      <div class="edhero">
        ${dial(s.score)}
        <div class="grow">
          <div class="eyebrow">AI Search readiness</div>
          <div class="small muted" style="margin-top:4px">
            ${s.score == null ? esc(s.unscored || 'Not scored yet.')
              : `Scored on ${measured} of ${rows.length} components, carrying ${s.weightUsed} of 100 weight.`}
          </div>
        </div>
      </div>
      ${na.length ? `<p class="small dim" style="margin-top:10px">Unscored: ${na.map(r=>esc(r.label.toLowerCase())).join(', ')}. ${esc(na[0].note)}</p>` : ''}
    </div>

    <div class="card pad">
      <div class="eyebrow" style="margin-bottom:6px">Components</div>
      ${rows.map(r => `<div class="submetric">
        <div><div class="lab">${esc(r.label)}</div><div class="det">${esc(r.note||'')}</div></div>
        <div class="meter${r.value==null?'':(r.value<.5?' crit':r.value<.75?' warn':'')}"><i style="width:${r.value==null?0:Math.round(r.value*100)}%"></i></div>
        <div class="n">${r.value==null?'<span class="dim">n/a</span>':Math.round(r.value*100)}</div>
      </div>`).join('')}
    </div>

    ${edCoverageCard(cluster)}

    <p class="small dim">This is an editorial checklist with numbers on it, not a gate and not a Google metric. It measures the same seven things the audit measures on a published page.</p>`;
}

/* The coverage component broken out per query. Session 3 of the spec turns this
   into the full live checklist; the data behind it is already exact, because
   draftCoverage() applies character for character the test readinessFor applies. */
function edCoverageCard(cluster){
  if (!cluster) return `<div class="card pad">
    <div class="eyebrow">Topic coverage</div>
    <p class="small muted" style="margin-top:8px">No topic selected, so coverage is not scored and its weight has been dropped. Pick one above to check the draft against the queries this topic actually earns impressions for.</p></div>`;
  if (!ED_COV) return '';
  return `<div class="card pad">
    <div class="row gap8" style="margin-bottom:8px">
      <div class="eyebrow grow">Topic coverage</div>
      <span class="mono small">${ED_COV.covered} / ${ED_COV.total}</span>
    </div>
    <div>${ED_COV.rows.map(r => `<div class="covrow ${r.covered?'yes':'no'}">
      <span class="ic">${r.covered?'✓':'○'}</span>
      <span>${esc(r.query)}${!r.covered && r.missing.length ? `<span class="miss">missing: ${esc(r.missing.join(', '))}</span>` : ''}</span>
    </div>`).join('')}</div>
    <p class="small dim" style="margin-top:10px">A query counts as covered when every word in it longer than three characters appears somewhere in the draft, its headings or its title. That is the same test the score above uses.</p>
  </div>`;
}

/* ------------------------------------------------------------
   TOPIC PICKER
   Repopulated whenever an analysis run produces new clusters.
   ------------------------------------------------------------ */
function edFillClusters(){
  const sel = $('#edCluster');
  if (!sel) return;
  const cl = (CLUST && CLUST.clusters) || [];
  const keep = EDRAFT.clusterId;
  sel.innerHTML = `<option value="">${cl.length ? 'No topic — coverage not scored' : 'Run the analysis to load topics'}</option>` +
    cl.slice(0, 200).map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${fmtInt(c.impr)} impr · ${c.size} quer${c.size===1?'y':'ies'}</option>`).join('');
  sel.disabled = !cl.length;
  if (keep && cl.some(c => c.id === keep)) sel.value = keep;
  else EDRAFT.clusterId = sel.value = '';
}

/* Called from run() once clusters exist, from resetAnalysis(), and on project
   load. On a project change the draft list is reloaded and the most recent draft
   opened, because a draft belongs to the project it was written for. */
async function refreshEditor(opts){
  opts = opts || {};
  edFillClusters();
  if (opts.reloadDrafts){
    await edFillDrafts();
    edApply(ED_LIST[0] || {});
    const note = $('#edImportNote'); if (note) note.innerHTML = '';
  } else {
    edRecompute();
  }
}

/* ------------------------------------------------------------
   DRAFT STORAGE
   Autosaved against the project, in its own IndexedDB store.
   Saving is debounced well behind scoring: scoring is what the
   writer watches, saving is what stops them losing work, and the
   two do not need the same cadence.
   ------------------------------------------------------------ */
let ED_LIST = [];
let _edSaveTimer = null;

function edScheduleSave(){
  clearTimeout(_edSaveTimer);
  _edSaveTimer = setTimeout(edSave, 1200);
}

async function edSave(){
  if (!PROJECT || !DB_OK) return;
  if (!EDRAFT.text.trim() && !EDRAFT.title.trim() && !EDRAFT.id) return;
  try {
    await saveDraft(PROJECT.id, {
      id: EDRAFT.id, title: EDRAFT.title, text: EDRAFT.text, clusterId: EDRAFT.clusterId,
      words: (ED_PAGE && ED_PAGE.wordCount) || 0,
      score: (ED_SCORE && ED_SCORE.score != null) ? ED_SCORE.score : null
    }).then(rec => { EDRAFT.id = rec.id; });
    await edFillDrafts();
  } catch(e){ /* storage full or blocked: the draft stays in memory and on screen */ }
}

async function edFillDrafts(){
  const sel = $('#edPick');
  if (!sel) return;
  ED_LIST = (PROJECT && DB_OK) ? await loadDrafts(PROJECT.id).catch(() => []) : [];
  sel.innerHTML = ED_LIST.length
    ? ED_LIST.map(d => `<option value="${esc(d.id)}">${esc(d.title || firstLineOf(d.text) || 'Untitled draft')} · ${fmtInt(d.words)} words${d.score!=null?` · ${d.score}`:''}</option>`).join('')
    : '<option value="">No saved drafts yet</option>';
  sel.disabled = !ED_LIST.length;
  if (EDRAFT.id) sel.value = EDRAFT.id;
}
function firstLineOf(t){
  const l = String(t || '').split('\n').find(x => x.trim());
  return l ? l.replace(/^#+\s*/, '').slice(0, 44) : '';
}

function edApply(d){
  EDRAFT = { id: d.id || null, text: d.text || '', title: d.title || '', clusterId: d.clusterId || '' };
  $('#edText').value = EDRAFT.text;
  $('#edTitle').value = EDRAFT.title;
  IMGS = [];
  renderImageKit();
  edFillClusters();
  edRecompute();
}

/* ------------------------------------------------------------
   IMPORT
   ------------------------------------------------------------ */
function edShowImportReport(res, source){
  const host = $('#edImportNote');
  if (!host) return;
  const r = res.report;
  host.innerHTML = `<div class="callout" style="margin:12px 0 16px">
    <b>Imported from ${esc(source)}.</b> ${esc(r.note)}
    ${r.removed.length ? `<div class="small" style="margin-top:6px">Not carried over: ${esc(r.removed.join(', '))}.</div>` : ''}
    ${r.imageCount ? `<div class="small" style="margin-top:6px">The page had ${r.imageCount} image${r.imageCount>1?'s':''}. They were not imported —
      add the ones you want below and write your own alt text, and the export will size and name them.
      ${res.images.filter(i=>i.alt && i.alt.trim()).length ? `Their alt text, for reference only: ${esc(res.images.filter(i=>i.alt&&i.alt.trim()).slice(0,6).map(i=>'“'+i.alt.trim().slice(0,60)+'”').join(', '))}.` : ''}</div>` : ''}
  </div>`;
}

function edImportHtml(html, source, url){
  let res;
  try { res = htmlToDraft(html, { url: url || '' }); }
  catch(e){ toast('Could not read that HTML'); return; }
  if (!res.markdown){ toast('No readable text found on that page'); return; }
  EDRAFT.text = res.markdown;
  if (!EDRAFT.title) EDRAFT.title = res.h1 || res.title || '';
  $('#edText').value = EDRAFT.text;
  $('#edTitle').value = EDRAFT.title;
  edShowImportReport(res, source);
  edRecompute();
  edScheduleSave();
  toast('Page converted to a draft');
}

async function edFetchUrl(){
  const url = ($('#edUrl').value || '').trim();
  if (!url) return toast('Enter a page URL first');
  const btn = $('#btnEdFetch');
  btn.disabled = true; btn.textContent = 'Fetching…';
  try {
    if (!FETCH_MODE) await detectFetchMode(url);
    const res = await grab(url);
    if (res.status >= 400) throw new Error('The page returned HTTP ' + res.status);
    edImportHtml(res.body, new URL(url).hostname, res.finalUrl || url);
  } catch(e){
    $('#edImportNote').innerHTML = `<div class="callout warn" style="margin:12px 0 16px">
      <b>Could not fetch that page.</b> ${esc(e.message)}
      <div class="small" style="margin-top:6px">A browser cannot read another site's pages on its own. Either configure <span class="mono">proxy.php</span>
      next to this file, or open the page, view source, and use <b>Paste HTML instead</b> — which always works and fetches nothing.</div></div>`;
  } finally { btn.disabled = false; btn.textContent = 'Fetch and convert'; }
}

function edPasteHtml(){
  showModal('Paste the page source', `<div style="padding:16px">
    <p class="small muted" style="margin:0 0 10px;max-width:64ch">Open the page, view source, copy all of it and paste it here.
    Nothing is fetched and nothing is executed: the markup is parsed into an inert document and only its text is read out.</p>
    <textarea id="edPasteBox" style="width:100%;min-height:240px;font-family:var(--mono);font-size:12px;
      background:var(--surface-2);border:1px solid var(--line-strong);border-radius:7px;padding:10px" placeholder="&lt;!doctype html&gt; …"></textarea>
    <div class="row gap8" style="margin-top:12px"><button class="btn primary" id="btnEdPasteGo">Convert to draft</button></div>
  </div>`);
  $('#btnEdPasteGo').onclick = () => {
    const html = $('#edPasteBox').value;
    if (!html.trim()) return toast('Nothing pasted');
    $('#modal').classList.add('hide');
    edImportHtml(html, 'pasted source', '');
  };
}

/* ------------------------------------------------------------
   WIRING
   ------------------------------------------------------------ */
(function edInit(){
  const ta = $('#edText'), ti = $('#edTitle'), sel = $('#edCluster');
  if (!ta) return;

  ta.addEventListener('input', () => { EDRAFT.text = ta.value; edSchedule(); edScheduleSave(); });
  ti.addEventListener('input', () => { EDRAFT.title = ti.value; edSchedule(); edScheduleSave(); });
  sel.addEventListener('change', () => { EDRAFT.clusterId = sel.value; edRecompute(); edScheduleSave(); });

  $('#edPick').addEventListener('change', () => {
    const d = ED_LIST.find(x => x.id === $('#edPick').value);
    if (d) edApply(d);
  });

  $('#btnEdNew').onclick = async () => {
    await edSave();
    edApply({});
    $('#edImportNote').innerHTML = '';
    ta.focus();
  };

  /* Click twice rather than confirm(): a modal dialog can be blocked outright in a
     sandboxed embed, and a Delete button that silently does nothing is worse than
     one that asks. */
  let delArmed = null;
  const btnDel = $('#btnEdDelete');
  btnDel.onclick = async () => {
    if (!delArmed && (EDRAFT.text.trim() || EDRAFT.id)){
      delArmed = setTimeout(() => { delArmed = null; btnDel.textContent = 'Delete draft'; }, 4000);
      btnDel.textContent = 'Click again to delete';
      return toast('Click delete again to remove this draft for good');
    }
    clearTimeout(delArmed); delArmed = null; btnDel.textContent = 'Delete draft';
    if (EDRAFT.id && DB_OK) await deleteDraft(EDRAFT.id).catch(() => {});
    await edFillDrafts();
    edApply(ED_LIST[0] || {});
    toast('Draft deleted');
  };

  $('#btnEdCopy').onclick = () => navigator.clipboard.writeText(EDRAFT.text || '')
    .then(() => toast('Draft copied'), () => toast('Copy blocked by the browser'));

  $('#btnEdDownload').onclick = () => {
    const name = slug(EDRAFT.title || (ED_PAGE && ED_PAGE.h1) || 'draft', 8) || 'draft';
    saveFile(name + '.md', EDRAFT.text || '', 'text/markdown');
  };

  $('#btnEdFetch').onclick = edFetchUrl;
  $('#edUrl').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); edFetchUrl(); } });
  $('#btnEdPaste').onclick = edPasteHtml;

  /* ---- images ---- */
  $('#btnEdAddImg').onclick = () => $('#edImgInput').click();
  $('#edImgInput').addEventListener('change', e => {
    addImageFiles([...e.target.files]);
    e.target.value = '';
  });
  const drop = $('#edImages');
  ['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('drop'); }));
  ['dragleave','drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('drop'); }));
  drop.addEventListener('drop', e => {
    const files = [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type));
    if (files.length) addImageFiles(files);
  });
  $('#btnEdManifest').onclick = () => {
    if (!IMGS.length) return toast('No images added yet');
    const html = IMGS.map((im, i) => imgSnippet(im, i).html).join('\n\n');
    navigator.clipboard.writeText(html).then(() => toast('Image HTML copied'), () => toast('Copy blocked by the browser'));
  };

  $('#btnEdExport').onclick = () => exportBundle().catch(e => toast('Export failed: ' + e.message));

  edFillClusters();
  renderImageKit();
  edRecompute();
})();
/* ============================================================
   PAGE LINK PROFILES — the stage
   Renders what 04l-profiles.js computed. No analysis here.
   ============================================================ */

let PROFILES = null, PROF_GROUP = 'url', PROF_OWN = '';

const pf = {
  pct: v => v == null ? '—' : (v*100).toFixed(0) + '%',
  int: v => v == null ? '—' : fmtInt(v)
};

/* These edits change two maps on CFG and nothing else, so they persist the project
   directly. saveCfg() would re-read every field of the settings form first, which
   is a much bigger hammer than a single cell needs and would overwrite anything
   the user had typed there but not yet saved. */
function profPersist(){
  if (PROJECT && typeof saveProject === 'function') saveProject(PROJECT).catch(() => {});
}

function renderProfiles(){
  const host = $('#profBody');
  if (!host) return;

  if (!PROFILES){
    host.innerHTML = emptyState(
      'Load a Semrush backlinks export for each page you want to compare — yours and the pages outranking it — and this stage compares their link profiles side by side. One export per URL: run Backlink Analytics on a URL, set the scope to that exact URL rather than the domain, and export.',
      { go:'data', label:'Go to Load exports' });
    return;
  }

  const list = PROFILES.profiles;
  const cmp = compareProfiles(list, PROF_OWN || (list.find(p => p.isOwn) || {}).key);
  const cl = (CLUST && CLUST.clusters) || [];

  host.innerHTML = `
    <div class="callout" style="margin-bottom:16px">
      <b>Everything on this stage is <span class="evtag reported">reported</span>, not observed.</b> ${esc(PROFILES.note)}
    </div>

    ${!PROFILES.hasOwn ? `<div class="callout warn" style="margin-bottom:16px"><b>None of these targets is your domain.</b>
      Set the project domain at stage 1, or load a backlinks export for your own page, and the comparison below turns on.</div>` : ''}
    ${PROFILES.thin ? `<div class="callout warn" style="margin-bottom:16px"><b>${PROFILES.thin} target${PROFILES.thin>1?'s have':' has'} fewer than three links.</b>
      That usually means the export was taken for a whole domain rather than for one URL, which spreads a few links across many pages.
      Switch to per site below, or re-export with the scope set to the exact URL.</div>` : ''}

    <div class="row wrap gap6" style="margin-bottom:14px">
      <button class="btn sm" data-profgroup="url" aria-pressed="${PROF_GROUP==='url'}">Per page</button>
      <button class="btn sm" data-profgroup="host" aria-pressed="${PROF_GROUP==='host'}">Per site</button>
      <div class="grow"></div>
      <button class="btn sm" id="btnProfCopy">Copy comparison</button>
    </div>

    <div class="card" style="overflow:auto">
      <table>
        <thead><tr>
          <th>${PROF_GROUP==='host'?'Site':'Page'}</th>
          <th>Links</th><th>Ref domains</th><th>Links / domain</th>
          <th>Follow</th><th>Text</th><th>Image</th>
          <th>Median source AS</th><th>AS 40+</th><th>Top anchor</th>
          <th title="Semrush Authority Score for this target. Not in the backlinks export — type it in from Semrush.">Target AS</th>
          ${cl.length ? '<th>Topic</th>' : ''}
        </tr></thead>
        <tbody>${list.map(p => `<tr${p.isOwn?' style="background:var(--brand-soft)"':''}>
          <td><div class="trunc url" style="max-width:280px" title="${esc(p.raw)}">${esc(p.raw)}</div>
              ${p.isOwn?'<span class="pill owned">yours</span>':''}</td>
          <td class="num">${pf.int(p.links)}</td>
          <td class="num">${pf.int(p.refDomains)}</td>
          <td class="num">${p.linksPerDomain == null ? '—' : p.linksPerDomain}</td>
          <td class="num">${pf.pct(p.followRatio)}</td>
          <td class="num">${p.hasTypes ? pf.pct(p.textRatio) : '<span class="dim" title="The export had no Type column, so link types are unknown rather than zero.">n/a</span>'}</td>
          <td class="num">${p.hasTypes ? pf.pct(p.imageRatio) : '<span class="dim">n/a</span>'}</td>
          <td class="num">${p.sourceAuthority ? p.sourceAuthority.median : '<span class="dim">n/a</span>'}</td>
          <td class="num">${p.sourceAuthority ? pf.int((p.sourceAuthority.tiers['60+']||0)+(p.sourceAuthority.tiers['40–59']||0)) : '<span class="dim">n/a</span>'}</td>
          <td class="num">${pf.pct(p.topAnchorShare)}</td>
          <td><input class="profas" data-profas="${esc(p.key)}" type="number" min="0" max="100" inputmode="numeric"
                     value="${p.recordedAuthority == null ? '' : p.recordedAuthority}" placeholder="—" aria-label="Recorded Authority Score"></td>
          ${cl.length ? `<td><select class="proftopic" data-proftopic="${esc(p.key)}">
            <option value="">—</option>
            ${cl.slice(0,200).map(c => `<option value="${esc(c.id)}"${c.id===p.clusterId?' selected':''}>${esc(c.name)}</option>`).join('')}
          </select></td>` : ''}
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <p class="small dim" style="margin-top:8px">AS is Semrush Authority Score. <b>Median source AS</b> and <b>AS 40+</b> describe the domains linking in, counted once per domain, and are computed from the export.
    <b>Target AS</b> is the score of the page itself, which a backlinks export does not contain — type it in from Semrush and it is stored with the project as a recorded value.</p>

    ${cmp ? profGapCard(cmp) : ''}
    ${cmp && cmp.prospects.length ? profProspectCard(cmp) : ''}
    ${profAnchorCard(list)}`;

  host.querySelectorAll('[data-profgroup]').forEach(b => b.onclick = () => {
    PROF_GROUP = b.dataset.profgroup; runProfiles();
  });
  host.querySelectorAll('[data-profas]').forEach(inp => inp.onchange = () => {
    CFG.linkAuthority = CFG.linkAuthority || {};
    const v = inp.value.trim();
    if (v === '') delete CFG.linkAuthority[inp.dataset.profas];
    else CFG.linkAuthority[inp.dataset.profas] = Math.max(0, Math.min(100, Math.round(+v)));
    if (PROJECT) PROJECT.cfg = CFG;
    profPersist(); runProfiles();
  });
  host.querySelectorAll('[data-proftopic]').forEach(sel => sel.onchange = () => {
    CFG.linkTopics = CFG.linkTopics || {};
    if (!sel.value) delete CFG.linkTopics[sel.dataset.proftopic];
    else CFG.linkTopics[sel.dataset.proftopic] = sel.value;
    if (PROJECT) PROJECT.cfg = CFG;
    profPersist(); runProfiles();
  });
  const copy = $('#btnProfCopy');
  if (copy) copy.onclick = () => navigator.clipboard.writeText(profilesToText())
    .then(() => toast('Comparison copied'), () => toast('Copy blocked by the browser'));
}

/* The gap card: ours against the median of the rest, never against the best of
   them. One rival with an unusual profile should not set the target. */
function profGapCard(cmp){
  const fmtv = (v, f) => f === 'pct' ? pf.pct(v) : pf.int(v);
  return `<div class="card pad" style="margin-top:16px">
    <div class="eyebrow">Your page against the median of the ${cmp.rivals.length} other${cmp.rivals.length>1?'s':''}</div>
    <p class="small muted" style="margin:6px 0 12px;max-width:70ch">The median, not the strongest, so a single outlier does not set the bar. A row is only shown where both sides carry the measure.</p>
    ${cmp.gaps.map(g => `<div class="submetric">
      <div><div class="lab">${esc(g.label)}</div>
        <div class="det">${g.behind ? 'Behind the group median.' : 'At or ahead of the group median.'}</div></div>
      <div class="mono small" style="text-align:right">${fmtv(g.mine, g.fmt)} <span class="dim">vs</span> ${fmtv(g.theirs, g.fmt)}</div>
      <div class="n ${g.behind ? 'tone-fail' : 'tone-pass'}">${g.behind ? 'behind' : 'ok'}</div>
    </div>`).join('')}
    <p class="small dim" style="margin-top:12px">Being behind on a measure is a description, not an instruction. A page can rank ahead on fewer, better links, and Semrush's crawl is a sample of the web rather than all of it.</p>
  </div>`;
}

function profProspectCard(cmp){
  const rows = cmp.prospects.slice(0, 60);
  return `<div class="card" style="margin-top:16px;overflow:auto">
    <div style="padding:14px 18px;border-bottom:1px solid var(--line)">
      <div class="eyebrow">Domains linking to them and not to you</div>
      <div class="small dim" style="margin-top:4px">${fmtInt(cmp.prospects.length)} found${cmp.shared ? `, ${fmtInt(cmp.shared)} of which link to every page you compared` : ''}. This is the one list on this stage you can act on directly.</div>
    </div>
    <table><thead><tr><th>Domain</th><th>Links to</th><th>Best source AS seen</th></tr></thead>
    <tbody>${rows.map(p => `<tr>
      <td class="mono">${esc(p.host)}</td>
      <td class="num">${p.rivalCount} of ${cmp.rivals.length}</td>
      <td class="num">${p.score == null ? '<span class="dim">n/a</span>' : p.score}</td>
    </tr>`).join('')}</tbody></table>
  </div>`;
}

function profAnchorCard(list){
  return `<div class="card pad" style="margin-top:16px">
    <div class="eyebrow" style="margin-bottom:8px">Anchor mix</div>
    <div class="stack gap10">${list.map(p => {
      const total = Object.values(p.anchorTypes).reduce((a,b)=>a+b,0) || 1;
      const order = ['descriptive','branded','naked URL','generic','empty or image'];
      return `<div>
        <div class="row gap8"><div class="small grow trunc" style="max-width:340px">${esc(p.raw)}</div>
          <span class="small dim mono">${fmtInt(p.links)} links · ${pf.pct(p.anchorDiversity)} varied</span></div>
        <div class="row" style="height:10px;border-radius:99px;overflow:hidden;background:var(--surface-3);margin-top:5px">
          ${order.map((k,i) => { const n = p.anchorTypes[k]||0; if (!n) return '';
            const col = ['var(--gsc)','var(--brand)','var(--ink-3)','var(--warn)','var(--surface-3)'][i];
            return `<div title="${esc(k)}: ${n}" style="width:${(n/total*100).toFixed(1)}%;background:${col};height:100%"></div>`; }).join('')}
        </div>
        <div class="small dim" style="margin-top:3px">${order.filter(k=>p.anchorTypes[k]).map(k => `${esc(k)} ${Math.round((p.anchorTypes[k]/total)*100)}%`).join(' · ')}</div>
      </div>`;
    }).join('')}</div>
    <p class="small dim" style="margin-top:10px">Classified by the same rule as your own backlink stage, so the two are comparable. "Varied" is the effective number of distinct anchors, not a judgement.</p>
  </div>`;
}

function profilesToText(){
  if (!PROFILES) return '';
  const L = [`Link profile comparison — ${CFG.domain || ''}`, `Grouped per ${PROFILES.groupBy === 'host' ? 'site' : 'page'}. Source: Semrush backlink exports (REPORTED).`,
             'Authority Score is Semrush\'s metric, not Moz Domain or Page Authority.', ''];
  L.push(['target','links','ref_domains','follow_pct','text_pct','image_pct','median_source_as','as40plus','top_anchor_pct','target_as_recorded'].join('\t'));
  for (const p of PROFILES.profiles){
    L.push([p.raw, p.links, p.refDomains,
      p.followRatio == null ? '' : Math.round(p.followRatio*100),
      p.hasTypes ? Math.round(p.textRatio*100) : '',
      p.hasTypes ? Math.round(p.imageRatio*100) : '',
      p.sourceAuthority ? p.sourceAuthority.median : '',
      p.sourceAuthority ? (p.sourceAuthority.tiers['60+']||0)+(p.sourceAuthority.tiers['40–59']||0) : '',
      p.topAnchorShare == null ? '' : Math.round(p.topAnchorShare*100),
      p.recordedAuthority == null ? '' : p.recordedAuthority].join('\t'));
  }
  const cmp = compareProfiles(PROFILES.profiles, PROF_OWN || (PROFILES.profiles.find(p=>p.isOwn)||{}).key);
  if (cmp){
    L.push('', 'Against the median of the others:');
    for (const g of cmp.gaps) L.push(`  ${g.label}: ${g.fmt==='pct'?Math.round(g.mine*100)+'%':g.mine} vs ${g.fmt==='pct'?Math.round(g.theirs*100)+'%':g.theirs} — ${g.behind?'behind':'ok'}`);
    if (cmp.prospects.length){
      L.push('', `Domains linking to them and not to you (${cmp.prospects.length}):`);
      for (const p of cmp.prospects.slice(0,40)) L.push(`  ${p.host}\t${p.rivalCount} of ${cmp.rivals.length}\tAS ${p.score==null?'':p.score}`);
    }
  }
  return L.join('\n');
}

/* Recomputed rather than mutated, so a change to a recorded score or a grouping
   goes back through the same engine the first render used. */
function runProfiles(){
  PROFILES = (typeof linkProfiles === 'function') ? linkProfiles(DATASETS, CFG, { groupBy: PROF_GROUP }) : null;
  const sub = $('#sub-prof');
  if (sub) sub.textContent = PROFILES ? `${PROFILES.profiles.length} page${PROFILES.profiles.length===1?'':'s'}` : 'no export';
  renderProfiles();
}
/* ============================================================
   SEARCH CONSOLE CONNECTOR — the stage
   Auth, the property picker, and the import run. Everything that
   computes anything lives in 04m-gsc.js; this file talks to
   Google and hands rows to addTable(), the same function a
   dropped CSV goes through.

   The token model, and why it is the right one here:
   Google Identity Services issues an access token inside this
   page and the Search Console REST endpoints are CORS-enabled,
   so the data path is Google → this tab. No proxy, no server, no
   refresh token, nothing stored. The token lives in a variable
   and dies with the page, which is what lets a tool that
   promises "nothing is uploaded" connect to an API at all.

   Google labels this flow's implicit grant weaker than the
   authorization-code flow with PKCE, and they are right — but
   the code flow needs a backend, because Google's token endpoint
   does not send CORS headers. When the hosted app exists it
   should use the code flow; until then this is the honest
   trade, and the stage says so in plain words rather than
   implying it is the same thing.
   ============================================================ */

let GSC_TOKEN = null, GSC_TOKEN_AT = 0, GSC_SITES = [], GSC_SITE = '';
let GSC_CLIENT = null, GSC_BUSY = false;
let GSC_RUN = null;   // last run report, for the stage to render
/* The last connection error, held because renderGsc() rebuilds the panel and would
   otherwise wipe the one message that says what to fix. A toast is not enough for
   something the user has to act on. */
let GSC_ERR = '';

/* Google's own script. It is the one external script the standalone build loads,
   and only when the user actually clicks Connect — not on page load. */
const GSC_GIS_SRC = 'https://accounts.google.com/gsi/client';

function gscLoadGis(){
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve(true);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = GSC_GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => res(true);
    s.onerror = () => rej(new Error('Could not load Google Identity Services. Check the network, or any extension blocking accounts.google.com.'));
    document.head.appendChild(s);
  });
}

/* The token is requested from a user gesture, per Google's requirement, and is
   never persisted — not in the project, not in localStorage, nowhere. */
async function gscConnect(){
  const id = (CFG.gscClientId || '').trim();
  if (!id) throw new Error('Add your Google OAuth client ID first. It identifies your own Google Cloud project — this tool has no shared credential to lend you.');
  await gscLoadGis();
  return new Promise((res, rej) => {
    try {
      GSC_CLIENT = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: GSC_SCOPE,
        callback: r => {
          if (r && r.access_token){
            GSC_TOKEN = r.access_token;
            GSC_TOKEN_AT = Date.now();
            res(r);
          } else rej(new Error((r && r.error_description) || 'Google did not return a token. The consent dialog may have been closed.'));
        },
        error_callback: e => rej(new Error(e && e.type === 'popup_closed'
          ? 'The Google window was closed before consent was given.'
          : 'Google could not start the sign-in. Check that this exact origin is listed under Authorised JavaScript origins on the OAuth client.'))
      });
      GSC_CLIENT.requestAccessToken({ prompt: '' });
    } catch(e){ rej(e); }
  });
}

/* One place that talks to Google. Maps every failure through gscErrorMessage so no
   raw API string ever reaches the user on its own. */
async function gscFetchJson(url, body){
  if (!GSC_TOKEN) throw new Error('Not connected to Search Console.');
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + GSC_TOKEN },
                           body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok){
    let j = null;
    try { j = await r.json(); } catch(e){}
    if (r.status === 401) GSC_TOKEN = null;   // force a fresh consent next time
    throw new Error(gscErrorMessage(r.status, j));
  }
  return r.json();
}

async function gscLoadSites(){
  const list = await gscFetchJson(gscSitesUrl(), null);
  GSC_SITES = gscPickSites(list, CFG.domain);
  if (!GSC_SITES.length) throw new Error('That Google account has no verified Search Console properties.');
  const match = GSC_SITES.find(s => s.matches);
  GSC_SITE = (match || GSC_SITES[0]).siteUrl;
  return GSC_SITES;
}

/* ------------------------------------------------------------
   THE IMPORT
   Each selected preset becomes one dataset, through addTable().
   ------------------------------------------------------------ */
async function gscImport(){
  if (GSC_BUSY) return;
  const chosen = GSC_PRESETS.filter(p => $('#gscP_' + p.key) && $('#gscP_' + p.key).checked);
  if (!chosen.length) return toast('Pick at least one table to import');
  if (!GSC_SITE) return toast('Pick a Search Console property first');

  const days = Math.max(1, Math.min(480, +($('#gscDays').value || 28)));
  const compare = ($('#gscPrev2') && $('#gscPrev2').value) || CFG.gscCompare || 'prev';
  const range = gscDateRange(days);
  const windows = [['current', range]];
  if (compare === 'prev' || compare === 'both') windows.push(['previous', gscPreviousRange(range, days)]);
  /* snapYearAgo shifts by 52 whole weeks. Fetched as its own window and kept
     in its own bucket: it is never merged with the previous period. */
  if (compare === 'yoy' || compare === 'both') windows.push(['yoy', snapYearAgo(range, days)]);

  GSC_BUSY = true;
  GSC_RUN = { started: Date.now(), site: GSC_SITE, tables: [], errors: [], truncated: 0, firstIncomplete: null };
  renderGsc();

  for (const [period, win] of windows){
    for (const preset of chosen){
      $('#gscStatus').textContent = `Fetching ${preset.label.toLowerCase()} · ${period === 'yoy' ? 'year ago' : period} · ${win.startDate} to ${win.endDate}…`;
      try {
        const res = await gscPageAll(gscFetchJson, GSC_SITE, {
          startDate: win.startDate, endDate: win.endDate,
          dimensions: preset.dimensions,
          country: CFG.gscCountryFilter || '', device: CFG.gscDeviceFilter || '',
          maxRows: 100000
        });
        if (res.firstIncomplete) GSC_RUN.firstIncomplete = res.firstIncomplete;
        if (res.truncated) GSC_RUN.truncated++;

        if (!res.rows.length){
          GSC_RUN.tables.push({ preset: preset.label, period, rows: 0, note: 'No rows for that window.' });
          continue;
        }
        const matrix = jsonToMatrix(gscToJson(res));
        const suffix = period === 'previous' ? ' · previous' : period === 'yoy' ? ' · year ago' : '';
        const name = gscDatasetName(preset, win, GSC_SITE) + suffix;
        const okAdd = addTable(name, matrix);
        if (okAdd && period !== 'current'){
          /* the model reads period off the dataset, and the ledger lets it be changed
             by hand — set it here so a comparison works without that step */
          const d = DATASETS[DATASETS.length - 1];
          if (d){ d.period = period; persistDataset(d); }
        }
        GSC_RUN.tables.push({ preset: preset.label, period, rows: res.rows.length,
                              pages: res.pages, truncated: res.truncated, added: okAdd });
      } catch(e){
        GSC_RUN.errors.push(`${preset.label} (${period}): ${e.message}`);
      }
      renderGsc();
    }
  }

  GSC_BUSY = false;
  $('#gscStatus').textContent = '';
  renderLedger(); syncChips(); renderGsc();
  const added = GSC_RUN.tables.filter(t => t.added).length;
  toast(added ? `${added} table${added>1?'s':''} imported from Search Console` : 'Nothing imported');
}

/* ------------------------------------------------------------
   RENDER
   ------------------------------------------------------------ */
function renderGsc(){
  const host = $('#gscBody');
  if (!host) return;
  const connected = !!GSC_TOKEN;
  const mins = connected ? Math.round((Date.now() - GSC_TOKEN_AT) / 60000) : 0;

  host.innerHTML = `
    <div class="card pad" style="margin-bottom:16px">
      <div class="row gap12 wrap">
        <div class="grow" style="min-width:280px">
          <div class="eyebrow" style="margin-bottom:6px">Connection</div>
          ${connected
            ? `<div class="row gap8"><span class="chip on"><span class="dot gsc"></span>connected</span>
                 <span class="small dim">Token issued ${mins} minute${mins===1?'':'s'} ago. It is held in memory only and expires on its own.</span></div>`
            : `<p class="small muted" style="max-width:74ch;margin:0">Connecting asks Google for a read-only token in this page. Your Search Console data goes from Google straight to this tab — there is no server in the path and no refresh token is kept, so the connection ends when you close it.</p>`}
        </div>
        <div class="row gap8">
          <button class="btn ${connected?'':'primary'}" id="btnGscConnect">${connected ? 'Reconnect' : 'Connect Search Console'}</button>
          ${connected ? '<button class="btn ghost" id="btnGscForget">Disconnect</button>' : ''}
        </div>
      </div>
      ${GSC_ERR ? `<div class="callout warn" style="margin-top:14px"><b>Could not connect.</b> ${esc(GSC_ERR)}</div>` : ''}

      <div class="grid g2" style="margin-top:16px">
        <label class="field"><span>Google OAuth client ID</span>
          <input id="gscClientId" placeholder="1234567890-abc.apps.googleusercontent.com" autocomplete="off" value="${esc(CFG.gscClientId||'')}">
          <span class="hint">From your own Google Cloud project: create an OAuth client of type Web application, enable the Search Console API, and list this page's exact origin under Authorised JavaScript origins. Stored with the project; a client ID is not a secret.</span></label>
        <label class="field"><span>Property</span>
          <select id="gscSite" ${GSC_SITES.length?'':'disabled'}>
            ${GSC_SITES.length
              ? GSC_SITES.map(s => `<option value="${esc(s.siteUrl)}"${s.siteUrl===GSC_SITE?' selected':''}>${esc(s.siteUrl)}${s.matches?'  ·  matches this project':''}</option>`).join('')
              : '<option>Connect to list your properties</option>'}
          </select>
          <span class="hint">A domain property (sc-domain:) covers every subdomain and protocol. A URL-prefix property covers only what it says.</span></label>
      </div>
    </div>

    <div class="card pad" style="margin-bottom:16px">
      <div class="eyebrow" style="margin-bottom:10px">What to import</div>
      <div class="row wrap gap16">
        ${GSC_PRESETS.map(p => `<label class="row gap6" style="cursor:pointer">
          <input type="checkbox" id="gscP_${p.key}" ${p.on?'checked':''}>
          <span class="small">${esc(p.label)}</span></label>`).join('')}
      </div>
      <div class="grid g3" style="margin-top:16px">
        <label class="field"><span>Days</span><input id="gscDays" type="number" min="1" max="480" value="28">
          <span class="hint">Search Console keeps roughly 16 months. Import regularly and the project's own history outlives that window.</span></label>
        <label class="field"><span>Also fetch, to compare against</span>
          <select id="gscPrev2">
            <option value="prev">The previous period — enables trend and decay</option>
            <option value="both">Previous period and the same window last year</option>
            <option value="yoy">The same window last year only</option>
            <option value="none">Nothing, just this period</option>
          </select>
          <span class="hint">The previous period is the same number of days immediately before. The year-ago window is shifted 364 days, not 365, so Monday still lines up with Monday — search traffic is strongly weekly and a one-day slip reads as a trend.</span></label>
        <div class="field"><span>Freshness</span>
          <div class="small muted" style="padding-top:6px">The window ends two days back and asks only for settled data, because the last day or two is still filling in and would read as a collapse.</div></div>
      </div>
      <div class="row gap8 wrap" style="margin-top:16px">
        <button class="btn primary" id="btnGscImport" ${connected && !GSC_BUSY ? '' : 'disabled'}>Import into this project</button>
        <span class="small dim" id="gscStatus"></span>
      </div>
    </div>

    ${GSC_RUN ? gscRunCard() : ''}

    <div class="card pad">
      <div class="eyebrow" style="margin-bottom:8px">What this connector does not do</div>
      <ul class="small muted" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;max-width:88ch">
        <li>There is no AI Overview or AI Mode dimension in this API, and <span class="mono">searchAppearance</span> does not expose one. The AI Search stage's observation recorder is not a stopgap waiting for an endpoint — it is the only way to capture that.</li>
        <li>Nothing is written to your Search Console account. The scope requested is read-only.</li>
        <li>The token is held in memory for this tab only. Reloading the page means connecting again, on purpose.</li>
        <li>This flow's implicit grant is weaker than the authorization-code flow, which needs a server because Google's token endpoint sends no CORS headers. The hosted build should use the code flow; a browser-only build cannot.</li>
      </ul>
    </div>`;

  const ci = $('#gscClientId');
  ci.onchange = () => { CFG.gscClientId = ci.value.trim(); if (PROJECT){ PROJECT.cfg = CFG; saveProject(PROJECT).catch(()=>{}); } };
  const ss = $('#gscSite');
  if (ss && GSC_SITES.length) ss.onchange = () => { GSC_SITE = ss.value; };
  const pv = $('#gscPrev2');
  if (pv){ pv.value = CFG.gscCompare || 'prev'; pv.onchange = () => { CFG.gscCompare = pv.value; saveCfg(); }; }

  $('#btnGscConnect').onclick = async () => {
    const btn = $('#btnGscConnect');
    btn.disabled = true; btn.textContent = 'Waiting for Google…';
    try {
      CFG.gscClientId = ($('#gscClientId').value || '').trim();
      GSC_ERR = '';
      await gscConnect();
      await gscLoadSites();
      toast('Connected · ' + GSC_SITES.length + ' propert' + (GSC_SITES.length===1?'y':'ies'));
    } catch(e){
      GSC_TOKEN = null;
      GSC_ERR = e.message;
      toast(e.message);
    } finally { renderGsc(); }
  };
  const forget = $('#btnGscForget');
  if (forget) forget.onclick = () => {
    GSC_TOKEN = null; GSC_SITES = []; GSC_SITE = ''; GSC_RUN = null; GSC_ERR = '';
    renderGsc(); toast('Disconnected');
  };
  $('#btnGscImport').onclick = () => gscImport().catch(e => toast(e.message));
}

function gscRunCard(){
  const r = GSC_RUN;
  const rows = r.tables.reduce((s,t) => s + t.rows, 0);
  return `<div class="card pad" style="margin-bottom:16px">
    <div class="eyebrow" style="margin-bottom:8px">This import</div>
    <div class="row wrap gap8" style="margin-bottom:12px">
      <span class="chip"><span class="dot gsc"></span>${fmtInt(rows)} rows</span>
      <span class="chip">${r.tables.filter(t=>t.added).length} table${r.tables.filter(t=>t.added).length===1?'':'s'} added</span>
      ${r.errors.length ? `<span class="chip" style="border-color:var(--crit);color:var(--crit)">${r.errors.length} failed</span>` : ''}
    </div>
    ${r.tables.map(t => `<div class="submetric">
      <div><div class="lab">${esc(t.preset)}${t.period==='previous'?' · previous period':t.period==='yoy'?' · same window last year':''}</div>
        <div class="det">${t.rows ? `${fmtInt(t.rows)} rows over ${t.pages} request${t.pages===1?'':'s'}${t.truncated?' · capped at 100,000':''}` : esc(t.note||'No rows.')}</div></div>
      <div></div>
      <div class="n ${t.added ? 'tone-pass' : 'tone-skip'}">${t.added ? 'added' : '—'}</div>
    </div>`).join('')}
    ${r.firstIncomplete ? `<div class="callout warn" style="margin-top:12px"><b>Google reports data from ${esc(r.firstIncomplete)} onward is still incomplete.</b>
      Rows on and after that date will rise over the next day or two. The window already ends two days back, so this only appears if you widened it.</div>` : ''}
    ${r.truncated ? `<div class="callout warn" style="margin-top:12px"><b>One or more tables hit the 100,000-row cap.</b>
      Narrow the window or filter to a country to get the whole set.</div>` : ''}
    ${r.errors.length ? `<div class="callout crit" style="margin-top:12px"><b>Some tables failed.</b>
      <div class="small" style="margin-top:6px">${r.errors.map(e=>esc(e)).join('<br>')}</div></div>` : ''}
  </div>`;
}

/* The stage renders on load like every other one; nothing is fetched until the
   user clicks Connect. */
(function gscInit(){ if ($('#gscBody')) renderGsc(); })();
/* ============================================================
   AI ASSIST — the stage
   (c) 2026 Syed.ai. All rights reserved.

   Everything that decides anything lives in 04n-ai.js. This file
   collects the key, assembles the context out of the current
   project, runs a job and renders what came back.

   Three deliberate choices, each of which took an argument:

   1. THE KEY LIVES IN THE meta STORE, NOT IN THE PROJECT.
      Projects are what sync to the companion server, as an opaque
      blob. A key inside a project would therefore leave the
      browser the first time someone turned sync on — quietly, and
      without ever being asked. The meta store is per-browser and
      is never part of a project, so the key cannot travel even by
      accident.

   2. THE SPEND COUNTER IS THE USER'S OWN ARITHMETIC.
      No price table ships here, because prices change and a stale
      one is worse than none. The operator types the two rates off
      their provider's pricing page; every figure shown is labelled
      "about" and the provider's dashboard is named as the
      authority.

   3. NOTHING GENERATED IS EVER SAVED INTO A RUN.
      Results live in memory and are copied out by hand. A run is a
      record of what was measured, and putting model output in one
      would make the history untrustworthy for the one thing it is
      for. This is the same reason the results carry a GENERATED
      badge everywhere they appear.
   ============================================================ */

let AI_CFG = { provider: 'anthropic', model: '', baseUrl: '', inPerM: '', outPerM: '', capUSD: '5' };
let AI_KEY = '';                 // in memory for the session; also in the meta store if the user asked
let AI_REMEMBER = false;
let AI_SPEND = { month: '', usd: 0, calls: 0, inTokens: 0, outTokens: 0 };
let AI_RESULTS = [];             // newest first, never persisted
let AI_PROBE = null;             // last probe result
let AI_BUSY = false;
let AI_ERR = '';

const AI_META_KEY = 'aikey', AI_META_CFG = 'aicfg', AI_META_SPEND = 'aispend';

function aiMonthKey(d){
  const t = d || new Date();
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0');
}

/* ---------- persistence (per browser, never per project) ---------- */

async function aiLoadSettings(){
  try {
    const cfg = await DBget('meta', AI_META_CFG);
    if (cfg && cfg.v) AI_CFG = Object.assign(AI_CFG, cfg.v);
    const sp = await DBget('meta', AI_META_SPEND);
    if (sp && sp.v) AI_SPEND = Object.assign(AI_SPEND, sp.v);
    if (AI_SPEND.month !== aiMonthKey()) AI_SPEND = { month: aiMonthKey(), usd: 0, calls: 0, inTokens: 0, outTokens: 0 };
    const k = await DBget('meta', AI_META_KEY);
    if (k && k.v){ AI_KEY = String(k.v); AI_REMEMBER = true; }
  } catch(e){ /* a blocked or private database just means nothing is remembered */ }
}

async function aiSaveSettings(){
  try { await DBput('meta', { k: AI_META_CFG, v: AI_CFG }); } catch(e){}
}
async function aiSaveSpend(){
  try { await DBput('meta', { k: AI_META_SPEND, v: AI_SPEND }); } catch(e){}
}
async function aiWriteKey(remember){
  try {
    if (remember && AI_KEY) await DBput('meta', { k: AI_META_KEY, v: AI_KEY });
    else await DBdel('meta', AI_META_KEY);
  } catch(e){}
}

/* ---------- the transport ---------- */

/* The one place a real network call is made. It returns the shape 04n-ai.js
   expects and does not interpret anything. */
async function aiFetchJson(url, init){
  const r = await fetch(url, init);
  let json = null;
  try { json = await r.json(); } catch(e){ json = null; }
  return { status: r.status, json };
}

/* ---------- context: only what the job needs ---------- */

function aiFindingOptions(){
  const out = [];
  if (SCORE && Array.isArray(SCORE.pillars)){
    SCORE.pillars.forEach((p, i) => {
      if (!p) return;
      out.push({ id: 'pillar:' + i, label: 'Pillar — ' + (p.label || p.name || ('pillar ' + (i+1))) });
    });
  }
  if (FIND && Array.isArray(FIND.actions)){
    FIND.actions.slice(0, 25).forEach((a, i) => {
      out.push({ id: 'action:' + i, label: (a.decision || 'action') + ' — ' + (a.targetRaw || a.target || '') });
    });
  }
  return out;
}

/* Build the fact block for a chosen finding. Only measured fields go in: the
   model is told what was measured, not asked to guess what it means. */
function aiFindingFacts(id){
  const [kind, idxRaw] = String(id || '').split(':');
  const idx = Number(idxRaw);
  if (kind === 'pillar' && SCORE && SCORE.pillars && SCORE.pillars[idx]){
    const p = SCORE.pillars[idx];
    const facts = { pillar: p.label || p.name || 'pillar', score: p.score != null ? p.score : 'not measured' };
    if (Array.isArray(p.metrics))
      facts.measurements = p.metrics.filter(m => m).slice(0, 12)
        .map(m => (m.label || m.name || 'metric') + ': ' + (m.value != null ? m.value : 'not measured'));
    if (p.note) facts.note = p.note;
    return { facts, label: facts.pillar };
  }
  if (kind === 'action' && FIND && FIND.actions && FIND.actions[idx]){
    const a = FIND.actions[idx];
    return {
      facts: {
        what: a.decision || '', target: a.targetRaw || a.target || '',
        basis: a.basis || '', evidence: (a.evidence || []).slice(0, 4),
        estimatedImpact: a.impact != null ? Math.round(a.impact) : null,
      },
      label: (a.decision || 'action') + ' — ' + (a.targetRaw || a.target || ''),
    };
  }
  return null;
}

function aiSiteFacts(){
  const f = {};
  if (CFG && CFG.domain) f.domain = CFG.domain;
  if (CFG && CFG.market) f.market = CFG.market;
  if (CRAWL && CRAWL.pages) f.pagesCrawled = CRAWL.pages.length;
  if (SCORE && SCORE.overall != null) f.healthScore = SCORE.overall;
  return f;
}

function aiClusterFacts(){
  const src = (typeof CLUST !== 'undefined' && CLUST && CLUST.clusters) ? CLUST.clusters : [];
  return src.slice(0, 20).map((c, i) => ({
    id: c.id || ('c' + (i + 1)),
    queries: (c.queries || c.members || []).slice(0, 8).map(q => (typeof q === 'string' ? q : (q.query || q.key || ''))).filter(Boolean),
  })).filter(c => c.queries.length);
}

/* ---------- running a job ---------- */

function aiCapReached(){
  const cap = Number(AI_CFG.capUSD);
  return isFinite(cap) && cap > 0 && AI_SPEND.usd >= cap;
}

async function aiRun(jobId, ctx, label){
  const job = AI_JOBS[jobId];
  if (!job) return;
  if (!AI_KEY && AI_CFG.provider !== 'compatible'){
    AI_ERR = 'Add your API key first. It stays in this browser and is sent only to ' +
             (AI_PROVIDERS[AI_CFG.provider] || {}).label + '.';
    renderAssist(); return;
  }
  if (aiCapReached()){
    AI_ERR = 'This browser has reached the monthly spend cap you set (about $' + Number(AI_CFG.capUSD).toFixed(2) +
             '). Raise it below, or reset the counter, once you have checked your provider dashboard.';
    renderAssist(); return;
  }

  AI_BUSY = true; AI_ERR = ''; renderAssist();
  const built = job.build(ctx);
  try {
    const out = await aiCall(aiFetchJson, AI_CFG.provider, AI_KEY, AI_CFG.model,
      built.system, built.user, { baseUrl: AI_CFG.baseUrl });

    const rec = aiResultRecord(jobId, out, label);
    const cost = aiCostEstimate(out.inTokens, out.outTokens, { inPerM: AI_CFG.inPerM, outPerM: AI_CFG.outPerM });
    rec.costUSD = cost;
    AI_RESULTS.unshift(rec);
    if (AI_RESULTS.length > 20) AI_RESULTS.length = 20;

    AI_SPEND.month = aiMonthKey();
    AI_SPEND.calls++;
    AI_SPEND.inTokens += out.inTokens || 0;
    AI_SPEND.outTokens += out.outTokens || 0;
    if (cost != null) AI_SPEND.usd += cost;
    await aiSaveSpend();

    if (out.truncated) AI_ERR = 'The answer was cut off at the token limit. Ask for a smaller piece of work.';
  } catch (e){
    /* aiCall has already redacted the key. Redacting again is cheap and means a
       future change to that function cannot leak one through this path. */
    AI_ERR = aiRedact(String(e.message || e), AI_KEY);
  }
  AI_BUSY = false;
  renderAssist();
}

async function aiRunProbe(){
  AI_BUSY = true; AI_ERR = ''; renderAssist();
  AI_PROBE = await aiProbe(aiFetchJson, AI_CFG.provider, AI_KEY, AI_CFG.model, { baseUrl: AI_CFG.baseUrl });
  if (AI_PROBE && AI_PROBE.error) AI_PROBE.error = aiRedact(AI_PROBE.error, AI_KEY);
  AI_BUSY = false; renderAssist();
}

/* ---------- the panel ---------- */

/* renderAssist, NOT renderAi: the AI Search stage already owns renderAi(), and
   because everything shares one global scope this file loads later and would
   silently replace it — that stage simply stopped drawing. test-globals.js now
   fails the build on any duplicate top-level name. */

function renderAssist(){
  /* NOT #aiBody: that id already belongs to the AI Search stage, and $()
     returns the first match, so sharing it made this panel silently steal
     that stage's body. pw18.js caught it. */
  const host = $('#assistBody');
  if (!host) return;
  const p = AI_PROVIDERS[AI_CFG.provider] || AI_PROVIDERS.anthropic;
  const findings = aiFindingOptions();
  const clusters = aiClusterFacts();
  const cap = Number(AI_CFG.capUSD);
  const spendKnown = AI_CFG.inPerM !== '' && AI_CFG.outPerM !== '';

  host.innerHTML = `
  <div class="card pad">
    <h3>Your key, your account</h3>
    <p class="small muted" style="max-width:74ch">This tool has no AI account to lend you and never will — a shared key would mean your drafts and your clients' data passing through someone else's bill. You paste a key from your own provider. It stays in this browser, is sent only to the provider you pick, and is never written into a project, so it cannot travel even if you switch sync on later.</p>

    <div class="grid g2" style="margin-top:14px">
      <label class="field"><span>Provider</span>
        <select id="aiProvider">
          ${Object.values(AI_PROVIDERS).map(x => `<option value="${x.id}" ${x.id===AI_CFG.provider?'selected':''}>${esc(x.label)}</option>`).join('')}
        </select>
        <span class="hint">${p.browserDirect === 'yes'
          ? 'Documented to work straight from a browser — the only provider that says so explicitly.'
          : 'May refuse a request straight from a browser. Test it below; if it does, use Anthropic or route it through the companion server.'}</span>
      </label>
      <label class="field"><span>Model</span>
        <input id="aiModel" type="text" spellcheck="false" placeholder="${esc(p.defaultModel || 'model id')}" value="${esc(AI_CFG.model)}">
        <span class="hint">${esc(p.modelsNote || '')}</span>
      </label>
    </div>

    ${p.needsBaseUrl ? `
    <label class="field" style="margin-top:12px"><span>Base URL</span>
      <input id="aiBaseUrl" type="text" spellcheck="false" placeholder="https://openrouter.ai/api/v1" value="${esc(AI_CFG.baseUrl)}">
      <span class="hint">Ends in /v1. A local model here — Ollama, llama.cpp — means the draft never leaves the machine at all.</span>
    </label>` : ''}

    <label class="field" style="margin-top:12px"><span>API key</span>
      <input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(p.keyHint || '')}" value="${esc(AI_KEY)}">
      <span class="hint">${p.keysAt ? 'Get one at ' + esc(p.keysAt) + '. ' : ''}Never shown in a report, an export, or an error message.</span>
    </label>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="aiRemember" ${AI_REMEMBER?'checked':''}> <span>Remember it in this browser. Leave this off on a shared machine and it lasts only until you close the tab.</span></label>

    <div class="row wrap gap8" style="margin-top:14px">
      <button class="btn sm" id="aiTest" ${AI_BUSY?'disabled':''}>${AI_BUSY ? 'Working…' : 'Test the connection'}</button>
      <button class="btn sm ghost" id="aiForget">Forget the key</button>
    </div>

    ${AI_PROBE ? `<div class="callout ${AI_PROBE.ok?'':'crit'}" style="margin-top:12px">
      <b>${AI_PROBE.ok ? 'Connected.' : 'Not connected.'}</b>
      ${AI_PROBE.ok
        ? `${esc(p.label)} answered in ${AI_PROBE.ms} ms using <span class="mono">${esc(AI_PROBE.model||'')}</span>.`
        : esc(AI_PROBE.error || '')}
    </div>` : ''}
    ${AI_ERR ? `<div class="callout crit" style="margin-top:12px">${esc(AI_ERR)}</div>` : ''}
  </div>

  <div class="card pad" style="margin-top:16px">
    <h3>What it costs</h3>
    <p class="small muted" style="max-width:74ch">No price list ships with this tool: prices change, and a stale one is worse than none. Type the two rates from your provider's pricing page and every figure below becomes arithmetic on the tokens actually used. Your provider's own dashboard is still the only authority on what you were billed.</p>
    <div class="grid g3" style="margin-top:12px">
      <label class="field"><span>Input, $ per million tokens</span>
        <input id="aiInRate" type="text" inputmode="decimal" placeholder="3.00" value="${esc(AI_CFG.inPerM)}"></label>
      <label class="field"><span>Output, $ per million</span>
        <input id="aiOutRate" type="text" inputmode="decimal" placeholder="15.00" value="${esc(AI_CFG.outPerM)}"></label>
      <label class="field"><span>Stop at, $ this month</span>
        <input id="aiCap" type="text" inputmode="decimal" placeholder="5.00" value="${esc(AI_CFG.capUSD)}">
        <span class="hint">A brake, not a bill. Blank or zero removes it.</span></label>
    </div>
    <div class="grid g3" style="margin-top:14px">
      ${tile('Calls this month', fmtInt(AI_SPEND.calls), '<span class="flat">' + esc(AI_SPEND.month || aiMonthKey()) + '</span>')}
      ${tile('Tokens in / out', fmtInt(AI_SPEND.inTokens) + ' / ' + fmtInt(AI_SPEND.outTokens), '<span class="flat">as the provider reported them</span>')}
      ${tile('Spend', spendKnown ? 'about $' + AI_SPEND.usd.toFixed(2) : 'not priced', '<span class="flat">' + (spendKnown ? (cap > 0 ? 'cap $' + cap.toFixed(2) : 'no cap set') : 'enter your rates above') + '</span>')}
    </div>
    <div class="row gap8" style="margin-top:12px"><button class="btn sm ghost" id="aiResetSpend">Reset the counter</button></div>
  </div>

  <div class="card pad" style="margin-top:16px">
    <div class="row wrap gap8" style="align-items:center">
      <h3 style="margin:0">What it will do</h3><div class="grow"></div>
      <span class="evtag generated">generated</span><span class="small dim">never scored</span>
    </div>
    <p class="small muted" style="max-width:74ch;margin-top:10px">Everything below writes prose for you to edit. None of it produces a number, changes a score, or enters a saved run — the model is told so in its own instructions, and the scoring engines have no way to read any of it. That is the point: the audit stays measured, and the writing gets faster.</p>

    <div class="grid g2" style="margin-top:14px">
      <label class="field"><span>Explain a finding in plain English</span>
        <select id="aiFinding">
          ${findings.length ? findings.map(f => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')
                            : '<option value="">Run the analysis first</option>'}
        </select>
      </label>
      <label class="field"><span>&nbsp;</span>
        <button class="btn sm" id="aiExplain" ${!findings.length || AI_BUSY?'disabled':''}>Explain it</button>
      </label>
    </div>

    <div class="row wrap gap8" style="margin-top:10px">
      <button class="btn sm" id="aiCritique" ${AI_BUSY?'disabled':''}>Read my draft against the data</button>
      <button class="btn sm" id="aiNarrative" ${(!SCORE||AI_BUSY)?'disabled':''}>Write the client summary</button>
      <button class="btn sm" id="aiLabel" ${(!clusters.length||AI_BUSY)?'disabled':''}>Name the topic clusters${clusters.length?' ('+clusters.length+')':''}</button>
    </div>
    <p class="small dim" style="margin-top:10px">Rewriting a weak section happens in the Live editor, next to the paragraph it changes.</p>
  </div>

  <div class="card pad" style="margin-top:16px">
    <div class="row wrap gap8" style="align-items:center">
      <h3 style="margin:0">Results</h3><div class="grow"></div>
      ${AI_RESULTS.length ? `<span class="chip">${AI_RESULTS.length} this session</span>` : ''}
    </div>
    <div style="margin-top:12px">
    ${AI_RESULTS.length ? AI_RESULTS.map((r, i) => `
      <div class="genblock">
        <div class="genhead">
          <span class="evtag generated">generated</span>
          <b>${esc((AI_JOBS[r.job]||{}).label || r.job)}</b>
          ${r.about ? `<span class="small dim">· ${esc(r.about)}</span>` : ''}
          <div class="grow"></div>
          <span class="small dim mono">${esc(r.model)} · ${fmtInt(r.inTokens)}+${fmtInt(r.outTokens)} tokens${r.tokensEstimated?' (estimated)':''}${r.costUSD!=null?' · about $'+r.costUSD.toFixed(4):''}</span>
          <button class="btn sm ghost aiCopy" data-idx="${i}">Copy</button>
        </div>
        <div class="gentext">${esc(r.text)}</div>
      </div>`).join('')
    : `<div class="empty"><p style="max-width:56ch;margin:0 auto">Nothing generated yet. Anything that appears here is a suggestion written by a language model, marked as such, and never counted as evidence.</p></div>`}
    </div>
  </div>`;

  /* ---------- wiring ---------- */
  const bind = (id, ev, fn) => { const el = $('#' + id); if (el) el[ev] = fn; };
  const persist = () => { aiSaveSettings(); };

  bind('aiProvider', 'onchange', e => { AI_CFG.provider = e.target.value; AI_CFG.model = ''; AI_PROBE = null; persist(); renderAssist(); });
  bind('aiModel', 'onchange', e => { AI_CFG.model = e.target.value.trim(); persist(); });
  bind('aiBaseUrl', 'onchange', e => { AI_CFG.baseUrl = e.target.value.trim(); persist(); });
  bind('aiKey', 'oninput', e => { AI_KEY = e.target.value.trim(); if (AI_REMEMBER) aiWriteKey(true); });
  bind('aiRemember', 'onchange', e => { AI_REMEMBER = !!e.target.checked; aiWriteKey(AI_REMEMBER); });
  bind('aiInRate', 'onchange', e => { AI_CFG.inPerM = e.target.value.trim(); persist(); renderAssist(); });
  bind('aiOutRate', 'onchange', e => { AI_CFG.outPerM = e.target.value.trim(); persist(); renderAssist(); });
  bind('aiCap', 'onchange', e => { AI_CFG.capUSD = e.target.value.trim(); persist(); renderAssist(); });

  bind('aiTest', 'onclick', () => aiRunProbe());
  bind('aiForget', 'onclick', async () => {
    AI_KEY = ''; AI_REMEMBER = false; AI_PROBE = null;
    await aiWriteKey(false);
    toast('Key forgotten in this browser.');
    renderAssist();
  });
  bind('aiResetSpend', 'onclick', async () => {
    AI_SPEND = { month: aiMonthKey(), usd: 0, calls: 0, inTokens: 0, outTokens: 0 };
    await aiSaveSpend(); renderAssist();
  });

  bind('aiExplain', 'onclick', () => {
    const sel = $('#aiFinding');
    const f = aiFindingFacts(sel && sel.value);
    if (!f){ AI_ERR = 'Pick a finding first.'; renderAssist(); return; }
    aiRun('explain', { finding: f.facts, site: aiSiteFacts() }, f.label);
  });
  bind('aiCritique', 'onclick', () => {
    const text = (typeof EDRAFT !== 'undefined' && EDRAFT && EDRAFT.text) ? EDRAFT.text : '';
    if (!text.trim()){ AI_ERR = 'Write or paste a draft in the Live editor first.'; renderAssist(); return; }
    const queries = aiDraftQueries();
    aiRun('critique', { draft: text, queries, score: aiDraftScoreFacts() }, EDRAFT.title || 'the current draft');
  });
  bind('aiNarrative', 'onclick', () => {
    aiRun('narrative', { run: aiRunFacts(), actions: aiTopActions() }, CFG.domain || 'this site');
  });
  bind('aiLabel', 'onclick', () => {
    aiRun('label', { clusters }, clusters.length + ' clusters');
  });

  aiSyncChip();

  host.querySelectorAll('.aiCopy').forEach(btn => {
    btn.onclick = () => {
      const r = AI_RESULTS[Number(btn.dataset.idx)];
      if (!r) return;
      navigator.clipboard.writeText(r.text).then(() => toast('Copied. It is a draft — read it before you send it.'),
                                                  () => toast('Could not reach the clipboard.'));
    };
  });
}

/* ---------- small context helpers ---------- */

function aiDraftQueries(){
  const cid = (typeof EDRAFT !== 'undefined' && EDRAFT) ? EDRAFT.clusterId : '';
  const src = (typeof CLUST !== 'undefined' && CLUST && CLUST.clusters) ? CLUST.clusters : [];
  const c = src.find(x => x && (x.id === cid));
  const qs = c ? (c.queries || c.members || []) : [];
  return qs.slice(0, 20).map(q => (typeof q === 'string' ? q : (q.query || q.key || ''))).filter(Boolean);
}

function aiDraftScoreFacts(){
  try {
    if (typeof analyseDraft !== 'function' || typeof readinessFor !== 'function') return null;
    const text = (EDRAFT && EDRAFT.text) || '';
    if (!text.trim()) return null;
    const d = analyseDraft(text);
    const s = readinessFor(d, null, null, {});
    return { readiness: s && s.score != null ? s.score : 'not scored', words: d.words };
  } catch(e){ return null; }
}

function aiRunFacts(){
  const f = aiSiteFacts();
  if (SCORE && Array.isArray(SCORE.pillars))
    f.pillars = SCORE.pillars.filter(p => p).map(p =>
      (p.label || p.name || 'pillar') + ': ' + (p.score != null ? p.score : 'not measured'));
  if (SCORE && SCORE.coverageNote) f.whatIsNotMeasured = SCORE.coverageNote;
  return f;
}

function aiTopActions(){
  if (!FIND || !Array.isArray(FIND.actions)) return [];
  return FIND.actions.slice(0, 8).map(a =>
    (a.decision || '') + ' — ' + (a.targetRaw || a.target || '') +
    (a.evidence && a.evidence[0] ? ' (' + a.evidence[0] + ')' : ''));
}

/* Called once, from the app's own init, after the database is open. */
async function aiInit(){
  await aiLoadSettings();
  renderAssist();
  aiSyncChip();
}

/* The rail sub-label. It says whether a key is present, never what it is. */
function aiSyncChip(){
  const el = $('#sub-assist');
  if (!el) return;
  const p = AI_PROVIDERS[AI_CFG.provider] || {};
  el.textContent = AI_KEY ? (p.label || AI_CFG.provider) : 'no key';
}
/* ============================================================
   SIMPLE MODE
   (c) 2026 Syed.ai. All rights reserved.

   Twenty-three stages is the right number for someone who does
   this for a living and the wrong number for someone opening the
   tool for the first time. Simple mode shows eleven of them and
   rewrites the headings into plain words.

   Two rules made this worth building rather than dangerous:

   1. NOTHING IS REMOVED, ONLY HIDDEN. Every engine still runs,
      every measurement is still taken, and the score in Simple
      mode is identical to the score in Pro mode — there is no
      "beginner scoring". Switching back shows the same numbers
      with more of the working visible. A mode that quietly
      measured less would be a lie told to the least experienced
      user, which is exactly the wrong person to lie to.

   2. THE PLAIN WORDING IS A LAYER, NOT A REWRITE. The original
      heading is kept on the element in a data attribute and put
      back on the way out. There is one copy of each panel, so the
      two modes cannot drift apart.

   The choice is per project and remembered, because an agency
   running its own audits in Pro will still want Simple on the
   project it hands to a client.
   ============================================================ */

/* The eleven. Chosen by asking what someone needs to get from nothing to a
   report: set up, get data in (two routes), see what is missing, see the
   score, see what to do, write the page, get it explained, send the report. */
const SIMPLE_STAGES = ['setup', 'guide', 'gsc', 'data', 'checks', 'score', 'actions', 'editor', 'assist', 'report', 'export'];

const SIMPLE_LABEL = {
  setup:   'Your site',
  guide:   'Get your data',
  gsc:     'Connect Google',
  data:    'Load a file',
  checks:  "What's missing",
  score:   'Your score',
  actions: 'What to fix first',
  editor:  'Write a page',
  assist:  'Ask AI',
  report:  'Your report',
  export:  'Save and compare',
};

const SIMPLE_H1 = {
  setup:   'Tell it about your site.',
  guide:   'Where the numbers come from.',
  gsc:     'Skip the export — connect instead.',
  data:    'Drop your export in.',
  checks:  'What you have, and what is missing.',
  score:   'Where the site stands.',
  actions: 'The list, in order.',
  editor:  'Write it here and watch it score.',
  assist:  'Get any of this explained.',
  report:  'Something you can send.',
  export:  'Keep a copy, and compare it later.',
};

/* One sentence at the top of each stage, written for someone who does not
   know the jargon. These are the whole point of the mode. */
const SIMPLE_NOTE = {
  setup:   'Two things matter here: your domain, and the country you sell in. Everything else can stay as it is.',
  guide:   'You need one file to start: a Search Console export. This page shows exactly where to click to get it.',
  gsc:     'This is the easier route — connect once and the data comes straight in, no downloading. It needs a one-off setup in Google Cloud, about ten minutes, explained step by step.',
  data:    'Drag the file you downloaded onto the box below. CSV, Excel or a zip; it works out what each file is on its own.',
  checks:  'A stage with a tick can run. Anything greyed out is waiting for a file you have not loaded yet — nothing is broken, and the report simply leaves that part out rather than guessing.',
  score:   'One number out of a hundred, built from five parts. Anything that could not be measured is left out of the total rather than counted as zero, so the score never punishes you for a file you did not have.',
  actions: 'Start at the top and work down. Each row says what to do, which page to do it to, and the measurement that put it there.',
  editor:  'Paste a draft or start typing. The score updates as you write, using the same engine that scored your live pages — so the two can never disagree.',
  assist:  'Paste your own AI key and it will explain any finding in plain words, or read your draft. It writes suggestions only: nothing it says changes your score.',
  report:  'One page you can save, print or send. Every number on it says which file it came from.',
  export:  'Save a snapshot every time you load fresh data. It is one small file with the date in its name, and it is the only way to prove later that something actually improved. Take a backup before you clear your browser.',
};

let TIER_APPLIED = null;

function tierIsSimple(){ return !!(CFG && CFG.simple); }

/* applyTier is idempotent and is safe to call after anything that rebuilds a
   panel — which is most render functions. */
function applyTier(){
  const simple = tierIsSimple();
  document.body.classList.toggle('simplemode', simple);

  $$('.tierswitch [data-tier]').forEach(b =>
    b.setAttribute('aria-pressed', String((b.dataset.tier === 'simple') === simple)));

  /* Rail buttons: hide the ones Simple does not offer, and relabel the rest.
     The original label is parked on the element, so Pro mode gets it back
     exactly rather than from a second copy that could drift. */
  $$('.step[data-go]').forEach(btn => {
    const go = btn.dataset.go;
    const keep = !simple || SIMPLE_STAGES.includes(go);
    btn.hidden = !keep;

    const wrap = btn.children[1];
    if (!wrap) return;
    const textNode = [...wrap.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (!textNode) return;
    if (!btn.dataset.proLabel) btn.dataset.proLabel = textNode.textContent;
    textNode.textContent = (simple && SIMPLE_LABEL[go]) ? SIMPLE_LABEL[go] : btn.dataset.proLabel;
  });

  /* A group heading with nothing under it is noise. */
  $$('.raillabel').forEach(lab => {
    let anyVisible = false;
    for (let el = lab.nextElementSibling; el && !el.classList.contains('raillabel'); el = el.nextElementSibling){
      if (el.classList.contains('step') && !el.hidden) { anyVisible = true; break; }
    }
    lab.hidden = !anyVisible;
  });

  /* Panel headings, and the plain sentence under them. */
  $$('section.panel').forEach(sec => {
    const go = sec.id.replace(/^p-/, '');
    const head = sec.querySelector('.panelhead > div');
    if (!head) return;

    const h1 = head.querySelector('h1');
    if (h1){
      if (!h1.dataset.proText) h1.dataset.proText = h1.textContent;
      h1.textContent = (simple && SIMPLE_H1[go]) ? SIMPLE_H1[go] : h1.dataset.proText;
    }

    let note = head.querySelector('.simplenote');
    if (simple && SIMPLE_NOTE[go]){
      if (!note){
        note = document.createElement('p');
        note.className = 'simplenote';
        head.insertBefore(note, head.querySelector('p') || null);
      }
      note.textContent = SIMPLE_NOTE[go];
    } else if (note){
      note.remove();
    }
  });

  /* Anything marked pro-only is an advanced control inside a stage Simple
     keeps — a threshold, a mapper, a raw table. */
  $$('.pro-only').forEach(el => { el.hidden = simple; });

  /* If the stage on screen has just been hidden, move somewhere sensible
     rather than leaving a blank sheet. */
  const open = $$('section.panel').find(s => !s.classList.contains('hide'));
  if (open){
    const go = open.id.replace(/^p-/, '');
    if (simple && !SIMPLE_STAGES.includes(go)) go2(SCORE ? 'score' : 'setup');
  }

  if (typeof numberStages === 'function') numberStages();
  TIER_APPLIED = simple;
}

/* go() is defined in 05-ui.js; this indirection exists only so applyTier can
   be called from a file that loads before it without a reference error at
   parse time. */
function go2(id){ if (typeof go === 'function') go(id); }

async function setTier(simple){
  if (!CFG) return;
  CFG.simple = !!simple;
  applyTier();
  /* Remembered per project, and separately as the default for the next new
     project — an agency that works in Pro should not get Simple again every
     time it starts a client, and a beginner should not have to re-pick it. */
  if (PROJECT){ PROJECT.cfg = CFG; try { await saveProject(PROJECT); } catch(e){} }
  try { await DBput('meta', { k: 'tier', v: simple ? 'simple' : 'pro' }); } catch(e){}
  if (typeof toast === 'function')
    toast(simple ? 'Simple mode. Ten stages, plain language — nothing is measured differently.'
                 : 'Pro mode. All twenty-three stages.');
}

/* The default for a project that has never chosen. A brand new install starts
   Simple, because the person opening it for the first time is the one who
   needs it; anyone who switches to Pro is remembered from then on. */
async function tierDefault(){
  try {
    const m = await DBget('meta', 'tier');
    if (m && m.v) return m.v === 'simple';
  } catch(e){}
  return true;
}

function tierBind(){
  $$('.tierswitch [data-tier]').forEach(b =>
    b.addEventListener('click', () => setTier(b.dataset.tier === 'simple')));
}
/* ============================================================
   EXPORT, IMPORT AND COMPARE  —  05l-export.js
   (c) 2026 Syed.ai. All rights reserved.

   Four things live here, and they exist for one reason: a number
   is only evidence if you can still produce it in a year.

     1. Snapshots.   One dated JSON file per run: the totals, the
                     score, the pillars and the top of the action
                     queue. Small enough to keep forever, and the
                     unit of "what did this look like in March".
     2. Comparison.  Any two snapshots, ordered by date, with
                     every unmeasured value staying unmeasured.
                     Including the year-over-year shortcut, which
                     shifts 364 days so weekdays still line up.
     3. Workbooks.   One .xlsx, seven sheets, for the people who
                     will re-cut the numbers themselves.
     4. Backups.     The whole project, dated in its filename, and
                     an offer to write one before anything is
                     deleted — because IndexedDB has no undo.
   ============================================================ */

/* Snapshots the user has loaded from disk this session. Not persisted: they
   are files, and the file is the archive. Keeping a copy in IndexedDB would
   invite the idea that deleting the file is safe. */
let SNAPS = [];

/* ---------- gathering the context an export describes ---------- */

/* Everything below exports the same object the report is built from, plus the
   things a file needs and a screen does not: the letterhead, the project name
   and the list of files the figures came from. */
function exportContext(){
  const ctx = reportContext();
  ctx.projectName = PROJECT ? PROJECT.name : '';
  ctx.datasets = DATASETS || [];
  ctx.logo = reportLogo();
  ctx.at = Date.now();
  return ctx;
}

/* The report carries its letterhead as a data URI so the file stays branded
   offline. Reading it off the rendered <img> keeps one copy of the asset in
   the build instead of two. */
function reportLogo(){
  const img = document.querySelector('.logo.lt');
  const src = img ? (img.getAttribute('src') || '') : '';
  return src.indexOf('data:') === 0 ? src : '';
}

function exportStamp(at){
  return snapStamp(at == null ? Date.now() : at);
}

/* ---------- 1. snapshots ---------- */

function exportSnapshot(){
  if (!SCORE){ toast('Run the analysis first'); return; }
  const ctx = exportContext();
  const snap = buildSnapshot(ctx, { at: ctx.at, projectName: ctx.projectName,
                                    datasets: ctx.datasets, build: '' });
  saveFile(snapshotFilename(snap), JSON.stringify(snap, null, 2), 'application/json');
  toast('Snapshot saved for ' + new Date(snap.at).toLocaleDateString());
}

async function loadSnapshotFile(file){
  const snap = parseSnapshot(await file.text());
  /* Same date, same domain, loaded twice: replace rather than accumulate, or
     the picker fills up with the same column. */
  const key = s => s.at + '::' + ((s.project && s.project.domain) || '');
  SNAPS = SNAPS.filter(s => key(s) !== key(snap)).concat([snap]);
  SNAPS.sort((a, b) => a.at - b.at);
  return snap;
}

/* The snapshots available to compare: the files loaded this session, plus
   every run already saved against this project, which is the same shape one
   level thinner. Runs are marked so the comparison can say what is missing
   from that side rather than reporting an empty queue as progress. */
function snapshotChoices(){
  const fromRuns = (RUNS || []).map(r => runToSnapshot(r, CFG, PROJECT ? PROJECT.name : ''));
  const all = SNAPS.concat(fromRuns);
  /* A loaded file wins over a saved run for the same moment: it carries more. */
  const seen = new Set();
  const out = [];
  for (const s of all.slice().sort((a, b) => (a.fromSavedRun ? 1 : 0) - (b.fromSavedRun ? 1 : 0))){
    const k = String(s.at).slice(0, 10);
    if (seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out.sort((a, b) => b.at - a.at);
}

function snapshotLabel(s){
  return new Date(s.at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    + (s.fromSavedRun ? ' — saved run' : ' — snapshot file')
    + (s.score && s.score.overall != null ? ' (score ' + s.score.overall + ')' : '');
}

/* ---------- 2. rendering a comparison ---------- */

const COUNT_LABEL = { actions: 'Actions queued', issues: 'Technical issues',
                      topics: 'Topics found', pages: 'Pages crawled' };

function cmpValue(v, kind){
  if (v == null) return '<span class="dim">not measured</span>';
  if (kind === 'pct') return fmtPct(v);
  if (kind === 'pos') return v.toFixed(1);
  return fmtInt(v);
}

function cmpDeltaCell(m){
  if (m.delta == null) return '<span class="dim">—</span>';
  const s = m.kind === 'pct' ? (m.delta * 100).toFixed(2) + 'pt'
          : m.kind === 'pos' ? m.delta.toFixed(1)
          : fmtInt(m.delta);
  const sign = m.delta > 0 ? '+' : '';
  const cls = m.direction === 'better' ? 'up' : m.direction === 'worse' ? 'down' : 'flat';
  const pct = m.pct == null ? '' : ` <span class="dim small">(${(m.pct * 100).toFixed(1)}%)</span>`;
  return `<span class="${cls}"><b>${sign}${s}</b></span>${pct}`;
}

function renderComparison(cmp){
  const rows = [Object.assign({}, cmp.overall)].concat(Object.keys(cmp.totals).map(k => cmp.totals[k]));
  const table = list => `<div class="tablewrap"><table><thead><tr>
      <th>Measure</th><th class="n">${esc(new Date(cmp.from.at).toLocaleDateString())}</th>
      <th class="n">${esc(new Date(cmp.to.at).toLocaleDateString())}</th><th class="n">Change</th><th>Notes</th></tr></thead><tbody>
    ${list.map(m => `<tr><td><b>${esc(m.label || m.name)}</b></td>
        <td class="n">${cmpValue(m.a, m.kind)}</td><td class="n">${cmpValue(m.b, m.kind)}</td>
        <td class="n">${cmpDeltaCell(m)}</td><td class="small dim">${esc(m.note || '')}</td></tr>`).join('')}
    </tbody></table></div>`;

  const acts = cmp.actions;
  return `
    ${cmp.warnings.map(w => `<div class="callout warn"><b>Read this first.</b> ${esc(w)}</div>`).join('')}
    <p class="muted small">${esc(cmp.label)} · ${cmp.days} days apart${cmp.yearOverYear ? ' · <b>year over year</b>' : ''}.
      A blank means the measure was not present on that side. It is not a zero, and it is not a fall to zero.</p>
    ${table(rows)}
    <h3 style="margin:22px 0 4px">Pillars</h3>
    ${table(cmp.pillars)}
    <h3 style="margin:22px 0 4px">Volumes</h3>
    ${table(Object.keys(cmp.counts).map(k => Object.assign({ label: COUNT_LABEL[k] || k, kind: 'int' }, cmp.counts[k])))}
    <h3 style="margin:22px 0 4px">The action queue</h3>
    ${acts ? `<div class="grid g3">
        <div class="card pad"><div class="eyebrow">Closed</div><div class="v" style="font-family:var(--display);font-weight:600;font-size:28px;letter-spacing:-.028em">${acts.closed.length}</div>
          <p class="small dim">On the earlier queue and no longer on the later one.</p></div>
        <div class="card pad"><div class="eyebrow">New</div><div class="v" style="font-family:var(--display);font-weight:600;font-size:28px;letter-spacing:-.028em">${acts.opened.length}</div>
          <p class="small dim">Appeared since.</p></div>
        <div class="card pad"><div class="eyebrow">Carried over</div><div class="v" style="font-family:var(--display);font-weight:600;font-size:28px;letter-spacing:-.028em">${acts.carried.length}</div>
          <p class="small dim">Still open on both.</p></div>
      </div>
      ${acts.closed.length ? `<h4 style="margin:18px 0 4px">Closed</h4><ul style="margin:6px 0 0;padding-left:20px;font-size:13px;line-height:1.7">${acts.closed.slice(0, 12).map(a => `<li><b>${esc(a.decision)}</b> ${esc(a.target)}</li>`).join('')}</ul>` : ''}
      ${acts.opened.length ? `<h4 style="margin:18px 0 4px">New</h4><ul style="margin:6px 0 0;padding-left:20px;font-size:13px;line-height:1.7">${acts.opened.slice(0, 12).map(a => `<li><b>${esc(a.decision)}</b> ${esc(a.target)}</li>`).join('')}</ul>` : ''}`
      : `<p class="muted small">At least one side is a saved run, which records the score and the totals but not the queue, so there is nothing to compare here. Export a snapshot at each point to get this section.</p>`}`;
}

/* ---------- the compare dialog ---------- */

function openCompare(){
  const choices = snapshotChoices();
  if (choices.length < 2){
    showModal('Compare two points in time', `
      <p>There is only ${choices.length === 1 ? 'one point' : 'nothing'} on record for this project, so there is nothing to compare yet.</p>
      <p class="muted small">Two things create a comparable point: pressing <b>Run analysis</b>, which saves a run, and <b>Export snapshot</b>, which writes a dated file you can keep and load back at any time. Take one now and another after the next data refresh.</p>
      <div class="row gap8" style="margin-top:14px">
        <button class="btn primary" id="cmpTakeSnap">Export a snapshot now</button>
        <label class="btn" style="cursor:pointer">Load a snapshot file<input type="file" id="cmpLoad" accept=".json" style="display:none"></label>
      </div>`);
    bindCompareControls();
    return;
  }
  const opts = (sel) => choices.map((s, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(snapshotLabel(s))}</option>`).join('');
  showModal('Compare two points in time', `
    <div class="row wrap gap8" style="align-items:flex-end">
      <label class="field"><span>Earlier</span><select id="cmpA">${opts(Math.min(1, choices.length - 1))}</select></label>
      <label class="field"><span>Later</span><select id="cmpB">${opts(0)}</select></label>
      <label class="btn" style="cursor:pointer">Load a snapshot file<input type="file" id="cmpLoad" accept=".json" style="display:none"></label>
      <div class="grow"></div>
      <button class="btn" id="cmpCsv">Download as CSV</button>
    </div>
    <div id="cmpOut" style="margin-top:16px"></div>`);
  bindCompareControls();
  drawCompare();
}

function bindCompareControls(){
  const a = document.getElementById('cmpA'), b = document.getElementById('cmpB');
  if (a) a.onchange = drawCompare;
  if (b) b.onchange = drawCompare;
  const take = document.getElementById('cmpTakeSnap');
  if (take) take.onclick = () => { exportSnapshot(); };
  const load = document.getElementById('cmpLoad');
  if (load) load.onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try {
      const s = await loadSnapshotFile(f);
      toast('Loaded the snapshot from ' + new Date(s.at).toLocaleDateString());
      openCompare();
    } catch (err){ toast(err.message); }
  };
  const csv = document.getElementById('cmpCsv');
  if (csv) csv.onclick = downloadComparisonCsv;
}

function currentComparison(){
  const choices = snapshotChoices();
  const a = document.getElementById('cmpA'), b = document.getElementById('cmpB');
  if (!a || !b) return null;
  const x = choices[+a.value], y = choices[+b.value];
  if (!x || !y) return null;
  if (x === y) return { same: true };
  return compareSnapshots(x, y);
}

function drawCompare(){
  const out = document.getElementById('cmpOut');
  if (!out) return;
  const cmp = currentComparison();
  if (!cmp){ out.innerHTML = ''; return; }
  if (cmp.same){ out.innerHTML = '<div class="callout">Those are the same point in time. Pick two different ones.</div>'; return; }
  out.innerHTML = renderComparison(cmp);
  LAST_COMPARISON = cmp;
}

/* Kept so the report can carry the comparison the user is looking at. */
let LAST_COMPARISON = null;

function downloadComparisonCsv(){
  const cmp = currentComparison();
  if (!cmp || cmp.same){ toast('Pick two different points first'); return; }
  const rows = [['Measure', 'Earlier date', 'Earlier value', 'Later date', 'Later value', 'Change', 'Direction', 'Note']];
  const push = m => rows.push([
    m.label || m.name,
    new Date(cmp.from.at).toISOString().slice(0, 10), m.a == null ? '' : m.a,
    new Date(cmp.to.at).toISOString().slice(0, 10), m.b == null ? '' : m.b,
    m.delta == null ? '' : m.delta, m.direction, m.note || '',
  ]);
  push(cmp.overall);
  for (const k of Object.keys(cmp.totals)) push(cmp.totals[k]);
  for (const p of cmp.pillars) push(p);
  const host = snapSlug((cmp.to.project && cmp.to.project.domain) || '');
  downloadCsv(host + '-comparison-' + exportStamp(cmp.to.at) + '.csv', rows);
}

/* ---------- 3. the workbook ---------- */

async function exportWorkbook(){
  if (!SCORE){ toast('Run the analysis first'); return; }
  const ctx = exportContext();
  const btn = document.getElementById('btnExportXlsx');
  if (btn){ btn.disabled = true; btn.textContent = 'Building…'; }
  try {
    const sheets = auditWorkbook(ctx, { at: ctx.at, datasets: ctx.datasets, projectName: ctx.projectName });
    const bytes = await makeXlsx(sheets);
    saveFile(xlsxFilename(CFG, ctx.at), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(sheets.length + ' sheets written');
  } catch (err){
    toast('The workbook could not be built: ' + err.message);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = 'Excel workbook'; }
  }
}

/* ---------- 4. the PDF ---------- */

/* There is no PDF writer here and there should not be: the browser already
   has one, it is the one the user's own printer dialog offers, and it renders
   the same CSS the report was designed in. What this does is hand the report
   to it in its own window so the print is the report and not the console
   around it. */
function saveReportPdf(){
  if (!SCORE){ toast('Run the analysis first'); return; }
  const ctx = exportContext();
  if (LAST_COMPARISON && !LAST_COMPARISON.same) ctx.comparison = LAST_COMPARISON;
  const html = buildReport(ctx);

  /* A same-origin iframe rather than window.open: a pop-up blocker cannot
     silently swallow it, and nothing needs a second click. */
  const old = document.getElementById('printFrame');
  if (old) old.remove();
  const f = document.createElement('iframe');
  f.id = 'printFrame';
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0';
  document.body.appendChild(f);

  f.onload = () => {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
      toast('Choose "Save as PDF" as the destination');
    } catch (err){
      /* Some embedded webviews refuse to print an iframe. Falling back to the
         file is better than a dead button: the file prints from anywhere. */
      saveFile(reportFilename(ctx), html, 'text/html');
      toast('Printing is blocked here, so the report was saved instead. Open it and print to PDF.');
    }
  };
  const doc = f.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
}

function reportFilename(ctx){
  return snapSlug((ctx && ctx.cfg && ctx.cfg.domain) || (CFG && CFG.domain) || '')
    + '-search-evidence-report-' + exportStamp(ctx && ctx.at) + '.html';
}

/* ---------- 5. project backups ---------- */

function projectBackupName(project, at){
  const slug = String((project && project.name) || 'project').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
  return slug + '-' + exportStamp(at) + '.seoproject.json';
}

async function backupProject(opts){
  if (!PROJECT) return null;
  const o = opts || {};
  readCfg(); PROJECT.cfg = CFG; await saveProject(PROJECT);
  const data = await exportProject(PROJECT.id);
  /* Stamp the file itself, not only its name: a renamed file must still be
     able to say when it was written and what it came from. */
  data.exportedAt = new Date().toISOString();
  data.app = { name: 'Search Evidence Suite', build: '' };
  const json = JSON.stringify(data);
  saveFile(projectBackupName(PROJECT, Date.now()), json, 'application/json');
  if (!o.quiet) toast('Backup written — ' + fmtBytes(json.length));
  return json.length;
}

function fmtBytes(n){
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* Deleting a project destroys every export, crawl and run inside it, and
   IndexedDB has no undo. So the dialog offers the backup first, and the
   destructive button stays disabled until the name has been typed out. */
function confirmDeleteProject(){
  if (!PROJECT) return;
  if (PROJECTS.length < 2){ toast('Keep at least one project'); return; }
  const runs = (RUNS || []).length, sets = (DATASETS || []).length;
  const crawled = CRAWL && CRAWL.pages ? CRAWL.pages.length : 0;
  showModal('Delete this project', `
    <div class="callout crit"><b>This cannot be undone.</b> Projects live in this browser only. There is no copy on a server and no recycle bin.</div>
    <p>Deleting <b>${esc(PROJECT.name)}</b> destroys, permanently:</p>
    <ul style="margin:6px 0 0;padding-left:20px;font-size:13px;line-height:1.7">
      <li><b>${sets}</b> loaded export${sets === 1 ? '' : 's'} — the parsed rows, not the original files on your disk</li>
      <li><b>${runs}</b> saved run${runs === 1 ? '' : 's'} — your recorded baselines, which is what makes movement measurable</li>
      ${crawled ? `<li><b>${crawled}</b> crawled URLs</li>` : ''}
      <li>the project settings, competitors and notes</li>
    </ul>
    <p class="muted small">Write a backup first. One file, everything in it, and importing it later restores the project exactly — including the run history, which you cannot recreate from the original exports.</p>
    <div class="row gap8" style="margin-top:6px">
      <button class="btn primary" id="delBackup">Export a backup first</button>
      <span class="small dim" id="delBackupState"></span>
    </div>
    <label class="field" style="margin-top:18px"><span>To confirm, type the project name</span>
      <input id="delConfirm" autocomplete="off" spellcheck="false" placeholder="${esc(PROJECT.name)}"></label>
    <div class="row gap8" style="margin-top:12px">
      <button class="btn danger" id="delGo" disabled>Delete permanently</button>
      <button class="btn ghost" id="delCancel">Keep it</button>
    </div>`);

  const inp = document.getElementById('delConfirm');
  const go = document.getElementById('delGo');
  const state = document.getElementById('delBackupState');
  inp.oninput = () => { go.disabled = inp.value.trim() !== PROJECT.name; };
  inp.focus();
  document.getElementById('delCancel').onclick = () => document.getElementById('modal').classList.add('hide');
  document.getElementById('delBackup').onclick = async () => {
    const size = await backupProject({ quiet: true });
    state.textContent = size == null ? 'Could not write the backup.' : 'Saved to your downloads — ' + fmtBytes(size) + '.';
  };
  go.onclick = async () => {
    document.getElementById('modal').classList.add('hide');
    await deleteProject(PROJECT.id);
    PROJECTS = await listProjects();
    await openProject(PROJECTS[0].id);
    toast('Project deleted');
  };
}

/* ---------- the export panel ---------- */

function renderExportPanel(){
  const host = document.getElementById('exportBody');
  if (!host) return;
  const choices = snapshotChoices();
  const ready = !!SCORE;
  host.innerHTML = `
    <div class="grid g2">
      <div class="card pad">
        <div class="eyebrow">Point in time</div>
        <h3 style="margin:8px 0 6px">Snapshot</h3>
        <p class="small muted">One small dated JSON file: the totals, the score, every pillar and the top hundred actions. Keep one per data refresh and you can answer "what did this look like last March" without re-finding last March's exports.</p>
        <div class="row gap8" style="margin-top:12px">
          <button class="btn primary" id="btnExportSnap"${ready ? '' : ' disabled'}>Export snapshot</button>
          <label class="btn" style="cursor:pointer">Load one<input type="file" id="impSnap" accept=".json" style="display:none"></label>
          <button class="btn" id="btnCompareSnaps">Compare</button>
        </div>
        <p class="small dim" style="margin-top:10px">${choices.length} point${choices.length === 1 ? '' : 's'} on record${SNAPS.length ? `, ${SNAPS.length} loaded from file this session` : ''}.</p>
      </div>

      <div class="card pad">
        <div class="eyebrow">For the client</div>
        <h3 style="margin:8px 0 6px">Report</h3>
        <p class="small muted">A branded, self-contained page with a cover, the score, the queue and the sources named. It prints to A4 with the tables kept whole, so "save as PDF" produces something you can send.</p>
        <div class="row gap8" style="margin-top:12px">
          <button class="btn primary" id="btnSavePdf"${ready ? '' : ' disabled'}>Save as PDF</button>
          <button class="btn" id="btnPreviewReport2"${ready ? '' : ' disabled'}>Preview</button>
          <button class="btn" id="btnDownloadReport2"${ready ? '' : ' disabled'}>HTML</button>
        </div>
      </div>

      <div class="card pad">
        <div class="eyebrow">For the analyst</div>
        <h3 style="margin:8px 0 6px">Excel workbook</h3>
        <p class="small muted">Seven sheets — summary, scorecard, action queue, technical issues, topics, sources and run history — with filters on and the header frozen. Anything not measured arrives as an empty cell, never a zero, so a total is never quietly wrong.</p>
        <div class="row gap8" style="margin-top:12px">
          <button class="btn primary" id="btnExportXlsx"${ready ? '' : ' disabled'}>Excel workbook</button>
          <button class="btn" id="btnExportAllCsv"${ready ? '' : ' disabled'}>Every table as CSV</button>
        </div>
      </div>

      <div class="card pad">
        <div class="eyebrow">Everything</div>
        <h3 style="margin:8px 0 6px">Project backup</h3>
        <p class="small muted">The whole project in one dated file: settings, every parsed export, the crawl and the full run history. This is the only thing that moves a project to another machine, and the only thing that survives clearing site data.</p>
        <div class="row gap8" style="margin-top:12px">
          <button class="btn primary" id="btnBackupProject">Export backup</button>
          <label class="btn" style="cursor:pointer">Import a backup<input type="file" id="impProject2" accept=".json" style="display:none"></label>
        </div>
        <p class="small dim" style="margin-top:10px">Named with today's date, so a folder of these sorts itself.</p>
      </div>
    </div>

    <div class="callout" style="margin-top:18px"><b>Which file for what.</b>
      A <b>snapshot</b> is for measuring change and is safe to keep forever. A <b>report</b> is for someone else to read.
      A <b>workbook</b> is for re-cutting the numbers yourself. A <b>backup</b> is for not losing the work — take one before
      you clear your browser data, change machine, or delete anything.</div>`;

  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('btnExportSnap', exportSnapshot);
  on('btnCompareSnaps', openCompare);
  on('btnSavePdf', saveReportPdf);
  on('btnExportXlsx', exportWorkbook);
  on('btnExportAllCsv', exportEveryTable);
  on('btnBackupProject', () => backupProject());
  on('btnPreviewReport2', () => {
    const html = buildReport(exportContext());
    showModal('Report preview', `<iframe sandbox="allow-same-origin" srcdoc="${esc(html)}"></iframe>`);
  });
  on('btnDownloadReport2', () => {
    const ctx = exportContext();
    saveFile(reportFilename(ctx), buildReport(ctx), 'text/html');
  });
  const imp = document.getElementById('impSnap');
  if (imp) imp.onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try { const s = await loadSnapshotFile(f); renderExportPanel(); toast('Loaded ' + new Date(s.at).toLocaleDateString()); }
    catch (err){ toast(err.message); }
  };
  const impP = document.getElementById('impProject2');
  if (impP) impP.onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try {
      const p = await importProject(JSON.parse(await f.text()));
      await refreshProjectUI(); await openProject(p.id);
      toast('Project imported');
    } catch (err){ toast(err.message); }
  };
}

/* The workbook's sheets are arrays of arrays; the interface's own toCsv()
   takes an array of objects keyed by column. Rather than reshape the data into
   objects and back, this writes the matrix directly — and writes an empty
   field for a null, so an unmeasured value stays unmeasured in the CSV too. */
function csvMatrix(rows){
  const q = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}

/* Every on-screen table as a zip of CSVs, for the people who would otherwise
   click download eleven times. */
async function exportEveryTable(){
  if (!SCORE){ toast('Run the analysis first'); return; }
  const ctx = exportContext();
  const sheets = auditWorkbook(ctx, { at: ctx.at, datasets: ctx.datasets, projectName: ctx.projectName });
  const enc = new TextEncoder();
  const entries = sheets.map(s => ({
    name: s.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv',
    bytes: enc.encode(csvMatrix(s.rows)),
  }));
  const bytes = await makeZip(entries);
  saveFile(snapSlug(CFG.domain) + '-tables-' + exportStamp(ctx.at) + '.zip', bytes, 'application/zip');
  toast(entries.length + ' CSVs zipped');
}


const MODULES = [{"num": 1, "id": "module-01", "title": "Project Setup and Brand Knowledge Builder", "prompt": "Build the reusable SEO project context for {{DOMAIN}}.\n\nINPUTS\n- Website/domain: {{DOMAIN}}\n- Business description: {{BUSINESS_DESCRIPTION}}\n- Products/services: {{SERVICES}}\n- Primary markets/languages: {{MARKETS}}\n- Primary conversion: {{PRIMARY_CONVERSION}}\n- Secondary conversions: {{SECONDARY_CONVERSIONS}}\n- Target audiences: {{AUDIENCES}}\n- Approved proof: {{VERIFIED_PROOF}}\n- Approved testimonials/results: {{VERIFIED_RESULTS}}\n- Brand voice samples: {{VOICE_SAMPLES}}\n- Legal/compliance constraints: {{CONSTRAINTS}}\n- Known competitors: {{COMPETITORS}}\n\nTASK\nCreate a Project Knowledge document containing:\n1. Brand facts that may be stated as facts.\n2. Claims that require proof before use.\n3. Topics and services we are qualified to cover.\n4. Audience segments, pains, objections, buying triggers, and next actions.\n5. Brand voice: sentence length, vocabulary, rhythm, tone, CTA style, banned phrases, and examples.\n6. Conversion architecture: primary/secondary CTA by page type.\n7. Proof library with source, date, permission, and where each proof can be used.\n8. Competitor mention policy.\n9. Internal-link priorities and money pages.\n10. A JSON configuration using stable keys.\n\nQUALITY GATE\nFlag anything unverified. Do not turn aspirations into facts.", "follow": "Audit the Project Knowledge you just created. List contradictions, unsupported claims, missing conversion definitions, stale proof, and any instruction likely to make future content sound generic or fabricated. Return a corrected final version only after the audit table.", "group": "Foundation"}, {"num": 2, "id": "module-02", "title": "Data Intake Validator", "prompt": "Validate the attached GSC, Semrush, crawl, backlink, sitemap, analytics, and image-audit files before doing SEO analysis.\n\nPROJECT\n- Domain: {{DOMAIN}}\n- Target market: {{MARKET}}\n- Expected search type: {{SEARCH_TYPE}}\n- Current period: {{CURRENT_PERIOD}}\n- Comparison period: {{COMPARISON_PERIOD}}\n\nCHECK\n1. File inventory: filename, source tool, report type, date range, export date, row count, dimensions, filters.\n2. GSC: property, search type, country, device, clicks, impressions, CTR, position, page/query/date availability.\n3. Semrush: database, device/location, report type, domain scope, active filters, volume/KD/CPC/intent/URL fields.\n4. Crawl: absolute URLs, status, indexability, canonical, title, H1, meta, word count, depth, internal links, schema, images.\n5. Image audit: page URL, image URL, filename, alt presence, context, status, dimensions, loading, responsive markup.\n6. Comparison validity: equal-length windows, seasonality, migrations, known campaigns, tracking changes.\n7. Merge keys: normalized URL and normalized query rules.\n8. Data loss risks: UI row caps, anonymized queries, sampling/top-row limits, inaccessible pages.\n\nOUTPUT\nA. PASS / PASS WITH LIMITATIONS / FAIL.\nB. Data dictionary.\nC. Problems ordered by severity.\nD. Safe analyses we can perform now.\nE. Analyses that would be misleading.\nF. Exact re-export instructions for each failed file.\nG. Clean-room assumptions list. Do not continue into recommendations.", "follow": "Using the validation report, create a one-page handoff for the person exporting data. Include exact tool path, filters, tabs, columns, file naming, and a checkbox beside every required export.", "group": "Foundation"}, {"num": 3, "id": "module-03", "title": "GSC Opportunity and Decay Engine", "prompt": "Analyze the validated Search Console evidence for {{DOMAIN}}.\n\nINPUTS\n- Current GSC period: {{GSC_CURRENT}}\n- Previous equal period: {{GSC_PREVIOUS}}\n- Year-over-year period if available: {{GSC_YOY}}\n- Conversion/page-value data: {{CONVERSION_DATA}}\n- Known releases/migrations/algorithm events: {{EVENTS}}\n\nDO NOT average average-position rows directly. Recalculate weighted values when aggregating.\n\nCLASSIFY EACH MATERIAL PAGE/QUERY\n- Protect and expand.\n- CTR/snippet test.\n- Striking-distance refresh.\n- Intent mismatch.\n- Content decay investigation.\n- Cannibalization review.\n- New page needed.\n- Consolidate/redirect candidate.\n- Demand/seasonality change rather than content failure.\n- Technical/indexing investigation.\n\nFOR EACH OPPORTUNITY RETURN\nPage | Query/cluster | Current clicks/impressions/CTR/position | Comparison delta | Evidence | Root-cause hypothesis | Confidence | Recommended action | Expected mechanism | Effort | Business value | What could disprove the hypothesis | Measurement window.\n\nREQUIRED ANALYSES\n1. High-impression, below-expected CTR pages, with SERP-feature caveat.\n2. Position 4–10 and 11–20 opportunities.\n3. Click/impression decay separated from demand decay.\n4. Pages gaining impressions but not clicks.\n5. Query-to-page collisions and URL switching.\n6. Brand vs non-brand.\n7. Device/country divergence.\n8. Image/video/news search opportunities when supplied.\n9. Pages with strong traffic but weak conversion path.\n10. Top 10 actions only after scoring confidence, business value, impact mechanism, and effort.", "follow": "Challenge the top 10 opportunities as a skeptical Head of SEO. For each, identify alternative explanations, missing evidence, risk of harming an already-winning page, and the smallest reversible test that would validate the recommendation.", "group": "Data & Decisions"}, {"num": 4, "id": "module-04", "title": "Semrush Competitive Intelligence Engine", "prompt": "Analyze the validated Semrush exports for {{DOMAIN}} and {{COMPETITORS}}.\n\nFILES MAY INCLUDE\nOrganic Rankings/Positions, Position Changes, Pages, Competitors, Keyword Gap, Keyword Magic, Position Tracking, Site Audit, Backlinks, and Keyword Strategy Builder.\n\nTASK\n1. Verify database, location, device, date and domain/subdomain/subfolder scope.\n2. Distinguish first-party GSC evidence from Semrush estimates.\n3. Build these opportunity sets:\n   - Missing and untapped topics.\n   - Weak keywords where our page type and intent match.\n   - Competitor pages with high estimated value but reproducible content gaps.\n   - Position 11–20 opportunities.\n   - SERP-feature opportunities.\n   - Competitor backlink patterns worth replicating ethically.\n   - Technical issues with likely visibility or UX impact.\n4. Exclude false opportunities caused by brand terms, irrelevant countries, mismatched intent, forums/marketplaces with a different page type, duplicate keyword variants, or impossible authority gaps.\n5. Cluster by intent and required page, not lexical similarity.\n6. Map every accepted cluster to CREATE, REFRESH, CONSOLIDATE, SUPPORT, PROTECT, or REJECT.\n\nOUTPUT\n- Opportunity matrix with source row references.\n- Competitor/page-type map.\n- Rejected-opportunity table explaining why.\n- Keyword cluster table with one primary page per intent.\n- Link-gap prospects with relevance, evidence, likely relationship path, and outreach angle.\n- Technical actions separated from content actions.", "follow": "Re-score the accepted opportunities using our actual GSC impressions, conversions, topical authority, internal-link strength, and delivery capacity. Remove any opportunity whose priority exists only because Semrush shows search volume.", "group": "Data & Decisions"}, {"num": 5, "id": "module-05", "title": "Site Inventory, Cannibalization, and Lifecycle Decisions", "prompt": "Create a page-level SEO inventory for {{DOMAIN}} from the sitemap, crawl, GSC, analytics, backlink, conversion, and content files.\n\nFOR EVERY INDEXABLE URL DECIDE\n- PROTECT\n- REFRESH\n- EXPAND\n- CONSOLIDATE\n- REDIRECT\n- NOINDEX\n- REMOVE\n- CREATE SUPPORTING CONTENT\n- TECHNICAL FIX\n- MANUAL REVIEW\n\nEVALUATE\n1. Page purpose and primary intent.\n2. Target query/cluster and competing URLs.\n3. Traffic, impressions, conversions, links, freshness, depth, quality and brand importance.\n4. Duplicate/near-duplicate titles, headings, copy, location pages and parameter URLs.\n5. Orphans, crawl depth, weak inbound links and broken internal links.\n6. Indexability, canonical, redirect chain, status and sitemap consistency.\n7. Content that should remain untouched because it is winning.\n8. Pages with no traffic but legitimate utility, legal, support or conversion value.\n\nOUTPUT\nURL | Current role | Evidence | Decision | Target URL if consolidation | Query ownership | Exact work | Risk | Priority | Owner | Validation.\n\nNever recommend deletion from “zero clicks” alone.", "follow": "Produce a cannibalization evidence table. Require repeated query overlap, URL switching, intent duplication, or mutually suppressive performance before labeling a pair as cannibalization. Separate true cannibalization from healthy multi-URL coverage.", "group": "Data & Decisions"}, {"num": 6, "id": "module-06", "title": "Live SERP Intent and Page-Type Deconstructor", "prompt": "Deconstruct the current SERP for {{TARGET_QUERY}} in {{LOCATION}}, {{LANGUAGE}}, on {{DEVICE}}.\n\nINPUTS\n- Live top results and visible SERP features: {{SERP_EVIDENCE}}\n- Our current page/content: {{OUR_PAGE}}\n- GSC query-page evidence: {{GSC_EVIDENCE}}\n- Business goal: {{GOAL}}\n\nANALYZE THE TOP 10 BEFORE SELECTING COMPARATORS\n1. Dominant and secondary intent.\n2. Page types: service, product, category, guide, list, tool, UGC, video, local pack, news, comparison, homepage.\n3. SERP features and what they imply about task completion.\n4. Freshness requirements.\n5. Local/YMYL/transactional trust requirements.\n6. Common entities, attributes, questions, proof and content features.\n7. What varies by page type and should not be averaged.\n8. Select 3–5 true intent-matched comparators; explain every exclusion.\n9. Identify concrete information gain: original data, clearer process, calculator, examples, templates, media, expert evidence, local proof, or decision support.\n10. Decide whether our existing URL is the correct page type.\n\nOUTPUT\n- Intent verdict with confidence.\n- SERP/page-type distribution.\n- Comparator selection table.\n- Keep/change/test map for our page.\n- Winning page specification—not a copied outline.\n- Evidence gaps requiring browsing or human input.", "follow": "Act as a search-intent red team. Argue the strongest case that our selected page type and dominant intent are wrong. Then state what live-SERP evidence would settle the disagreement.", "group": "Research & Architecture"}, {"num": 7, "id": "module-07", "title": "Topical Map and Query-Ownership Architect", "prompt": "Build a topical and commercial architecture for {{DOMAIN}} using validated GSC queries, Semrush clusters, site inventory, products/services, audiences, and the live SERP.\n\nRULES\n- A cluster is defined by the same underlying task and same best destination page.\n- Similar words can require different pages; different words can belong to one page.\n- Give every material query one owner URL or planned URL.\n- Do not manufacture dozens of thin support posts.\n- Separate entity coverage from page count.\n- Include conversion and customer-journey roles.\n\nOUTPUT\n1. Pillars, subtopics, attributes, jobs-to-be-done and entity relationships.\n2. Query-ownership table:\n   Cluster | Searcher task | Intent | Primary query | Supporting queries | Existing owner URL | Decision | Page type | Conversion role | Internal-link parents/children | Evidence | Priority.\n3. Content gaps versus genuine non-gaps.\n4. Cannibalization risks.\n5. 90-day sequence balancing refreshes, new content, internal links, proof assets and technical fixes.\n6. Mermaid graph.\n7. “Do not create” list for redundant or low-value topics.", "follow": "Stress-test the topical map for thin pages, overlapping intent, orphan clusters, weak commercial paths, missing trust content, and topics chosen only because a keyword tool listed them. Return the corrected map.", "group": "Research & Architecture"}, {"num": 8, "id": "module-08", "title": "Evidence-Based Content Brief", "prompt": "Create an implementation-ready brief for {{TARGET_PAGE_OR_QUERY}}.\n\nEVIDENCE\n- Project knowledge: {{PROJECT_CONTEXT}}\n- GSC opportunity rows: {{GSC}}\n- SERP deconstruction: {{SERP}}\n- Topical-map node: {{TOPICAL_NODE}}\n- Existing page: {{EXISTING_CONTENT}}\n- Internal-link inventory: {{INTERNAL_LINKS}}\n- Approved proof and sources: {{PROOF_AND_SOURCES}}\n\nDELIVER\n1. Page decision: create/refresh/consolidate/protect and why.\n2. Primary user task, secondary tasks and conversion action.\n3. Strategic angle and concrete information gain.\n4. Title/H1/slug recommendations with rationale; no formulaic clickbait.\n5. MECE outline. For every section include:\n   - user question;\n   - entity/attribute/relationship;\n   - required evidence or example;\n   - information-gain device;\n   - internal link;\n   - CTA role;\n   - word-budget range only when useful.\n6. Visual plan with image type, purpose, proposed filename, alt-text intent, caption/data source, dimensions/format, and insertion point.\n7. Tables, calculators, templates, screenshots or original-data requirements.\n8. Source plan using primary references.\n9. Schema candidates only when content and current Google support justify them.\n10. Writer prohibited actions: unsupported claims, fake experience, keyword stuffing, competitor copying, filler, and inaccessible visuals.\n11. Acceptance checklist.", "follow": "Review this brief as the editor who must reject weak assignments. Identify unsupported sections, duplicate headings, vague “information gain,” missing proof, inaccessible visual ideas, and any instruction that would create a generic AI article. Rewrite the brief to pass.", "group": "Research & Architecture"}, {"num": 9, "id": "module-09", "title": "Draft Optimizer with Protected-Wins Logic", "prompt": "Audit and improve {{DRAFT}} against the approved brief and evidence packet.\n\nDO THIS IN TWO PASSES\nPASS 1 — DIAGNOSE ONLY\n- What already works and must be protected?\n- Does the first screen satisfy the main task?\n- Is the page type and CTA appropriate?\n- Missing questions/entities/relationships/evidence.\n- Unsupported claims and stale facts.\n- Redundancy, filler, AI mannerisms and structural problems.\n- Internal/external link gaps.\n- Image, table and accessibility gaps.\n- Conversion friction.\n\nPASS 2 — EDIT\nReturn:\n1. Keep/change/remove/add table with evidence.\n2. Exact replacement copy with placement markers.\n3. Change log with reason and risk.\n4. Claims/source ledger.\n5. Remaining human inputs.\n6. Final QA scorecard:\n   Intent satisfaction | Evidence | Completeness | Original value | Readability | Trust | Accessibility | Conversion | Technical readiness.\n\nDo not invent a case study or “when we tested” sentence. Insert a clearly labeled placeholder requesting verified proof instead.", "follow": "Perform a regression review between the original and edited draft. Flag any lost facts, changed meaning, unsupported certainty, removed conversions, broken internal-link context, or sections that became more generic. Supply corrected replacements.", "group": "Creation & QA"}, {"num": 10, "id": "module-10", "title": "Fact, Source, E-E-A-T, and Claim Audit", "prompt": "Audit every material factual or performance claim in {{CONTENT}}.\n\nFOR EACH CLAIM RETURN\nClaim | Claim type | Source currently supplied | Source quality | Publication/update date | Directly supported? | Qualification needed | Action | Approved wording.\n\nCLAIM TYPES\n- Stable fact.\n- Time-sensitive fact.\n- Statistic.\n- Legal/medical/financial/YMYL claim.\n- Product/pricing/specification.\n- Company/brand claim.\n- First-person experience.\n- Client result/testimonial.\n- Prediction/opinion.\n\nRULES\n- Prefer primary sources.\n- Do not cite a source that does not directly support the sentence.\n- Do not turn correlation into causation.\n- Remove fake precision.\n- Separate author expertise, organization proof, editorial process, source quality and page-level experience.\n- Mark any claim that needs legal/client approval.\n\nThen provide a corrected claims-safe version of only the affected passages.", "follow": "Create the page's visible trust plan: author/byline needs, reviewer, methodology, update date, citations, proof blocks, limitations, contact details, editorial policy links, and organization/entity signals. Include only elements the business can substantiate.", "group": "Creation & QA"}, {"num": 11, "id": "module-11", "title": "Image Filename, Alt Text, Accessibility, and Visual SEO Audit", "prompt": "Audit the attached image-audit CSV together with page screenshots/images and page content.\n\nIMPORTANT\n- The CSV detects markup patterns; you must inspect the actual visual before writing alt text.\n- Alt text describes purpose in context, not a keyword target.\n- Decorative images receive alt=\"\".\n- Functional images describe destination/action unless adjacent link text already does.\n- Complex charts require a text equivalent.\n\nFOR EACH IMAGE PLACEMENT RETURN\nPage URL | Image URL | Visual classification | Current filename | Filename verdict | Proposed filename | Current alt state | Proposed alt treatment | Final alt text or empty-alt instruction | Caption/long-description need | Loading/LCP action | Responsive/dimensions action | License/credit action | Priority | Exact implementation note.\n\nREVIEW\n1. Generic, long, uppercase, underscore, mismatched or keyword-stuffed filenames.\n2. Missing versus intentionally empty alt attributes.\n3. Duplicate alt text used for different purposes.\n4. Filename copied into alt.\n5. “Image of” boilerplate and excessive length.\n6. Linked images with missing functional text.\n7. Hero/LCP images lazy-loaded or low-priority.\n8. Missing width/height, srcset/sizes and modern format opportunities.\n9. Broken image URLs and blocked/indexability issues.\n10. Image sitemap need, preferred social/share image, schema image, licensing/IPTC/C2PA needs.\n11. Visual redundancy: remove images that add no comprehension or trust.\n12. Information-gain visuals to create: original diagram, process, comparison, screenshot, before/after, data chart, template.\n\nDo not rename live indexed files without an implementation/redirect plan.", "follow": "Generate a WordPress implementation sheet from the approved image actions. Include media-library action, old URL, new filename, replacement URL, redirect requirement, alt field, caption, page placement, dimensions, format, compression target, lazy/LCP setting, owner and QA check.", "group": "Creation & QA"}, {"num": 12, "id": "module-12", "title": "Internal Linking and Authority-Flow Planner", "prompt": "Use the crawl, sitemap, GSC page metrics, topical map and target content to produce an executable internal-link plan.\n\nDO NOT infer an insertion location from URL titles alone. Inspect source-page text or mark TEXT NEEDED.\n\nDELIVER\nSource URL | Target URL | Direction | Existing or new | Exact anchor | Exact insertion sentence/paragraph | Placement heading | User-journey reason | Topical reason | Authority reason | Priority | Risk | Verification.\n\nANALYZE\n- New page outbound links.\n- Existing pages that should link inbound.\n- High-value orphans.\n- Broken and redirected internal links.\n- Overlinked pages and repetitive anchors.\n- Links that send users to the wrong stage or duplicate destination.\n- Breadcrumb and hub/cluster navigation needs.\n- Pages with GSC authority that can support striking-distance targets.\n- Content that should not receive more links because it is being consolidated/noindexed.\n\nDo not enforce arbitrary exact-match percentages. Use descriptive, natural anchors that set correct expectations.", "follow": "Run a link-plan conflict check. Find circular recommendations, duplicate insertions, anchors that misrepresent destination content, links to noncanonical/redirecting URLs, and source passages that do not actually support the link.", "group": "Creation & QA"}, {"num": 13, "id": "module-13", "title": "Technical, Structured Data, and Indexability QA", "prompt": "Audit {{URL_OR_URL_SET}} using the crawl, rendered HTML, Search Console, PageSpeed/Core Web Vitals evidence, robots, sitemap, headers and structured-data tests.\n\nCHECK\n- Status and redirect chain.\n- Indexability and robots directives.\n- Canonical and duplicate variants.\n- XML sitemap consistency and lastmod integrity.\n- Hreflang if relevant.\n- Rendered content and JS dependency.\n- Titles, descriptions, H1, headings and duplicate templates.\n- Internal links, broken resources and crawl depth.\n- Pagination/facets/parameters.\n- Mobile UX, forms and tap targets.\n- LCP, INP, CLS evidence; distinguish lab and field data.\n- Image delivery.\n- Structured data matching visible content and current Google-supported features.\n- Organization/local business/breadcrumb/article/product/profile and other applicable types.\n- Rich Results Test and Schema.org validation status.\n- Security, mixed content and accidental staging/indexation.\n\nOUTPUT\nP0/P1/P2 issue | Evidence | Affected URLs | SEO/user mechanism | Exact fix | Developer acceptance test | Owner | Rollback risk.\n\nDo not auto-generate FAQ or HowTo schema merely because a page has questions or steps. Do not promise a rich result.", "follow": "Convert the approved technical findings into developer tickets. Each ticket must include environment, reproducible steps, expected behavior, actual behavior, affected templates/URLs, acceptance criteria, test method, dependencies and rollback plan.", "group": "Creation & QA"}, {"num": 14, "id": "module-14", "title": "Pre-Publish QA and Conversion Review", "prompt": "Perform final pre-publication QA on {{STAGING_OR_DRAFT}}.\n\nREVIEW AS FOUR PEOPLE\n1. Searcher: Is the task solved quickly and completely?\n2. Editor/fact checker: Are claims, sources, dates, grammar and brand voice correct?\n3. SEO/accessibility QA: metadata, headings, links, images/alt, schema, canonical, indexability, mobile and performance.\n4. Conversion QA: offer clarity, CTA hierarchy, form friction, trust, phone/email links, privacy/consent and tracking.\n\nRETURN\n- BLOCKER / FIX BEFORE PUBLISH / IMPROVE LATER / PASS.\n- Exact issue, location, correction and owner.\n- Metadata and social-share preview fields.\n- Final image manifest.\n- Link manifest.\n- Claims/source manifest.\n- Tracking events to test.\n- Baseline metrics and hypothesis.\n- Publish checklist with sign-off fields.\n\nDo not rewrite the whole page during final QA unless a blocker requires it.", "follow": "After fixes are applied, run a verification-only review. Return only unresolved items, regressions introduced by the fixes, and a final GO / NO-GO decision with reasons.", "group": "Creation & QA"}, {"num": 15, "id": "module-15", "title": "Post-Publish Measurement and Experiment Review", "prompt": "Evaluate the change logged for {{URL}}.\n\nINPUTS\n- Baseline period and metrics: {{BASELINE}}\n- Publish date and exact changes: {{CHANGE_LOG}}\n- 7/14/28/56/90-day GSC and conversion data: {{FOLLOW_UP_DATA}}\n- Seasonality/algorithm/competitor events: {{EVENTS}}\n- Rank tracking/SERP snapshots: {{RANK_DATA}}\n\nANALYZE\n1. Data maturity: is there enough data yet?\n2. Clicks, impressions, CTR, weighted position and query mix.\n3. Brand/non-brand, country, device and page/query effects.\n4. Conversion and assisted-conversion effects.\n5. New queries gained, queries lost and URL switching.\n6. SERP/competitor changes.\n7. Whether evidence supports KEEP, ITERATE, EXPAND, REVERT, or INCONCLUSIVE.\n8. Do not attribute causality when simultaneous changes or external events exist.\n\nOUTPUT\nResult | Confidence | Evidence | Alternative explanations | Decision | Next smallest test | Measurement date.", "follow": "Create a learning memo that updates our reusable playbook: what hypothesis was tested, what happened, what remains uncertain, which page types this may generalize to, and what must not be generalized.", "group": "Measurement & Operations"}, {"num": 16, "id": "module-16", "title": "Cross-Platform AI Visibility (ChatGPT, Claude, Perplexity)", "prompt": "Measure brand visibility across assistants OTHER than Google Search for {{DOMAIN}}.\n\nSCOPE\nThis module is about ChatGPT, Claude, Perplexity, Gemini app and similar. It is NOT about Google\nAI Overviews or AI Mode: those have their own first-party Search Console data and their own modules (20 to 22).\nDo not mix the two measurement systems in one number.\n\nBuild an AI-answer visibility program for {{BRAND}} and {{TOPIC_SET}}.\n\nINPUTS\n- Priority commercial/informational questions: {{PROMPTS}}\n- Brand/domain and competitors: {{BRAND_COMPETITORS}}\n- Current pages and sources cited by AI systems: {{OBSERVATIONS}}\n- Search/brand demand and link/mention data: {{DATA}}\n\nDESIGN\n1. A stable prompt set segmented by awareness, comparison, recommendation, troubleshooting and local/service intent.\n2. Test matrix across available AI systems, logged by date, model/product, prompt, location/account state when known, response, citations, brand mention, position and sentiment.\n3. Repeat runs to reduce one-response noise.\n4. Citation-gap analysis: source types, pages, evidence formats and entities repeatedly cited.\n5. Actions: improve first-party facts, definitions, original research, tables, author/entity clarity, third-party mentions, community participation, and accessible structured content.\n6. Separate visible brand mention from source citation.\n7. Measurement dashboard: mention rate, cited-page rate, source share, competitor share, prompt coverage and change over time.\n\nNever claim that any optimization guarantees inclusion in an AI answer. Respect platform terms and do not automate prohibited scraping.", "follow": "List every claim you made that came from your own training data rather than from a prompt you actually ran, and mark each as unverified. Then give the minimum set of prompts a human would need to run to verify or refute each one.", "group": "Measurement & Operations"}, {"num": 17, "id": "module-17", "title": "Weekly SEO Operating Review", "prompt": "Act as Head of SEO for {{DOMAIN}}. Build this week's operating plan from validated data, unresolved tickets, content capacity, conversion priorities and experiment schedules.\n\nCAPACITY\n- Strategy/editorial hours: {{STRATEGY_HOURS}}\n- Writing hours: {{WRITING_HOURS}}\n- Development hours: {{DEV_HOURS}}\n- Design/image hours: {{DESIGN_HOURS}}\n\nALLOCATE WORK ACROSS\n- Protect urgent losses or technical failures.\n- Refresh evidence-backed opportunities.\n- Publish cluster gaps with business value.\n- Strengthen internal links and proof.\n- Run one controlled experiment.\n- Complete measurement reviews.\n\nOUTPUT\nPriority | Task | URL/cluster | Evidence | Deliverable | Owner | Hours | Dependency | QA gate | Metric | Due date | Do-not-do note.\n\nLimit work in progress. Do not create generic recurring tasks. Every task must have a source row, issue, hypothesis, or approved strategic rationale.", "follow": "Cut the plan by 30% without losing the highest expected business value. Explain what was deferred, why, and the trigger that would bring it back.", "group": "Measurement & Operations"}, {"num": 18, "id": "module-18", "title": "Client/Executive SEO Report", "prompt": "Create an executive SEO report for {{PERIOD}} using the attached validated data and change log.\n\nAUDIENCE\n{{AUDIENCE}}\n\nSTRUCTURE\n1. Executive summary: outcomes, not activity.\n2. What changed in clicks, impressions, conversions, revenue proxy and visibility.\n3. What we shipped and the hypothesis behind it.\n4. Wins with evidence and confidence.\n5. Losses/risks with alternative explanations.\n6. Content lifecycle actions: created, refreshed, protected, consolidated, removed.\n7. Technical and image/accessibility progress.\n8. Competitive and AI-visibility observations.\n9. Next-period priorities with expected mechanism and owner.\n10. Decisions/inputs required from the client.\n11. Appendix: definitions, data limitations, source files and change log.\n\nDo not hide declines. Do not claim causality without evidence. Do not report vanity metrics without explaining business relevance.", "follow": "Turn the report into a five-minute meeting script with likely stakeholder objections and concise, evidence-based answers. Separate verified outcomes from hypotheses and planned work.", "group": "Measurement & Operations"}, {"num": 19, "id": "module-19", "title": "Master Orchestrator", "prompt": "Run Surfer Killer OS V2 for {{DOMAIN}} and {{SCOPE}}.\n\nSTAGE 0 — PROJECT CONTEXT\nLoad approved brand, audience, conversion, proof, market and compliance knowledge.\n\nSTAGE 1 — DATA GATE\nInventory and validate every supplied file. STOP analysis if a critical date/scope/column mismatch makes recommendations unsafe.\n\nSTAGE 2 — OPPORTUNITY DECISION\nUse GSC as first-party performance evidence and Semrush/crawl/SERP sources as supporting evidence. Decide CREATE, REFRESH, CONSOLIDATE, REDIRECT, PROTECT, TECHNICAL FIX, or NO ACTION.\n\nSTAGE 3 — LIVE SERP AND PAGE TYPE\nAnalyze the current SERP, features, intent and true comparators. Do not compare our service page with an informational guide or marketplace unless the mixed SERP justifies it.\n\nSTAGE 4 — CONTENT AND VISUAL SPEC\nCreate an approved brief, proof plan, image filename/alt plan, table/tool/template plan, link plan, conversion plan and technical/schema requirements.\n\nSTAGE 5 — CREATION/EDITING\nGenerate or edit only after the brief passes. Mark every unsupported business fact as a placeholder.\n\nSTAGE 6 — RED TEAM AND QA\nFact-check, regression-check, image/accessibility-check, technical-check, conversion-check and verify exact implementation details.\n\nSTAGE 7 — PUBLISH\nCreate a change log, baseline, owner checklist, analytics test and rollback plan.\n\nSTAGE 8 — MEASURE\nSchedule and interpret follow-up windows. Update the playbook with confirmed learning.\n\nDELIVERABLES\n1. Data validation report.\n2. Decision and root-cause diagnosis.\n3. Prioritized implementation table.\n4. Copy-ready content changes.\n5. Image manifest with filename and alt actions.\n6. Internal-link manifest.\n7. Technical/schema tickets.\n8. Pre-publish QA.\n9. Change log and measurement plan.\n10. Confidence, risks, rejected ideas and required human inputs.\n\nAt every stage, distinguish observation, inference, recommendation and verification needed.", "follow": "", "group": "Measurement & Operations"}, {"num": 20, "id": "module-20", "group": "Google AI Search", "title": "AI Overview Source Audit (research pass)", "prompt": "Audit {{URL}} for Google AI Overview and AI Mode visibility on the topic below.\n\nEVIDENCE SUPPLIED\n- Google AI Search evidence packet: {{DATA}}\n- Recorded AI Overview and its cited sources: {{SERP_EVIDENCE}}\n- Search Console evidence: {{GSC_EVIDENCE}}\n- Project context: {{PROJECT_CONTEXT}}\n\nRULES THAT OVERRIDE EVERYTHING ELSE\n- Never state or imply why Google selected a particular source. Nobody outside Google knows.\n- Label every statement as OBSERVED, INFERRED or SPECULATIVE. If you cannot label it, do not write it.\n- OBSERVED means it is in the supplied data. INFERRED means it follows from the data with a stated assumption.\n- Never claim a change will produce inclusion in an AI Overview.\n- Never recommend llms.txt for Google, a special \"AI schema\", artificial content chunking, one page per\n  fan-out variation, exact-match repetition, or manufactured third-party mentions.\n\nANALYSE\n\nA. THE TASK\nWhat is the searcher actually trying to accomplish? State it in one sentence.\n\nB. THE RECORDED RESPONSE\nBreak the recorded AI Overview into its component claims, subtopics, comparisons and decisions.\nFor each, note whether our page addresses it at all.\n\nC. THE CITED SOURCES\nFor each cited URL, and only from what you can actually see:\n- which claim it appears to support\n- source type (guide, study, service page, comparison, forum, documentation)\n- first-party or secondary\n- original information present, and what kind\n- supporting evidence: figures, dates, methodology, named sources\n- freshness signals\n- experience or expertise signals\n- tables, images or examples that carry weight\n- what is materially present there and absent from our page\n\nD. FAN-OUT\nIdentify the related tasks Google would plausibly need answered to satisfy this query comprehensively.\nFor each, decide: SAME INTENT (cover on the existing page) / SEPARATE TASK (a supporting page is justified) / IRRELEVANT.\nDo not recommend a page per variation. Say so explicitly if the honest answer is that one page should cover all of it.\n\nE. OUR PAGE\nClassify each requirement from B and D as STRONG, ADEQUATE, WEAK, MISSING or NOT RELEVANT.\n\nF. INFORMATION GAIN\nWhat could this business contribute that is not commodity information and that a model could not reproduce\nwithout us: original data, real examples, first-hand experience, screenshots, case studies, templates,\ncurrent pricing, decision frameworks, supportable contrarian findings. Only list things the project context\nsays we can actually substantiate.\n\nG. RECOMMENDATIONS\nOrdered by priority. For each: page section, the observed evidence behind it, the problem, the exact change,\nwhat source or asset is required to make it true, the information-gain opportunity, the user benefit, and\nyour confidence (high, medium, low).\n\nReturn the audit as tables where the content is tabular. State plainly at the end what you could not determine\nfrom the supplied evidence.", "follow": "Re-read your own audit. List every line that is INFERRED or SPECULATIVE but reads as though it were OBSERVED, and rewrite those lines. Then list what additional evidence a human would need to gather to move each inference to an observation."}, {"num": 21, "id": "module-21", "group": "Google AI Search", "title": "Apply the AI Search plan (controlled edit)", "prompt": "Apply the approved Google AI Search plan to this page. This is a controlled edit, not a rewrite.\n\nINPUTS\n- Approved plan and audit: {{DATA}}\n- Current content: {{CONTENT}}\n- Project context, voice and approved proof: {{PROJECT_CONTEXT}}\n- Current search evidence for this URL: {{GSC_EVIDENCE}}\n\nPRESERVE\n- Every section that currently ranks or performs. If the evidence shows it earns clicks, it does not get rewritten.\n- Valid original information already on the page.\n- Brand voice and reading level.\n- Conversion intent and calls to action.\n- Any claim already correctly sourced.\n\nCHANGE ONLY WHERE THE EVIDENCE JUSTIFIES IT\nPrioritise, in this order:\n1. A self-contained direct answer near the top, before any preamble.\n2. Better explanation of what the audit marked WEAK.\n3. Original information and first-party evidence, drawn only from approved proof.\n4. Factual support: figures with a source and a date.\n5. Meaningful comparison where the task requires a decision.\n6. Real examples.\n7. Related questions the query set shows people actually ask.\n8. Current information where the topic is time-sensitive.\n9. A table or image where it carries information the prose cannot.\n\nDO NOT\n- Create artificial \"AI chunks\" or break prose into fragments.\n- Repeat the target query unnaturally, or hit a keyword count.\n- Invent statistics, experience, case studies, customers or quotes.\n- Manufacture citations, or cite a source you have not been given.\n- Add FAQs that nobody asked, or schema that describes something the page does not contain.\n- Change anything purely to sound optimised.\n\nRETURN\n1. The revised content, complete.\n2. A change log: section, what changed, which piece of evidence justified it.\n3. Claims that still need verification before publishing, with what would verify them.\n4. Assets still required: data, screenshots, examples, images.\n5. Sections deliberately left alone, and why.", "follow": "List anything in your revision that you could not substantiate from the supplied context, and rewrite those passages so that they only claim what the evidence supports."}, {"num": 22, "id": "module-22", "group": "Google AI Search", "title": "Red team the revision before it ships", "prompt": "Red team this revision for Google AI Search. Your job is to find reasons it should NOT ship.\n\nINPUTS\n- Revised content and change log: {{DRAFT}}\n- The audit it was based on: {{DATA}}\n- Current search evidence: {{GSC_EVIDENCE}}\n- Project context and approved proof: {{PROJECT_CONTEXT}}\n\nCHECK FOR\n- Claims with no source, or a source that does not support the claim.\n- Commodity content dressed up as original information.\n- Statistics, experience or examples that appear invented.\n- Stale facts, or dates that will read as stale within a quarter.\n- Sections that answer a different intent from the one stated.\n- Repetition of the same idea across sections.\n- Factual ambiguity, or precision the evidence does not support.\n- Claimed expertise the business cannot demonstrate.\n- Missing attribution on borrowed framing.\n- Fan-out coverage that was added for its own sake rather than because the task needs it.\n- Regressions: text removed or reworded in a section the evidence shows was already performing.\n- Internal link gaps, and links added that do not serve the reader.\n- Anything that contradicts the recorded SERP evidence.\n- Any language implying a guaranteed ranking or guaranteed AI Overview inclusion.\n\nRETURN each finding as one of:\nBLOCKER   must be fixed before publishing\nFIX       should be fixed\nOPTIONAL  worth considering\nPASS      checked and sound\n\nFor every BLOCKER and FIX, quote the exact text and give the exact replacement.\n\nDo not reward the revision for mentioning more entities, covering more subtopics or using the target phrase\nmore often. Reward it only for being more useful, more accurate and better substantiated than what it replaced.\nIf the revision is worse than the original in any respect, say so plainly.", "follow": "State whether you would publish this page as it now stands, in one word, then give the single strongest argument against your own answer."}];

/* ============================================================
   EVIDENCE INJECTION
   ============================================================ */
function tsv(header, rows){
  return [header.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
}
function evTable(kind){
  const N = EVROWS;
  if (!FIND || !MODEL) return null;
  const g = arr => [...arr].sort((a,b)=>b.impr-a.impr).slice(0,N).map(r => [r.queryRaw||r.urlRaw||r.query||r.url, r.clicks, r.impr, (r.ctr*100).toFixed(2)+'%', r.pos!=null?r.pos.toFixed(1):'']);
  switch(kind){
    case 'gsc_current': return MODEL.gscQ.current.length ? tsv(['query','clicks','impressions','ctr','position'], g(MODEL.gscQ.current)) : null;
    case 'gsc_previous': return MODEL.gscQ.previous.length ? tsv(['query','clicks','impressions','ctr','position'], g(MODEL.gscQ.previous)) : null;
    case 'gsc_yoy': return MODEL.gscQ.yoy.length ? tsv(['query','clicks','impressions','ctr','position'], g(MODEL.gscQ.yoy)) : null;
    case 'gsc_pages': return MODEL.gscP.current.length ? tsv(['page','clicks','impressions','ctr','position'], g(MODEL.gscP.current)) : null;
    case 'striking': return FIND.striking.length ? tsv(['query_or_page','position','impressions','clicks','ctr','target_position','est_clicks_gained'],
      FIND.striking.slice(0,N).map(r=>[r.raw||r.key, r.pos.toFixed(1), r.impr, r.clicks, (r.ctr*100).toFixed(2)+'%', r.target, Math.round(r.gain)])) : null;
    case 'ctrgap': return FIND.ctrGap.length ? tsv(['query_or_page','position','impressions','actual_ctr','expected_ctr','clicks_forgone'],
      FIND.ctrGap.slice(0,N).map(r=>[r.raw||r.key, r.pos.toFixed(1), r.impr, (r.ctr*100).toFixed(2)+'%', (r.exp*100).toFixed(2)+'%', Math.round(r.lost)])) : null;
    case 'decay': return FIND.decay.length ? tsv(['page_or_query','cause','clicks_before','clicks_now','change','impressions_before','impressions_now','position_move'],
      FIND.decay.slice(0,N).map(r=>[r.raw||r.key, r.cause, r.prevClicks, r.clicks, r.delta, r.prevImpr, r.impr, r.posMove!=null?r.posMove.toFixed(1):''])) : null;
    case 'risers': return FIND.risers.length ? tsv(['page_or_query','clicks_before','clicks_now','change','position'],
      FIND.risers.slice(0,N).map(r=>[r.raw||r.key, r.prevClicks, r.clicks, r.delta, r.pos!=null?r.pos.toFixed(1):''])) : null;
    case 'cannibal': return FIND.cannibal.length ? tsv(['query','total_impressions','url','url_impressions','share','position'],
      FIND.cannibal.slice(0,Math.ceil(N/2)).flatMap(c => c.urls.slice(0,3).map(u=>[c.raw||c.query, c.impr, u.raw||u.url, u.impr, Math.round(u.share*100)+'%', u.pos!=null?u.pos.toFixed(1):'']))) : null;
    case 'gaps': return FIND.gaps.length ? tsv(['keyword','verdict','est_volume','kd','intent','best_competitor','competitor_position','your_position','your_gsc_impressions'],
      FIND.gaps.slice(0,N).map(r=>[r.raw||r.keyword, r.verdict, r.volume, r.kd||'', r.intent||'', r.best.domain, r.best.pos, r.myPos||'', r.gscImpr])) : null;
    case 'smrpos': return MODEL.smrPos.length ? tsv(['keyword','position','previous_position','est_volume','kd','url','intent'],
      [...MODEL.smrPos].sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,N).map(r=>[r.keywordRaw||r.keyword, r.pos??'', r.prevPos??'', r.volume, r.kd||'', r.urlRaw||r.url, r.intent||''])) : null;
    case 'actions': return FIND.actions.length ? tsv(['decision','target','est_clicks','effort','basis','evidence'],
      FIND.actions.slice(0,N).map(a=>[DECISION_LABEL[a.decision], a.targetRaw||a.target, a.impact, a.effort, a.basis, a.evidence.join(' | ')])) : null;
    case 'reconcile': return FIND.reconcile.length ? tsv(['keyword','semrush_position','est_volume','gsc_impressions','flag'],
      FIND.reconcile.slice(0,N).map(r=>[r.raw||r.keyword, r.smrPos, r.volume, r.gscImpr, r.note])) : null;
    case 'topics': return (CLUST && CLUST.clusters.length) ? tsv(['topic','status','intent','queries','impressions','clicks','position','owning_page','owner_share','headroom'],
      CLUST.clusters.slice(0,N).map(c=>[c.name, c.status, c.intent, c.size, c.impr, c.clicks, c.pos!=null?c.pos.toFixed(1):'',
        c.owner?(c.owner.raw||c.owner.url):'', c.owner?Math.round(c.owner.share*100)+'%':'', Math.round(c.opportunity)])) : null;
    case 'pagemap': return (PAGEMAP && PAGEMAP.length) ? tsv(['page','verdict','topics_owned','also_competing','intents','impressions'],
      PAGEMAP.slice(0,N).map(p=>[p.raw||p.url, p.verdict, p.distinct, p.contested.length, p.intents.join(' '), p.impr])) : null;
    case 'technical': return ISSUES.length ? tsv(['severity','code','finding','url','detail'],
      ISSUES.slice(0,N).map(i=>[i.severity, i.code, i.title, i.url||'', (i.detail||'').replace(/\t/g,' ')])) : null;
    case 'score': return SCORE ? [`overall ${SCORE.overall}`, SCORE.coverageNote,
      ...SCORE.pillars.map(p=>`${p.name}: ${p.score==null?'not measured':p.score}` + (p.metrics.filter(m=>m.value!=null).length?' [' + p.metrics.filter(m=>m.value!=null).map(m=>`${m.label} ${Math.round(m.value*100)}`).join('; ') + ']':''))].join('\n') : null;
    case 'ilinks': return (LINKPLAN && LINKPLAN.opportunities.length) ? tsv(['add_link_on','pointing_at','topic','anchor','existing_sentence'],
      LINKPLAN.opportunities.slice(0,N).map(o=>[o.fromRaw, o.toRaw, o.topic, o.anchor, (o.context||'').replace(/\t/g,' ')])) : null;
    case 'media': return (MEDIA && MEDIA.total) ? tsv(['file','alt','page','problems'],
      MEDIA.images.filter(i=>i.issues.length).slice(0,N).map(i=>[i.file+'.'+i.ext, i.alt==null?'(missing)':i.alt, i.pageRaw, i.issues.join('; ')])) : null;
    case 'serp': return (SERP && SERP.suppressed.length) ? tsv(['query','features','position','impressions','ctr','expected_ctr','clicks_forgone'],
      SERP.suppressed.slice(0,N).map(x=>[x.keyword, x.features.join('; '), x.gscPos!=null?x.gscPos.toFixed(1):'', x.gscImpr, (x.gscCtr*100).toFixed(2)+'%', (x.expected*100).toFixed(2)+'%', Math.round(x.lost)])) : null;
    case 'aipacket': return (typeof AI !== 'undefined' && AI) ? aiResearchPacket() : null;
    case 'aiobs': return (OBSERVATIONS && OBSERVATIONS.length)
      ? OBSERVATIONS.slice(0,10).map(o => `QUERY: ${o.query} (${o.date})\nRESPONSE: ${(o.response||'').replace(/\s+/g,' ').slice(0,900)}\nCITED: ${o.cited.map(c=>c.url).join(' | ')}`).join('\n\n') : null;
    case 'gates': return GATES.length ? GATES.map(g=>`[${g.state.toUpperCase()}] ${g.title}: ${g.detail}`).join('\n') : null;
    case 'baseline': {
      if (!FIND.snapshot.current.n) return null;
      const c = FIND.snapshot.current, p = FIND.snapshot.previous;
      return `clicks ${Math.round(c.clicks)}, impressions ${Math.round(c.impr)}, ctr ${(c.ctr*100).toFixed(2)}%, weighted average position ${c.pos?c.pos.toFixed(2):'n/a'}`
        + (p ? `\nprevious period: clicks ${Math.round(p.clicks)}, impressions ${Math.round(p.impr)}, ctr ${(p.ctr*100).toFixed(2)}%, weighted average position ${p.pos?p.pos.toFixed(2):'n/a'}` : '');
    }
    case 'period': {
      const d = MODEL.gscDates.filter(r=>r.period==='current').map(r=>r.date).filter(Boolean).sort();
      return d.length ? `${d[0]} to ${d[d.length-1]} (${d.length} days)` : null;
    }
    case 'period_prev': {
      const d = MODEL.gscDates.filter(r=>r.period==='previous').map(r=>r.date).filter(Boolean).sort();
      return d.length ? `${d[0]} to ${d[d.length-1]} (${d.length} days)` : null;
    }
  }
  return null;
}

function fillMap(){
  const c = CFG, host = hostOf(c.domain||'') || c.domain;
  const m = {
    DOMAIN: host || null,
    BRAND: c.brand || null,
    MARKET: c.market || null, MARKETS: c.market || null,
    LANGUAGE: c.language || null,
    SEARCH_TYPE: c.searchType || null,
    DEVICE: c.device || null,
    LOCATION: c.market || null,
    PRIMARY_CONVERSION: c.conversion || null,
    COMPETITORS: c.competitors || null,
    BRAND_COMPETITORS: c.competitors || null,
    PROJECT_CONTEXT: c.context || null,
    BUSINESS_DESCRIPTION: c.context || null,
    SCOPE: host ? `${host}${c.market ? ', ' + c.market : ''}${c.searchType ? ', ' + c.searchType + ' search' : ''}` : null,
    PERIOD: evTable('period'), CURRENT_PERIOD: evTable('period'), COMPARISON_PERIOD: evTable('period_prev'),
    GSC_CURRENT: evTable('gsc_current'), GSC_PREVIOUS: evTable('gsc_previous'), GSC_YOY: evTable('gsc_yoy'),
    GSC: evTable('gsc_current'), GSC_EVIDENCE: evTable('striking') || evTable('gsc_current'),
    RANK_DATA: evTable('smrpos'),
    BASELINE: evTable('baseline'), OBSERVATIONS: evTable('gates'),
    TOPIC_SET: evTable('topics'), TOPICAL_NODE: evTable('topics'),
    SCOPE_TECHNICAL: evTable('technical'),
    INTERNAL_LINKS: evTable('ilinks'),
    SERP_EVIDENCE: evTable('aiobs') || evTable('serp'),
    DATA: evTable('actions')
  };
  for (const k of Object.keys(m)) if (m[k] === '' ) m[k] = null;
  return m;
}

const EXTRA_EVIDENCE = {
  2:  [['Data gate results', 'gates'], ['Current queries', 'gsc_current'], ['Previous queries', 'gsc_previous']],
  3:  [['Within reach', 'striking'], ['Under-clicked at rank', 'ctrgap'], ['Losing ground', 'decay'], ['Gaining ground', 'risers']],
  4:  [['Keyword gap', 'gaps'], ['Semrush positions', 'smrpos'], ['Source disagreements', 'reconcile']],
  5:  [['Two pages one query', 'cannibal'], ['Pages', 'gsc_pages'], ['Topic map', 'topics'], ['Page dilution', 'pagemap']],
  7:  [['Topic map', 'topics'], ['Page dilution', 'pagemap'], ['Keyword gap', 'gaps']],
  8:  [['Within reach', 'striking'], ['Keyword gap', 'gaps']],
  11: [['Image audit', 'media']],
  12: [['Internal link opportunities', 'ilinks'], ['Two pages one query', 'cannibal'], ['Topic map', 'topics']],
  15: [['Baseline', 'baseline'], ['Losing ground', 'decay'], ['Gaining ground', 'risers']],
  13: [['Technical findings', 'technical']],
  16: [['SERP features', 'serp']],
  20: [['AI Search packet', 'aipacket'], ['Recorded overviews', 'aiobs'], ['Within reach', 'striking']],
  21: [['AI Search packet', 'aipacket'], ['Topic map', 'topics']],
  22: [['AI Search packet', 'aipacket'], ['Data gate results', 'gates']],
  17: [['Action queue', 'actions'], ['Data gate results', 'gates'], ['Health score', 'score']],
  18: [['Baseline', 'baseline'], ['Action queue', 'actions'], ['Health score', 'score']],
  19: [['Action queue', 'actions'], ['Data gate results', 'gates'], ['Baseline', 'baseline']]
};

const TARGET_PREAMBLE = {
  claude: 'Attach the export files listed below to this conversation, or paste the tables inline. Work only from the data provided. If a conclusion is not supported by the data, say so and stop rather than filling the gap.',
  gpt: 'Upload the export files listed below. Use the analysis tool to recompute any figure you are about to state, rather than reading it off by eye. Work only from the data provided. If a conclusion is not supported by the data, say so and stop rather than filling the gap.',
  generic: 'Work only from the data provided. If a conclusion is not supported by the data, say so and stop rather than filling the gap.'
};

function buildPrompt(mod){
  const map = fillMap();
  if (mod.group === 'Google AI Search'){
    const packet = evTable('aipacket');
    if (packet) map.DATA = packet;
  }
  let text = mod.prompt;
  const missing = new Set();
  text = text.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
    const v = map[key];
    if (v == null || v === ''){ missing.add(key); return all; }
    return v.includes('\n') ? '\n' + v + '\n' : v;
  });
  const extra = (EXTRA_EVIDENCE[mod.num] || []).map(([label, kind]) => {
    const t = evTable(kind);
    return t ? `\n\n--- ${label.toUpperCase()} (computed by the console, ${kind === 'gates' || kind === 'baseline' ? 'summary' : 'top ' + EVROWS + ' rows'}) ---\n${t}` : '';
  }).join('');
  const head = TARGET_PREAMBLE[TARGET] + '\n\n';
  return { text: head + text + extra, missing: [...missing], fed: extra.length > 0 };
}

function highlight(text){
  return esc(text).replace(/\{\{([A-Z_]+)\}\}/g, '<span class="unfill">{{$1}}</span>');
}

function renderModules(){
  const host = $('#moduleList');
  host.innerHTML = MODULES.map(m => {
    const built = buildPrompt(m);
    const missing = built.missing.length;
    return `<div class="mod${built.fed?' fed':''}" data-m="${m.num}">
      <button class="modhead" aria-expanded="false">
        <span class="modnum">${String(m.num).padStart(2,'0')}</span>
        <span><span class="modtitle">${esc(m.title)}</span><br><span class="modgroup">${esc(m.group)}</span></span>
        <span class="row gap6">${built.fed?'<span class="tag" style="color:var(--gsc);border-color:var(--gsc)">evidence attached</span>':''}${missing?`<span class="tag">${missing} to fill in</span>`:'<span class="tag" style="color:var(--good)">ready</span>'}</span>
        <span class="modtoggle">+</span>
      </button>
      <div class="modbody">
        <div class="row wrap gap8" style="margin-bottom:10px">
          <button class="btn sm primary" data-copy="${m.num}">Copy prompt</button>
          ${m.follow?`<button class="btn sm" data-copyf="${m.num}">Copy the follow-up audit</button>`:''}
          <div class="grow"></div>
          <span class="small dim">${built.text.length.toLocaleString()} characters</span>
        </div>
        <pre class="prompt">${highlight(built.text)}</pre>
        ${m.follow?`<div style="margin-top:10px"><div class="eyebrow" style="margin-bottom:5px">Follow-up audit</div><pre class="prompt" style="max-height:150px">${esc(m.follow)}</pre></div>`:''}
      </div>
    </div>`;
  }).join('');
  host.querySelectorAll('.modhead').forEach(b => b.onclick = () => {
    const mod = b.closest('.mod'); const open = mod.classList.toggle('open');
    b.setAttribute('aria-expanded', String(open));
  });
  host.querySelectorAll('[data-copy]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const m = MODULES.find(x => x.num == b.dataset.copy);
    navigator.clipboard.writeText(buildPrompt(m).text).then(()=>toast('Module ' + m.num + ' copied'), ()=>toast('Copy blocked by the browser'));
  });
  host.querySelectorAll('[data-copyf]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const m = MODULES.find(x => x.num == b.dataset.copyf);
    navigator.clipboard.writeText(m.follow).then(()=>toast('Follow-up copied'), ()=>toast('Copy blocked by the browser'));
  });
  const fed = MODULES.filter(m => buildPrompt(m).fed).length;
  $('#sub-prompts').textContent = FIND ? `${fed} fed with data` : '19 modules';
}

$('#btnDownloadPack').onclick = () => {
  const md = ['# SEO prompt pack', '', `Domain: ${CFG.domain||'not set'}`, `Generated: ${new Date().toISOString().slice(0,10)}`,
    `Target assistant: ${TARGET === 'claude' ? 'Claude' : TARGET === 'gpt' ? 'ChatGPT' : 'any'}`, '',
    FIND ? 'Evidence tables below were computed from the exports loaded in the console.' : 'No data was loaded, so the evidence sections are empty.', ''].concat(
    MODULES.map(m => { const b = buildPrompt(m); return `\n---\n\n## ${String(m.num).padStart(2,'0')}. ${m.title}\n\n_${m.group}_\n\n\`\`\`\n${b.text}\n\`\`\`\n${m.follow?`\n**Follow-up audit**\n\n\`\`\`\n${m.follow}\n\`\`\`\n`:''}`; })
  ).join('\n');
  saveFile('seo-prompt-pack.md', md, 'text/markdown');
};
$('#btnCopyEvidence').onclick = () => {
  if (!FIND){ toast('Run the analysis first'); return; }
  const parts = [['Data gate','gates'],['Health score','score'],['Baseline','baseline'],['Within reach','striking'],['Under-clicked','ctrgap'],['Losing ground','decay'],['Gaining ground','risers'],['Two pages one query','cannibal'],['Topic map','topics'],['Page dilution','pagemap'],['Keyword gap','gaps'],['Source disagreements','reconcile'],['Technical findings','technical'],['Internal link opportunities','ilinks'],['Image audit','media'],['SERP features','serp'],['Google AI Search','aipacket'],['Recorded overviews','aiobs'],['Action queue','actions']]
    .map(([l,k]) => { const t = evTable(k); return t ? `--- ${l.toUpperCase()} ---\n${t}` : ''; }).filter(Boolean);
  const txt = `Evidence bundle for ${CFG.domain||'unnamed project'}, generated ${new Date().toISOString().slice(0,10)}.\nAll figures computed from Search Console and Semrush exports. Search Console figures are observed; Semrush figures are estimates.\n\n` + parts.join('\n\n');
  navigator.clipboard.writeText(txt).then(()=>toast('Evidence bundle copied'), ()=>toast('Copy blocked by the browser'));
};

/* ============================================================
   METHOD / REFERENCE
   ============================================================ */
function renderRef(){
  $('#refBody').innerHTML = `
  <div class="grid g2" style="margin-bottom:22px">
    <div class="card pad">
      <div class="eyebrow">The question everyone asks</div>
      <h3 style="margin:8px 0 8px">Claude or ChatGPT?</h3>
      <p class="small muted" style="margin-bottom:10px">Neither one does the counting. The console does that, in your browser, the same way every time. What you are choosing is which assistant reads the evidence and writes the judgement on top of it.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>Job</th><th>Better fit</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td>Long rule-bound briefs and edits</td><td><b>Claude</b></td><td>Holds a long instruction set and a house style together across a big document without drifting.</td></tr>
          <tr><td>Heavy arithmetic on a raw CSV</td><td><b>ChatGPT</b></td><td>Its code tool recomputes rather than estimates. Ask Claude to write and run the same code and it evens out.</td></tr>
          <tr><td>Live SERP inspection</td><td><b>Either, with browsing on</b></td><td>Both hallucinate SERPs when browsing is off. Never accept a SERP description that was not fetched.</td></tr>
          <tr><td>Bulk repetitive edits</td><td><b>Claude</b></td><td>More consistent across dozens of near-identical items, which is most of stage 9 to 14.</td></tr>
          <tr><td>Draft optimisation to a fixed spec</td><td><b>Claude</b></td><td>Respects negative constraints, banned phrasing and word counts more reliably.</td></tr>
        </tbody>
      </table></div>
      <p class="small dim" style="margin-top:10px">The honest version: the prompts are plain text and portable. Run the analysis modules wherever you already pay for a seat. The one thing that matters more than the brand is whether the model is looking at the real file or improvising from the file name.</p>
    </div>
    <div class="card pad">
      <div class="eyebrow">Six gates before anything ships</div>
      <h3 style="margin:8px 0 10px">Nothing goes live on a model's say-so</h3>
      <div style="border:1px solid var(--line);border-radius:8px">
        <div class="gate pass"><span class="ico">1</span><div><b>Evidence</b><p>Every claim traces to a row in a loaded export or a source you can open. No source, no claim.</p></div></div>
        <div class="gate pass"><span class="ico">2</span><div><b>Regression</b><p>List what the page currently ranks for before editing. Anything in the top ten is protected text.</p></div></div>
        <div class="gate pass"><span class="ico">3</span><div><b>Fact and attribution</b><p>Statistics, prices, dates and quotes carry a source and a date. No invented first-person experience.</p></div></div>
        <div class="gate pass"><span class="ico">4</span><div><b>Accessibility and images</b><p>Every image has a real filename, purposeful alt or a deliberate empty alt, dimensions, and a decision on lazy loading.</p></div></div>
        <div class="gate pass"><span class="ico">5</span><div><b>Technical</b><p>Indexable, canonical correct, in the sitemap, no orphan, no layout shift introduced, structured data valid against the visible page.</p></div></div>
        <div class="gate pass"><span class="ico">6</span><div><b>Measurement</b><p>Baseline saved, hypothesis written, review date set, and the condition that would make you revert.</p></div></div>
      </div>
    </div>
  </div>

  <h2 style="margin:6px 0 12px">How each number is derived</h2>
  <details class="ref"><summary>The expected click-through curve</summary><div>
    <p class="small muted">Every opportunity estimate needs an answer to "what would this earn at position N". Published curves vary wildly by industry and query type, so the console fits one to your own data first: for each whole position from 1 to 20 it takes the median click-through rate across your rows with at least 25 impressions, and uses that whenever a rank has at least 8 such rows. Gaps are filled by scaling a baseline curve to the nearest fitted rank, and the whole curve is forced to be non-increasing so a better position is never modelled as worse. If fewer than four ranks have enough data, it falls back to the baseline entirely and says so in the header chip.</p>
    <p class="small dim" style="margin-top:8px">Baseline used when yours cannot be fitted: position 1 at 27.5%, 2 at 15.2%, 3 at 9.9%, 5 at 5.3%, 10 at 2.1%, 20 at 0.75%, and 0.4% beyond.</p>
  </div></details>
  <details class="ref"><summary>Within reach</summary><div><p class="small muted">Rows between position 3.5 and 40 with at least 20 impressions. Target position is 3 for anything currently in the top ten, 8 for positions 11 to 20, and 15 beyond that, which is one realistic tier rather than an assumption that everything can reach the top. Estimated gain is impressions multiplied by the difference between the curve value at the target and the click-through rate you actually get. Impressions are held constant, which understates the gain for a genuine ranking improvement, since a better rank usually earns more impressions too.</p></div></details>
  <details class="ref"><summary>Ranking well, under-clicked</summary><div><p class="small muted">Top-ten rows with at least 50 impressions whose click-through rate is under 60% of the curve value for their position. Branded queries are flagged but not excluded, because a branded query with a poor click-through rate is often a genuine snippet problem. Clicks forgone is impressions multiplied by the shortfall.</p></div></details>
  <details class="ref"><summary>Losing ground and gaining ground</summary><div><p class="small muted">Requires two periods labelled Current and Previous. Rows are matched by exact normalised query, or by URL with the protocol, www prefix, query string and trailing slash stripped. A decline counts when the row previously earned at least 5 clicks and lost at least a quarter of them, or at least 3 clicks, whichever is larger. The cause is assigned in this order: a row absent from the current export is marked as dropped out; an average position that worsened by a full place or more is a ranking loss; otherwise impressions falling by a quarter or more is an impressions problem and anything else is a click-through problem at a stable rank.</p><p class="small dim" style="margin-top:8px">Average position is impression-weighted whenever rows are aggregated. Averaging the average-position column directly is one of the most common ways to get a wrong answer from this data.</p></div></details>
  <details class="ref"><summary>Two pages, one query</summary><div><p class="small muted">Needs a page and query export. Queries with at least 100 impressions where two or more URLs each hold at least 12% of those impressions and at least 20 impressions of their own. A split above 35% on the second URL is marked high. This is a signal to investigate, not proof: sometimes two URLs legitimately serve the same query at different stages.</p></div></details>
  <details class="ref"><summary>Keyword gap and the observed versus estimated rule</summary><div><p class="small muted">From the Semrush Keyword Gap export. Your column is found by matching the domain you set in stage 1; everything else is treated as a competitor. A row qualifies when a competitor holds a top-ten position and you do not. The score is estimated monthly volume converted to a 28-day period, multiplied by the curve value at position 5, weighted up for commercial and transactional intent and down as difficulty rises. Where your Search Console data already shows impressions for the same term, the verdict flips from create to refresh, because the page exists and is being seen.</p><p class="small dim" style="margin-top:8px">Search Console numbers are observed, Semrush numbers are modelled. The console never averages the two. Where they disagree it says so, in the Where the two sources disagree table.</p></div></details>
  <details class="ref"><summary>How topics are formed and who owns them</summary><div>
    <p class="small muted">Queries are stemmed, stripped of stop words, and weighted by how rare each remaining word is across your own query set, so a word appearing in half your queries counts for almost nothing while a distinctive noun counts for a lot. Each query is then compared to the running centre of every candidate cluster, not to individual members: comparing against the cluster is what stops "cleaning cost" and "treatment cost" chaining four separate topics into one through a shared modifier.</p>
    <p class="small muted" style="margin-top:8px">Where you have a page and query export, the URL Google actually serves a query from is treated as far stronger evidence than vocabulary. Two queries served by the same page get a large similarity bonus; two queries each confidently served by different pages are blocked from merging unless the wording is nearly identical. That is Google's own opinion about what belongs together, and it beats any string comparison.</p>
    <p class="small muted" style="margin-top:8px">Ownership then follows the impressions: a topic is <b>owned</b> when one URL takes 60% or more, <b>split</b> when two or more URLs each take a fifth, <b>weak</b> when no URL leads and nothing is close, and <b>unmapped</b> when there is no page and query data to judge with. The strictness slider on that stage moves the merge threshold, and the whole analysis re-runs.</p>
  </div></details>
  <details class="ref"><summary>How the crawler reaches a site</summary><div>
    <p class="small muted">A browser cannot read another domain's pages, so the console resolves one of three routes at run time. If <code>proxy.php</code> answers next to this page, it fetches through that, which works for any domain listed in the proxy's allowlist. If not, and the console is served from the same origin as the target, it fetches directly. Otherwise it fetches nothing and says so, and you supply a sitemap by paste or a crawler export by file.</p>
    <p class="small muted" style="margin-top:8px">The crawler obeys robots.txt by default, seeds from the sitemap when one is found, follows internal links breadth-first, skips assets, and stops at the page limit you set. Near-duplicate detection uses a 64-bucket minhash over five-word shingles, which finds pages that are the same article with the town name changed.</p>
  </div></details>
  <details class="ref"><summary>How internal link suggestions are found</summary><div>
    <p class="small muted">For every topic with an owning page, the console takes that topic's actual query strings as candidate phrases, then searches the body text of every other crawled page for them. A page that contains the phrase and does not already link to the owner is an opportunity. The sentence shown is the one already published, so the link is a placement job rather than a writing job.</p>
    <p class="small muted" style="margin-top:8px">Body text is read from the page's <code>main</code> or <code>article</code> region where one exists, with navigation, headers and footers stripped. That matters: without it every page appears to "mention" every item in its own menu, and word counts and duplicate detection are inflated by the same boilerplate.</p>
    <p class="small muted" style="margin-top:8px">Ranking combines the source page's own clicks and inlinks with the destination's headroom, and prefers longer, more specific phrases. Links that already exist are never suggested, and a page is never suggested as a link to itself. It needs a live crawl with page text kept: an imported crawler export carries no body copy.</p>
  </div></details>
  <details class="ref"><summary>What is in a brief, and what is deliberately not</summary><div>
    <p class="small muted">Each brief is assembled, not written. The primary and supporting queries come from your Search Console export with their real impressions, clicks and positions. The questions are the queries that begin with a question word, so they are questions people actually used rather than invented FAQ filler. The recurring terms are word stems from the cluster ordered by impressions, offered as subjects to cover, not as strings to place a fixed number of times.</p>
    <p class="small muted" style="margin-top:8px">The current state of the owning page (title length, meta, H1 count, word count, images, markup, inlinks) comes from the crawl. The word-count benchmark is this site's own median, clearly labelled, because the console cannot read competitor pages and will not pretend a number came from somewhere it did not.</p>
    <p class="small muted" style="margin-top:8px">There is no suggested word count target, no keyword density, and no content score. Those numbers are the part of this category of tool that is invented, and inventing them is what the whole console exists to avoid.</p>
  </div></details>
  <details class="ref"><summary>Images, markup and hreflang</summary><div>
    <p class="small muted">Images are judged on filename (camera names, generic names, hashes, case and separators), alt state, declared dimensions, srcset and format. A missing alt attribute and an empty one are counted separately, because an empty alt on a decorative image is correct and a missing attribute never is.</p>
    <p class="small muted" style="margin-top:8px">Structured data reports the types present and any JSON-LD that will not parse. It does not validate against Google's requirements for a given rich result, because that needs the rendered page and Google's own tester.</p>
    <p class="small muted" style="margin-top:8px">Hreflang is checked for the four things that actually break it: a missing self-reference, a declaration with no return tag from the page it points at, invalid language or region codes, and no x-default. A one-way declaration is discarded by Google entirely, which is why it is marked critical rather than as a warning.</p>
  </div></details>
  <details class="ref"><summary>SERP features, and why they change the diagnosis</summary><div>
    <p class="small muted">Semrush records which features appeared on each result page. Crossing that with your own click-through rate separates two problems that look identical in a rankings report: ranking badly, and ranking well underneath a snippet, a local pack or an AI overview that takes the click first. The fix for the first is the page; the fix for the second is the result, or an acceptance that the click is gone.</p>
    <p class="small muted" style="margin-top:8px">The two sources describe different moments: Semrush recorded features when it crawled, Search Console recorded your clicks across the whole period. A row here is a reason to look at the live result page, never proof on its own.</p>
  </div></details>
  <details class="ref"><summary>How the health score is built</summary><div>
    <p class="small muted">Six pillars: crawl and indexation at 18, on-page at 17, topic coverage at 19, search performance at 24, AI answer readiness at 12, off-page at 10. Each is the weighted mean of its own sub-measurements, every one of which is visible on the scorecard with the count behind it.</p>
    <p class="small muted">AI answer readiness is built from the GEO experiment (Aggarwal et al., KDD 2024, 10,000 queries), which rewrote pages and measured what changed: quoting a named source was worth +40%, concrete statistics +32%, citing outside sources +27% and up to +115% for a page already ranking fourth or fifth, while keyword stuffing <b>cost</b> 8%. Schema markup is deliberately not part of it — a controlled study of 1,885 pages that added JSON-LD found no citation lift. It enters at 12 rather than higher because the retrieval studies still disagree with each other by a factor of two, and the weighting version travels with every saved run so a change here can never look like a client improving.</p>
    <p class="small muted" style="margin-top:8px">A pillar with no data is not scored, and its weight is removed from the denominator rather than counted as zero. That is why the scorecard states how much of the available weight was actually carried. A score built on one pillar is a score about one pillar, and the page says so instead of implying a full audit.</p>
  </div></details>
  <details class="ref"><summary>Google AI Search: three kinds of evidence, never merged</summary><div>
    <p class="small muted"><b>Observed.</b> The Search Console generative AI report counts impressions inside Google's generative features. That is Google telling you a URL appeared. It is page level only: there is no query dimension and no split between AI Overviews and AI Mode, so this console never claims either. There are no AI clicks in it, so none are shown. Any tool presenting you with AI click-through has modelled it.</p>
    <p class="small muted" style="margin-top:8px"><b>Reported.</b> Semrush records the features present on a result page when it crawled. That gives query-level knowledge of where an AI Overview appears, at one moment in time. It is drawn in orange like every other third-party estimate.</p>
    <p class="small muted" style="margin-top:8px"><b>Recorded.</b> An overview you looked at and pasted in, with the sources it cited and a date. Nothing is scraped: Google does not publish citation data and no export contains it. Your own dated record is the only honest source for a citation gap, which is why the console asks you for it rather than inventing one.</p>
    <p class="small muted" style="margin-top:8px">The three are never averaged. If the generative AI report is not loaded, page-level AI visibility reads <b>unknown</b>, not zero, because those are entirely different statements.</p>
  </div></details>
  <details class="ref"><summary>The AI eligibility gate, and the generative control</summary><div>
    <p class="small muted">Participation in Google's generative features runs on ordinary Search eligibility: indexed, crawlable, snippet-eligible, not excluded. There is no separate markup requirement, so the gate does not invent one. It checks status, indexability, canonical consistency, nosnippet and max-snippet directives, robots.txt, whether the main content is present in the served HTML, and the property's generative AI control.</p>
    <p class="small muted" style="margin-top:8px">That last one is decisive. If the property is set to exclude itself from generative features, the AI stage stops and says so rather than scoring content that cannot appear no matter how good it gets. Record the setting on the project stage; until you do, that check reads unknown rather than passing quietly.</p>
    <p class="small muted" style="margin-top:8px">"Main content in the served HTML" deserves a note: this crawler reads what the server returns. If a page assembles its content in the browser, a first-pass crawler will not see it, and the check flags that rather than pretending the page is thin.</p>
  </div></details>
  <details class="ref"><summary>AI Search readiness: what it is and what it is not</summary><div>
    <p class="small muted">Nine components, weighted: eligibility 20, answers the task quickly 15, non-commodity information 15, evidence and factual support 15, subtopic coverage 10, organisation 10, freshness 5, media 5, internal links 5. Every one is computed from the crawl and shown with the count behind it, and a component with no data is dropped rather than scored zero.</p>
    <p class="small muted" style="margin-top:8px">Two of them are frank proxies. "Non-commodity information" looks for first-party language and evidence density, which is a text signal, not a judgement about whether the content is actually original. "Evidence and factual support" counts figures, outbound citations and tables. Both are stated as proxies on the page itself.</p>
    <p class="small muted" style="margin-top:8px">It is an internal editorial metric. It is not a Google signal, it does not predict inclusion in an AI Overview, and no third-party tool has access to anything that would. It is a checklist with numbers on it, which is useful, and it is nothing more than that.</p>
  </div></details>
  <details class="ref"><summary>Fan-out, and why this tool will not tell you to publish ten pages</summary><div>
    <p class="small muted">Google assembles a generative answer partly by running related searches around the original query. The tempting response is to publish a page per variation. That is how a site acquires scaled content abuse, which is a policy problem rather than a tactic.</p>
    <p class="small muted" style="margin-top:8px">So the fan-out view is a coverage report, not a content plan: it lists the member queries of a topic that the owning page never addresses in its own words, and leaves the same-page-or-separate-page decision to you. The list is a text match, not a quality judgement: a query counts as covered when its meaningful words appear in the body or headings.</p>
  </div></details>
  <details class="ref"><summary>What this cannot tell you</summary><div><ul class="notes">
    <li>Whether a ranking change was caused by your edit. Only a change log and a review window can suggest that, and even then only suggest.</li>
    <li>Anything about pages with no impressions. They are invisible to Search Console and therefore invisible here.</li>
    <li>Real search volume. Nobody sells that. Every volume figure on this page is an estimate.</li>
    <li>Whether a query is worth money to you. Impressions are not intent and clicks are not revenue.</li>
    <li>What the SERP currently looks like. Fetch it yourself; do not let a model describe it from memory.</li>
    <li>Site totals, if any export hit the 1,000-row report cap. The tail is missing and the tail is usually most of the queries.</li>
    <li>Whether a backlink is any good. The link stage describes the shape of the profile and stops there, because no export carries enough to judge quality.</li>
    <li>Core Web Vitals. The crawler measures document response time, which is not the same thing. Use the Search Console report or a lab tool.</li>
    <li>Anything on a page rendered entirely by JavaScript. The crawler reads the HTML the server returns, as a first-pass crawler does.</li>
    <li>Whether you are cited inside an AI Overview. Google does not publish it and no export contains it. The only honest source is your own dated observation, which is why the console asks for one.</li>
    <li>Which generative surface an impression came from. The Search Console report does not separate AI Overviews from AI Mode, so neither does this.</li>
    <li>Why Google chose a particular source. The research prompts are instructed never to guess, and to label every statement as observed, inferred or speculative.</li>
  </ul></div></details>

  <h2 style="margin:26px 0 12px">Export procedures</h2>
  <details class="ref"><summary>Search Console, three ways to get the data out</summary><div>
    <div class="grid g3">
      <div><b class="small">Report export</b><p class="small muted">Fastest. Performance, Search results, set the search type, apply filters, then Export. Respects the active filters and grouping and caps at about 1,000 rows. Good for a first read, wrong for anything long-tail.</p></div>
      <div><b class="small">API</b><p class="small muted">Repeatable and detailed. Request one day at a time, page at 25,000 rows, and query search appearance on its own pass. Gives you page and query on the same row, which unlocks cannibalisation.</p></div>
      <div><b class="small">BigQuery bulk export</b><p class="small muted">Durable and site-wide. Settings, Bulk data export. The first export is prospective and can take up to 48 hours, so set it up before you need it. Do not alter the table schema.</p></div>
    </div>
    <p class="small dim" style="margin-top:10px">Whichever route, record the search type, country, device and date range in stage 1. An export without its filters written down cannot be compared to anything later.</p>
  </div></details>
  <details class="ref"><summary>Semrush, what to export and what to keep</summary><div><div class="tablewrap"><table>
    <thead><tr><th>Report</th><th>How</th><th>Keep these fields</th></tr></thead>
    <tbody>
      <tr><td>Organic Research, Positions</td><td>Pick the database matching your market, filter, export. Repeat per competitor.</td><td>Keyword, position, previous position, volume, difficulty, CPC, URL, intent, SERP features</td></tr>
      <tr><td>Keyword Gap</td><td>Your domain plus up to four competitors. Export Missing, Weak and Untapped separately.</td><td>Keyword, volume, difficulty, intent, each domain's position</td></tr>
      <tr><td>Position Tracking</td><td>Set date, device, location and competitors, then export the overview.</td><td>Keyword, tag, current and previous rank, URL, visibility</td></tr>
      <tr><td>Site Audit, Crawled Pages</td><td>Export with absolute URLs selected.</td><td>URL, status, indexability, canonical, depth, internal link rank, issues</td></tr>
      <tr><td>Backlinks</td><td>Filter by follow, new or lost, authority, then export.</td><td>Source and target URL, authority, anchor, first and last seen</td></tr>
    </tbody></table></div>
    <p class="small dim" style="margin-top:10px">Do not merge across databases. A US database export and a UK-filtered Search Console export describe two different worlds, and joining them produces confident nonsense.</p>
  </div></details>
  <details class="ref"><summary>Image filenames, alt text and delivery</summary><div>
    <div class="grid g2">
      <div><b class="small">Filename standard</b><ul class="notes"><li>Short, lowercase, hyphenated, describing the subject. <code>seo-content-audit-dashboard.webp</code>, not <code>IMG_4839.JPG</code>.</li><li>Describe the subject, do not list keywords.</li><li>The extension must match the actual file type.</li><li>Never rename a live indexed asset without a redirect plan.</li></ul></div>
      <div><b class="small">Alt text by role</b><ul class="notes"><li><b>Informative:</b> describe the meaning in this page's context. The same image needs different alt text elsewhere.</li><li><b>Decorative:</b> <code>alt=""</code>. Do not drag screen reader users through flourishes.</li><li><b>Functional:</b> describe the action or destination, not the picture.</li><li><b>Complex:</b> charts and diagrams get a visible text equivalent, not a paragraph stuffed into alt.</li></ul></div>
    </div>
    <p class="small dim" style="margin-top:10px">Audit every placement, not every file: page URL, image URL, status, size, alt state, role, nearby heading, whether it is the largest contentful paint element, lazy loading, dimensions, srcset, and licensing.</p>
  </div></details>

  <h2 style="margin:26px 0 12px">What was cut from the previous version</h2>
  <div class="card pad">
    <div class="grid g2">
      <div><b class="small">Removed</b><ul class="notes">
        <li>Role-play credentials such as "former Google Search Quality Rater". They buy confidence, not accuracy.</li>
        <li>"One shot" and "make it rank number one". No prompt can promise a ranking.</li>
        <li>Hard-coded client domains, model version names and pricing comparisons.</li>
        <li>LSI keywords and fixed anchor-text percentages. Neither survives contact with evidence.</li>
        <li>Blanket FAQ and HowTo schema recommendations.</li>
        <li>Competitor analysis from URLs alone when the page content was never actually fetched.</li>
      </ul></div>
      <div><b class="small">Kept and rebuilt on top of real numbers</b><ul class="notes">
        <li>Search intent, entity coverage, information gain and MECE structure.</li>
        <li>Copy-ready internal link sentences with named source and target pages.</li>
        <li>The split between strategic analysis and bulk editing.</li>
        <li>The weekly operating cadence and the executive report.</li>
        <li>Protected-wins logic before any draft is edited.</li>
      </ul></div>
    </div>
  </div>`;
}

/* ============================================================
   SAMPLE DATA
   ============================================================ */
function seeded(s){ let x = s; return () => (x = (x*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
function sampleData(){
  const R = seeded(7);
  const heads = ['cooling tower','water treatment','industrial chiller','boiler descaling','cooling tower maintenance','legionella testing','heat exchanger cleaning','water softener','closed loop system','evaporative condenser'];
  const mods = ['cost','services','company','near me','suppliers','price','installation','specialist','contractor','maintenance','cleaning','uk','checklist','guide','vs alternatives'];
  const kws = [];
  for (const h of heads) for (const m of mods) kws.push(h + ' ' + m);
  for (const h of heads) kws.push(h);
  ['example water','example water reviews','example water contact','example water cooling towers'].forEach(k => kws.push(k));
  const netNew = ['dry cooler servicing','water hygiene audit','cooling tower legionella risk assessment','industrial water filtration cost','biocide dosing system','tower packing replacement','water treatment contract pricing','chemical dosing pump service'];
  const pages = ['/', '/services/cooling-tower-cleaning', '/services/water-treatment', '/services/legionella-control', '/blog/cooling-tower-maintenance-checklist', '/blog/what-does-water-treatment-cost', '/blog/legionella-testing-explained', '/contact', '/about', '/case-studies/manufacturing-plant', '/services/chiller-servicing', '/blog/closed-loop-system-guide'];

  const qCur = [], qPrev = [];
  kws.forEach((k,i) => {
    const pos = 1 + Math.pow(R(), 1.7) * 45;
    const impr = Math.round(30 + Math.pow(R(), 2.4) * 9000);
    const base = pos <= 20 ? (BASE_CURVE[Math.max(1,Math.round(pos))] || .004) : .004;
    const noise = .35 + R()*1.5;
    const clicks = Math.max(0, Math.round(impr * base * noise));
    qCur.push({ q:k, clicks, impr, pos });
    const drift = (R()-.45) * 3.2;
    const pPos = Math.max(1, pos + drift);
    const pImpr = Math.max(5, Math.round(impr * (0.7 + R()*0.75)));
    const pBase = pPos <= 20 ? (BASE_CURVE[Math.max(1,Math.round(pPos))] || .004) : .004;
    qPrev.push({ q:k, clicks: Math.max(0, Math.round(pImpr * pBase * (.35 + R()*1.5))), impr:pImpr, pos:pPos });
  });
  const mkGsc = (rows, keyName) => [[keyName,'Clicks','Impressions','CTR','Position'],
    ...rows.map(r => [r.q, r.clicks, r.impr, (r.impr? (r.clicks/r.impr*100).toFixed(2):'0.00')+'%', r.pos.toFixed(2)])];

  const pCur = pages.map((p,i) => { const impr = Math.round(200 + Math.pow(R(),2)*14000); const pos = 1+Math.pow(R(),1.5)*20; const b = BASE_CURVE[Math.max(1,Math.min(20,Math.round(pos)))]||.01; return {q:'https://example.com'+p, clicks:Math.round(impr*b*(.5+R())), impr, pos}; });
  const pPrev = pCur.map(r => ({ q:r.q, clicks: Math.max(0,Math.round(r.clicks*(0.55+R()*1.0))), impr: Math.round(r.impr*(0.7+R()*0.7)), pos: Math.max(1, r.pos+(R()-.45)*3) }));

  const pq = [['Page','Query','Clicks','Impressions','CTR','Position']];
  kws.slice(0, 60).forEach(k => {
    const n = R() < .3 ? 2 : 1;
    for (let i = 0; i < n; i++){
      const p = pages[Math.floor(R()*pages.length)];
      const impr = Math.round(60 + R()*2500);
      const pos = 2 + R()*18;
      const cl = Math.round(impr*.03*(0.4+R()));
      pq.push(['https://example.com'+p, k, cl, impr, (cl/impr*100).toFixed(2)+'%', pos.toFixed(2)]);
    }
  });

  const dates = [['Date','Clicks','Impressions','CTR','Position']];
  for (let i = 27; i >= 0; i--){ const d = new Date(Date.now() - i*864e5).toISOString().slice(0,10); const cl = Math.round(80+R()*90), im = Math.round(3000+R()*2500); dates.push([d, cl, im, (cl/im*100).toFixed(2)+'%', '12.4']); }
  const datesPrev = [['Date','Clicks','Impressions','CTR','Position']];
  for (let i = 55; i >= 28; i--){ const d = new Date(Date.now() - i*864e5).toISOString().slice(0,10); const cl = Math.round(80+R()*90), im = Math.round(3000+R()*2500); datesPrev.push([d, cl, im, (cl/im*100).toFixed(2)+'%', '12.9']); }

  const smrPos = [['Keyword','Position','Previous position','Search Volume','Keyword Difficulty','CPC','URL','Traffic','Keyword Intents','SERP Features by Keyword']];
  kws.slice(0, 90).forEach(k => {
    const pos = Math.round(1 + Math.pow(R(),1.6)*40);
    smrPos.push([k, pos, Math.max(1, pos + Math.round((R()-.4)*8)), Math.round(20 + Math.pow(R(),2.5)*4000), Math.round(10+R()*70), (R()*9).toFixed(2), 'https://example.com'+pages[Math.floor(R()*pages.length)], Math.round(R()*400), R()<.4?'Commercial':R()<.8?'Informational':'Transactional',
      (R()<.45 ? 'AI Overview, ' : '') + (R()<.5 ? 'People also ask, ' : '') + (R()<.35 ? 'Featured snippet, ' : '') + 'Local pack']);
  });

  const gap = [['Keyword','Search Volume','Keyword Difficulty','CPC','Competition','Results','Keyword Intents','example.com','watertechpros.com','coolingsystems.co']];
  kws.slice(40, 130).concat(netNew).forEach(k => {
    const isNew = netNew.includes(k);
    const mine = (!isNew && R() < .45) ? Math.round(1+R()*60) : '';
    gap.push([k, Math.round(30 + Math.pow(R(),2.3)*5000), Math.round(8+R()*75), (R()*8).toFixed(2), (R()).toFixed(2), Math.round(R()*9e6), R()<.4?'Commercial':'Informational', mine, Math.round(1+R()*25), Math.round(1+R()*30)]);
  });

  // page x query for every keyword, so ownership can actually be judged
  const pq2 = [['Page','Query','Clicks','Impressions','CTR','Position']];
  kws.forEach((k, ki) => {
    const theme = Math.floor(ki / 15) % pages.length;
    const main = pages[theme];
    const impr = Math.round(80 + R()*2600);
    const pos = 2 + R()*20;
    const cl = Math.round(impr*.03*(0.4+R()));
    if (R() < .22){                                   // deliberate splits
      const other = pages[(theme+4) % pages.length];
      const a = Math.round(impr*0.55), b = impr - a;
      pq2.push(['https://example.com'+main, k, Math.round(cl*.6), a, (cl*.6/a*100).toFixed(2)+'%', pos.toFixed(2)]);
      pq2.push(['https://example.com'+other, k, Math.round(cl*.4), b, (cl*.4/b*100).toFixed(2)+'%', (pos+2).toFixed(2)]);
    } else {
      pq2.push(['https://example.com'+main, k, cl, impr, (cl/impr*100).toFixed(2)+'%', pos.toFixed(2)]);
    }
  });

  // backlinks
  const refs = ['watertechjournal.com','buildingservicesnews.co.uk','hvac-directory.org','facilitiesweek.com','ukmanufacturing.net','plantengineer.co.uk','greenbuildingblog.com','industrytoday.eu','tradesdirectory.uk','engineeringnews.io','localchamber.org.uk','waterhygieneforum.com'];
  const bl = [['Source url','Target url','Anchor','Page ascore','Nofollow','First seen','New','Lost']];
  for (let i = 0; i < 260; i++){
    const d = refs[Math.floor(R()*refs.length)];
    const anchor = R()<.18 ? 'Example water' : R()<.3 ? 'click here' : R()<.42 ? 'https://example.com' : ['cooling tower cleaning','water treatment services','legionella testing','industrial water treatment'][Math.floor(R()*4)];
    bl.push([`https://${d}/article-${Math.floor(R()*300)}`, 'https://example.com'+pages[Math.floor(R()*pages.length)],
             anchor, String(8+Math.floor(R()*70)), R()<.18?'true':'false', '2025-1'+Math.floor(R()*2)+'-01',
             R()<.14?'2026-08-0'+(1+Math.floor(R()*9)):'', R()<.09?'2026-07-1'+Math.floor(R()*9):'']);
  }

  // a crawler export standing in for a live crawl, with deliberate faults
  const sf = [['Address','Status Code','Title 1','Meta Description 1','H1-1','Word Count','Canonical Link Element 1','Indexability','Indexability Status','Inlinks','Crawl Depth','Size (bytes)','Response Time','Content Type']];
  const titles = {};
  pages.forEach((p, i) => {
    const url = 'https://example.com'+p;
    let title = ['Cooling tower cleaning and disinfection services','Industrial water treatment for manufacturing','Legionella control and risk assessment','Chiller servicing and maintenance','Water treatment services'][i % 5];
    if (i === 6 || i === 9) title = 'Water treatment services';       // duplicate titles
    const thin = (i === 7 || i === 8);
    sf.push([url, i === 10 ? '404' : '200', i === 3 ? '' : title,
      (i % 4 === 0) ? '' : 'A useful description of what this page covers for the reader.',
      i === 5 ? '' : title.split(' ').slice(0,3).join(' '),
      thin ? String(60 + Math.floor(R()*120)) : String(450 + Math.floor(R()*1400)),
      i === 2 ? '' : url,
      i === 11 ? 'Non-Indexable' : 'Indexable', i === 11 ? 'noindex' : '',
      String(i === 8 ? 0 : 1 + Math.floor(R()*14)), String(i === 9 ? 5 : Math.min(3, Math.floor(R()*4))),
      String(40000 + Math.floor(R()*90000)), (0.2 + R()*2.2).toFixed(2), 'text/html; charset=UTF-8']);
  });
  for (let i = 0; i < 26; i++){
    const url = 'https://example.com/blog/post-'+i+(i===4?'_Draft_Copy':'');
    sf.push([url, '200', 'Blog post number '+i+' about water treatment topics',
      i % 3 === 0 ? '' : 'Description for blog post '+i+'.', 'Blog post '+i,
      String(i % 7 === 0 ? 120 : 700 + Math.floor(R()*900)), url, 'Indexable', '',
      String(i % 5 === 0 ? 0 : 1 + Math.floor(R()*6)), String(2 + (i % 4)),
      String(30000 + Math.floor(R()*60000)), (0.2 + R()*1.9).toFixed(2), 'text/html; charset=UTF-8']);
  }

  // Search Console generative AI report, current and previous
  const aiPages = pages.slice(0, 9);
  const genCur = [['Top pages','Impressions']], genPrev = [['Top pages','Impressions']];
  aiPages.forEach((p, i) => {
    const base = Math.round(120 + Math.pow(R(), 1.6) * 2600);
    if (i !== 3) genCur.push(['https://example.com' + p, base]);
    if (i !== 7) genPrev.push(['https://example.com' + p, Math.round(base * (0.55 + R() * 0.9))]);
  });
  const genDev = [['Device','Impressions'], ['MOBILE', Math.round(3000 + R()*3000)], ['DESKTOP', Math.round(1200 + R()*1600)], ['TABLET', Math.round(60 + R()*160)]];
  const genCtry = [['Country','Impressions'], ['gbr', Math.round(4000 + R()*3000)], ['irl', Math.round(300 + R()*500)], ['usa', Math.round(200 + R()*400)]];

  DATASETS = [];
  addTable('Queries.csv  (sample)', mkGsc(qCur,'Top queries'));
  DATASETS[DATASETS.length-1].period = 'current';
  addTable('Queries-previous.csv  (sample)', mkGsc(qPrev,'Top queries'));
  DATASETS[DATASETS.length-1].period = 'previous';
  addTable('Pages.csv  (sample)', mkGsc(pCur,'Top pages'));
  DATASETS[DATASETS.length-1].period = 'current';
  addTable('Pages-previous.csv  (sample)', mkGsc(pPrev,'Top pages'));
  DATASETS[DATASETS.length-1].period = 'previous';
  addTable('page-query-api.csv  (sample)', pq2);
  addTable('Dates.csv  (sample)', dates);
  DATASETS[DATASETS.length-1].period = 'current';
  addTable('Dates-previous.csv  (sample)', datesPrev);
  DATASETS[DATASETS.length-1].period = 'previous';
  addTable('example.com-organic.Positions.csv  (sample)', smrPos);
  addTable('example.com-keyword-gap.csv  (sample)', gap);
  addTable('example.com-backlinks.csv  (sample)', bl);
  addTable('internal_all.csv  (sample crawl)', sf);
  addTable('Generative-AI-pages.csv  (sample)', genCur);
  DATASETS[DATASETS.length-1].period = 'current';
  addTable('Generative-AI-pages-previous.csv  (sample)', genPrev);
  DATASETS[DATASETS.length-1].period = 'previous';
  addTable('Generative-AI-devices.csv  (sample)', genDev);
  addTable('Generative-AI-countries.csv  (sample)', genCtry);

  /* A live crawl as well as the crawler export. The export stands in for a Screaming Frog
     import, which carries no page copy; this stands in for the built-in crawler, which does.
     Without it the AI readiness engine would have nothing to read and every page would come
     back unscored, which is correct behaviour but a poor demonstration of it. */
  CRAWL = sampleCrawl(pages.concat(Array.from({length:26}, (_, i) => '/blog/post-' + i + (i===4?'_Draft_Copy':''))), R);
  SITEMAP_URLS = CRAWL.pages.filter(p => p.status === 200).map(p => ({ loc: p.raw }));
  SITEMAPS = [{ source:'https://example.com/sitemap.xml', type:'urlset', entries: SITEMAP_URLS,
                bytes: 40 * SITEMAP_URLS.length, error:null, malformed:false }];
  renderCrawlSummary();

  if (!CFG.domain){
    $('#cfgDomain').value = 'example.com'; $('#cfgBrand').value = 'Example water';
    $('#cfgCountry').value = 'United Kingdom'; $('#cfgLanguage').value = 'English';
    $('#cfgConversion').value = 'Qualified site survey request';
    $('#cfgCompetitors').value = 'watertechpros.com\ncoolingsystems.co';
    $('#crawlRoot').value = 'https://example.com/';
    const g = document.getElementById('cfgGenerative'); if (g) g.value = 'included';
  }
  saveCfg(); renderLedger(); syncChips(); run();
  toast('Sample project loaded. Every number below is computed from it.');
}
$('#btnDemo').onclick = sampleData;

/* ------------------------------------------------------------
   A synthetic live crawl for the sample project. Pages are written
   with a deliberate spread: a few that answer early with figures and
   tables, a middle band of ordinary marketing copy, and some thin
   pages, so the readiness components separate instead of all landing
   on the same number.
   ------------------------------------------------------------ */
function sampleCrawl(paths, R){
  const TOPICS = {
    '/services/cooling-tower-cleaning': ['cooling tower cleaning','cooling tower cleaning cost','how often to clean a cooling tower'],
    '/services/legionella-risk-assessment': ['legionella risk assessment','legionella testing','legionella control'],
    '/services/water-treatment': ['industrial water treatment','water treatment services','water treatment for manufacturing'],
    '/services/chiller-servicing': ['chiller servicing','chiller maintenance','chiller cleaning']
  };
  const nowY = new Date().getFullYear();
  const pages = paths.map((path, i) => {
    const url = 'https://example.com' + path;
    const tier = i % 10 === 7 || i % 10 === 8 ? 'thin' : (i % 3 === 0 ? 'strong' : 'ordinary');
    const key = Object.keys(TOPICS).find(k => path.startsWith(k));
    const slug = (path.split('/').filter(Boolean).pop() || 'water treatment')
                   .replace(/_/g,' ').replace(/-/g,' ').toLowerCase();
    const terms = key ? TOPICS[key] : [slug];
    const subject = terms[0];

    const opener = tier === 'thin'
      ? `We provide ${subject} across the UK.`
      : `${subject.charAt(0).toUpperCase() + subject.slice(1)} typically costs between £450 and £1,900 per tower, and most sites need it twice a year under ACOP L8. This page sets out what the work involves, what drives the price, and how to tell whether your last clean was done properly.`;

    const body = tier === 'thin'
      ? opener + ' Contact us for a quote.'
      : [opener,
         terms.map(t => `Our engineers handle ${t} on live plant, so production does not stop. In 2026 we completed 214 of these visits and 91% passed the follow-up dip slide at 48 hours.`).join(' '),
         tier === 'strong'
           ? `We tested three disinfection regimes across 40 towers in ${nowY - 1} and measured recovery of aerobic counts at 7, 14 and 28 days. Our data showed chlorine dioxide held below 10,000 cfu/ml for 26 days against 11 days for hypochlorite.`
           : `The process follows HSG274 Part 1 and is signed off by a Legionella Control Association registered assessor.`,
         `Frequency depends on tower size, duty cycle and local water hardness. A 250 kW tower in a hard-water area normally needs 2 to 3 cleans a year.`
        ].join(' ');

    const words = body.split(/\s+/).length + (tier === 'thin' ? 40 : 620 + Math.floor(R() * 700));
    const headings = tier === 'thin' ? [] :
      ['What the work involves','What it costs','How often it is needed','How we report the result']
        .slice(0, tier === 'strong' ? 4 : 2 + Math.floor(R() * 2));

    return {
      url: normUrl(url), raw: url, requested: url, status: i === 10 ? 404 : 200, redirects: [],
      ms: 200 + Math.floor(R() * 900), bytes: 40000 + Math.floor(R() * 60000),
      title: subject.charAt(0).toUpperCase() + subject.slice(1) + ' | Example water',
      metaDescription: tier === 'thin' ? '' : `What ${subject} involves, what it costs and how often it is needed.`,
      robotsMeta: '', noindex: i === 11, nofollowPage: false,
      canonical: normUrl(url), canonicalRaw: url, selfCanonical: true,
      h1: subject.charAt(0).toUpperCase() + subject.slice(1), h1Count: 1, h2Count: headings.length,
      headings, firstPara: opener,
      medianPara: tier === 'thin' ? 14 : 42 + Math.floor(R() * 30),
      paraCount: tier === 'thin' ? 2 : 6 + Math.floor(R() * 6),
      listCount: tier === 'thin' ? 0 : 1 + Math.floor(R() * 3),
      tableCount: tier === 'strong' ? 1 : 0,
      outboundCitations: tier === 'strong' ? 3 : tier === 'ordinary' ? 1 : 0,
      numberHits: tier === 'thin' ? 1 : 14 + Math.floor(R() * 20),
      latestYear: tier === 'strong' ? nowY : tier === 'ordinary' ? nowY - 1 : nowY - 3,
      wordCount: words, text: body, contentAnalysed: true,
      shingles: null, internalLinks: [], internalLinkCount: tier === 'thin' ? 1 : 8 + Math.floor(R() * 20),
      externalLinkCount: tier === 'strong' ? 4 : 1, nofollowCount: 0,
      images: tier === 'thin' ? [] : new Array(2 + Math.floor(R() * 4)).fill({ src: '/img.webp', alt: subject }),
      imgMissingAlt: 0, imgNoDims: tier === 'ordinary' ? 1 : 0,
      schemaTypes: tier === 'thin' ? [] : ['Service','BreadcrumbList'], hreflang: [],
      lang: 'en-GB', hasViewport: true,
      inlinks: tier === 'thin' ? 0 : 3 + Math.floor(R() * 18),
      clickDepth: Math.min(3, 1 + Math.floor(R() * 3)), notHtml: false
    };
  });
  return { at: Date.now(), origin: 'https://example.com', mode: 'sample',
           pages, sitemaps: ['https://example.com/sitemap.xml'], robots: null,
           stats: { requested: pages.length, ok: pages.filter(p => p.status === 200).length } };
}

/* ============================================================
   INIT
   ============================================================ */
(async function boot(){
  /* The app is alive. Removed here, at the start of boot, rather than at the
     top of the bundle: if an earlier file throws, the banner should STAY. */
  const nojs = document.getElementById('nojs');
  if (nojs) nojs.remove();

  populateCountries();
  numberStages();
  renderRef(); renderGates(); renderModules();
  await initProjects();
  renderMap(); renderReportPanel(); renderExportPanel();

  /* AI assist: settings and the stage. The key is read from the meta store,
     which is per-browser and never part of a project. */
  tierBind();
  await aiInit();

  /* The tier is applied AFTER everything has rendered, because it hides and
     relabels what those render functions just drew. A project that has never
     chosen inherits the install default. */
  if (CFG && CFG.simple == null) CFG.simple = await tierDefault();
  applyTier();

  detectMode().catch(()=>{});
})();

/* ============================================================
   SELF-HOSTED EXTRAS
   Only present in the standalone build. The published artifact
   takes its theme from the viewer's own setting instead.
   ============================================================ */
(function(){
  const KEY = 'sec.theme.v1';
  const root = document.documentElement;
  let mode = 'system';
  try { mode = localStorage.getItem(KEY) || 'system'; } catch(e){}

  const btn = document.createElement('button');
  btn.className = 'btn sm ghost';
  btn.id = 'btnTheme';
  btn.setAttribute('aria-label', 'Switch colour theme');
  btn.style.cssText = 'margin-top:10px;padding:3px 8px;font-size:11.5px';

  const LABEL = { system: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
  function apply(){
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    btn.textContent = LABEL[mode];
    try { localStorage.setItem(KEY, mode); } catch(e){}
  }
  btn.addEventListener('click', () => {
    mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    apply();
  });
  apply();

  /* The rail footer, not the top bar: a colour preference is not one of the
     two things you do on this screen, and in the top bar it was pushing "Load
     sample data" and "Run analysis" onto a second row at 1440px. */
  const foot = document.querySelector('.railfoot');
  if (foot) foot.appendChild(btn);
  else { const bar = document.querySelector('.topbar'); if (bar) bar.appendChild(btn); }
})();

/* ============================================================
   LICENCE MARKER — standalone build only
   This is a compliance marker, not a lock, and the distinction
   is the whole design.

   The file runs on the customer's machine. Any check it makes,
   the customer can edit out. So it does not gate a single
   feature, does not phone home, and does not pretend a client-
   side check is enforcement — it makes an unlicensed deployment
   visibly unlicensed to the staff and clients who open it, which
   is what actually matters to a business that could face a
   procurement question. AG Grid and Kendo sell licensed
   JavaScript that runs entirely in the browser and neither
   blocks; an invalid key produces a watermark and a console
   warning, and the product keeps working. Same here.

   The key format carries a checksum so a typo is caught and
   reported as a typo. That is all it is: SEC-<YEAR>-<8>-<2>,
   where the last two characters are derived from the rest. It is
   deliberately not cryptographic, and the licence text says so
   rather than implying a strength it does not have.
   ============================================================ */

const LIC_STORE = 'sec-licence';
const LIC_RE = /^SEC-(\d{4})-([A-Z0-9]{8})-([A-Z0-9]{2})$/;

/* A short, stable checksum over the body of the key. Catches mistyping, nothing
   more — anyone who wants to mint a key can read this function. */
function licChecksum(year, body){
  const s = 'SEC-' + year + '-' + body;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1
  return A[(h >>> 5) % A.length] + A[h % A.length];
}

function licParse(key){
  const k = String(key || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!k) return { state:'none' };
  const m = LIC_RE.exec(k);
  if (!m) return { state:'malformed', reason:'That is not a licence key. They look like SEC-2026-ABCD2345-KP.' };
  const [, year, body, sum] = m;
  if (licChecksum(year, body) !== sum)
    return { state:'typo', reason:'That key has a character wrong — the check digits do not match. Copy it again from your invoice.' };
  /* An annual licence covers the year it was issued and is not enforced past it.
     Expiry here is informational: it tells the operator to renew, and nothing else
     happens, because a tool that stops working on a date is a tool that loses
     someone their Monday. */
  const now = new Date().getUTCFullYear();
  return { state: (+year < now) ? 'lapsed' : 'valid', key:k, year:+year,
           reason: (+year < now) ? `This licence covers ${year}. It still works — renewal is a billing matter, not a switch.` : '' };
}

function licRead(){
  try { return licParse(localStorage.getItem(LIC_STORE)); }
  catch(e){ return { state:'none' }; }   // private mode, blocked storage
}
function licWrite(key){
  try { localStorage.setItem(LIC_STORE, String(key || '').trim().toUpperCase()); return true; }
  catch(e){ return false; }
}

let _licWarned = false;
function licApply(){
  const foot = document.querySelector('.railfoot');
  if (!foot) return;
  const lic = licRead();

  let host = document.getElementById('licMark');
  if (!host){
    host = document.createElement('div');
    host.id = 'licMark';
    host.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:10.5px;line-height:1.5';
    foot.appendChild(host);
  }

  if (lic.state === 'valid'){
    host.innerHTML = `<span class="mono" style="color:var(--ink-3)">Licensed · ${licEsc(lic.key)}</span>`;
    return;
  }

  if (!_licWarned){
    _licWarned = true;
    console.warn('[Search Evidence Suite] This copy is not licensed. It works in full; the marker in the sidebar says so. Licences: syed.ai');
  }

  const label = lic.state === 'lapsed' ? 'Licence lapsed' : 'Unlicensed copy';
  host.innerHTML = `
    <b style="display:block;color:var(--warn);font-weight:600">${label}</b>
    <span style="color:var(--ink-3)">${lic.reason ? licEsc(lic.reason) : 'Every feature works. This marker is here so an unlicensed deployment is visible to whoever opens it.'}</span>
    <button class="btn sm ghost" id="licBtn" style="margin-top:7px;padding:3px 7px;font-size:11px">Enter licence key</button>`;

  const btn = document.getElementById('licBtn');
  if (btn) btn.onclick = () => {
    const k = prompt('Licence key\n\nFrom your invoice. Looks like SEC-2026-ABCD2345-KP.', '');
    if (k == null) return;
    const parsed = licParse(k);
    if (parsed.state === 'valid' || parsed.state === 'lapsed'){
      if (licWrite(parsed.key)){
        if (typeof toast === 'function') toast(parsed.state === 'valid' ? 'Licence accepted' : 'Licence accepted — it covers ' + parsed.year);
      } else if (typeof toast === 'function') toast('This browser is blocking storage, so the key cannot be remembered.');
    } else if (typeof toast === 'function') toast(parsed.reason);
    licApply();
  };
}

function licEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

licApply();

