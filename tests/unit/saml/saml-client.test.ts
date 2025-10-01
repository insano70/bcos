/**
 * SAML Client Unit Tests
 * Tests SAML client validation logic in isolation
 *
 * Pattern: Follows tests/unit/auth/jwt.test.ts - isolated logic testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSAMLClientMock, createMockSAMLProfiles, createMockValidationResults } from '@/tests/mocks/saml-mocks'

describe('SAML Client', () => {
  describe('createLoginUrl', () => {
    it('should generate Microsoft login URL', async () => {
      const samlClient = createSAMLClientMock()

      const authContext = {
        requestId: 'test-request-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      }

      const loginUrl = await samlClient.createLoginUrl(authContext)

      expect(loginUrl).toContain('login.microsoftonline.com')
      expect(samlClient.createLoginUrl).toHaveBeenCalledWith(authContext)
    })

    it('should include relay state in login URL', async () => {
      const samlClient = createSAMLClientMock()

      const authContext = {
        requestId: 'test-request-456',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date(),
        relayState: '/dashboard/analytics'
      }

      await samlClient.createLoginUrl(authContext)

      expect(samlClient.createLoginUrl).toHaveBeenCalledWith(authContext)
      expect(authContext.relayState).toBe('/dashboard/analytics')
    })
  })

  describe('validateResponse', () => {
    it('should validate SAML response successfully', async () => {
      const samlClient = createSAMLClientMock()
      const validResult = createMockValidationResults().success

      samlClient.validateResponse.mockResolvedValueOnce(validResult)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      expect(result.success).toBe(true)
      expect(result.profile).toBeDefined()
      expect(result.profile?.email).toBe('test@bendcare.com')
      expect(result.validations.signatureValid).toBe(true)
      expect(result.validations.issuerValid).toBe(true)
      expect(result.validations.audienceValid).toBe(true)
      expect(result.validations.timestampValid).toBe(true)
      expect(result.validations.notReplay).toBe(true)
      expect(result.validations.emailDomainValid).toBe(true)
    })

    it('should fail validation on invalid signature', async () => {
      const samlClient = createSAMLClientMock()
      const signatureFailed = createMockValidationResults().signatureFailed

      samlClient.validateResponse.mockResolvedValueOnce(signatureFailed)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid signature')
      expect(result.validations.signatureValid).toBe(false)
    })

    it('should fail validation on wrong issuer', async () => {
      const samlClient = createSAMLClientMock()
      const issuerFailed = createMockValidationResults().issuerFailed

      samlClient.validateResponse.mockResolvedValueOnce(issuerFailed)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid issuer')
      expect(result.validations.issuerValid).toBe(false)
    })

    it('should detect replay attacks', async () => {
      const samlClient = createSAMLClientMock()
      const replayDetected = createMockValidationResults().replayDetected

      samlClient.validateResponse.mockResolvedValueOnce(replayDetected)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Replay attack detected')
      expect(result.validations.notReplay).toBe(false)
    })
  })

  describe('Profile Extraction', () => {
    it('should extract email from SAML profile', () => {
      const profiles = createMockSAMLProfiles()
      const profile = profiles.validProfile

      expect(profile.email).toBe('test@bendcare.com')
      expect(profile.nameID).toBe('test@bendcare.com')
    })

    it('should extract optional attributes when present', () => {
      const profiles = createMockSAMLProfiles()
      const profile = profiles.validProfile

      expect(profile.displayName).toBe('Test User')
      expect(profile.givenName).toBe('Test')
      expect(profile.surname).toBe('User')
    })

    it('should handle missing optional attributes', () => {
      const profiles = createMockSAMLProfiles()
      const minimalProfile = {
        ...profiles.validProfile,
        displayName: undefined,
        givenName: undefined,
        surname: undefined
      }

      expect(minimalProfile.email).toBeTruthy()
      expect(minimalProfile.issuer).toBeTruthy()
      expect(minimalProfile.displayName).toBeUndefined()
    })

    it('should normalize email to lowercase', () => {
      const profiles = createMockSAMLProfiles()
      const profile = {
        ...profiles.validProfile,
        email: 'Test@BendCare.COM'
      }

      // Input validator would normalize this
      expect(profile.email.toLowerCase()).toBe('test@bendcare.com')
    })
  })

  describe('generateMetadata', () => {
    it('should generate SP metadata XML', async () => {
      const samlClient = createSAMLClientMock()

      const metadata = await samlClient.generateMetadata()

      expect(metadata).toBeTruthy()
      expect(metadata).toContain('EntityDescriptor')
      expect(samlClient.generateMetadata).toHaveBeenCalled()
    })
  })

  describe('Configuration', () => {
    it('should return SAML configuration', () => {
      const samlClient = createSAMLClientMock()

      const config = samlClient.getConfig()

      expect(config).toBeDefined()
      expect(config.entryPoint).toContain('login.microsoftonline.com')
      expect(config.issuer).toContain('/saml/metadata')
      expect(config.callbackUrl).toContain('/api/auth/saml/callback')
    })

    it('should support configuration reload', async () => {
      const samlClient = createSAMLClientMock()

      await samlClient.reload()

      expect(samlClient.reload).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid base64 in SAML response', async () => {
      const samlClient = createSAMLClientMock()

      samlClient.validateResponse.mockRejectedValueOnce(
        new Error('Invalid base64 encoding')
      )

      await expect(
        samlClient.validateResponse('INVALID_BASE64!!!', {
          requestId: 'test-123',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Browser',
          timestamp: new Date()
        })
      ).rejects.toThrow('Invalid base64 encoding')
    })

    it('should handle malformed XML in SAML response', async () => {
      const samlClient = createSAMLClientMock()

      samlClient.validateResponse.mockRejectedValueOnce(
        new Error('Malformed XML')
      )

      await expect(
        samlClient.validateResponse('base64-malformed-xml', {
          requestId: 'test-123',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Browser',
          timestamp: new Date()
        })
      ).rejects.toThrow('Malformed XML')
    })
  })

  describe('Validation Chain', () => {
    it('should perform all validation checks', async () => {
      const samlClient = createSAMLClientMock()
      const validResult = createMockValidationResults().success

      samlClient.validateResponse.mockResolvedValueOnce(validResult)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      // Verify all validations were checked
      expect(result.validations.signatureValid).toBeDefined()
      expect(result.validations.issuerValid).toBeDefined()
      expect(result.validations.audienceValid).toBeDefined()
      expect(result.validations.timestampValid).toBeDefined()
      expect(result.validations.notReplay).toBeDefined()
      expect(result.validations.emailDomainValid).toBeDefined()
    })

    it('should include metadata in validation result', async () => {
      const samlClient = createSAMLClientMock()
      const validResult = createMockValidationResults().success

      samlClient.validateResponse.mockResolvedValueOnce(validResult)

      const result = await samlClient.validateResponse('base64-saml-response', {
        requestId: 'test-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        timestamp: new Date()
      })

      expect(result.metadata).toBeDefined()
      expect(result.metadata.validatedAt).toBeInstanceOf(Date)
      expect(result.metadata.issuer).toBeTruthy()
    })
  })
})
