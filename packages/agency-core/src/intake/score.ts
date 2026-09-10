/**
 * Deterministic lead score (master prompt §CRM: components stored, AI may never write the total).
 * Rules come from the `lead-score-rules` collection: `field` names a submitted field, `match` is an
 * exact value or a /regex/, `points` may be negative. Total is clamped to 0–100.
 */
export type ScoreRule = { name: string; factor: string; field: string; match: string; points: number }
export type ScoreComponent = { rule: string; factor: string; field: string; value: string; points: number }

export function scoreLead(fields: Record<string, string | undefined>, rules: ScoreRule[]) {
  const components: ScoreComponent[] = []
  for (const r of rules) {
    const value = fields[r.field]
    if (value === undefined || value === '') continue
    const m = r.match.match(/^\/(.+)\/([a-z]*)$/)
    let hit: boolean
    if (m) {
      try {
        hit = new RegExp(m[1]!, m[2]).test(value)
      } catch {
        hit = false
      }
    } else hit = value === r.match
    if (hit) components.push({ rule: r.name, factor: r.factor, field: r.field, value, points: r.points })
  }
  const raw = components.reduce((a, c) => a + c.points, 0)
  return { total: Math.max(0, Math.min(100, raw)), components }
}
