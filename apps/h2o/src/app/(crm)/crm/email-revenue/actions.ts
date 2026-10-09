'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { pendingSession } from '../../../../auth/mfa/guard'
import { pauseOne, resumeOne, stopOne } from '../../../../crm/ers/control'
import { activateGated, markReady } from '../../../../crm/seq/activate'
import { createFromPrebuilt } from '../../../../crm/seq/build'
import { changeSequenceApprovalMode } from '../../../../crm/seq/approval'
import { recordReplyCheck, setReplyMode } from '../../../../crm/seq/reply'
import { approveSimulation } from '../../../../crm/seq/review'
import { saveTriggerConfig, setTriggerEnabled } from '../../../../crm/seq/triggers'
import { changeApprovalMode, runImport } from '../../../../crm/library/service'
import type { Outcome } from '../../../../crm/workspace/mutations'
import type { CrmSession } from '../../../../crm/workspace/session'
import type { ActionState } from '../../../../crm/workspace/ui/actionState'
import { actionSession } from '../session'

/** EMAIL-LIB-1 actions. Each resolves the session again (a direct POST is possible); the service repeats role and step-up. */
const DENIED: ActionState = {
  ok: false,
  code: 'FORBIDDEN',
  message: 'You don’t have access to the Sales Workspace.',
}
const f = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : undefined
}
async function run(fn: (s: CrmSession, sid: string | null) => Promise<Outcome>): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const pending = await pendingSession(s.payload, await headers())
  const out = await fn(s, pending?.sid ?? null)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

export async function approvalModeAction(_: ActionState, fd: FormData) {
  return run((s, sid) =>
    changeApprovalMode(s, sid, { id: f(fd, 'id'), mode: f(fd, 'mode'), reason: f(fd, 'reason') }),
  )
}

export async function importLibraryAction(_: ActionState, __: FormData) {
  return run((s, sid) => runImport(s, sid, false))
}

/** Per-enrollment controls. The service re-checks the role and the viewer's access to the enrollment. */
export async function pauseEnrollmentAction(_: ActionState, fd: FormData) {
  return run((s) => pauseOne(s, f(fd, 'enrollmentId')))
}
export async function resumeEnrollmentAction(_: ActionState, fd: FormData) {
  return run((s) => resumeOne(s, f(fd, 'enrollmentId')))
}
export async function stopEnrollmentAction(_: ActionState, fd: FormData) {
  return run((s) => stopOne(s, f(fd, 'enrollmentId')))
}

/** SEQ-BUILD-1. Each re-resolves the session; the services repeat the role, step-up and gate checks. */
export async function createFromPrebuiltAction(_: ActionState, fd: FormData) {
  const s = await actionSession()
  if (!s) return DENIED
  const pending = await pendingSession(s.payload, await headers())
  const out = await createFromPrebuilt(s, pending?.sid ?? null, { code: f(fd, 'code') })
  if (out.ok && out.sequenceId) redirect(`/crm/email-revenue/sequences/${encodeURIComponent(out.sequenceId)}/?created=1`)
  return { ...out, nonce: Date.now() } as ActionState
}
export async function markReadyAction(_: ActionState, fd: FormData) {
  return run((s) => markReady(s, { sequenceId: f(fd, 'sequenceId') }))
}
export async function activateGatedAction(_: ActionState, fd: FormData) {
  return run((s, sid) => activateGated(s, sid, { sequenceId: f(fd, 'sequenceId'), code: f(fd, 'code'), seen: f(fd, 'seen') }))
}
export async function approveSimulationAction(_: ActionState, fd: FormData) {
  return run((s) => approveSimulation(s, { sequenceId: f(fd, 'sequenceId'), snapshotHash: f(fd, 'snapshotHash') }))
}
export async function setTriggerAction(_: ActionState, fd: FormData) {
  return run((s, sid) => setTriggerEnabled(s, sid, { key: f(fd, 'key'), enabled: f(fd, 'enabled') === '1' }))
}
export async function saveTriggerAction(_: ActionState, fd: FormData) {
  return run((s, sid) => saveTriggerConfig(s, sid, { key: f(fd, 'key'), sequenceId: f(fd, 'sequenceId') || undefined, idleDays: f(fd, 'idleDays') ? Number(f(fd, 'idleDays')) : undefined }))
}

/** ENGINE-SCOPE-1c. Each re-resolves the session; the services repeat the role, step-up and rules. */
export async function recordReplyCheckAction(_: ActionState, fd: FormData) {
  return run((s) => recordReplyCheck(s, { sequenceId: f(fd, 'sequenceId'), confirmed: f(fd, 'confirmed') === '1' }))
}
export async function setReplyModeAction(_: ActionState, fd: FormData) {
  return run((s, sid) =>
    setReplyMode(s, sid, {
      sequenceId: f(fd, 'sequenceId'),
      mode: f(fd, 'mode'),
      ownerId: f(fd, 'ownerId') || undefined,
      days: f(fd, 'days'),
      startHour: Number(f(fd, 'startHour')),
      endHour: Number(f(fd, 'endHour')),
      zone: f(fd, 'zone'),
      initialBatch: Number(f(fd, 'initialBatch')),
    }),
  )
}
export async function changeSequenceModeAction(_: ActionState, fd: FormData) {
  return run((s, sid) => changeSequenceApprovalMode(s, sid, { sequenceId: f(fd, 'sequenceId'), mode: f(fd, 'mode'), reason: f(fd, 'reason') }))
}
