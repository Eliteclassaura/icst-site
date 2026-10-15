'use client'
/**
 * Native RFQ: one request session, shared by the corner chat and the inline form. Loads the registry lazily (contract §2:
 * on the first open, not in the page bundle), resumes the session draft, fetches the form token when the visitor starts,
 * and sends exactly once per "Send request" with the draft's submissionId (contract §4).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionAttribution } from './attribution'
import { clearDraft, loadDraft, saveDraft, type Draft } from './draft'
import { answer as setAnswer, migrate, nextQuestion, prune, questionsFor, reopen, submittedAnswers, validate, validateAll, type Answers, type Surface } from './flow'
import type { Registry } from './model'
import { formToken, newSubmissionId, submitRfq, type RfqContext, type RfqSource, type SendTiming, type SubmitOutcome } from './submission'

export type Phase = 'loading' | 'unavailable' | 'resume' | 'asking' | 'review' | 'sending' | 'sent'
/** `fresh`: skip the HTTP cache (the registry is cacheable for minutes; after NOTICE_CHANGED the current one is needed). */
export type RegistryLoader = (locale: string, fresh?: boolean) => Promise<Registry | null>
export const fetchRegistry: RegistryLoader = async (locale, fresh) => {
  try {
    const res = await fetch(`/api/rfq/registry/?locale=${encodeURIComponent(locale)}`, { credentials: 'same-origin', ...(fresh ? { cache: 'no-store' as const } : {}) })
    return res.ok ? ((await res.json()) as Registry) : null
  } catch {
    return null
  }
}

const store = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

export type RfqSession = {
  registry: Registry | null
  phase: Phase
  answers: Answers
  /** Server or form errors by question id: an error key and its placeholder values. */
  errors: Record<string, { key: string; values?: Record<string, string> }>
  /** The latest send failure (err.* key), cleared on the next action. */
  failure: { key: string; disabled?: boolean } | null
  rfqNumber: string | null
  /** CHAT-FLOW-1: counts NOTICE_CHANGED refusals. Each one reloads the registry and asks the email step again (the current
   * privacy line sits under it); the chat moves back to that step when this changes. */
  noticeRev: number
  /** Seconds until a rate-limited send may be retried (429 Retry-After); 0 when Send is allowed. */
  retryIn: number
  context: RfqContext
  start: () => void
  setContext: (context: RfqContext) => void
  answer: (id: string, value: string) => void
  edit: (id: string) => void
  /** `changedId`: the field being edited; its error is cleared as it changes (1.3a-F1), and re-checked when the field is left. */
  setAll: (answers: Answers, changedId?: string) => void
  /** 1.3a-F1: check one field when the visitor leaves it. Only the email field is checked early, and only when it is not blank
   * (a blank required field waits for the submit); a valid address clears an earlier error. */
  checkField: (id: string) => void
  review: () => boolean
  send: (hp: string) => Promise<void>
  /** CHAT-FLOW-1: the chat's last step — record its answer, check everything, and send with it (no review screen). */
  finish: (hp: string, id: string, value: string) => void
  resume: (continueDraft: boolean) => void
  reset: () => void
}

export const DRAFT_DEBOUNCE_MS = 400
const defaultFetch: typeof fetch = (...a) => fetch(...a)

