import type { ImageRef } from '../types'

/**
 * Renders an ImageRef as a plain <img> with srcset. No framework image component: blocks must work
 * in any host (Next today, others later) and the URLs are already sized by Payload/S3.
 */
export function Picture({
  image,
  sizes = '100vw',
  loading = 'lazy',
  fetchPriority,
  className,
}: {
  image: ImageRef
  sizes?: string
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
  className?: string
}) {
  const srcSet = image.sources?.map((s) => `${s.url} ${s.width}w`).join(', ')
  return (
    <img
      className={className}
      src={image.url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={image.decorative ? '' : image.alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
    />
  )
}
