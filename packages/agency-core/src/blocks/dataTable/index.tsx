import { defineBlock } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import { fixtures } from './fixture'
import './data-table.css'

export type DataTableProps = {
  eyebrow?: string
  title?: string
  lede?: string
  /** Visible caption (also the accessible name). */
  caption: string
  /** First column header; empty string renders a blank corner cell. */
  rowHeader: string
  columns: string[]
  rows: Array<{ label: string; cells: string[] }>
  /** `compare` = last column emphasised (GEO vs SEO) · `price` = first row is the price row with `num` styling · `plain` */
  variant?: 'compare' | 'price' | 'plain'
  footnote?: string
}

/** Real <table> with row/column headers; scrolls inside its own focusable region on narrow screens. Cell text may contain no HTML. */
export function DataTableBlock({
  eyebrow,
  title,
  lede,
  caption,
  rowHeader,
  columns,
  rows,
  variant = 'plain',
  footnote,
}: DataTableProps) {
  return (
    <div className="blk-table">
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, rows.length)}
          lede={withCount(lede, rows.length)}
        />
      )}
      <div className="ds-tbl-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className={`ds-tbl blk-table__tbl blk-table__tbl--${variant}`}>
          <caption>{withCount(caption, rows.length)}</caption>
          <thead>
            <tr>
              <th scope="col">{rowHeader || <span className="visually-hidden">Row</span>}</th>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label + i}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, j) => (
                  <td key={j} className={variant === 'price' && i === 0 ? 'blk-table__price' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote && <p className="blk-table__foot">{footnote}</p>}
    </div>
  )
}

export const dataTable = defineBlock<DataTableProps>({
  slug: 'dataTable',
  label: 'Data table',
  kind: 'layout',
  Component: DataTableBlock,
  a11y: [
    'A real <table> with <caption>, column headers (scope=col) and row headers (scope=row); no layout tables, no divs pretending. An empty corner cell gets visually-hidden text (axe empty-table-header — the legacy &nbsp; failed this).',
    'The scroll wrapper is a named, focusable region so keyboard users can scroll it on narrow screens.',
    'Emphasis in the compare variant is weight and colour together, never colour alone.',
  ],
  fixtures,
})
