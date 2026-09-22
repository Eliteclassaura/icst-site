import { testimonials, type Testimonial } from './testimonials'

const Attribution = ({ testimonial }: { testimonial: Testimonial }) => (
  <footer className="testimonial-attribution">
    <strong>{testimonial.person}</strong>
    <span>
      {testimonial.company} / {testimonial.title}
    </span>
  </footer>
)

const Quote = ({ testimonial }: { testimonial: Testimonial }) => (
  <blockquote>
    {testimonial.quoteLines.map((line) => (
      <p key={line}>{line}</p>
    ))}
  </blockquote>
)

export const Testimonials = () => {
  const [featured, ...rows] = testimonials
  if (featured === undefined) return null
  return (
    <section aria-labelledby="testimonials" className="band testimonials">
      <div className="shell">
        <h2 className="sec-title" id="testimonials">
          Testimonials
        </h2>
        <article className="testimonial-feature">
          <Quote testimonial={featured} />
          <Attribution testimonial={featured} />
        </article>
        <div className="testimonial-rows">
          {rows.slice(0, 3).map((testimonial) => (
            <article className="testimonial-row" key={testimonial.recordId}>
              <Quote testimonial={testimonial} />
              <Attribution testimonial={testimonial} />
            </article>
          ))}
        </div>
        <details className="testimonial-more">
          <summary>More customer perspectives ({rows.length - 3})</summary>
          <div className="testimonial-rows testimonial-rows--more">
            {rows.slice(3).map((testimonial) => (
              <article className="testimonial-row" key={testimonial.recordId}>
                <Quote testimonial={testimonial} />
                <Attribution testimonial={testimonial} />
              </article>
            ))}
          </div>
        </details>
      </div>
    </section>
  )
}
