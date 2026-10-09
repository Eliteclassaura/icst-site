import {pdfLinkProps} from './link-attrs'
/**
 * H2O Phase 2D — the shared renderers.
 *
 * Extracted from the page template so the homepage composition and the article template render
 * accepted content through exactly the same code. That is the point of the extraction, not tidiness:
 * two renderers would be two chances for one surface to drift from the accepted copy while the
 * other stayed faithful, and the drift would be invisible until someone diffed two pages by eye.
 *
 * Everything here renders React elements from parsed blocks. Nothing is ever passed through
 * `dangerouslySetInnerHTML`, and no construct outside the accepted subset can reach this point,
 * because the parser refuses it first.
 */
import { Fragment, type ReactNode } from 'react'
import type { FeatureMedia } from './feature-media'
import type { Block, InlineNode } from './markdown'
import type { PlacedMedia } from './media'
import type { ResourceDocument } from './resources'

export const renderInline = (nodes: InlineNode[]): ReactNode =>
  nodes.map((node, i) => {
    const key = `${node.kind}-${i}`
    if (node.kind === 'strong') return <strong key={key}>{node.text}</strong>
    if (node.kind === 'emphasis') return <em key={key}>{node.text}</em>
    if (node.kind === 'link')
      return (
        <a href={node.href} key={key} {...pdfLinkProps(node.href)}>
          {node.text}
        </a>
      )
    return <Fragment key={key}>{node.text}</Fragment>
  })

