/** Streaming loading state: skeleton rows at final height; they pulse gently, and stay still under reduced motion. */
export default function Loading() {
  return (
    <div className="crm-app">
      <div className="c-side" aria-hidden="true" />
      <main className="c-content" aria-busy="true">
        <p role="status" className="c-muted">
          Loading…
        </p>
        <div className="c-panel c-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="c-skeleton-row" />
          ))}
        </div>
      </main>
    </div>
  )
}
