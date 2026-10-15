import type { ProjectCarouselProps } from './index'

/** Synthetic copy and no images: project photos need provenance from the content pack before use. */
export const fixtures: { default: ProjectCarouselProps } & Record<string, ProjectCarouselProps> = {
  default: {
    eyebrow: 'Projects',
    title: 'Selected projects',
    lede: 'Short introduction to the project section, written from the client content pack.',
    items: [
      { title: 'Project one', text: 'Short description of the first project.', href: '/project-one/' },
      { title: 'Project two', text: 'Short description of the second project.', href: '/project-two/' },
      { title: 'Project three', text: 'Short description of the third project.', href: '/project-three/' },
      { title: 'Project four', text: 'Short description of the fourth project.' },
    ],
  },
}
