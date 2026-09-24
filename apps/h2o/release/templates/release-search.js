const query=new URLSearchParams(location.search).get('q')?.trim().slice(0,200)||''
const status=document.getElementById('release-search-status')
const input=document.getElementById('lux-query')
const list=document.getElementById('release-search-results')
const more=document.getElementById('release-search-more')
if(input)input.value=query
const words=value=>value.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]
const terms=words(query),slug=terms.join('-')
// Boost destination/title intent only within Pagefind matches; preserve its tie order.
const relevance=entry=>{
  const path=new URL(entry.url,location.origin).pathname.replace(/^\/+|\/+$/g,'')
  const title=words(entry.meta.title||'')
  return (slug&&path===slug?4:slug&&path.startsWith(slug+'-')?2+1/words(path).length:0)+(terms.length&&terms.every(t=>title.includes(t))?1:0)
}
// Only text and Pagefind's <mark> reach the DOM, never arbitrary indexed HTML.
function excerpt(entry){
  let html=entry.excerpt||''
  // Remove a clipped timestamp prefix, not article facts or indexed content.
  html=html.replace(/^\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*/i,'')
  if(/Related Products|Explore Part.*Explore Part/i.test(html))html=(entry.content||'').split(/Related Products/i)[0].slice(0,260)
  const parsed=new DOMParser().parseFromString(html,'text/html'),fragment=document.createDocumentFragment()
  function append(node,parent){for(const child of node.childNodes){if(child.nodeType===Node.TEXT_NODE)parent.append(document.createTextNode(child.textContent));else if(child.nodeName==='MARK'){const mark=document.createElement('mark');mark.textContent=child.textContent;parent.append(mark)}else append(child,parent)}}
  append(parsed.body,fragment);return fragment
}
if(query&&status&&list){
  status.textContent='Searching…';list.setAttribute('aria-busy','true')
  try{
    const pagefind=await import('/pagefind/pagefind.js')
    const result=await pagefind.search(query)
    const found=await Promise.all(result.results.map(item=>item.data()))
    const seen=new Set()
    const entries=found.filter(entry=>{const url=new URL(entry.url,location.origin);if(url.origin!==location.origin||seen.has(url.pathname))return false;seen.add(url.pathname);return true}).sort((a,b)=>relevance(b)-relevance(a))
    let shown=0
    function render(focus=false){
      const start=shown
      for(const entry of entries.slice(shown,shown+20)){
        const item=document.createElement('li'),heading=document.createElement('h2'),link=document.createElement('a'),description=document.createElement('p'),path=document.createElement('p')
        link.href=entry.url;link.textContent=entry.meta.title||new URL(entry.url,location.origin).pathname;heading.append(link)
        description.className='ics-search-excerpt';description.append(excerpt(entry))
        path.className='ics-search-path';path.textContent=decodeURI(new URL(entry.url,location.origin).pathname)
        item.append(heading,description,path);list.append(item)
      }
      shown=Math.min(entries.length,shown+20)
      status.textContent=`${entries.length} ${entries.length===1?'result':'results'} for “${query}”${shown<entries.length?` · Showing ${shown}`:''}`
      if(more){more.hidden=shown>=entries.length;more.textContent=`Show more results (${entries.length-shown} remaining)`}
      if(focus)list.children[start]?.querySelector('a')?.focus()
    }
    render();more?.addEventListener('click',()=>render(true))
    if(!entries.length){document.getElementById('release-search-empty').hidden=false;document.getElementById('release-search-empty-query').textContent=`No results for “${query}”.`}
  }catch{status.textContent='Search is temporarily unavailable. Please retry or browse the site sections.'}
  finally{list.setAttribute('aria-busy','false')}
}
