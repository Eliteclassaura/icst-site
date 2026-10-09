import {pageFaq} from './page-faq'

/** DD country-page review M4: the restored "Frequently Asked Questions" section (questions as native disclosure controls, answers in full text). */
export function PageFaq({path}:{path:string}){
  const faq=pageFaq(path)
  if(!faq)return null
  return <section className="dr4-section page-faq" aria-labelledby="page-faq-title">
    <h2 className="dr4-h2" id="page-faq-title">{faq.heading}</h2>
    <div className="page-faq-list">{faq.items.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
  </section>
}
