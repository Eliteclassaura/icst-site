import {Fragment,type ReactNode} from 'react'
import {decodeEntities} from './text-repair'

/**
 * QUICK-WINS-1 (CT 2026-10-08): raw markup that leaked into article text.
 *
 * 1. LaTeX (and its backslash-stripped copy: "$10^circtext{F}$", "frac{..}{..}", "times") renders as plain HTML: ×, ±, °, Δ, ·, ≈,
 *    <sup>, <sub> and a stacked fraction. No script and no library; the scanner below covers exactly the commands the
 *    published articles use. Dollar signs are only treated as math delimiters when the span between them is unmistakably
 *    a formula (see `inlineMath`), so prices ("$5 and $10", "$65,000 for a small unit … more than $") are left alone.
 * 2. WPBakery / WordPress shortcodes ("[vc_row]", "[/vc_column_text]", "[caption …]") are removed from visible text.
 */

const SHORTCODE = /\[\/?(?:vc_[a-z0-9_]+|caption|gallery|embed|audio|video)\b[^\]]*\]/gi
/** Visible text without WPBakery/WordPress shortcodes (their inner text stays). */
export const stripShortcodes = (text: string): string => (text.includes('[') ? text.replace(SHORTCODE, ' ').replace(/ {2,}/g, ' ') : text)

