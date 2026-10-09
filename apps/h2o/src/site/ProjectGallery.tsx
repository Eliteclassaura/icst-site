import {projectGalleryConfig} from './project-media'

/**
 * PROJECT-IMAGES-1 R2: the photo gallery (photos with their source captions) of a historical portfolio page that now redirects to this
 * project page. Self-contained: the photos are the page's delivered files (never enlarged) listed in content/projects/project-media.json
 * (projectGalleries), so the page does not depend on the withdrawn route's record.
 */
export function ProjectGallery({path}:{path:string}){
  const config=projectGalleryConfig(path)
  if(!config?.photos.length)return null
  return <section className="sp-section-inner project-gallery" aria-label="Project photos"><ul>{config.photos.map(photo=><li key={photo.src}><figure><img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" data-source-sha256={photo.sha256}/><figcaption>{photo.caption}</figcaption></figure></li>)}</ul></section>
}
