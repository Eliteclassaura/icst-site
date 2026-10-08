import {runOnDevice,restoreOnDevice,translateStatus,type DeviceEnv} from './translate-device'
import {restoreEnglish,translateInPlace,type TranslateOptions} from './translate-widget'

/**
 * LANG-2.1: what a visitor's choice of language does, in order (owner decision 2026-10-08):
 *   1. the browser's own Translator (on this device: no Google request, no cookie), where it supports the pair;
 *   2. otherwise the opt-in Google Translate widget (translate-widget.ts), which sets the googtrans cookie;
 *   3. if that fails too, the new-tab Google Translate link.
 * "English" puts the original back: from memory on the device path, by clearing the cookie and reloading on the Google path.
 */
export type TranslatePageOptions=TranslateOptions&{deviceEnv?:DeviceEnv}

export async function translatePage(options:TranslatePageOptions):Promise<'device'|'google'>{
  const env=(options.env??{doc:document,win:window}) as DeviceEnv
  const {to,from='en'}=options
  const state=translateStatus(env.doc)
  // A page already translated by the Google widget keeps using it (it cannot be mixed with an on-device pass).
  if(!state||state.split('|')[1]==='device'){
    if(await runOnDevice(to,from,options.deviceEnv??env))return 'device'
  }
  translateInPlace(options)
  return 'google'
}

export function restorePage(env:DeviceEnv=({doc:document,win:window}) as DeviceEnv):void{
  const state=translateStatus(env.doc)
  if(state&&state.split('|')[1]==='device')restoreOnDevice(env.doc)
  else restoreEnglish(env)
}
