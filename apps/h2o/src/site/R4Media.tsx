import type { FeatureMedia } from './feature-media'
import { FeatureFigure } from './render'

/** Owner-approved Salmon originals. Browser-only crops; no pixel alteration or project attribution. */
export const R4_MEDIA = {
  tower: {
    src: '/media/r4/salmon-tower.png', nativeWidth: 1195, nativeHeight: 896,
    crop: { x0: 0.04, y0: 0.02, x1: 0.96, y1: 0.94 },
    sha256: '2ce5b0462c2ee93c87a389cf7f047b14e3bd9308723ac241221eba5964e6cf7c',
    alt: 'Cooling tower with external access ladder and upper-deck railings.',
    caption: 'FIELD-ERECTED / INDUSTRIAL COOLING',
  },
  deck: {
    src: '/media/r4/salmon-deck.png', nativeWidth: 2732, nativeHeight: 1536,
    crop: { x0: 0.26, y0: 0.02, x1: 0.995, y1: 0.62 },
    sha256: '3939590bf612913dc12f3ba95bc63b37a797bc50f6f515ee9c777d144c9fa32f',
    alt: 'Cooling tower fan deck and cylindrical fan stacks.',
    caption: 'TECHNICAL LIBRARY / TOWER SYSTEMS',
  },
  fan: {
    src: '/media/r4/salmon-fan.jpg', nativeWidth: 1200, nativeHeight: 630,
    crop: { x0: 0.72, y0: 0.04, x1: 1, y1: 0.96 },
    sha256: 'ae5d2e66c4fcd175e448b554b37c0f46ff5de860c84a1690c3e205a6e86786b2',
    alt: 'Close view of cooling tower fan blades and mechanical assembly.',
    caption: 'COMPONENT DETAIL / FAN ASSEMBLY',
  },
  inspection: {
    src: '/media/r4/salmon-inspection.jpg', nativeWidth: 640, nativeHeight: 480,
    crop: { x0: 0, y0: 0, x1: 1, y1: 0.83 },
    sha256: '90b0794f71e7d6e62bf7c24576e21c24fb5d5f0f50a9b96dc9bda023cd9cc108',
    alt: 'People wearing hard hats standing on a cooling tower deck.',
    caption: 'INDUSTRIAL COOLING / ON THE DECK',
  },
} as const

export const R4Media = ({ kind, className = '' }: { kind: keyof typeof R4_MEDIA; className?: string }) => {
  const asset = R4_MEDIA[kind]
  const croppedWidth = Math.round(asset.nativeWidth * (asset.crop.x1 - asset.crop.x0))
  const media: FeatureMedia = {
    ...asset, croppedWidth,
    croppedHeight: Math.round(asset.nativeHeight * (asset.crop.y1 - asset.crop.y0)),
    renderedMaxWidthPx: Math.min(croppedWidth, asset.nativeWidth * (asset.crop.x1 - asset.crop.x0)),
    attachmentId: `salmon-r4-${kind}`, altState: 'DESCRIPTIVE_NO_PROJECT_ATTRIBUTION',
    region: `R4_${kind.toUpperCase()}`, routeId: 'R4_PRESENTATION',
  }
  return (
    <div className={`r4-media r4-media--${kind} ${className}`} data-media-authority="SALMON_OWNER_APPROVED_R4">
      <FeatureFigure media={media} priority />
      <p className="r4-media-caption"><span aria-hidden="true">＋</span>{asset.caption}</p>
    </div>
  )
}
