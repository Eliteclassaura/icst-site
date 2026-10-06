import {readFileSync} from 'node:fs'
import path from 'node:path'

/**
 * Design Fixes R2 (Control Tower 2026-10-05; design audit R1 #7): the hero's primary action on the legacy service pages is
 * the quote action. Which routes, and the label, are data (content/design/hero-actions.json), so an OGCS wording change is
 * a data change only. `sourceLabel` names the source action it replaces on a source-rendered page (/cooling-tower/); without
 * it the renderer's hero signal is the action (the key-addressed luxury pages).
 */
export type HeroAction={label:string;sourceLabel?:string}
type Authority={routes:Record<string,HeroAction>}
let cache:Authority|undefined
const authority=():Authority=>cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/hero-actions.json'),'utf8')) as Authority
export const heroActionFor=(routePath:string):HeroAction|undefined=>authority().routes[routePath]
