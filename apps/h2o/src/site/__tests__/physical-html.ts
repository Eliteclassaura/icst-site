import {physicalImagePath} from '../../content/image-slugs'

/**
 * IMG-SEO-1 phase B: pages name the descriptive image URL; these older tests pin images by the physical (hash) file they hold.
 * `physicalHtml` maps every descriptive image URL in rendered markup back to its physical file, so their identity checks stay exact.
 * The phase B guard (image-slugs.test.tsx) pins the descriptive URLs themselves.
 */
export const physicalHtml=(html:string):string=>html.replace(/\/media\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.(?:png|jpe?g|webp|gif)/g,url=>physicalImagePath(url)??url)
/** A ledger or head src named by a descriptive URL, as the physical public path. */
export const physicalSrc=(src:string):string=>physicalImagePath(src)??src
