import type { CrmSession } from '../crm/workspace/session'
import { notifyAdmins, type LockNoticeDeps } from '../auth/mfa/lock-notice'
import { identity } from './client-identity'

/**
 * CRM-C-S1-1 (Security Auditor C-S1): a session that holds the step-up could point outgoing mail at another server.
 * Every change to a sending profile therefore tells every admin, by the same short system email as the step-up lock
 * notice. The text names the kind of change, the profile's name and who made it; it never carries a host, user name,
 * password or address. Audited with counts only. The mail mode still governs delivery (off = nothing leaves).
 */
export type ProfileChange = 'created' | 'saved' | 'activated' | 'deactivated' | 'deleted'

const VERB: Record<ProfileChange, string> = {
  created: 'was added',
  saved: 'was changed (connection, password or From details may have been edited)',
  activated: 'was turned on, so new email is sent through it',
  deactivated: 'was turned off',
  deleted: 'was deleted',
}

export const profileNoticeSubject = (kind: ProfileChange): string => `A CRM sending profile ${kind === 'created' ? 'was added' : kind === 'saved' ? 'was changed' : kind === 'activated' ? 'was turned on' : kind === 'deactivated' ? 'was turned off' : 'was deleted'}`

export function profileNoticeText(kind: ProfileChange, profileName: string, by: string, date: string): string {
  const name = profileName.replace(/[\r\n]+/g, ' ').slice(0, 80) || 'A sending profile'
  const who = by.replace(/[\r\n]+/g, ' ').slice(0, 80) || 'an admin'
  return `On ${date}, the sending profile “${name}” ${VERB[kind]}. Changed by ${who}.\n\nIf this was not expected, sign out everywhere, change the password, and review Settings → Sending profiles.\n\n${identity.emailFrom}\n`
}

export async function notifyProfileChange(s: CrmSession, kind: ProfileChange, profileName: string, now: Date = new Date(), deps: LockNoticeDeps = {}): Promise<void> {
  await notifyAdmins(
    s.payload,
    { kind: `profile-${kind}`, subject: profileNoticeSubject(kind), text: profileNoticeText(kind, profileName, s.displayName, now.toISOString().slice(0, 10)), userId: s.userId, actorId: s.userId },
    deps,
  )
}