export function useRfqSession(source: RfqSource, locale: string, loader: RegistryLoader = fetchRegistry, fetcher: typeof fetch = defaultFetch, timing?: SendTiming): RfqSession {
  // CHAT-FLOW-1: the corner chat runs on its own questions; the inline form on the form's
  const surface: Surface = source === 'NATIVE_FORM' ? 'form' : 'chat'
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const answersNow = answers
  const [errors, setErrors] = useState<RfqSession['errors']>({})
  const [failure, setFailure] = useState<RfqSession['failure']>(null)
  const [rfqNumber, setRfqNumber] = useState<string | null>(null)
  const [noticeRev, setNoticeRev] = useState(0)
  const [context, setContextState] = useState<RfqContext>({})
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // the 429 countdown: tick each second until Retry-After has passed, then allow the retry
  useEffect(() => {
    if (retryAt === null) return undefined
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= retryAt) setRetryAt(null)
    }, 1000)
    return () => clearInterval(timer)
  }, [retryAt])
  const retryIn = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000))
  const started = useRef(false)
  const draft = useRef<Draft | null>(null)
  const token = useRef<{ formToken: string; fetchedAt: number } | null>(null)

  const persist = useCallback((next: Answers, step: Draft['step'], reg: Registry) => {
    draft.current = { submissionId: draft.current?.submissionId ?? newSubmissionId(), registryVersion: reg.registryVersion, step, answers: next, source }
    saveDraft(store(), draft.current)
  }, [source])

  /** First open: load the registry, then resume or begin; fetch the form token (contract §3). */
  const start = useCallback(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      let reg = await loader(locale)
      // CHAT-FLOW-1.2: the registry is cacheable (max-age 300, stale-while-revalidate 86400), so a browser can still hold the one
      // from before CHAT-FLOW-1: no chat questions, no `chatflow.*` strings. The chat on it would show the form's wording and
      // an empty OK. Ask once for a fresh copy, past the HTTP cache.
      if (reg?.enabled && surface === 'chat' && !(reg.chatQuestions?.length && reg.strings['chatflow.ok'])) reg = (await loader(locale, true)) ?? reg
      if (!reg || !reg.enabled) {
        // a switched-off registry still carries its strings: the panel says so and points to the offices
        if (reg) setRegistry(reg)
        // RFQ-FIX-1 (audit R7): a registry that failed to load is tried again on the next open, not for the rest of the visit
        else started.current = false
        setPhase('unavailable')
        return
      }
      setRegistry(reg)
      const held = loadDraft(store())
      if (held && Object.keys(held.answers).length) {
        const kept = held.registryVersion === reg.registryVersion ? held.answers : migrate(reg, held.answers, surface)
        draft.current = { ...held, registryVersion: reg.registryVersion, answers: kept }
        setAnswers(kept)
        setPhase('resume')
      } else setPhase('asking')
      token.current = await formToken(fetcher, token.current)
    })()
  }, [loader, locale, fetcher, surface])

  const answerFn = useCallback((id: string, value: string) => {
    if (!registry) return
    setFailure(null)
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e
      void _drop
      return rest
    })
    setAnswers((a) => {
      const next = setAnswer(registry, a, id, value, surface)
      persist(next, nextQuestion(registry, next, surface)?.step ?? 'review', registry)
      return next
    })
  }, [registry, persist, surface])

  // RFQ-FIX-1 (audit R11): the inline form keeps what is typed (debounced) so a refresh before "Continue" loses nothing
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (persistTimer.current) clearTimeout(persistTimer.current) }, [])
  const setAll = useCallback((next: Answers, changedId?: string) => {
    setAnswers(next)
    setFailure(null)
    if (changedId) setErrors((e) => {
      if (!(changedId in e)) return e
      const { [changedId]: _drop, ...rest } = e
      void _drop
      return rest
    })
    if (!registry) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => { persistTimer.current = null; persist(next, 'contact', registry) }, DRAFT_DEBOUNCE_MS)
  }, [registry, persist])

  const checkField = useCallback((id: string) => {
    if (!registry) return
    const q = questionsFor(registry, answersNow, surface).find((x) => x.id === id)
    const value = (answersNow[id] ?? '').trim()
    if (!q || q.validation.pattern !== 'email' || !value) return
    const err = validate(registry, q, value, surface)
    setErrors((e) => {
      if (err) return { ...e, [id]: err }
      if (!(id in e)) return e
      const { [id]: _drop, ...rest } = e
      void _drop
      return rest
    })
  }, [registry, answersNow, surface])

  const review = useCallback(() => {
    if (!registry) return false
    // on the inline form every question is shown at once: an optional field left blank is a skip
    const all = source === 'NATIVE_FORM' ? prune(registry, Object.fromEntries(questionsFor(registry, answers).map((q) => [q.id, (answers[q.id] ?? '').trim()]))) : answers
    const errs = validateAll(registry, all, surface)
    setErrors(errs)
    if (all !== answers) setAnswers(all)
    if (Object.keys(errs).length || nextQuestion(registry, all, surface)) return false
    setPhase('review')
    persist(all, 'review', registry)
    return true
  }, [registry, answers, source, persist, surface])

  const send = useCallback(async (hp: string, override?: Answers) => {
    if (!registry || phase === 'sending' || retryIn > 0) return
    // CHAT-FLOW-1: `finish` sends with the answers it has just recorded (state has not caught up yet)
    const answers = override ?? answersNow
    setPhase('sending')
    setFailure(null)
    if (!draft.current) persist(answers, 'review', registry)
    const { outcome, token: tok } = await submitRfq(
      fetcher,
      { submissionId: draft.current!.submissionId, source, registryVersion: registry.registryVersion, ...(registry.noticeVersion ? { noticeVersion: registry.noticeVersion } : {}), locale: registry.locale, answers: submittedAnswers(registry, answers, surface), context, attribution: typeof window === 'undefined' ? {} : sessionAttribution(window), hp },
      token.current,
      (id) => { draft.current = { ...draft.current!, submissionId: id }; saveDraft(store(), draft.current) },
      { minSecondsToSubmit: registry.limits?.minSecondsToSubmit, ...timing },
    )
    token.current = tok
    applyOutcome(outcome)
    function applyOutcome(o: SubmitOutcome) {
      if (o.kind === 'sent') {
        if (persistTimer.current) clearTimeout(persistTimer.current)
        clearDraft(store())
        draft.current = null
        setRfqNumber(o.rfqNumber)
        setPhase('sent')
        return
      }
      if (o.kind === 'notice_changed') {
        // CHAT-FLOW-1 (Auditor condition 2): the privacy line changed since this page loaded. Load the current registry (past
        // the HTTP cache) and show the visitor the email step again, answers kept, with the new line under it.
        void (async () => {
          const current = await loader(locale, true)
          if (!current || !current.enabled) {
            setFailure({ key: 'err.server' })
            setPhase('review')
            return
          }
          setRegistry(current)
          setErrors({ email: { key: 'err.notice_changed' } })
          setNoticeRev((n) => n + 1)
          setPhase('asking')
        })()
        return
      }
      // 413: the body is over the limit — the longest answer is the one to shorten (contract §4.1)
      const fields: Record<string, string> = o.kind === 'invalid' ? o.fields : o.kind === 'too_large' ? longestAnswer() : {}
      if (o.kind === 'invalid' || o.kind === 'too_large') {
        // show each server error beside its field, `{max}` filled from the question's own limit; the chat goes back to the
        // first failing question
        setErrors(Object.fromEntries(Object.entries(fields).map(([id, key]) => {
          const q = (surface === 'chat' && registry!.chatQuestions?.length ? registry!.chatQuestions : registry!.questions).find((x) => x.id === id)
          return [id, q && key === q.errorKeys.tooLong ? { key, values: { max: String(q.validation.maxLength) } } : { key }]
        })))
        const first = questionsFor(registry!, answers, surface).find((q) => q.id in fields) ?? (surface === 'chat' && registry!.chatQuestions?.length ? registry!.chatQuestions : registry!.questions).find((q) => q.id in fields)
        if (first && source === 'NATIVE_CHAT') setAnswers((a) => reopen(a, first.id))
        // RFQ-FIX-1 (audit R4): both surfaces go back to the questions, where each error shows beside its field (the
        // form moves focus to the first one). An error no question owns is shown as the send failure instead.
        if (!first) setFailure({ key: 'err.server' })
        setPhase(first ? 'asking' : 'review')
        return
      }
      if (o.retryAfterSeconds) {
        const t = Date.now()
        setNow(t)
        setRetryAt(t + o.retryAfterSeconds * 1000)
      }
      setFailure({ key: o.key, ...(o.disabled ? { disabled: true } : {}) })
      setPhase('review')
    }
    function longestAnswer(): Record<string, string> {
      const id = Object.entries(submittedAnswers(registry!, answers, surface)).sort((a, b) => b[1].length - a[1].length)[0]?.[0]
      return id ? { [id]: 'err.too_long' } : {}
    }
  }, [registry, phase, retryIn, answersNow, context, source, fetcher, persist, timing, surface, loader, locale])

  const finish = useCallback((hp: string, id: string, value: string) => {
    if (!registry) return
    const next = setAnswer(registry, answersNow, id, value, surface)
    setAnswers(next)
    const errs = validateAll(registry, next, surface)
    setErrors(errs)
    if (Object.keys(errs).length || nextQuestion(registry, next, surface)) {
      // an earlier answer no longer passes: ask that question again (the chat lands on the first unanswered step)
      const bad = questionsFor(registry, next, surface).find((q) => q.id in errs)
      const back = bad ? reopen(next, bad.id) : next
      if (bad) setAnswers(back)
      persist(back, nextQuestion(registry, back, surface)?.step ?? 'review', registry)
      return
    }
    persist(next, 'review', registry)
    void send(hp, next)
  }, [registry, answersNow, surface, persist, send])

  const resume = useCallback((continueDraft: boolean) => {
    if (!registry) return
    if (!continueDraft) {
      clearDraft(store())
      draft.current = null
      setAnswers({})
    }
    setPhase('asking')
  }, [registry])

  const reset = useCallback(() => {
    clearDraft(store())
    draft.current = null
    setAnswers({})
    setErrors({})
    setFailure(null)
    setRfqNumber(null)
    setPhase(registry ? 'asking' : 'loading')
  }, [registry])

  const edit = useCallback((id: string) => {
    setAnswers((a) => reopen(a, id))
    setPhase('asking')
  }, [])

  return {
    registry, phase, answers, errors, failure, rfqNumber, noticeRev, retryIn, context,
    start, setContext: setContextState, answer: answerFn, edit, setAll, checkField, review, send, finish, resume, reset,
  }
}
