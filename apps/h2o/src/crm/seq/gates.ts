import type { Payload } from 'payload'
import { readEmailConfig } from '../../email/config'
import { templateHash } from '../../email/templates'
import { engineStatus as engineStatusFull } from '../ers/report'
import { type Step } from '../ers/engine'
import { lintVariant } from '../library/lint'
import { isApproved, textOf } from '../settings/templates'
import type { CrmSession } from '../workspace/session'
import { purposeNeedsRfq } from '../ers/identity'
import { relId } from '../guards'
import { CHECK_REASON_TEXT, type CheckReason } from '../ers/reply-mode'
import { replyHandling } from './reply'
import { configHash, simulationReviewFor } from './review-read'

/**
 * SEQ-BUILD-1 — the activation gates, read from the server every time (never cached "all green"). Five blocks, in the
 * order of the design: system send mode, test-recipient restriction, traffic kinds, engine state, this sequence.
 * A hard gate that is not met blocks activation; there is no bypass anywhere. Two gates are owner/CT decisions that
 * the UI cannot flip: the sending-safety checks and the feedback / suppression handling are recorded by the owner in
 * the environment (`H2O_ERS_GATES_PASSED`, a comma list) after they pass, never by a button.
 *
 * HARD STOPS that the approval mode (AUTO or REQUIRED) can never bypass: a copy-check BLOCK on any email, and the
 * engine / safety gates. Approval mode only decides whether a person reviews each email once sending is allowed.
 */
type Doc = Record<string, unknown>
const ro = { overrideAccess: true as const, depth: 0 }

export type GateStatus = 'MET' | 'NOT_MET' | 'AT_CONFIRM' | 'INFO'
export type Gate = { key: string; label: string; status: GateStatus; reason: string; hard: boolean }
export type Block = { key: 'send_mode' | 'recipients' | 'traffic' | 'engine' | 'program'; label: string; summary: string; gates: Gate[] }
export type GateReport = {
  blocks: Block[]
  unmet: Gate[]
  blocker: Gate | null
  allMet: boolean
  autoSteps: number
  requiredSteps: number
  fingerprint: string
}

/** Replies for an enrollment with no inquiry need an enrollment-anchored reply address; not agreed or built yet. */
export const RFQLESS_REPLY_ANCHOR_AVAILABLE = false

/** The rule runner (seq/rules.ts) runs inside the engine's tick. */
export const RULE_RUNNER_AVAILABLE = true
const passed = (): Set<string> => new Set((process.env.H2O_ERS_GATES_PASSED ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))

const g = (key: string, label: string, ok: boolean, metText: string, unmetText: string, hard = true): Gate => ({
  key,
  label,
  status: ok ? 'MET' : 'NOT_MET',
  reason: ok ? metText : unmetText,
  hard,
})

/** Copy check over the exact wording of every email step: a template that changed, is unapproved or is BLOCKED fails. */
export async function copyCheck(payload: Payload, version: Doc | null): Promise<{ ok: boolean; reason: string; flags: number }> {
  if (!version) return { ok: false, reason: 'There is no version to check yet.', flags: 0 }
  let flags = 0
  for (const [i, st] of ((version.steps ?? []) as Step[]).entries()) {
    if (st.type !== 'EMAIL') continue
    const tpl = (await payload.findByID({ collection: 'crm-email-templates', id: String(relId(st.template)), ...ro }).catch(() => null)) as Doc | null
    if (!tpl || !isApproved(tpl)) return { ok: false, reason: `Step ${i + 1}: the wording is not approved.`, flags }
    if (st.template_hash && st.template_hash !== templateHash(textOf(tpl))) return { ok: false, reason: `Step ${i + 1}: the wording changed after the version was published.`, flags }
    const l = lintVariant(String(tpl.subject), String(tpl.body))
    if (l.badge === 'BLOCKED') return { ok: false, reason: `Step ${i + 1}: the copy check blocks this email.`, flags }
    flags += (l.counts.REVIEW ?? 0)
  }
  return { ok: true, reason: flags ? `No blocking flags. ${flags} to review.` : 'No blocking flags.', flags }
}

