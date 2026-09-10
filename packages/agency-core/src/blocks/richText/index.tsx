import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './rich-text.css'

export type RichTextProps = {
  body: SerializedEditorState
  /** `prose` = reading measure (default) · `wide` = two columns on wide screens · `full` = container width */
  measure?: 'prose' | 'wide' | 'full'
}

export function RichTextBlock({ body, measure = 'prose' }: RichTextProps) {
  return (
    <div className={`blk-rich-text blk-rich-text--${measure} prose`}>
      <RichText data={body} />
    </div>
  )
}

export const richText = defineBlock<RichTextProps>({
  slug: 'richText',
  label: 'Rich text',
  kind: 'layout',
  Component: RichTextBlock,
  a11y: [
    'Heading levels come from the editor; the restricted editor allows h2–h4 only so the page keeps one h1.',
    'Links are real <a> elements with visible underline on hover and 3:1 contrast against body text.',
    'Reading measure is capped at --measure (≈65ch) so lines stay readable at every viewport.',
  ],
  fixtures,
})
