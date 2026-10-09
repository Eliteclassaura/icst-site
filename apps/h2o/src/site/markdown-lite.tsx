import {pdfLinkProps} from './link-attrs'
import {Fragment,type ReactNode} from 'react'

/**
 * A small Markdown renderer for the legal texts (LEGAL-1): ATX headings, paragraphs, nested "- " lists, pipe tables and the
 * inline forms **bold**, `code` and [text](/path). It renders exactly what is written (no HTML pass-through, no autolinking),
 * so the copy on the page is the copy OGCS supplied. Server-rendered: no script.
 */
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

/** A monospace name may wrap only after a dot ("h2o.rfq.draft.v1" never splits inside "v1"): a word-break opportunity follows each dot. */
const breakAfterDots = (text: string, key: string): ReactNode[] =>
  text.split('.').flatMap((part, i, all) => (i < all.length - 1 ? [`${part}.`, <wbr key={`${key}.w${i}`} />] : [part]))

export function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const from = m.index!
    if (from > last) out.push(text.slice(last, from))
    if (m[1] !== undefined) out.push(<strong key={`${key}.${n++}`}>{inline(m[1], `${key}.${n}`)}</strong>)
    else if (m[2] !== undefined) out.push(<code key={`${key}.${n++}`}>{breakAfterDots(m[2], `${key}.${n}`)}</code>)
    else out.push(<a key={`${key}.${n++}`} href={m[4]!} {...pdfLinkProps(m[4])}>{m[3]}</a>)
    last = from + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const isTable = (line: string) => line.trimStart().startsWith('|')
const isRule = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
const listItem = (line: string) => /^(\s*)- (.*)$/.exec(line)

type Item = { text: string; children: Item[] }

function buildList(lines: string[]): Item[] {
  const root: Item[] = []
  const stack: Array<{ indent: number; items: Item[] }> = [{ indent: 0, items: root }]
  for (const line of lines) {
    const m = listItem(line)!
    const indent = m[1]!.length
    const item: Item = { text: m[2]!, children: [] }
    while (stack.length > 1 && indent < stack[stack.length - 1]!.indent) stack.pop()
    const top = stack[stack.length - 1]!
    const parent = top.items[top.items.length - 1]
    if (indent > top.indent && parent) {
      parent.children.push(item)
      stack.push({ indent, items: parent.children })
    } else top.items.push(item)
  }
  return root
}

function renderItems(items: Item[], key: string): ReactNode {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${key}.${i}`}>
          {inline(item.text, `${key}.${i}`)}
          {item.children.length ? renderItems(item.children, `${key}.${i}`) : null}
        </li>
      ))}
    </ul>
  )
}

export function markdownBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let n = 0
  let lastHeading = ''
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const text = heading[2]!.trim()
      lastHeading = text
      const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3'
      out.push(<Tag key={`b${n++}`} id={level > 1 ? slug(text) : undefined}>{inline(text, `h${n}`)}</Tag>)
      i++
      continue
    }
    if (isTable(line) && i + 1 < lines.length && isRule(lines[i + 1]!)) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTable(lines[i]!)) rows.push(cells(lines[i++]!))
      out.push(
        <div className="legal-table" key={`b${n++}`} role="region" aria-label={`${lastHeading || 'Details'}, table`} tabIndex={0}>
          <table>
            <thead>
              <tr>{head.map((c, k) => <th scope="col" key={k}>{inline(c, `th${n}.${k}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{row.map((c, k) => (k === 0 ? <th scope="row" key={k}>{inline(c, `r${n}.${r}.${k}`)}</th> : <td key={k} data-label={head[k]}>{inline(c, `r${n}.${r}.${k}`)}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (listItem(line)) {
      const block: string[] = []
      while (i < lines.length && listItem(lines[i]!)) block.push(lines[i++]!)
      out.push(<Fragment key={`b${n++}`}>{renderItems(buildList(block), `l${n}`)}</Fragment>)
      continue
    }
    // paragraph: consecutive plain lines, ended by a blank line or the start of a list, table or heading
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !listItem(lines[i]!) && !/^#{1,3} /.test(lines[i]!) && !isTable(lines[i]!)) para.push(lines[i++]!.trim())
    out.push(<p key={`b${n++}`}>{inline(para.join(' '), `p${n}`)}</p>)
  }
  return out
}
