import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { registry } from '@factory/agency-core/blocks'
import { Container, Stack, Label } from '@factory/agency-core/design-system'

export const metadata: Metadata = { title: 'Block registry (dev)', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Index of the component registry: one link per fixture. Hidden in production unless DEV_ROUTES=1. */
export default function BlocksIndex() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_ROUTES !== '1') notFound()
  return (
    <main>
      <Container>
        <Stack gap={6} style={{ paddingBlock: 'var(--s-7)' }}>
          <div>
            <Label>Component registry</Label>
            <h1 className="t-d2">{registry.length} blocks, every fixture</h1>
            <p className="t-lead">
              Each entry renders in isolation with real copy. The e2e suite loops this list.
            </p>
          </div>
          <ul className="ds-stack" data-gap="4" style={{ listStyle: 'none', padding: 0 }}>
            {registry.map((b) => (
              <li key={b.slug}>
                <h2 className="t-h3">
                  {b.label} <code className="t-cap">{b.slug}</code> <span className="t-cap">· {b.kind}</span>
                  {b.interactive && <span className="t-cap"> · interactive</span>}
                </h2>
                <p>
                  {Object.keys(b.fixtures).map((f) => (
                    <a
                      key={f}
                      className="ds-link"
                      href={`/dev/blocks/${b.slug}/?fixture=${f}`}
                      style={{ marginInlineEnd: 'var(--s-4)' }}
                    >
                      {f}
                    </a>
                  ))}
                </p>
                <ul className="t-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {b.a11y.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Stack>
      </Container>
    </main>
  )
}
