'use client'
/**
 * Native RFQ: an RFQ control (hero, product, category, service, editorial) as the native intake sees it. A real link to the
 * inline form on /contact-us/ (it works before hydration and without the panel); with the corner panel on the page, a click
 * opens the panel instead, carrying this control's page context so the visitor is never asked for it.
 */
import type { MouseEvent, ReactNode } from 'react'
import { pageLabel, RFQ_OPEN_EVENT, type RfqOpenDetail } from './NativeRfq'
import styles from './NativeRfq.module.css'

export const NATIVE_FORM_HREF = '/contact-us/#request-a-quote'

export function NativeRfqTrigger({ context, contextLabel, className, children, placement }: { context: Record<string, string | undefined>; contextLabel?: string; className?: string; children: ReactNode; placement: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const detail: RfqOpenDetail & { handled?: boolean } = { context: { ...context, cta_placement: placement }, label: contextLabel || pageLabel(), trigger: e.currentTarget }
    window.dispatchEvent(new CustomEvent(RFQ_OPEN_EVENT, { detail }))
    // the panel marks the event handled (synchronously); without a panel the link simply navigates
    if (detail.handled) e.preventDefault()
  }
  return <a href={NATIVE_FORM_HREF} className={className ?? styles.trigger} data-rfq-native="" data-rfq-placement={placement} onClick={onClick}>{children}</a>
}
