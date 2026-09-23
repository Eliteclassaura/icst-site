const query=new URLSearchParams(location.search).get('q')?.trim().slice(0,200)||''
const status=document.getElementById('release-search-status')
const input=document.getElementById('lux-query')
if(input)input.value=query
if(query&&status){
  status.textContent='Searching…'
  try{
    const pagefind=await import('/pagefind/pagefind.js')
    const result=await pagefind.search(query)
    status.textContent=`${result.results.length} results for “${query}”`
    const entries=await Promise.all(result.results.slice(0,100).map(item=>item.data()))
    const list=document.getElementById('release-search-results')
    for(const entry of entries){const item=document.createElement('li'),link=document.createElement('a'),description=document.createElement('p');link.href=entry.url;link.textContent=entry.meta.title||entry.url;description.textContent=entry.url;item.append(link,description);list?.append(item)}
  }catch{status.textContent='Search is temporarily unavailable. Please contact ICS for assistance.'}
}
