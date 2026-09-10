import type { ReactNode } from 'react'
import './section-head.css'

/** Eyebrow label + heading + optional lede. The heading level is the caller's decision (document outline). */
export function SectionHead({
  eyebrow,
  title,
  lede,
  level = 2,
  id,
  align = 'start',
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  level?: 2 | 3
  id?: string
  align?: 'start' | 'center'
}) {
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <div className={`blk-head${align === 'center' ? ' blk-head--center' : ''}`}>
      {eyebrow && <span className="t-label blk-head__eyebrow">{eyebrow}</span>}
      <H className={level === 2 ? 't-d3' : 't-h3'} id={id}>
        {title}
      </H>
      {lede && <p className="blk-head__lede">{lede}</p>}
    </div>
  )
}
