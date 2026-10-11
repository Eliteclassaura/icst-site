import type { Metadata } from 'next'
import { listUserSignatures, loadStandard, resolveSignature } from '../../../../../crm/settings/signatures'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { EditSignatureDialog, MySignatureForm, StandardSignatureForm } from '../../_components/SignatureForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Signatures' }

/**
 * SIGNATURES-1: Settings → Signatures. Everyone sees "My signature" (one box, a live preview, Save). Admins also edit the
 * organisation's standard signature and anyone's own. No step-up: a signature starts and sends nothing.
 */
export default async function SignaturesPage() {
  const s = await requireCrmSession('/crm/settings/signatures/')
  const standard = await loadStandard(s.payload)
  const me = (await s.payload.findByID({ collection: 'users', id: s.userId, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
  const used = await resolveSignature(s.payload, s.userId)
  const rows = s.isAdmin ? await listUserSignatures(s) : []
  return (
    <Shell active="settings" title="Signatures" crumb={s.isAdmin ? <a href="/crm/settings/">Settings</a> : undefined} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <div className="c-stack">
        <section className="c-panel is-settings" aria-labelledby="sig-mine-h">
          <div className="c-panel-head">
            <h2 id="sig-mine-h">My signature</h2>
          </div>
          <div className="c-panel-body is-padded">
            <p className="c-hint">Your replies end with {used.label}. Switch off “Use the standard signature” to write your own.</p>
            <MySignatureForm initialText={typeof me?.signature_text === 'string' ? me.signature_text : ''} initialUseStandard={me?.signature_use_standard !== false} standard={standard} />
          </div>
        </section>
        {s.isAdmin ? (
          <>
            <section className="c-panel is-settings" aria-labelledby="sig-std-h">
              <div className="c-panel-head">
                <h2 id="sig-std-h">Standard signature</h2>
              </div>
              <div className="c-panel-body is-padded">
                <StandardSignatureForm initial={standard} />
              </div>
            </section>
            <section className="c-panel is-settings" aria-labelledby="sig-all-h">
              <div className="c-panel-head">
                <h2 id="sig-all-h">Everyone’s signature</h2>
              </div>
              <div className="c-panel-body is-padded">
                <div className="c-table-wrap">
                  <table className="c-table">
                    <caption className="c-visually-hidden">Signatures by person</caption>
                    <thead>
                      <tr>
                        <th scope="col">Person</th>
                        <th scope="col">Uses</th>
                        <th scope="col">Signature</th>
                        <th scope="col">
                          <span className="c-visually-hidden">Edit</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.useStandard || !r.text ? 'Standard' : 'Their own'}</td>
                          <td className="c-sig-cell">{r.useStandard || !r.text ? <span className="c-muted">Standard</span> : r.text.split('\n')[0]}</td>
                          <td className="act">
                            <EditSignatureDialog userId={r.id} name={r.name} initialText={r.text} initialUseStandard={r.useStandard} standard={standard} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Shell>
  )
}
