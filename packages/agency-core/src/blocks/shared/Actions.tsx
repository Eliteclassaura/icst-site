import { Button } from '../../design-system/primitives/index'
import type { CtaPair } from '../types'
import './actions.css'

export function Actions({ cta, center }: { cta?: CtaPair; center?: boolean }) {
  if (!cta?.primary && !cta?.secondary) return null
  return (
    <div className={`blk-actions${center ? ' blk-actions--center' : ''}`}>
      {cta.primary && (
        <Button href={cta.primary.href} variant="solid">
          {cta.primary.label}
        </Button>
      )}
      {cta.secondary && (
        <Button href={cta.secondary.href} variant="ghost">
          {cta.secondary.label}
        </Button>
      )}
    </div>
  )
}
