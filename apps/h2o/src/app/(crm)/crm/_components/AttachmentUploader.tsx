'use client'

import { useId, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'

/**
 * CRM-ATTACH-1: the upload control for one record. Files go one at a time to `/crm/attachments/upload/` (so each gets its own
 * result and progress), in the order chosen. Drag-and-drop, a button, several files at once. Every refusal is shown
 * in words, with the file's name. Nothing is stored in the browser.
 */

type Row = { key: number; name: string; state: 'waiting' | 'sending' | 'done' | 'failed'; progress: number; message: string }

type Props = { kind: string; recordId: string; accept: string; limitLabel: string }

export function AttachmentUploader({ kind, recordId, accept, limitLabel }: Props) {
  const router = useRouter()
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const sendOne = (key: number, file: File) =>
    new Promise<void>((resolve) => {
      const form = new FormData()
      form.append('kind', kind)
      form.append('recordId', recordId)
      form.append('file', file, file.name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/crm/attachments/upload/')
      xhr.responseType = 'json'
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) patch(key, { progress: Math.round((e.loaded / e.total) * 100) })
      }
      xhr.onload = () => {
        const body = (xhr.response ?? {}) as { ok?: boolean; message?: string }
        if (xhr.status === 201 && body.ok) patch(key, { state: 'done', progress: 100, message: body.message ?? 'Attached.' })
        else patch(key, { state: 'failed', message: body.message ?? 'The file could not be attached. Try again.' })
        resolve()
      }
      xhr.onerror = () => {
        patch(key, { state: 'failed', message: 'The connection dropped. Nothing was attached; try again.' })
        resolve()
      }
      xhr.send(form)
    })

  const attach = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length || busy) return
    const start = Date.now()
    const base = rows.length
    setRows((rs) => [...rs, ...list.map((f, i) => ({ key: start + base + i, name: f.name, state: 'waiting' as const, progress: 0, message: '' }))])
    setBusy(true)
    for (let i = 0; i < list.length; i++) {
      const key = start + base + i
      patch(key, { state: 'sending' })
      await sendOne(key, list[i]!)
    }
    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
    router.refresh()
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    if (!busy) void attach(e.dataTransfer.files)
  }

  return (
    <div className="c-block">
      <div
        className={`att-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <label htmlFor={inputId} className="c-btn is-primary att-pick">
          Attach files
        </label>
        <input
          id={inputId}
          ref={fileInput}
          type="file"
          multiple
          accept={accept}
          className="att-input"
          disabled={busy}
          onChange={(e) => void attach(e.currentTarget.files ?? [])}
        />
        <p className="c-hint">Drop files here, or choose them. {limitLabel}</p>
      </div>
      <ul className="att-rows" aria-live="polite" role="list">
        {rows.map((r) => (
          <li key={r.key} className={`att-row is-${r.state}`}>
            <span className="att-name">{r.name}</span>
            {r.state === 'sending' ? (
              <progress className="att-progress" value={r.progress} max={100} aria-label={`Sending ${r.name}`} />
            ) : null}
            <span className="c-muted">
              {r.state === 'waiting' ? 'Waiting' : r.state === 'sending' ? `Sending ${r.progress}%` : r.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
