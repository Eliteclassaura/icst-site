import { readFileSync } from 'node:fs'
import path from 'node:path'

const contentRoot = path.join(process.cwd(), 'content', '2d-launch-cohort')

export type Testimonial = {
  company: string
  person: string
  quoteLines: string[]
  recordId: string
  title: string
}

type TestimonialAuthority = {
  authorityClass: string
  authorityDate: string
  authorityId: string
  records: Testimonial[]
  retrievedAt: string
  sourceUrl: string
}

const authority = JSON.parse(
  readFileSync(path.join(contentRoot, 'OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21.json'), 'utf8'),
) as TestimonialAuthority

export const TESTIMONIAL_AUTHORITY_ID = authority.authorityId
export const testimonials = authority.records
