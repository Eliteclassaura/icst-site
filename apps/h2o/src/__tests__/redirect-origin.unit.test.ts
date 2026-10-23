import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { redirectOrigin } from '../proxy'

const at = (url: string) => new NextRequest(url)

describe('redirect origin (M1b)', () => {
  it('keeps the request origin for a normal host', () => {
    expect(redirectOrigin(at('https://review.icsthailand.co.th/admin/login'))).toBe('https://review.icsthailand.co.th')
  })

  it('never names the bind address: 0.0.0.0 and :: fall back to the configured public origin', () => {
    const saved = process.env.NEXT_PUBLIC_SERVER_URL
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://review.icsthailand.co.th/'
    try {
      expect(redirectOrigin(at('http://0.0.0.0:3000/crm/'))).toBe('https://review.icsthailand.co.th')
      expect(redirectOrigin(at('http://[::]:3000/crm/'))).toBe('https://review.icsthailand.co.th')
    } finally {
      process.env.NEXT_PUBLIC_SERVER_URL = saved
    }
  })
})
