/**
 * OIDC Client Unit Tests
 *
 * Tests the core OIDC client logic including:
 * - Discovery and initialization
 * - Authorization URL generation with PKCE
 * - Token exchange and validation
 * - Defense-in-depth ID token validation
 * - User info extraction
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as oauth from 'openid-client'
import { OIDCClient, getOIDCClient, resetOIDCClient } from '@/lib/oidc/client'
import { DiscoveryError, TokenExchangeError, TokenValidationError } from '@/lib/oidc/errors'
import { log } from '@/lib/logger'
import {
  createMockIDTokenClaims,
  createMockTokenResponse,
  createMockOIDCConfiguration,
  createMockServerMetadata
} from '@/tests/factories/oidc-factory'

// Mock dependencies
vi.mock('openid-client')
vi.mock('@/lib/oidc/config', () => ({
  buildOIDCConfig: vi.fn(() => ({
    tenantId: 'test-tenant-id',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:4001/api/auth/oidc/callback',
    scopes: ['openid', 'profile', 'email'],
    allowedEmailDomains: ['test.com'],
    successRedirect: '/dashboard',
  }))
}))
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}))

describe('OIDCClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetOIDCClient()
  })

  afterEach(() => {
    resetOIDCClient()
  })

  describe('initialize', () => {
    it('should discover OIDC configuration successfully', async () => {
      const mockConfig = createMockOIDCConfiguration()

      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)

      const client = new OIDCClient()
      await client.initialize()

      expect(oauth.discovery).toHaveBeenCalledWith(
        expect.objectContaining({
          href: 'https://login.microsoftonline.com/test-tenant-id/v2.0'
        }),
        'test-client-id',
        'test-client-secret'
      )
      expect(log.info).toHaveBeenCalledWith(
        'OIDC configuration discovered successfully',
        expect.objectContaining({
          issuer: 'https://login.microsoftonline.com/test-tenant-id/v2.0'
        })
      )
    })

    it('should throw DiscoveryError on network failure', async () => {
      vi.mocked(oauth.discovery).mockRejectedValue(new Error('Network error'))

      const client = new OIDCClient()

      await expect(client.initialize()).rejects.toThrow(DiscoveryError)
      await expect(client.initialize()).rejects.toThrow('OIDC discovery failed')
      expect(log.error).toHaveBeenCalledWith(
        'Failed to discover OIDC configuration',
        expect.objectContaining({
          error: 'Network error',
          tenantId: 'test-tenant-id'
        })
      )
    })

    it('should throw DiscoveryError on invalid tenant ID', async () => {
      vi.mocked(oauth.discovery).mockRejectedValue(new Error('Invalid tenant'))

      const client = new OIDCClient()

      await expect(client.initialize()).rejects.toThrow(DiscoveryError)
    })
  })

  describe('createAuthUrl', () => {
    it('should generate authorization URL with PKCE parameters', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
      vi.mocked(oauth.randomPKCECodeVerifier).mockReturnValue('test-code-verifier-43-chars')
      vi.mocked(oauth.calculatePKCECodeChallenge).mockResolvedValue('test-code-challenge')
      vi.mocked(oauth.randomState).mockReturnValue('test-state-token')
      vi.mocked(oauth.randomNonce).mockReturnValue('test-nonce-token')

      const client = new OIDCClient()
      await client.initialize()
      const result = await client.createAuthUrl()

      expect(result).toEqual({
        url: expect.stringContaining('code_challenge=test-code-challenge'),
        state: 'test-state-token',
        codeVerifier: 'test-code-verifier-43-chars',
        nonce: 'test-nonce-token'
      })
      expect(result.url).toContain('code_challenge_method=S256')
      expect(result.url).toContain('response_type=code')
      expect(result.url).toContain('client_id=test-client-id')
      expect(result.url).toContain('redirect_uri=')
      expect(result.url).toContain('scope=openid+profile+email')
    })

    it('should include state parameter for CSRF protection', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
      vi.mocked(oauth.randomState).mockReturnValue('csrf-protection-state-token')
      vi.mocked(oauth.randomPKCECodeVerifier).mockReturnValue('verifier')
      vi.mocked(oauth.calculatePKCECodeChallenge).mockResolvedValue('challenge')
      vi.mocked(oauth.randomNonce).mockReturnValue('nonce')

      const client = new OIDCClient()
      await client.initialize()
      const result = await client.createAuthUrl()

      expect(result.state).toBe('csrf-protection-state-token')
      expect(result.url).toContain('state=csrf-protection-state-token')
    })

    it('should include nonce parameter for replay protection', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
      vi.mocked(oauth.randomNonce).mockReturnValue('replay-protection-nonce')
      vi.mocked(oauth.randomPKCECodeVerifier).mockReturnValue('verifier')
      vi.mocked(oauth.calculatePKCECodeChallenge).mockResolvedValue('challenge')
      vi.mocked(oauth.randomState).mockReturnValue('state')

      const client = new OIDCClient()
      await client.initialize()
      const result = await client.createAuthUrl()

      expect(result.nonce).toBe('replay-protection-nonce')
      expect(result.url).toContain('nonce=replay-protection-nonce')
    })

    it('should generate valid PKCE code_challenge from code_verifier', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
      vi.mocked(oauth.randomPKCECodeVerifier).mockReturnValue('my-code-verifier')
      vi.mocked(oauth.calculatePKCECodeChallenge).mockResolvedValue('my-code-challenge')

      const client = new OIDCClient()
      await client.initialize()
      await client.createAuthUrl()

      expect(oauth.calculatePKCECodeChallenge).toHaveBeenCalledWith('my-code-verifier')
    })

    it('should initialize automatically if not initialized', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
      vi.mocked(oauth.randomPKCECodeVerifier).mockReturnValue('verifier')
      vi.mocked(oauth.calculatePKCECodeChallenge).mockResolvedValue('challenge')
      vi.mocked(oauth.randomState).mockReturnValue('state')
      vi.mocked(oauth.randomNonce).mockReturnValue('nonce')

      const client = new OIDCClient()
      // Do NOT call initialize()
      const result = await client.createAuthUrl()

      expect(oauth.discovery).toHaveBeenCalled()
      expect(result.url).toBeTruthy()
    })
  })

  describe('handleCallback', () => {
    describe('Token Exchange', () => {
      it('should exchange authorization code for tokens with PKCE', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const mockResponse = createMockTokenResponse()

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test-code&state=test-state')
        const nonce = mockResponse.claims().nonce as string

        await client.handleCallback(
          callbackUrl,
          'test-state',
          nonce,
          'test-code-verifier'
        )

        expect(oauth.authorizationCodeGrant).toHaveBeenCalledWith(
          expect.anything(),
          callbackUrl,
          expect.objectContaining({
            pkceCodeVerifier: 'test-code-verifier',
            expectedState: 'test-state',
            expectedNonce: nonce
          })
        )
      })

      it('should handle provider errors in callback URL', async () => {
        const mockConfig = createMockOIDCConfiguration()
        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?error=access_denied&error_description=User+canceled')

        await expect(
          client.handleCallback(callbackUrl, 'state', 'nonce', 'verifier')
        ).rejects.toThrow(TokenExchangeError)
        await expect(
          client.handleCallback(callbackUrl, 'state', 'nonce', 'verifier')
        ).rejects.toThrow('Identity provider returned an error')
      })

      it('should throw TokenExchangeError on exchange failure', async () => {
        const mockConfig = createMockOIDCConfiguration()
        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockRejectedValue(new Error('Invalid authorization code'))

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=invalid&state=state')

        await expect(
          client.handleCallback(callbackUrl, 'state', 'nonce', 'verifier')
        ).rejects.toThrow(TokenExchangeError)
      })
    })

    describe('ID Token Validation - Defense in Depth', () => {
      it('should validate email claim exists', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claimsWithoutEmail = createMockIDTokenClaims({ email: undefined })
        const mockResponse = createMockTokenResponse({ claims: claimsWithoutEmail })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', 'nonce', 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', 'nonce', 'verifier')
        ).rejects.toThrow('email claim')
      })

      it('should accept email_verified claim for email verification', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          email_verified: true
        })
        delete (claims as {xms_edov?: boolean}).xms_edov // Explicitly test email_verified without xms_edov
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result.emailVerified).toBe(true)
      })

      it('should accept xms_edov claim for Microsoft email verification', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          email_verified: undefined,
          xms_edov: true
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result.email).toBe(claims.email)
      })

      it('should reject unverified emails', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          email_verified: false,
          xms_edov: false
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow('not verified')
      })

      it('should validate nonce matches expected value', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({ nonce: 'wrong-nonce' })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', 'expected-nonce', 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', 'expected-nonce', 'verifier')
        ).rejects.toThrow('nonce validation failed')
      })

      it('should validate issuer matches expected tenant', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          iss: 'https://login.microsoftonline.com/different-tenant/v2.0'
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow('issuer validation failed')
      })

      it('should validate audience matches client_id', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({ aud: 'different-client-id' })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow('audience validation failed')
      })

      it('should handle audience as array', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          aud: ['test-client-id', 'other-client-id'] as never
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result.email).toBe(claims.email)
      })

      it('should reject tokens issued in the future', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const futureTime = Math.floor(Date.now() / 1000) + 300 // 5 minutes in future
        const claims = createMockIDTokenClaims({ iat: futureTime })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow('timestamp invalid')
      })

      it('should warn on stale tokens but not reject', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const oldTime = Math.floor(Date.now() / 1000) - 400 // 6+ minutes ago
        const claims = createMockIDTokenClaims({
          iat: oldTime,
          exp: Math.floor(Date.now() / 1000) + 3600 // Still valid
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result.email).toBe(claims.email)
        expect(log.warn).toHaveBeenCalledWith(
          'ID token is stale',
          expect.objectContaining({ tokenAge: expect.any(Number) })
        )
      })

      it('should reject expired tokens', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          exp: Math.floor(Date.now() / 1000) - 10 // Expired 10 seconds ago
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow(TokenValidationError)
        await expect(
          client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')
        ).rejects.toThrow('has expired')
      })
    })

    describe('User Info Extraction', () => {
      it('should extract complete user information from ID token', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          email: 'john.doe@test.com',
          name: 'John Doe',
          given_name: 'John',
          family_name: 'Doe'
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result).toEqual({
          email: 'john.doe@test.com',
          emailVerified: true,
          name: 'John Doe',
          givenName: 'John',
          familyName: 'Doe',
          claims
        })
      })

      it('should handle missing optional name fields', async () => {
        const mockConfig = createMockOIDCConfiguration()
        const claims = createMockIDTokenClaims({
          name: undefined,
          given_name: undefined,
          family_name: undefined
        })
        const mockResponse = createMockTokenResponse({ claims })

        vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)
        vi.mocked(oauth.authorizationCodeGrant).mockResolvedValue(mockResponse as never)

        const client = new OIDCClient()
        await client.initialize()

        const callbackUrl = new URL('http://localhost:4001/api/auth/oidc/callback?code=test&state=test')

        const result = await client.handleCallback(callbackUrl, 'test', claims.nonce as string, 'verifier')

        expect(result.email).toBe(claims.email)
        expect(result.name).toBeUndefined()
        expect(result.givenName).toBeUndefined()
        expect(result.familyName).toBeUndefined()
      })
    })
  })

  describe('Singleton Pattern', () => {
    it('should return same client instance on multiple calls', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)

      const client1 = await getOIDCClient()
      const client2 = await getOIDCClient()

      expect(client1).toBe(client2)
      expect(oauth.discovery).toHaveBeenCalledTimes(1)
    })

    it('should initialize only once', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)

      await getOIDCClient()
      await getOIDCClient()
      await getOIDCClient()

      expect(oauth.discovery).toHaveBeenCalledTimes(1)
    })

    it('should reset singleton on resetOIDCClient', async () => {
      const mockConfig = createMockOIDCConfiguration()
      vi.mocked(oauth.discovery).mockResolvedValue(mockConfig as never)

      const client1 = await getOIDCClient()
      resetOIDCClient()
      const client2 = await getOIDCClient()

      expect(client1).not.toBe(client2)
      expect(oauth.discovery).toHaveBeenCalledTimes(2)
    })
  })
})
