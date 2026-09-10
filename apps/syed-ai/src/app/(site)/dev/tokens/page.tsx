import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  Container,
  Stack,
  Band,
  Rule,
  Button,
  Link,
  Label,
  Num,
  Table,
  Dl,
  Field,
} from '@factory/agency-core/design-system'
import contract from '../../../../../design/design-contract.json'
import report from '../../../../design/generated/contrast-report.json'

export const metadata: Metadata = { title: 'Design tokens (dev)', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

// Dev-only preview of the compiled design system. Hidden in production builds.
export default function TokensPage() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_ROUTES !== '1') notFound()
  const colors = Object.entries(contract.colors)
  return (
    <main>
      <Band>
        <Container>
          <Stack gap={6}>
            <Stack gap={2}>
              <Label className="au">
                Design contract · v{contract.version} · {contract.meta.client}
              </Label>
              <h1 className="t-d1">The vocabulary, rendered once.</h1>
              <p className="t-lead prose">
                Every value on this page comes from <code>design-contract.json</code> through the compiler.
                Nothing is hand-styled. Bodoni Moda at opsz 14 for display and numerals; Jost for everything
                else.
              </p>
            </Stack>
            <Rule variant="gold" />

            <section aria-labelledby="colours">
              <Stack gap={4}>
                <h2 id="colours" className="t-d3">
                  Colour roles
                </h2>
                <ul
                  role="list"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 'var(--s-4)',
                  }}
                >
                  {colors.map(([role, t]) => (
                    <li key={role} style={{ border: 'var(--border-hair)', padding: 'var(--s-3)' }}>
                      <div
                        aria-hidden="true"
                        style={{ height: 'var(--s-7)', background: t.value, border: 'var(--border-visible)' }}
                      />
                      <p className="t-sm" style={{ marginTop: 'var(--s-2)' }}>
                        {role}
                      </p>
                      <p className="t-cap mut">
                        <Num>{t.value}</Num> · {t.source.kind}
                      </p>
                    </li>
                  ))}
                </ul>
              </Stack>
            </section>

            <section aria-labelledby="type">
              <Stack gap={4}>
                <h2 id="type" className="t-d3">
                  Type scale
                </h2>
                <p className="t-d1">Display one — 34 → 68</p>
                <p className="t-d2 font-display">Display two — 28 → 46</p>
                <p className="t-d3 font-display">Display three — 24 → 34</p>
                <p className="t-h3">Heading three — 20</p>
                <p className="t-lead">
                  Lead — 18. Read by pattern-matching on word silhouettes, not letter by letter.
                </p>
                <p className="t-body prose">
                  Body — 17. The measure is capped at {contract.typography.measure.value.ideal}ch so a line
                  stays readable on a wide screen; this paragraph demonstrates it by running long enough to
                  wrap at least twice.
                </p>
                <p className="t-sm">Small — 15</p>
                <p className="t-cap mut">Caption — 13</p>
                <Label>Label — 11 · uppercase · tracked</Label>
                <p>
                  <Num className="t-d1 au">51.7K</Num> <Num className="t-h3">1,840</Num>
                </p>
              </Stack>
            </section>

            <section aria-labelledby="prims">
              <Stack gap={5}>
                <h2 id="prims" className="t-d3">
                  Primitives
                </h2>
                <div style={{ display: 'flex', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
                  <Button>Send the brief</Button>
                  <Button variant="ghost">Read the method</Button>
                  <Button variant="ghost" size="sm">
                    Small
                  </Button>
                  <Link href="#type">Inline link →</Link>
                </div>
                <Table caption="Comparison table primitive with a decorative divider set." compare>
                  <thead>
                    <tr>
                      <th scope="col">Decision</th>
                      <th scope="col">SEO</th>
                      <th scope="col">GEO</th>
                      <th scope="col">Why it differs</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">What you win</th>
                      <td>A ranking</td>
                      <td>A citation</td>
                      <td>Different output, different measurement</td>
                    </tr>
                    <tr>
                      <th scope="row">Unit of work</th>
                      <td>Keyword</td>
                      <td>Prompt set</td>
                      <td>Prompts are sampled, not counted</td>
                    </tr>
                  </tbody>
                </Table>
                <Dl
                  items={[
                    {
                      id: 'citation-share',
                      term: 'Citation share',
                      detail: 'The share of sampled answers that cite your domain.',
                    },
                    {
                      id: 'prompt-set',
                      term: 'Prompt set',
                      detail: 'A fixed, revenue-weighted list of questions scored on a schedule.',
                    },
                  ]}
                />
                <form style={{ display: 'grid', gap: 'var(--s-4)', maxWidth: '36rem' }} onSubmit={undefined}>
                  <Field id="f-name" label="Name">
                    <input id="f-name" name="name" autoComplete="name" />
                  </Field>
                  <Field id="f-email" label="Email" error="Please check this">
                    <input
                      id="f-email"
                      name="email"
                      type="email"
                      aria-describedby="f-email-err"
                      aria-invalid="true"
                    />
                  </Field>
                </form>
              </Stack>
            </section>

            <section aria-labelledby="contrast">
              <Stack gap={4}>
                <h2 id="contrast" className="t-d3">
                  Contrast report
                </h2>
                <Table caption={`WCAG 2.2 AA · ${report.pass ? 'all pairs pass' : 'FAILURES PRESENT'}`}>
                  <thead>
                    <tr>
                      <th scope="col">Foreground</th>
                      <th scope="col">Background</th>
                      <th scope="col">Use</th>
                      <th scope="col">Ratio</th>
                      <th scope="col">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((r) => (
                      <tr key={r.foreground + r.background}>
                        <th scope="row">{r.foreground}</th>
                        <td>{r.background}</td>
                        <td>{r.use}</td>
                        <td>
                          <Num>{r.ratio}</Num>
                        </td>
                        <td>
                          {r.required} {r.pass ? '✓' : '✗'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Stack>
            </section>
          </Stack>
        </Container>
      </Band>
    </main>
  )
}
