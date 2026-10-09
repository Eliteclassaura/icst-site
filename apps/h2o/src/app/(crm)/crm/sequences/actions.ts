'use server'

import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { pendingSession } from '../../../../auth/mfa/guard'
import { setEngineSwitch } from '../../../../crm/ers/switch'
import { activateGated } from '../../../../crm/seq/activate'
import { redirect } from 'next/navigation'
import * as admin from '../../../../crm/ers/admin'
import * as enroll from '../../../../crm/ers/enroll'
import { resumeHealth } from '../../../../crm/ers/feedback'
import type { Outcome } from '../../../../crm/workspace/mutations'
import type { CrmSession } from '../../../../crm/workspace/session'
import type { ActionState } from '../../../../crm/workspace/ui/actionState'
import { actionSession } from '../session'

/**
 * Revenue Engine slice 1 — sequence actions. Each resolves the session again (direct POSTs are possible); the service
 * layer repeats the role checks. Untrusted form values go to validated services only.
 */
const DENIED: ActionState = { ok: false, code: 'FORBIDDEN', message: 'You don’t have access to the Sales Workspace.' }
const f = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : undefined
}
async function run(fn: (s: CrmSession) => Promise<Outcome>): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await fn(s)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

export async function publishAction(_: ActionState, fd: FormData) {
  return run((s) => admin.publishVersion(s, f(fd, 'versionId')))
}
/** SEQ-BUILD-1: starting a sequence goes through the safety gates and the step-up; there is no other way to start one. */
export async function activateAction(_: ActionState, fd: FormData) {
  const s = await actionSession()
  if (!s) return DENIED
  const pending = await pendingSession(s.payload, await headers())
  const out = await activateGated(s, pending?.sid ?? null, { sequenceId: f(fd, 'sequenceId'), code: f(fd, 'code') })
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}
export async function pauseAction(_: ActionState, fd: FormData) {
  return run((s) => admin.pauseSequence(s, f(fd, 'sequenceId')))
}
export async function duplicateAction(_: ActionState, fd: FormData) {
  return run((s) => admin.duplicateVersion(s, f(fd, 'sequenceId')))
}
export async function saveStepsAction(_: ActionState, fd: FormData) {
  return run((s) => admin.saveDraftSteps(s, f(fd, 'versionId'), f(fd, 'steps')))
}

/** The global switch (audited by the settings global). Turning it on needs step-up; turning it on does not bypass any other gate. */
export async function engineSwitchAction(_: ActionState, fd: FormData) {
  const s = await actionSession()
  if (!s) return DENIED
  const pending = await pendingSession(s.payload, await headers())
  const out = await setEngineSwitch(s, pending?.sid ?? null, { on: f(fd, 'on') === '1', code: f(fd, 'code') })
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}
export async function resumeHealthAction(_: ActionState) {
  return run((s) => resumeHealth(s))
}

const sourceOf = (fd: FormData): enroll.Source => ({ rfqId: f(fd, 'rfq') || undefined, contactId: f(fd, 'contact') || undefined, savedViewId: f(fd, 'view') || undefined })

export async function enrollAction(_: ActionState, fd: FormData) {
  const out = await run((s) => enroll.enrollFromPreview(s, { sequenceId: f(fd, 'sequenceId'), source: sourceOf(fd), missingItems: fd.getAll('items').map(String), cohortHash: f(fd, 'cohortHash') }))
  if (out.ok) {
    const rfq = f(fd, 'rfq')
    redirect(rfq ? `/crm/rfqs/${encodeURIComponent(rfq)}/?tab=activity` : `/crm/settings/sequences/${encodeURIComponent(f(fd, 'sequenceId') ?? '')}/`)
  }
  return out
}
export async function stopEnrollmentAction(_: ActionState, fd: FormData) {
  return run((s) => enroll.stopEnrollment(s, f(fd, 'enrollmentId')))
}
export async function resumeEnrollmentAction(_: ActionState, fd: FormData) {
  return run((s) => enroll.resumeEnrollment(s, f(fd, 'enrollmentId')))
}
