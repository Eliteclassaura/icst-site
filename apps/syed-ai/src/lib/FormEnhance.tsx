/**
 * Progressive enhancement for the brief form (C6). Without it the native POST still works (the route
 * answers with a redirect to /thanks/). With it: the dwell timer is set, the form posts with fetch,
 * the status line updates in place, and a typo suggestion becomes one click. Nonced inline script —
 * the CSP forbids anything else, and this keeps the public bundle free of a client framework.
 */
import { headers } from 'next/headers'

export async function FormEnhance() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const js = `(function(){var f=document.querySelector('form.blk-brief__form');if(!f)return;var t0=f.querySelector('[data-dwell]');if(t0)t0.value=String(Date.now());var st=f.querySelector('.blk-brief__status');function say(k,m){if(!st)return;st.textContent=m;st.setAttribute('data-kind',k);}f.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(f);fd.set('page',location.pathname);fd.set('referrer',document.referrer||'');fd.set('screen',screen.width+'x'+screen.height);fd.set('language',navigator.language||'');try{fd.set('timezone',Intl.DateTimeFormat().resolvedOptions().timeZone||'')}catch(_){}var q=new URLSearchParams(location.search);q.forEach(function(v,k){if(k.indexOf('utm_')===0)fd.set('utm['+k+']',v)});var b=f.querySelector('button[type=submit]');if(b)b.disabled=true;say('','Sending…');fetch(f.action,{method:'POST',body:fd,headers:{'Accept':'application/json'},credentials:'same-origin'}).then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})}).then(function(x){var j=x.j||{};if(j.ok){f.reset();if(t0)t0.value=String(Date.now());say('ok',j.message||'Thanks — your brief is in. Replies come from a real person within two working days.');}else{say('error',j.message||'Something went wrong. Please try again.');if(j.suggestion){var em=f.querySelector('[name=email]');if(em){em.value=j.suggestion;}var ok=document.createElement('input');ok.type='hidden';ok.name='email_ok';ok.value='1';f.appendChild(ok);}}}).catch(function(){say('error','Network problem — please try again.')}).then(function(){if(b)b.disabled=false;});});})();`
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: js }} />
}
