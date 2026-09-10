/**
 * @factory/no-hex-in-components
 * Components must consume design tokens (CSS custom properties), never raw colours.
 * Flags hex colours (#abc, #aabbcc, #aabbccdd), rgb()/rgba()/hsl()/hsla() literals in
 * strings and template literals inside files matched by the config (blocks/components).
 * Fixtures, tests and the design-contract compiler (which legitimately emits hex) are excluded via config.
 */
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/
const FUNC = /\b(?:rgba?|hsla?)\(/
const ALLOW_COMMENT = /token-exception:/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw colour literals in components; use design tokens (var(--c-*)).' },
    schema: [],
    messages: {
      raw: 'Raw colour "{{value}}" in a component. Use a design token (var(--c-…)). Add "// token-exception: <why>" on the line to override.',
    },
  },
  create(context) {
    const src = context.sourceCode
    const check = (node, text) => {
      if (!(HEX.test(text) || FUNC.test(text))) return
      const line = src.lines[node.loc.start.line - 1] || ''
      if (ALLOW_COMMENT.test(line)) return
      const m = text.match(HEX) || text.match(FUNC)
      context.report({ node, messageId: 'raw', data: { value: m ? m[0] : text.slice(0, 20) } })
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value.raw)
      },
    }
  },
}
