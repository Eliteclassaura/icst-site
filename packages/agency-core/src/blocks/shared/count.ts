/**
 * Counts in copy are derived, never typed (ADR-023 §7). Authors write `{{count}}` in a title or lede and
 * the block substitutes the real number of items at render — "{{count}} moves, in order." → "Five moves, in order."
 * Legacy headings that hard-coded numbers (and drifted: "Six builds" vs seven) become impossible to get wrong.
 */
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
]

export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? (WORDS[n] as string) : String(n)
}

export function withCount<T extends string | undefined>(text: T, n: number): T {
  if (!text || !text.includes('{{count}}')) return text
  const word = numberWord(n)
  let out = text.replace(/\{\{count\}\}/g, word)
  // Capitalise when the placeholder opened the sentence.
  if (text.startsWith('{{count}}')) out = out.charAt(0).toUpperCase() + out.slice(1)
  return out as T
}
