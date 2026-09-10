import type { CtaPair, ImageRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { Picture } from '../shared/Picture'
import { Actions } from '../shared/Actions'
import './cta.css'

export type CtaProps = {
  eyebrow?: string
  title: string
  text?: string
  cta: CtaPair
  image?: ImageRef
}

export function CtaBlock({ eyebrow, title, text, cta, image }: CtaProps) {
  return (
    <section className="blk-cta" aria-label={eyebrow ?? 'Next step'}>
      {image && (
        <div className="blk-cta__media">
          <Picture image={{ ...image, decorative: true }} sizes="100vw" />
        </div>
      )}
      <div className="blk-cta__in">
        {eyebrow && <span className="t-label blk-cta__eyebrow">{eyebrow}</span>}
        <h2 className="t-d3 blk-cta__title">{title}</h2>
        {text && <p className="blk-cta__text">{text}</p>}
        <Actions cta={cta} center />
      </div>
    </section>
  )
}

export const cta = defineBlock<CtaProps>({
  slug: 'cta',
  label: 'Call to action',
  kind: 'layout',
  Component: CtaBlock,
  a11y: [
    'The background image is decorative (alt="") — the message is the text.',
    'Image sits at 32 % opacity under a surface, so text-on-surface contrast holds; the compile-time report covers the pair.',
    'Actions are links; the roadmap variant (Release 2) becomes a button only when it opens the chat.',
  ],
  fixtures,
})
