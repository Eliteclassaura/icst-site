import type { CollectionConfig } from 'payload'
import { ProductCategories } from './product-categories'
import { ProductFamilies } from './product-families'
import { ProductEvidence } from './product-evidence'
import { ProductDocumentFiles } from './product-document-files'
import { ProductDocuments } from './product-documents'
import { ProductMedia } from './product-media'
import { PricingObservations } from './pricing-observations'
import { Products } from './products'

export { ProductCategories, ProductFamilies, ProductEvidence, ProductDocumentFiles }
export { ProductDocuments, ProductMedia, PricingObservations, Products }

/**
 * The 2A.2 catalog foundation, in dependency order.
 *
 * The order mirrors the blueprint's build order — manufacturers, categories, families, media, documents,
 * evidence, products, pricing — because that is the order a later import has to create records in, and
 * keeping the registration in the same order makes the two readable against each other. `manufacturers`
 * is not here: it was registered in 2A.1B and is untouched.
 *
 * Two entries are factories because their upload `staticDir` must be an absolute path: the standalone
 * server's working directory is not the app directory, which the Factory established the hard way.
 */
export const catalogCollections = (mediaDir: string): CollectionConfig[] => [
  ProductCategories,
  ProductFamilies,
  ProductMedia(mediaDir),
  ProductDocumentFiles(mediaDir),
  ProductDocuments,
  ProductEvidence,
  Products,
  PricingObservations,
]
