/**
 * A hidden line prompt: no echo while typing (the terminal is put in raw mode when it can be), Backspace edits, Enter submits,
 * Ctrl-C and Ctrl-D abort. The typed text is returned to the caller and written nowhere. `input` and `output` are injected so a test can
 * drive it with plain streams; a real terminal passes `process.stdin` and `process.stdout`.
 */
type In = { isTTY?: boolean; setRawMode?: (on: boolean) => unknown; resume: () => unknown; pause: () => unknown; setEncoding?: (e: BufferEncoding) => unknown; on: (ev: 'data', cb: (chunk: string | Buffer) => void) => unknown; off: (ev: 'data', cb: (chunk: string | Buffer) => void) => unknown }
type Out = { write: (s: string) => unknown }
export function readHidden(input: In, output: Out, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = ''
    // raw mode (no echo) is switched on BEFORE the prompt is shown: anything typed or pasted the instant the prompt appears is never echoed
    if (input.isTTY) input.setRawMode?.(true)
    output.write(prompt)
    input.setEncoding?.('utf8')
    input.resume()
    const done = (end: () => void) => {
      input.off('data', onData)
      if (input.isTTY) input.setRawMode?.(false)
      input.pause()
      output.write('\n')
      end()
    }
    const onData = (chunk: string | Buffer) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') return done(() => resolve(value))
        if (ch === '\u0003' || ch === '\u0004') return done(() => reject(new Error('aborted')))
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else if (ch >= ' ') value += ch
      }
    }
    input.on('data', onData)
  })
}
