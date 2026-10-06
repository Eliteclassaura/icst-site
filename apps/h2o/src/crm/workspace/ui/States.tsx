import type { ReactNode } from 'react'

/**
 * Polish R1: designed empty states. A glyph, a short heading, one line saying why the list is empty and, when
 * there is one, the next step. `role="status"` so a filter that empties a list is announced.
 */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="c-empty-state" role="status">
      {icon ? (
        <span className="c-empty-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="c-empty-title">{title}</p>
      {children ? <p className="c-empty-body">{children}</p> : null}
      {action ? <div className="c-empty-action">{action}</div> : null}
    </div>
  )
}