export const renderBlocks = (blocks: Block[]): ReactNode =>
  blocks.map((block, i) => {
    const key = `${block.kind}-${i}`
    if (block.kind === 'heading') {
      // The body's own `#` is the H1 and matches the accepted `h1` value; parity is asserted by test.
      if (block.level === 1) return <h1 key={key}>{renderInline(block.text)}</h1>
      if (block.level === 2) return <h2 key={key}>{renderInline(block.text)}</h2>
      return <h3 key={key}>{renderInline(block.text)}</h3>
    }
    if (block.kind === 'list') {
      return (
        <ul key={key}>
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    }
    return <p key={key}>{renderInline(block.text)}</p>
  })

/**
 * A recovered cohort image.
 *
 * Rendered at its own aspect ratio and never above its native width, so there is no crop to go
 * wrong at a narrow viewport and no upscaling at a wide one. The visual pass changes how the frame
 * around the image is composed; it does not change that contract, which the browser QA measures on
 * every load.
 */
/**
 * Undo the CSV escaping artifact in the frozen alt text.
 *
 * Several rows of `MEDIA_PLACEMENT_AUTHORITY.tsv` carry alt text that was quoted twice on its way
 * into the file, so it reaches the renderer wrapped in quotes with every internal quote doubled —
 * a screen reader announces the literal characters. The authority is frozen and the alt string it
 * intends is unambiguous, so the escaping is undone here, at the point of rendering, rather than
 * by editing a frozen file. Nothing but the escaping changes: the words are the authority's.
 */
export const unescapeAlt = (alt: string): string => {
  const trimmed = alt.startsWith('"') && alt.endsWith('"') && alt.length > 1 ? alt.slice(1, -1) : alt
  return trimmed.replace(/""/g, '"')
}

export const Figure = ({ media }: { media: PlacedMedia }): ReactNode => (
  <figure className={media.role === 'HERO' ? 'media media-hero' : 'media media-inline'}>
    <img
      alt={unescapeAlt(media.alt)}
      height={media.height}
      src={media.src}
      style={{ maxWidth: `${media.renderedMaxWidthPx}px` }}
      width={media.width}
    />
  </figure>
)

/**
 * A recovered image rendered through its authority-recorded crop window.
 *
 * The binary is served exactly as recovered. The window is applied by the browser: the frame is
 * given the crop's own aspect ratio, and the image is sized and offset inside it so that the
 * visible rectangle is precisely the recorded sub-rectangle of the native file.
 *
 * The arithmetic is the standard one for a CSS crop and is worth stating, because it is what makes
 * this a crop rather than a zoom. If the window is `w` wide as a fraction of the native width, the
 * image must be laid out at `100 / w` percent of the frame for that window to fill it; the
 * horizontal offset is then `x0 / (1 - w)` of the overflow. `background-size` and `object-fit` are
 * not used, so nothing is scaled by an unstated factor and nothing is resampled at build time.
 *
 * A one-dimension window (`w === 1`) has no overflow to offset, so the offset term collapses to
 * zero rather than dividing by it.
 */
export const FeatureFigure = ({
  className,
  media,
  priority: _priority,
}: {
  className?: string
  media: FeatureMedia
  priority?: boolean
}): ReactNode => {
  const { x0, y0, x1, y1 } = media.crop
  const fw = x1 - x0
  const fh = y1 - y0
  const pos = (start: number, span: number): string =>
    span >= 1 ? '50%' : `${((start / (1 - span)) * 100).toFixed(4)}%`
  return (
    <figure className={className === undefined ? 'feature' : `feature ${className}`}>
      {/*
        `max-inline-size` is the no-upscaling gate, and it is the crop's own pixel width.

        The image inside is laid out at `100 / fw` percent of the frame, so frame width and image
        width are locked together: the image reaches its native width exactly when the frame
        reaches `native_width * fw`, which is `cropped_width`. Capping the frame there therefore
        caps the image at its native width, at every viewport, without the frame needing to know
        the native number. This was measured wrong before it was measured right — a 1440px asset
        was rendering its 691px crop into a 1619px element at 1440 desktop, which is upscaling a
        frozen binary by arithmetic rather than by intent.
      */}
      <span
        className="feature-frame"
        style={{
          aspectRatio: `${media.croppedWidth} / ${media.croppedHeight}`,
          maxInlineSize: `${media.renderedMaxWidthPx}px`,
        }}
      >
        <img
          alt={media.alt}
          /*
            These are the few primary, bounded feature images on a route.  They are eager by
            contract, so decoding them asynchronously only creates a paint race for a full-page
            capture: the request can be complete while the clipped image has not reached the
            compositor.  Synchronous decode makes the frame's first eligible paint include the
            recovered binary.  It does not alter the file, its crop, or its rendered dimensions.
          */
          decoding="sync"
          height={media.nativeHeight}
          /*
            R2-F5. Eager, always. The image is absolutely positioned inside a clipping frame and
            is frequently larger than it, so the observer behind `loading="lazy"` may never see it
            intersect the viewport and the picture never arrives. There are at most three of these
            per route and on the homepage one of them is the largest contentful paint, so eager is
            also the right call on its own merits.
          */
          loading="eager"
          src={media.src}
          style={{
            inlineSize: `${(100 / fw).toFixed(4)}%`,
            blockSize: `${(100 / fh).toFixed(4)}%`,
            // The frame cap above holds the image to its native width to within a rounding
            // fraction; a percentage of a fractional box can still land a pixel over. These two
            // make the bound exact, so "never upscaled" is true of the measured element and not
            // only of the arithmetic that sizes it.
            maxInlineSize: `${media.nativeWidth}px`,
            maxBlockSize: `${media.nativeHeight}px`,
            insetInlineStart: pos(x0, fw),
            insetBlockStart: pos(y0, fh),
            transform: `translate(-${pos(x0, fw)}, -${pos(y0, fh)})`,
          }}
          width={media.nativeWidth}
        />
      </span>
    </figure>
  )
}

/**
 * The recovered resource documents.
 *
 * Restrained on purpose: a label, a format and a page count, which are the only things about these
 * files that are evidenced. No description, date, revision or applicability is shown, because none
 * is evidenced. The link goes to the document's own preserved path, so an existing bookmark or
 * index entry reaches the same file.
 */
export const DocumentList = ({ documents }: { documents: ResourceDocument[] }): ReactNode => (
  <section aria-labelledby="documents" className="docs">
    <h2 id="documents">Documents</h2>
    <ul className="doc-grid">
      {documents.map((doc) => (
        <li key={doc.attachmentId}>
          <a href={doc.href}>
            <span className="doc-name">{doc.label}</span>
            <span className="doc-meta">
              PDF{doc.pageCount === null ? null : <> · {doc.pageCount} pages</>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  </section>
)