/** The `title` of an accordion/tab/toggle shortcode: straight or curly quotes, as WPBakery content arrives. */
const SHORTCODE_TITLE = /\btitle\s*=\s*(?:"([^"]*)"|[”“]([^”“]*)[”“])/i
const TITLED = /^\[(?:vc_tta_section|vc_tab|vc_toggle|vc_accordion_tab|vc_tta_[a-z_]+|vc_[a-z_]*(?:tab|toggle|accordion)[a-z_]*)\b/i
/**
 * Shortcodes → nodes without losing content (CT 2026-10-08): an accordion, tab or toggle section keeps its title as a level-3
 * heading ahead of its text (a span with role="heading", so it is valid wherever the text sits); every other shortcode is dropped
 * and `[caption]` keeps only its inner text. Null when the text has no shortcode.
 */
export function shortcodeNodes(text: string, key: string, wrap: (plain: string, k: string) => ReactNode = (plain) => plain): ReactNode[] | null {
  if (!text.includes('[')) return null
  const out: ReactNode[] = []
  let last = 0
  let found = false
  let n = 0
  for (const m of text.matchAll(SHORTCODE)) {
    found = true
    const from = m.index!
    if (from > last) out.push(wrap(text.slice(last, from).replace(/ {2,}/g, ' '), `${key}.${n}`))
    last = from + m[0].length
    if (TITLED.test(m[0])) {
      const title = decodeEntities((SHORTCODE_TITLE.exec(m[0])?.slice(1).find((x) => x !== undefined) ?? '').trim())
      if (title) {
        out.push(
          <span className="shortcode-title" role="heading" aria-level={3} key={`${key}.${n++}`}>
            {title}
          </span>,
        )
      }
    }
  }
  if (!found) return null
  if (last < text.length) out.push(wrap(text.slice(last).replace(/ {2,}/g, ' '), `${key}.${n}`))
  return out
}

const WORD = /^(\\)?(frac|text|circtext|times|cdot|pm|approx|Delta|circ|left|right)(?![A-Za-z])/
const VOCABULARY = /\\?(?:frac|text|circtext|times|cdot|pm|approx|Delta|circ|left|right)(?![A-Za-z])/g
/** The backslash-less forms that appear without dollar signs: "10^circtext{F}", "frac{E}{…}", "text{CoC}". */
const BRACED_COMMAND = /\^circ(?:text)?\{|(?<![A-Za-z])(?:frac|text|circtext)\{/
const BACKSLASH_COMMAND = /\\(?:times|frac|text|circ|left|right|pm|cdot|approx|Delta)(?![A-Za-z])|\\%/

const SYMBOL: Record<string, string> = { times: '×', cdot: '·', pm: '±', approx: '≈', Delta: 'Δ', circ: '°' }

/** The `{…}` group starting at `from` (balanced), with the index after it. */
function group(src: string, from: number): [string, number] | null {
  if (src[from] !== '{') return null
  let depth = 0
  for (let j = from; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') {
      depth--
      if (depth === 0) return [src.slice(from + 1, j), j + 1]
    }
  }
  return null
}

/**
 * LaTeX subset → React nodes. `loose` also reads the commands written without their backslash ("times", "frac{a}{b}",
 * "circtext{F}"), which is how several article sources arrived; it is only used inside delimited math.
 */
export function texNodes(src: string, loose: boolean | 'braced', key = 'm'): ReactNode[] {
  const out: ReactNode[] = []
  let buf = ''
  let n = 0
  const flush = () => {
    if (buf) {
      out.push(buf)
      buf = ''
    }
  }
  const push = (node: ReactNode) => {
    flush()
    out.push(node)
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const word = WORD.exec(rest)
    // `loose === true`: delimited math, where the bare words are commands. `'braced'`: undelimited text, where only the bare
    // commands that take a brace group ("frac{…}{…}", "text{…}") are read, so ordinary words are never touched.
    const bare = !(i > 0 && /[A-Za-z]/.test(src[i - 1]!)) && (loose === true || (loose === 'braced' && src[i + (word?.[0].length ?? 0)] === '{'))
    if (word && (word[1] || bare)) {
      const name = word[2]!
      i += word[0].length
      if (name === 'frac') {
        const a = group(src, i)
        const b = a ? group(src, a[1]) : null
        if (a && b) {
          push(
            <span className="math-frac" key={`${key}${n++}`}>
              <span className="math-num">{texNodes(a[0], loose, `${key}${n}n`)}</span>
              <span className="math-den">{texNodes(b[0], loose, `${key}${n}d`)}</span>
            </span>,
          )
          i = b[1]
          continue
        }
      } else if (name === 'text' || name === 'circtext') {
        const g = group(src, i)
        if (name === 'circtext') buf += '°'
        if (g) {
          buf += g[0]
          i = g[1]
        }
        continue
      } else if (name === 'left' || name === 'right') {
        continue // the bracket that follows is kept as is
      } else {
        buf += SYMBOL[name] ?? ''
        continue
      }
      buf += word[0]
      continue
    }
    const ch = src[i]!
    if (ch === '\\') {
      const next = src[i + 1]
      if (next === '%' || next === '$' || next === '&') {
        buf += next
        i += 2
        continue
      }
      if (next !== undefined && /[,;: ]/.test(next)) {
        buf += ' '
        i += 2
        continue
      }
    }
    if (ch === '^') {
      // "^\circ" and "^circ" are the degree sign, not an exponent
      const degree = /^\^(\\)?circ(?:text)?(?![A-Za-z])/.exec(rest)
      if (degree && (degree[1] || loose === true || (loose === 'braced' && src[i + degree[0].length] === '{'))) {
        buf += '°'
        i += degree[0].length
        continue
      }
      const g = group(src, i + 1)
      const single = /^[A-Za-z0-9+\-−]/.exec(src.slice(i + 1))
      if (g) {
        push(<sup key={`${key}${n++}`}>{texNodes(g[0], loose, `${key}${n}s`)}</sup>)
        i = g[1]
        continue
      }
      if (single) {
        push(<sup key={`${key}${n++}`}>{single[0]}</sup>)
        i += 2
        continue
      }
    }
    if (ch === '_' && i > 0 && /[A-Za-z0-9)]/.test(src[i - 1]!)) {
      const g = group(src, i + 1)
      const single = /^[A-Za-z0-9]/.exec(src.slice(i + 1))
      if (g) {
        push(<sub key={`${key}${n++}`}>{texNodes(g[0], loose, `${key}${n}b`)}</sub>)
        i = g[1]
        continue
      }
      if (single) {
        push(<sub key={`${key}${n++}`}>{single[0]}</sub>)
        i += 2
        continue
      }
    }
    if (ch === '{' || ch === '}') {
      i++ // stray TeX grouping braces
      continue
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** Is the text between two single dollar signs a formula (and not two prices)? */
export function inlineMath(span: string): boolean {
  if (span.length === 0 || span.length > 120 || /\n/.test(span) || /^\s|\s$/.test(span)) return false
  return !/[A-Za-z]{3,}/.test(span.replace(VOCABULARY, ''))
}

const INLINE = /(?<![\w$])\$(?=\S)([^$\n]{1,120}?)(?<=\S)\$(?![\w$\d])/g
const DISPLAY = /\$\$([\s\S]{1,300}?)\$\$/g

/**
 * Text with math → nodes, or null when the string holds none (the common case, decided without allocating).
 * `$$…$$` is display math, `$…$` inline math (formulas only), and a string with backslash commands but no dollar signs
 * is read as a formula run in place.
 */
export function mathNodes(text: string, key: string): ReactNode[] | null {
  const hasDollar = text.includes('$')
  const hasCommand = (text.includes('\\') && BACKSLASH_COMMAND.test(text)) || BRACED_COMMAND.test(text)
  if (!hasDollar && !hasCommand) return null
  type Part = { text: string } | { math: string; display: boolean }
  const parts: Part[] = []
  let last = 0
  const spans: Array<{ from: number; to: number; math: string; display: boolean }> = []
  for (const m of text.matchAll(DISPLAY)) spans.push({ from: m.index!, to: m.index! + m[0].length, math: m[1]!, display: true })
  for (const m of text.matchAll(INLINE)) {
    const from = m.index!
    const to = from + m[0].length
    if (!inlineMath(m[1]!) || spans.some((s) => from < s.to && to > s.from)) continue
    spans.push({ from, to, math: m[1]!, display: false })
  }
  spans.sort((a, b) => a.from - b.from)
  for (const s of spans) {
    if (s.from > last) parts.push({ text: text.slice(last, s.from) })
    parts.push({ math: s.math, display: s.display })
    last = s.to
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  if (!spans.length && !hasCommand) return null
  return parts.map((part, idx) => {
    if ('math' in part) {
      return (
        <span className={part.display ? 'math math--display' : 'math'} key={`${key}.${idx}`}>
          {texNodes(part.math, true, `${key}.${idx}`)}
        </span>
      )
    }
    // plain stretches that carry backslash commands (the formula was never wrapped in dollar signs)
    return BACKSLASH_COMMAND.test(part.text) || BRACED_COMMAND.test(part.text) ? (
      <span className="math" key={`${key}.${idx}`}>
        {texNodes(part.text, 'braced', `${key}.${idx}`)}
      </span>
    ) : (
      <Fragment key={`${key}.${idx}`}>{part.text}</Fragment>
    )
  })
}
