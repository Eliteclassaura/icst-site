'use client'
import { suggestEmail } from './emailHint'
import { t, type Registry } from './model'
import styles from './NativeRfq.module.css'

/** "Did you mean name@gmail.com?" under an email field, announced politely (not an error). The visitor decides: "Use name@gmail.com" is a real button, nothing is auto-changed. */
export function EmailTypoHint({ reg, value, onUse }: { reg: Registry; value: string; onUse: (v: string) => void }) {
  const suggestion = suggestEmail(value)
  if (!suggestion) return null
  return <p className={styles.hint} aria-live="polite">
    {t(reg, 'email.hint.suggest', { suggestion })} <button type="button" className={styles.chip} onClick={() => onUse(suggestion)}>{t(reg, 'email.hint.use', { suggestion })}</button>
  </p>
}