export async function activationGates(s: CrmSession, input: { sequenceId?: string; trigger?: boolean }, now = new Date()): Promise<GateReport> {
  const p = s.payload
  const cfgEmail = readEmailConfig()
  const eng = await engineStatusFull(p, now)
  const envPassed = passed()
  const seq = input.sequenceId ? ((await p.findByID({ collection: 'crm-sequences', id: input.sequenceId, ...ro }).catch(() => null)) as Doc | null) : null
  const cfg = seq ? await configHash(p, String(seq.id)) : null
  const version = cfg?.version ?? null
  const emailSteps = ((version?.steps ?? []) as Step[]).filter((x) => x.type === 'EMAIL').length
  const required = seq?.approval_mode === 'REQUIRED'
  const review = seq ? await simulationReviewFor(p, String(seq.id), cfg?.hash ?? null) : { state: 'NONE' as const, hash: null, at: null }
  const check = await copyCheck(p, version)

  const sendMode =
    cfgEmail.mode === 'off' ? 'Off' : cfgEmail.mode === 'allowlist' ? 'Test only: sends only to the approved test addresses' : 'Live'
  const blocks: Block[] = [
    {
      key: 'send_mode',
      label: 'System send mode',
      summary: sendMode,
      gates: [g('send_mode', 'Sending is switched on for this system', cfgEmail.mode !== 'off', sendMode, 'Email sending is switched off for this system. An admin changes it in Settings → Sending.')],
    },
    {
      key: 'recipients',
      label: 'Test-recipient restriction',
      summary: '',
      gates: [
        {
          key: 'recipients',
          label:
            cfgEmail.mode === 'allowlist'
              ? `Only ${cfgEmail.allowlist.size} approved test address${cfgEmail.allowlist.size === 1 ? '' : 'es'} can receive email. No one else would receive email.`
              : 'No test-recipient restriction: any enrolled contact can receive email.',
          status: 'INFO',
          reason: '',
          hard: false,
        },
      ],
    },
    {
      key: 'traffic',
      label: 'Enabled traffic kinds',
      summary: '',
      gates: [{ key: 'traffic', label: 'Each email’s kind is checked when it sends. Sequences are one kind.', status: 'INFO', reason: '', hard: false }],
    },
    {
      key: 'engine',
      label: 'Engine state',
      summary: eng.settings.health.state === 'PAUSED' ? 'Paused for safety' : eng.settings.enabled ? 'On' : 'Off',
      gates: [
        g('engine', 'The engine is on', eng.settings.enabled && eng.settings.health.state !== 'PAUSED', 'The engine is on.', eng.settings.health.state === 'PAUSED' ? `The engine paused itself for safety. ${eng.settings.health.reason ?? ''}`.trim() : 'The engine is off. An admin turns it on in Settings → Sending.'),
      ],
    },
  ]
  const program: Gate[] = []
  if (!input.trigger || seq) {
    program.push(g('published', 'A version is published', Boolean(version), 'Published.', 'Nothing is published yet. Mark the sequence Ready first.'))
    program.push(g('copy_check', 'Copy check: no blocking flags', check.ok, check.reason, check.reason))
    program.push(
      g(
        'simulation',
        'Simulation for this version reviewed',
        review.state === 'CURRENT',
        `Reviewed ${review.hash?.slice(0, 8) ?? ''}${review.at ? `, ${new Date(review.at).toUTCString()}` : ''}.`,
        review.state === 'STALE' ? 'This simulation is out of date. Run it again.' : 'No simulation has been reviewed for this version.',
      ),
    )
  }
  program.push(g('sender', 'The sender is healthy', eng.settings.health.state === 'ACTIVE', 'The sender is healthy.', 'The sender is paused. An admin can resume it in Sequences.'))
  if (seq && !purposeNeedsRfq(String(seq.purpose ?? 'RFQ_RESPONSE')))
    program.push(g('reply_anchor', 'Replies can reach this program', RFQLESS_REPLY_ANCHOR_AVAILABLE, 'Replies can reach this program.', 'Replies to this kind of program have no inbox address to come back to yet, so it cannot run.'))
  const rh = seq ? await replyHandling(s, seq, eng.inboundLive, now) : { kind: 'NOT_SET' as const, ok: eng.inboundLive, text: eng.inboundLive ? 'Replies are monitored.' : 'Replies are not monitored in the CRM yet.' }
  program.push(
    g(
      'replies',
      rh.kind === 'MANUAL' ? 'Reply handling: manual' : 'Reply handling: replies are monitored',
      rh.ok,
      rh.text,
      rh.kind === 'MANUAL' ? `${CHECK_REASON_TEXT[(rh as { reason: CheckReason }).reason]} Follow-ups wait for the owner.` : 'Replies are not monitored in the CRM yet. Follow-ups cannot run safely without it.',
    ),
  )
  program.push(g('safety_suite', 'Sending-safety checks passed', envPassed.has('SAFETY_SUITE'), 'Passed.', 'The sending-safety checks have not been signed off yet. The owner records the sign-off once they pass.'))
  program.push(g('feedback', 'Bounce, complaint and opt-out handling is live', envPassed.has('FEEDBACK_SUPPRESSION'), 'Live.', 'Bounce, complaint and opt-out handling has not been signed off yet.'))
  if (input.trigger) program.push(g('rule_runner', 'Rules can start sequences', RULE_RUNNER_AVAILABLE, 'Available.', 'A rule cannot start a sequence on its own yet. Turn-on is not available.'))
  program.push({
    key: 'approval',
    label: required
      ? `${emailSteps} email${emailSteps === 1 ? '' : 's'} wait${emailSteps === 1 ? 's' : ''} for a person to approve before sending.`
      : `${emailSteps} email${emailSteps === 1 ? '' : 's'} send${emailSteps === 1 ? 's' : ''} without review once live. The copy check still holds anything it blocks.`,
    status: 'INFO',
    reason: '',
    hard: false,
  })
  program.push({ key: 'step_up', label: 'Admin and a verification code', status: 'AT_CONFIRM', reason: 'Asked when you confirm.', hard: false })
  blocks.push({ key: 'program', label: input.trigger && !seq ? 'This rule' : 'This sequence', summary: seq ? `${String(seq.name)} · ${seq.run_state === 'ACTIVE' ? 'Running' : seq.readiness === 'READY' ? 'Ready' : seq.run_state === 'PAUSED' ? 'Paused' : 'Draft'}` : 'No sequence chosen', gates: program })

  const unmet = blocks.flatMap((b) => b.gates).filter((x) => x.hard && x.status === 'NOT_MET')
  return {
    blocks,
    unmet,
    blocker: unmet[0] ?? null,
    allMet: unmet.length === 0,
    autoSteps: required ? 0 : emailSteps,
    requiredSteps: required ? emailSteps : 0,
    fingerprint: unmet.map((x) => x.key).join(','),
  }
}
