import type { UIFieldServerProps } from 'payload'

/**
 * "Edit page content" — shown at the top of a catalog record that indexes a public page (CRM go-live
 * Pass 0). The website renders the product or category from its `public-routes` record; this link takes
 * the editor there, so content is changed in one place only.
 */
export const EditPageContentLink = ({ data, payload }: UIFieldServerProps) => {
  const raw = (data as Record<string, unknown> | undefined)?.page_route
  const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : raw
  if (!id) return null
  const admin = payload?.config?.routes?.admin ?? '/admin'
  const href = `${admin}/collections/public-routes/${encodeURIComponent(String(id))}`
  return (
    <div
      style={{
        marginBlockEnd: 'var(--base, 20px)',
        padding: '12px 16px',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s, 4px)',
        background: 'var(--theme-elevation-50)',
      }}
    >
      <p style={{ margin: 0 }}>
        The website shows this from its public page. To change what visitors see — title, text, images,
        specifications, SEO — edit the page.
      </p>
      <p style={{ margin: '8px 0 0' }}>
        <a className="btn btn--style-primary btn--size-small" href={href}>
          Edit page content
        </a>
      </p>
    </div>
  )
}
