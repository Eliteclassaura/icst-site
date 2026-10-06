'use client'

import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import { IconMore } from '../../../../crm/workspace/ui/Icons'
import { Overflow } from '../../../../crm/workspace/ui/Overflow'
import * as A from '../actions'

const MENU = 'c-menu-item'

export function SaveViewDialog({ list, query, isAdmin }: { list: string; query: string; isAdmin: boolean }) {
  return (
    <ActionDialog
      label="Save view…"
      title="Save this view"
      action={A.saveViewAction}
      hidden={{ list, query }}
      submitLabel="Save view"
      buttonClassName="c-btn is-small is-ghost"
      description="Saves the current filters (not the search text). You can rename or delete your views later."
    >
      <Field name="name" label="Name" required>
        {(a) => <input className="c-input" {...a} maxLength={80} />}
      </Field>
      <label className="c-actions">
        <input type="checkbox" name="pinned" />
        <span>Pin to the sidebar</span>
      </label>
      {isAdmin ? (
        <label className="c-actions">
          <input type="checkbox" name="shared" />
          <span>Share with the whole team (admins only)</span>
        </label>
      ) : null}
    </ActionDialog>
  )
}

export function ViewManage({ view }: { view: { id: string; name: string; pinned: boolean } }) {
  return (
    <Overflow label={<IconMore />} ariaLabel={`Manage view ${view.name}`} className="c-btn is-small is-ghost c-icon-btn">
      <ActionForm inline action={A.updateViewAction} hidden={{ viewId: view.id, pinned: view.pinned ? 'false' : 'true' }} submitLabel={view.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'} submitClassName={MENU} />
      <ActionDialog label="Rename…" title="Rename view" action={A.updateViewAction} hidden={{ viewId: view.id }} submitLabel="Save" buttonClassName={MENU}>
        <Field name="name" label="Name" required>
          {(a) => <input className="c-input" {...a} defaultValue={view.name} maxLength={80} />}
        </Field>
      </ActionDialog>
      <ActionDialog label="Delete…" title="Delete view" action={A.deleteViewAction} hidden={{ viewId: view.id }} submitLabel="Delete view" buttonClassName={MENU} description={`Deletes the saved view “${view.name}”. The records it shows are not affected.`} />
    </Overflow>
  )
}
