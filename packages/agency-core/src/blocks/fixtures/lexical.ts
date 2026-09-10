import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

type Inline = string | { bold: string } | { link: string; href: string }

const text = (t: string, format = 0) => ({
  type: 'text',
  version: 1,
  text: t,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
})

const inline = (parts: Inline[]) =>
  parts.map((p) =>
    typeof p === 'string'
      ? text(p)
      : 'bold' in p
        ? text(p.bold, 1)
        : {
            type: 'link',
            version: 3,
            direction: 'ltr',
            format: '',
            indent: 0,
            fields: { linkType: 'custom', url: p.href, newTab: false },
            children: [text(p.link)],
          },
  )

const block = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  type,
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
  ...extra,
})

/** Minimal Lexical document builder for fixtures and seeds: paragraphs, h2/h3, bullet lists. */
export function lexical(
  nodes: Array<{ p: Inline[] } | { h2: string } | { h3: string } | { ul: Inline[][] }>,
): SerializedEditorState {
  const children = nodes.map((n) => {
    if ('p' in n) return block('paragraph', inline(n.p), { textFormat: 0, textStyle: '' })
    if ('h2' in n) return block('heading', [text(n.h2)], { tag: 'h2' })
    if ('h3' in n) return block('heading', [text(n.h3)], { tag: 'h3' })
    return block(
      'list',
      n.ul.map((li, i) => block('listitem', inline(li), { value: i + 1 })),
      { listType: 'bullet', start: 1, tag: 'ul' },
    )
  })
  return {
    root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children },
  } as unknown as SerializedEditorState
}
