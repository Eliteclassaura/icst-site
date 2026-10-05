'use client'

import { useEffect, useState } from 'react'
import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field, useFormOutcome } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../actions'

/**
 * Wave 1 W1-1 record controls: edit an account or a contact from its profile, link a contact to an account, and the
 * "New account" / "New contact" forms. Role rules are explained in place and enforced on the server (mutations and
 * collection hooks); a hidden or disabled control is courtesy, not authorization.
 */

type Person = { id: string; name: string }

export const RELATIONSHIP_OPTIONS: Array<[string, string, boolean]> = [
  ['UNKNOWN', 'Relationship unknown', false],
  ['CANDIDATE', 'Candidate', false],
  ['PROSPECT', 'Prospect', false],
  ['VERIFIED_CUSTOMER', 'Verified customer (admin)', true],
  ['VERIFIED_PAST_CUSTOMER', 'Verified past customer (admin)', true],
]

export const FUNCTION_OPTIONS: Array<[string, string]> = [
  ['UNKNOWN', 'Not known'],
  ['ENGINEERING_TECHNICAL', 'Engineering / technical'],
  ['PLANT_OPERATIONS', 'Plant operations'],
  ['MAINTENANCE_RELIABILITY', 'Maintenance / reliability'],
  ['PROCUREMENT_SOURCING', 'Procurement / sourcing'],
  ['PROJECT_MANAGEMENT', 'Project management'],
  ['EXECUTIVE_MANAGEMENT', 'Executive management'],
  ['EPC_CONSULTANT_THIRD_PARTY', 'EPC / consultant / third party'],
  ['OTHER', 'Other'],
]

