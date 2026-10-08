import {runOnDevice,restoreOnDevice,translateStatus,type DeviceEnv} from './translate-device'
import {restoreEnglish,translateInPlace,type TranslateOptions} from './translate-widget'
import type {TranslateMode} from './translate-switch'

/**
 * LANG-2.1/2.2: what a visitor's choice of language does, in order (owner decision 2026-10-08):
 *   1. the browser's own Translator (on this device: no Google request, no cookie), where it supports the pair;
 *   2. otherwise the opt-in Google Translate widget (translate-widget.ts), which sets the googtrans cookie, but only in `full` mode
 *      (`H2O_TRANSLATE_GOOGLE_WIDGET` not off, Payload runtime, not a staff session);
 *   3. otherwise the new-tab Google Translate link.
 * "English" puts the original back: from memory on the device path, by clearing the cookie and reloading on the Google path.
 */
export type TranslatePageOptions=TranslateOptions&{deviceEnv?:DeviceEnv;mode?:TranslateMode}

const openLink=(options:TranslatePageOptions)=>{
  const win=(options.env??{win:window}).win
  if(!win.open(options.fallbackHref,'_blank','noopener'))win.location.assign(options.fallbackHref)
}

export async function translatePage(options:TranslatePageOptions):Promise<'device'|'google'|'link'>{
  const env=(options.env??{doc:document,win:window}) as DeviceEnv
  const {to,from='en'}=options
  const mode=options.mode??'full'
  if(mode==='links'){openLink(options);return 'link'}
  const state=translateStatus(env.doc)
  // A page already translated by the Google widget keeps using it (it cannot be mixed with an on-device pass).
  if(!state||state.split('|')[1]==='device'){
    if(await runOnDevice(to,from,options.deviceEnv??env))return 'device'
  }
  if(mode==='no-google'){openLink(options);return 'link'}
  translateInPlace(options)
  return 'google'
}

export function restorePage(env:DeviceEnv=({doc:document,win:window}) as DeviceEnv):void{
  const state=translateStatus(env.doc)
  if(state&&state.split('|')[1]==='device')restoreOnDevice(env.doc)
  else restoreEnglish(env)
}
