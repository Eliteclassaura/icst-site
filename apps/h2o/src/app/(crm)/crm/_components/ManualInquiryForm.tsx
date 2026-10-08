'use client'

import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import { manualInquiryAction } from '../actions'

type Person = { id: string; name: string }
const INTEREST: Array<[string, string]> = [
  ['', 'Not classified yet'],
  ['PARTS', 'Parts'],
  ['REPAIR', 'Repair'],
  ['REBUILD_REPLACEMENT', 'Rebuild / replacement'],
  ['NEW_TOWER', 'New tower'],
  ['UPGRADE_RETROFIT', 'Upgrade / retrofit'],
  ['MAINTENANCE_INSPECTION', 'Maintenance / inspection'],
  ['OTHER_APPROVED', 'Other (approved motion)'],
]

/**
 * Manual New Inquiry form (accepted board F07d, amendment A). Two visually separate groups:
 * CUSTOMER SUPPLIED and STAFF ADDED / CLASSIFIED. `token` is a one-time server-issued id that makes a
 * double submit return the same RFQ.
 */
export function ManualInquiryForm({ token, people, meId }: { token: string; people: Person[]; meId: string }) {
  return (
    <ActionForm action={manualInquiryAction} hidden={{ token }} submitLabel="Create inquiry" draft="new-inquiry">
      <fieldset className="c-fieldset">
        <legend>Customer supplied</legend>
        <p className="c-hint">
          Required: what the customer asked for, and a phone number or an email address (one is enough).
        </p>
        <div className="c-form-grid">
          <Field name="firstName" label="First name">
            {(a) => <input className="c-input" {...a} autoComplete="off" maxLength={80} />}
          </Field>
          <Field name="lastName" label="Last name">
            {(a) => <input className="c-input" {...a} autoComplete="off" maxLength={80} />}
          </Field>
          <Field name="company" label="Company" wide>
            {(a) => <input className="c-input" {...a} autoComplete="off" maxLength={160} />}
          </Field>
          <Field name="phone" label="Phone" hint="Phone or email: at least one is required.">
            {(a) => <input className="c-input" type="tel" inputMode="tel" {...a} autoComplete="off" maxLength={40} />}
          </Field>
          <Field name="email" label="Email" hint="Email or phone: at least one is required.">
            {(a) => <input className="c-input" type="email" inputMode="email" {...a} autoComplete="off" maxLength={254} />}
          </Field>
          <Field name="message" label="What the customer asked for" wide required>
            {(a) => <textarea className="c-textarea" {...a} maxLength={5000} rows={6} />}
          </Field>
        </div>
      </fieldset>
      <fieldset className="c-fieldset">
        <legend>Staff added / classified</legend>
        <div className="c-form-grid">
          <Field name="motion" label="Interest (staff classification)">
            {(a) => (
              <select className="c-select" {...a} defaultValue="">
                {INTEREST.map(([v, l]) => (
                  <option key={v || 'none'} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <label className="c-field">
            <span>Source</span>
            <input className="c-input" value="Manual" readOnly aria-readonly="true" />
          </label>
          <Field name="assigneeId" label="Owner (optional)">
            {(a) => (
              <select className="c-select" {...a} defaultValue={meId}>
                <option value="">Leave unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <span />
          <Field name="followUpTitle" label="Follow-up (optional)">
            {(a) => <input className="c-input" {...a} maxLength={160} placeholder="e.g. Call back with part numbers" />}
          </Field>
          <Field name="followUpDue" label="Follow-up due" hint="Required when a follow-up title is given.">
            {(a) => <input className="c-input" type="date" {...a} />}
          </Field>
        </div>
        <p className="c-hint">
          Possible matches are not linked automatically: an ambiguous contact or company is saved unlinked and flagged for identity review. Nothing is sent to
          the customer.
        </p>
      </fieldset>
    </ActionForm>
  )
}
