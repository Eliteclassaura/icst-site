'use client'
/**
 * Native RFQ: one request session, shared by the corner chat and the inline form. Loads the registry lazily (contract §2:
 * on the first open, not in the page bundle), resumes the session draft, fetches the form token when the visitor starts,
 * and sends exactly once per "Send request" with the draft's submissionId (contract §4).
 */
import { useCallback, useRef, useState } from 'react'
import { sessionAttribution } from './attribution'
import { clearDraft, loadDraft, saveDraft, type Draft } from './draft'
import { answer as setAnswer, migrate, nextQuestion, prune, questionsFor, reopen, submittedAnswers, validateAll, type Answers } from './flow'
import type { Registry } from './model'
import { formToken, newSubmissionId, submitRfq, type RfqContext, type RfqSource, type SubmitOutcome } from './submission'

export type Phase = 'loading' | 'unavailable' | 'resume' | 'asking' | 'review' | 'sending' | 'sent'
export type RegistryLoader = (locale: string) => Promise<Registry | null>
export const fetchRegistry: RegistryLoader = async (locale) => {
  try {
    const res = await fetch(`/api/rfq/registry/?locale=${encodeURIComponent(locale)}`, { credentials: 'same-origin' })
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
  context: RfqContext
  start: () => void
  setContext: (context: RfqContext) => void
  answer: (id: string, value: string) => void
  edit: (id: string) => void
  setAll: (answers: Answers) => void
  review: () => boolean
  send: (hp: string) => Promise<void>
  resume: (continueDraft: boolean) => void
  reset: () => void
}

const defaultFetch: typeof fetch = (...a) => fetch(...a)

export function useRfqSession(source: RfqSource, locale: string, loader: RegistryLoader = fetchRegistry, fetcher: typeof fetch = defaultFetch): RfqSession {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<RfqSession['errors']>({})
  const [failure, setFailure] = useState<RfqSession['failure']>(null)
  const [rfqNumber, setRfqNumber] = useState<string | null>(null)
  const [context, setContextState] = useState<RfqContext>({})
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
      const reg = await loader(locale)
      if (!reg || !reg.enabled) {
        setPhase('unavailable')
        return
      }
      setRegistry(reg)
      const held = loadDraft(store())
      if (held && Object.keys(held.answers).length) {
        const kept = held.registryVersion === reg.registryVersion ? held.answers : migrate(reg, held.answers)
        draft.current = { ...held, registryVersion: reg.registryVersion, answers: kept }
        setAnswers(kept)
        setPhase('resume')
      } else setPhase('asking')
      token.current = await formToken(fetcher, token.current)
    })()
  }, [loader, locale, fetcher])

  const answerFn = useCallback((id: string, value: string) => {
    if (!registry) return
    setFailure(null)
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e
      void _drop
      return rest
    })
    setAnswers((a) => {
      const next = setAnswer(registry, a, id, value)
      persist(next, nextQuestion(registry, next)?.step ?? 'review', registry)
      return next
    })
  }, [registry, persist])

  const review = useCallback(() => {
    if (!registry) return false
    // on the inline form every question is shown at once: an optional field left blank is a skip
    const all = source === 'NATIVE_FORM' ? prune(registry, Object.fromEntries(questionsFor(registry, answers).map((q) => [q.id, (answers[q.id] ?? '').trim()]))) : answers
    const errs = validateAll(registry, all, source === 'NATIVE_FORM' ? 'form' : 'chat')
    setErrors(errs)
    if (all !== answers) setAnswers(all)
    if (Object.keys(errs).length || nextQuestion(registry, all)) return false
    setPhase('review')
    persist(all, 'review', registry)
    return true
  }, [registry, answers, source, persist])

  const send = useCallback(async (hp: string) => {
    if (!registry || phase === 'sending') return
    setPhase('sending')
    setFailure(null)
    if (!draft.current) persist(answers, 'review', registry)
    const { outcome, token: tok } = await submitRfq(
      fetcher,
      { submissionId: draft.current!.submissionId, source, registryVersion: registry.registryVersion, locale: registry.locale, answers: submittedAnswers(registry, answers), context, attribution: typeof window === 'undefined' ? {} : sessionAttribution(window), hp },
      token.current,
      (id) => { draft.current = { ...draft.current!, submissionId: id }; saveDraft(store(), draft.current) },
    )
    token.current = tok
    applyOutcome(outcome)
    function applyOutcome(o: SubmitOutcome) {
      if (o.kind === 'sent') {
        clearDraft(store())
        draft.current = null
        setRfqNumber(o.rfqNumber)
        setPhase('sent')
        return
      }
      if (o.kind === 'invalid') {
        // show each server error beside its field; the chat goes back to the first failing question
        setErrors(Object.fromEntries(Object.entries(o.fields).map(([id, key]) => [id, { key }])))
        const first = registry!.questions.find((q) => q.id in o.fields)
        if (first && source === 'NATIVE_CHAT') setAnswers((a) => reopen(a, first.id))
        setPhase(source === 'NATIVE_CHAT' ? 'asking' : 'review')
        return
      }
      setFailure({ key: o.key, ...(o.disabled ? { disabled: true } : {}) })
      setPhase('review')
    }
  }, [registry, phase, answers, context, source, fetcher, persist])

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
    registry, phase, answers, errors, failure, rfqNumber, context,
    start, setContext: setContextState, answer: answerFn, edit, setAll: setAnswers, review, send, resume, reset,
  }
}
