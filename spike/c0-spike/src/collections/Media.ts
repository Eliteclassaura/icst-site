import type { CollectionConfig } from 'payload'
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: { mimeTypes: ['image/*'], imageSizes: [{ name: 'thumb', width: 320 }] },
  fields: [{ name: 'alt', type: 'text', required: true }],
}
