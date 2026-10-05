import type { Scope } from '../../../../crm/workspace/prefs'
import { scopeAction } from '../actions'

/**
 * W1-8 Mine/Team (audit finding 5): one remembered choice shared by My Work and Follow-ups. Each button posts to
 * `scopeAction`, which stores the choice and returns to `back`; it works without JavaScript.
 */
export function ScopeSwitch({ scope, back }: { scope: Scope; back: string }) {
  return (
    <span className="c-scope" role="group" aria-label="Scope">
      {(['mine', 'team'] as const).map((k) => (
        <form key={k} action={scopeAction}>
          <input type="hidden" name="scope" value={k} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" aria-pressed={scope === k}>
            {k === 'mine' ? 'Mine' : 'Team'}
          </button>
        </form>
      ))}
    </span>
  )
}
