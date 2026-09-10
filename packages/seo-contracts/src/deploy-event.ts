import { z } from 'zod'
import { envelope, sha256 } from './common'

export const DEPLOY_EVENT_VERSION = '1.0.0'
export const deployEventPayload = z.object({
  environment: z.enum(['staging', 'production', 'preview']),
  base_url: z.string().url(),
  blueprint_sha256: sha256,
  git_sha: z.string().regex(/^[0-9a-f]{7,40}$/),
  migrations_applied: z.array(z.string()).optional(),
  status: z.enum(['deployed', 'rolled_back']),
  previous_git_sha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .nullable()
    .optional(),
})
export const deployEvent = envelope('factory.seo/deploy-event', DEPLOY_EVENT_VERSION, deployEventPayload)
export type DeployEvent = z.infer<typeof deployEvent>
