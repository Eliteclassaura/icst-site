/**
 * LANG-2.2: how much of the translation feature a request gets.
 *  - `full`:      on-device Translator first, then the in-page Google widget, then the new-tab link;
 *  - `no-google`: on-device first, then the new-tab link only (the in-page Google widget and its CSP additions are off);
 *  - `links`:     plain new-tab links only (a signed-in staff member: no widget, no on-device pass in the editing session).
 * `H2O_TRANSLATE_GOOGLE_WIDGET=off` (unset = on) is the launch safety switch for the Google widget. The static/repository build
 * serves a hash-based policy with no 'strict-dynamic', where an injected script cannot run, so it never offers the widget.
 */
export type TranslateMode='full'|'no-google'|'links'

export const googleWidgetEnabled=(env:Record<string,string|undefined>=process.env):boolean=>(env.H2O_TRANSLATE_GOOGLE_WIDGET??'').trim().toLowerCase()!=='off'

export function translateModeFor(input:{staff:boolean;payloadContent:boolean;env?:Record<string,string|undefined>}):TranslateMode{
  if(input.staff)return 'links'
  if(!input.payloadContent||!googleWidgetEnabled(input.env))return 'no-google'
  return 'full'
}