function OwnerSelect({ a, people, current, allowNone = true }: { a: Record<string, unknown>; people: Person[]; current: string | null; allowNone?: boolean }) {
  return (
    <select className="c-select" {...a} defaultValue={current ?? ''}>
      {allowNone ? <option value="">No owner</option> : null}
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}

function RelationshipSelect({ a, current, isAdmin }: { a: Record<string, unknown>; current: string; isAdmin: boolean }) {
  const locked = !isAdmin && (current === 'VERIFIED_CUSTOMER' || current === 'VERIFIED_PAST_CUSTOMER')
  return (
    <select className="c-select" {...a} defaultValue={current} disabled={locked}>
      {RELATIONSHIP_OPTIONS.map(([v, l, adminOnly]) => (
        <option key={v} value={v} disabled={adminOnly && !isAdmin && v !== current}>
          {l}
        </option>
      ))}
    </select>
  )
}

export function EditAccountDialog({
  account,
  people,
  isAdmin,
}: {
  account: { id: string; updatedAt: string; name: string; legalName: string | null; industry: string | null; relationship: string; ownerId: string | null }
  people: Person[]
  isAdmin: boolean
}) {
  const verified = account.relationship === 'VERIFIED_CUSTOMER' || account.relationship === 'VERIFIED_PAST_CUSTOMER'
  return (
    <ActionDialog
      label="Edit details"
      title="Edit account"
      action={A.updateAccountAction}
      hidden={{ accountId: account.id, expectedUpdatedAt: account.updatedAt }}
      submitLabel="Save account"
      description="Changes are recorded in the audit history. Domains, tier and archiving stay with admins in Payload admin."
    >
      <Field name="name" label="Company name" required>
        {(a) => <input className="c-input" {...a} defaultValue={account.name} maxLength={160} />}
      </Field>
      <div className="c-form-grid">
        <Field name="legalName" label="Legal name">
          {(a) => <input className="c-input" {...a} defaultValue={account.legalName ?? ''} maxLength={200} />}
        </Field>
        <Field name="industry" label="Industry" hint="Only when evidenced. Empty means unknown.">
          {(a) => <input className="c-input" {...a} defaultValue={account.industry ?? ''} maxLength={120} />}
        </Field>
        <Field
          name="relationship"
          label="Relationship"
          hint={!isAdmin && verified ? 'A verified relationship can be changed by an admin only.' : !isAdmin ? 'Verified relationships are set by admins.' : undefined}
        >
          {(a) => <RelationshipSelect a={a} current={account.relationship} isAdmin={isAdmin} />}
        </Field>
        <Field name="ownerId" label="Owner">
          {(a) => <OwnerSelect a={a} people={people} current={account.ownerId} />}
        </Field>
      </div>
    </ActionDialog>
  )
}

export function EditContactDialog({
  contact,
  people,
}: {
  contact: {
    id: string
    updatedAt: string
    email: string | null
    firstName: string | null
    lastName: string | null
    title: string | null
    contactFunction: string
    phone: string | null
    ownerId: string | null
  }
  people: Person[]
}) {
  return (
    <ActionDialog
      label="Edit details"
      title="Edit contact"
      action={A.updateContactAction}
      hidden={{ contactId: contact.id, expectedUpdatedAt: contact.updatedAt }}
      submitLabel="Save contact"
      description="Changes are recorded in the audit history."
    >
      <div className="c-field">
        <span>Email</span>
        <p className="c-locked">
          {contact.email ?? 'Not recorded'} <span className="c-tag">Locked</span>
        </p>
        <span className="c-hint">An address is the contact’s identity and can’t be changed. For a different address, create a new contact.</span>
      </div>
      <div className="c-form-grid">
        <Field name="firstName" label="First name">
          {(a) => <input className="c-input" {...a} defaultValue={contact.firstName ?? ''} maxLength={80} autoComplete="off" />}
        </Field>
        <Field name="lastName" label="Last name">
          {(a) => <input className="c-input" {...a} defaultValue={contact.lastName ?? ''} maxLength={80} autoComplete="off" />}
        </Field>
        <Field name="title" label="Title" hint="A title is not an authority claim.">
          {(a) => <input className="c-input" {...a} defaultValue={contact.title ?? ''} maxLength={120} />}
        </Field>
        <Field name="contactFunction" label="Function">
          {(a) => (
            <select className="c-select" {...a} defaultValue={contact.contactFunction}>
              {FUNCTION_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field name="phone" label="Phone" hint="As the contact gives it. Leave empty to remove.">
          {(a) => <input className="c-input" type="tel" {...a} defaultValue={contact.phone ?? ''} maxLength={40} autoComplete="off" />}
        </Field>
        <Field name="ownerId" label="Owner">
          {(a) => <OwnerSelect a={a} people={people} current={contact.ownerId} />}
        </Field>
      </div>
    </ActionDialog>
  )
}

type AccountHit = { id: string; name: string; relationship: string; domains: Array<{ domain: string; status: string }> }

/** Account search for pickers (as the user, debounced). */
function useAccountSearch(initial: string) {
  const [q, setQ] = useState(initial)
  const [hits, setHits] = useState<AccountHit[] | null>(null)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      A.searchAccountsAction(q).then((r) => {
        if (live) setHits(r as AccountHit[])
      })
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])
  return { q, setQ, hits }
}

function AccountPicker({ name = 'accountId', initial = '', current }: { name?: string; initial?: string; current?: { id: string; name: string } | null }) {
  const { q, setQ, hits } = useAccountSearch(initial)
  return (
    <>
      <label className="c-field">
        <span>Search accounts</span>
        <input className="c-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <fieldset className="c-fieldset">
        <legend>Account</legend>
        {current ? (
          <label className="c-actions" aria-label={`${current.name} (current)`}>
            <input type="radio" name={name} value={current.id} defaultChecked />
            <span>
              <strong>{current.name}</strong> <span className="c-muted">(current)</span>
            </span>
          </label>
        ) : null}
        {hits === null ? <p className="c-hint">Searching…</p> : null}
        {hits && hits.length === 0 ? <p className="c-hint">No matching accounts.</p> : null}
        {(hits ?? [])
          .filter((h) => h.id !== current?.id)
          .map((h) => (
            <label key={h.id} className="c-actions">
              <input type="radio" name={name} value={h.id} />
              <span>
                <strong>{h.name}</strong>{' '}
                <span className="c-muted">
                  {h.domains.map((d) => `${d.domain}${d.status.startsWith('VERIFIED') ? ' (verified)' : ' (unverified)'}`).join(', ') || 'no domain'}
                </span>
              </span>
            </label>
          ))}
      </fieldset>
    </>
  )
}

function ConfidenceSelect({ a, isAdmin }: { a: Record<string, unknown>; isAdmin: boolean }) {
  return (
    <select className="c-select" {...a} defaultValue="HIGH_CONFIDENCE">
      <option value="HIGH_CONFIDENCE">High confidence (e.g. company email, they said so)</option>
      <option value="LOW_CONFIDENCE">Low confidence (likely, not confirmed)</option>
      <option value="VERIFIED" disabled={!isAdmin}>
        Verified{isAdmin ? '' : ' (admin)'}
      </option>
    </select>
  )
}

export function ContactAccountDialog({
  contactId,
  updatedAt,
  current,
  verified,
  isAdmin,
}: {
  contactId: string
  updatedAt: string
  current: { id: string; name: string } | null
  verified: boolean
  isAdmin: boolean
}) {
  if (verified && !isAdmin) return <span className="c-hint">Verified link · admins change it</span>
  return (
    <ActionDialog
      label={current ? 'Change account' : 'Link account'}
      title="Link contact to an account"
      action={A.linkContactAccountAction}
      hidden={{ contactId, expectedUpdatedAt: updatedAt }}
      submitLabel="Save link"
      description="Say how you know this person belongs to the company. Records are never merged; the link is audited."
    >
      <AccountPicker current={current} />
      <Field name="confidence" label="How do you know?">
        {(a) => <ConfidenceSelect a={a} isAdmin={isAdmin} />}
      </Field>
    </ActionDialog>
  )
}

export function NewAccountForm({ people, meId, isAdmin }: { people: Person[]; meId: string; isAdmin: boolean }) {
  return (
    <ActionForm action={A.newAccountAction} submitLabel="Create account">
      <Field name="name" label="Company name" required>
        {(a) => <input className="c-input" {...a} maxLength={160} autoComplete="off" />}
      </Field>
      <div className="c-form-grid">
        <Field name="domain" label="Web domain (optional)" hint="Saved as an unverified candidate; verifying is an admin act.">
          {(a) => <input className="c-input" {...a} autoComplete="off" placeholder="example.com" />}
        </Field>
        <Field name="relationship" label="Relationship">
          {(a) => <RelationshipSelect a={a} current="UNKNOWN" isAdmin={isAdmin} />}
        </Field>
        <Field name="ownerId" label="Owner">
          {(a) => <OwnerSelect a={a} people={people} current={meId} />}
        </Field>
      </div>
    </ActionForm>
  )
}

function ExistingContactLink() {
  const state = useFormOutcome()
  if (state.code !== 'CONTACT_EXISTS' || !state.existingId) return null
  return (
    <p className="c-banner" role="status">
      <span>
        This address already belongs to a contact. <a href={`/crm/contacts/${state.existingId}/`}>Open that contact</a>
      </span>
    </p>
  )
}

export function NewContactForm({
  people,
  meId,
  isAdmin,
  account,
}: {
  people: Person[]
  meId: string
  isAdmin: boolean
  account: { id: string; name: string } | null
}) {
  const [linked, setLinked] = useState(Boolean(account))
  return (
    <ActionForm action={A.newContactAction} submitLabel="Create contact">
      <ExistingContactLink />
      <Field name="email" label="Email" required hint="The contact’s identity. It can’t be changed later.">
        {(a) => <input className="c-input" type="email" {...a} maxLength={254} autoComplete="off" />}
      </Field>
      <div className="c-form-grid">
        <Field name="firstName" label="First name">
          {(a) => <input className="c-input" {...a} maxLength={80} autoComplete="off" />}
        </Field>
        <Field name="lastName" label="Last name">
          {(a) => <input className="c-input" {...a} maxLength={80} autoComplete="off" />}
        </Field>
        <Field name="title" label="Title">
          {(a) => <input className="c-input" {...a} maxLength={120} />}
        </Field>
        <Field name="contactFunction" label="Function">
          {(a) => (
            <select className="c-select" {...a} defaultValue="UNKNOWN">
              {FUNCTION_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field name="phone" label="Phone">
          {(a) => <input className="c-input" type="tel" {...a} maxLength={40} autoComplete="off" />}
        </Field>
        <Field name="ownerId" label="Owner">
          {(a) => <OwnerSelect a={a} people={people} current={meId} />}
        </Field>
      </div>
      <label className="c-actions">
        <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
        <span>Link to an account now</span>
      </label>
      {linked ? (
        <>
          <AccountPicker current={account} />
          <Field name="confidence" label="How do you know?">
            {(a) => <ConfidenceSelect a={a} isAdmin={isAdmin} />}
          </Field>
        </>
      ) : null}
      <p className="c-hint">If this address is on do-not-contact, the new contact is too: suppressions follow the address.</p>
    </ActionForm>
  )
}
