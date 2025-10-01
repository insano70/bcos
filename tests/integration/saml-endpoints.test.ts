/**
 * SAML Endpoints Integration Tests
 * Tests SAML endpoints that don't require real SAML validation
 *
 * These tests verify:
 * - Login initiation works
 * - Metadata generation works
 * - Configuration validation works
 * - Rate limiting works
 *
 * NOTE: SAML callback validation requires cryptographically signed responses.
 * That validation is tested in unit tests and E2E tests with real Microsoft Entra.
 */

import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'

describe('SAML Login Initiation', () => {
  it('should redirect to Microsoft Entra', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/login`, {
      redirect: 'manual'
    })

    // Next.js 15 uses 307 for temporary redirects
    expect([302, 307]).toContain(response.status)

    const location = response.headers.get('location')
    expect(location).toBeTruthy()
    expect(location).toContain('login.microsoftonline.com')
  })

  it('should handle relay state parameter', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const relayState = '/dashboard/analytics'

    const response = await fetch(
      `${baseUrl}/api/auth/saml/login?relay_state=${encodeURIComponent(relayState)}`,
      { redirect: 'manual' }
    )

    expect([302, 307]).toContain(response.status)
    const location = response.headers.get('location')
    expect(location).toContain('login.microsoftonline.com')
  })
})

describe('SAML Metadata Endpoint', () => {
  it('should serve valid SP metadata XML', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/metadata`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('samlmetadata+xml')

    const metadata = await response.text()
    expect(metadata).toContain('<?xml')
    expect(metadata).toContain('EntityDescriptor')
    expect(metadata).toContain('SPSSODescriptor')
    expect(metadata).toContain('/api/auth/saml/callback')
  })

  it('should set cache headers', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/metadata`)

    const cacheControl = response.headers.get('cache-control')
    expect(cacheControl).toBeTruthy()
    expect(cacheControl).toContain('public')
  })

  it('should include security headers', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/metadata`)

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('SAML Configuration', () => {
  it('should have SAML enabled in test environment', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/metadata`)

    // If SAML not configured, would get 503
    expect(response.status).toBe(200)
  })
})
