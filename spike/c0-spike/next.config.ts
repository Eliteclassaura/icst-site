import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Public URLs are canonical WITH a trailing slash (legacy parity, A14). Payload's
  // /api and /admin must not be redirected — Next's built-in redirect would 308 every
  // API POST. So the built-in redirect is disabled and src/proxy.ts enforces the slash
  // on public routes only.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  output: 'standalone',
  reactStrictMode: true,
}
export default withPayload(nextConfig)
