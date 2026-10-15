/**
 * 1.3a-C4: the one-line preview of what the customer asked for, shown under the company and contact in the RFQ inbox so a
 * salesperson can triage by the request itself. Plain text only (the page renders it as text, so nothing in it can act as markup);
 * runs of whitespace and line breaks become one space; control and zero-width characters are dropped; at most `max` characters
 * (counted as characters, never splitting a surrogate pair), with an ellipsis when it was cut. Nothing to show gives null.
 */
export const PREVIEW_MAX = 120

export function requestPreview(text: unknown, max: number = PREVIEW_MAX): string | null {
  if (typeof text !== 'string') return null
  const flat = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  const chars = Array.from(flat)
  if (chars.length <= max) return flat
  return `${chars.slice(0, max).join('').trimEnd()}…`
}
