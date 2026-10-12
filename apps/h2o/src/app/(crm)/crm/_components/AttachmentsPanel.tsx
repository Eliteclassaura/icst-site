import { ACCEPT_ATTRIBUTE, limitLabel } from '../../../../crm/attachments/accept'
import { canSeeRecord, listAttachments, type AttachKind } from '../../../../crm/attachments/service'
import { compactTime } from '../../../../crm/workspace/time'
import type { CrmSession } from '../../../../crm/workspace/session'
import { ActionForm } from '../../../../crm/workspace/ui/ActionForm'
import { deleteAttachmentAction } from '../attachments/actions'
import { AttachmentUploader } from './AttachmentUploader'

/**
 * CRM-ATTACH-1: the Files section of a contact, account, deal or inquiry. Lists the live files the person may see, with
 * download links (through the authenticated route) and a Remove action for the uploader or an admin.
 */
export async function AttachmentsPanel({ s, kind, recordId, now = new Date() }: { s: CrmSession; kind: AttachKind; recordId: string; now?: Date }) {
  if (!(await canSeeRecord(s, kind, recordId))) return null
  const files = await listAttachments(s, kind, recordId)
  return (
    <section className="c-panel" aria-labelledby="files-h">
      <div className="c-panel-head">
        <h2 id="files-h">Files</h2>
      </div>
      <div className="c-block">
        <AttachmentUploader kind={kind} recordId={recordId} accept={ACCEPT_ATTRIBUTE} limitLabel={limitLabel(process.env)} />
        {files.length === 0 ? (
          <p className="c-hint">No files attached yet.</p>
        ) : (
          <>
            {/* ATTACH-1.2 (Auditor): files are not scanned for malware, and spreadsheets can run formulas when opened. */}
            <p className="c-hint">Files are not virus-scanned. Open only files you expect, and treat spreadsheets (CSV, Excel) with care.</p>
          <ul className="att-list" role="list">
            {files.map((f) => (
              <li key={f.id} className="att-item">
                <a href={`/crm/attachments/${f.id}/`} download>
                  {f.name}
                </a>
                <span className="c-muted">
                  {f.sizeLabel} · {f.uploadedBy} · <time dateTime={f.createdAt}>{compactTime(new Date(f.createdAt), now, s.timeZone)}</time>
                </span>
                {f.note ? <p className="c-note-body">{f.note}</p> : null}
                {f.canDelete ? (
                  <ActionForm action={deleteAttachmentAction} hidden={{ id: f.id }} submitLabel={`Remove ${f.name}`} submitClassName="c-btn is-quiet" />
                ) : null}
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </section>
  )
}
