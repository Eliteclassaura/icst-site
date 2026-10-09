/**
 * HOME-HERO-1 (post-launch, owner request): the home hero's right-hand image (the b1edced CSS background; the Figma node 51 layout is not what renders) is the live site's main slider photo
 * (a cooling tower with three round fan stacks), from the true corpus original, never upscaled. Alt wording comes from OGCS.
 */
import {describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'

const APP=process.cwd()
const ledger=JSON.parse(readFileSync(path.join(APP,'content/design/home-hero-1.json'),'utf8')) as {original:{width:number;height:number;sha256:string};delivered:{src:string;sha256:string;width:number;height:number;derivative:string};alt:string;slot:{previous:{src:string;sha256:string}}}

describe('HOME-HERO-1',()=>{
  it('the delivered file is the recorded downscale of the true original (never upscaled, 4:3 kept)',()=>{
    const bytes=readFileSync(path.join(APP,'public',ledger.delivered.src))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ledger.delivered.sha256)
    expect(ledger.delivered.width).toBeLessThanOrEqual(ledger.original.width)
    expect(ledger.delivered.height).toBeLessThanOrEqual(ledger.original.height)
    expect(ledger.delivered.width/ledger.delivered.height).toBeCloseTo(ledger.original.width/ledger.original.height,3)
    const webp=readFileSync(path.join(APP,'public',ledger.delivered.derivative))
    expect(createHash('sha256').update(webp).digest('hex')).toBe(ledger.delivered.derivative.match(/([0-9a-f]{64})\.webp$/)![1])
  })
  it('the home hero right-hand panel (Elementor container b1edced, a CSS background) uses the new cooling-tower derivative, not the steel construction site',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/salmon-parity.css'),'utf8')
    const rule=css.match(/elementor-element-b1edced:not\(\.elementor-motion-effects-element-type-background\)[^{]*\{([^}]*)\}/)![1]!
    expect(rule).toContain(`background-image:url("${ledger.delivered.derivative}")`)
    expect(rule).toContain('background-size:cover')
    expect(css).not.toContain(ledger.slot.previous.sha256)
  })
  it('the panel is decorative (CSS background): no alt text is involved, and the ledger records the OGCS-neutral description for any future <img>',()=>{
    expect(ledger.alt).toBe('Aerial view of a cooling tower with three large round fan stacks beside a construction site')
    expect(ledger.alt).not.toMatch(/Yonago|Japan|HVAC/i)
    expect(JSON.stringify(ledger)).not.toMatch(/Yonago|Japan/i) // owner: no place or project name anywhere
  })
})
