/**
 * OIDC Error Types Unit Tests
 *
 * Tests custom OIDC error classes:
 * - Base OIDCError class
 * - Specific error types
 * - Error details handling
 * - Stack trace preservation
 */

import { describe, it, expect } from 'vitest'
import {
  OIDCError,
  TokenExchangeError,
  TokenValidationError,
  StateValidationError,
  ConfigurationError,
  SessionError,
  DiscoveryError
} from '@/lib/oidc/errors'

describe('OIDC Errors', () => {
  describe('OIDCError Base Class', () => {
    it('should create error with message and code', () => {
      const error = new OIDCError('Test error message', 'test_error_code')

      expect(error.message).toBe('Test error message')
      expect(error.code).toBe('test_error_code')
      expect(error.name).toBe('OIDCError')
    })

    it('should include details object', () => {
      const details = { key: 'value', count: 42 }
      const error = new OIDCError('Test message', 'test_code', details)

      expect(error.details).toEqual({ key: 'value', count: 42 })
    })

    it('should handle missing details', () => {
      const error = new OIDCError('Test message', 'test_code')

      expect(error.details).toBeUndefined()
    })

    it('should maintain stack trace', () => {
      const error = new OIDCError('Test message', 'test_code')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('OIDCError')
    })

    it('should be instance of Error', () => {
      const error = new OIDCError('Test message', 'test_code')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(OIDCError)
    })

    it('should copy details object to prevent mutation', () => {
      const originalDetails = { mutable: 'value' }
      const error = new OIDCError('Test', 'code', originalDetails)

      originalDetails.mutable = 'changed'

      expect(error.details).toEqual({ mutable: 'value' })
    })
  })

  describe('TokenExchangeError', () => {
    it('should have correct error code', () => {
      const error = new TokenExchangeError('Exchange failed')

      expect(error.code).toBe('token_exchange_failed')
      expect(error.name).toBe('TokenExchangeError')
    })

    it('should include details', () => {
      const details = { authCode: 'invalid-code', reason: 'expired' }
      const error = new TokenExchangeError('Exchange failed', details)

      expect(error.message).toBe('Exchange failed')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new TokenExchangeError('Exchange failed')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(TokenExchangeError)
    })
  })

  describe('TokenValidationError', () => {
    it('should have correct error code', () => {
      const error = new TokenValidationError('Validation failed')

      expect(error.code).toBe('token_validation_failed')
      expect(error.name).toBe('TokenValidationError')
    })

    it('should include validation details', () => {
      const details = { claim: 'email', expected: 'verified', actual: 'unverified' }
      const error = new TokenValidationError('Email not verified', details)

      expect(error.message).toBe('Email not verified')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new TokenValidationError('Validation failed')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(TokenValidationError)
    })
  })

  describe('StateValidationError', () => {
    it('should have correct error code', () => {
      const error = new StateValidationError('State invalid')

      expect(error.code).toBe('state_validation_failed')
      expect(error.name).toBe('StateValidationError')
    })

    it('should include state validation details', () => {
      const details = { expected: 'valid-state', received: 'invalid-state' }
      const error = new StateValidationError('State mismatch', details)

      expect(error.message).toBe('State mismatch')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new StateValidationError('State invalid')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(StateValidationError)
    })
  })

  describe('ConfigurationError', () => {
    it('should have correct error code', () => {
      const error = new ConfigurationError('Config missing')

      expect(error.code).toBe('configuration_error')
      expect(error.name).toBe('ConfigurationError')
    })

    it('should include configuration details', () => {
      const details = { missing: ['TENANT_ID', 'CLIENT_ID'] }
      const error = new ConfigurationError('Missing required config', details)

      expect(error.message).toBe('Missing required config')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new ConfigurationError('Config missing')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(ConfigurationError)
    })
  })

  describe('SessionError', () => {
    it('should have correct error code', () => {
      const error = new SessionError('Session invalid')

      expect(error.code).toBe('session_error')
      expect(error.name).toBe('SessionError')
    })

    it('should include session details', () => {
      const details = { reason: 'expired', sessionId: 'sess-123' }
      const error = new SessionError('Session expired', details)

      expect(error.message).toBe('Session expired')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new SessionError('Session invalid')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(SessionError)
    })
  })

  describe('DiscoveryError', () => {
    it('should have correct error code', () => {
      const error = new DiscoveryError('Discovery failed')

      expect(error.code).toBe('discovery_failed')
      expect(error.name).toBe('DiscoveryError')
    })

    it('should include discovery details', () => {
      const details = { tenantId: 'invalid-tenant', endpoint: 'https://...' }
      const error = new DiscoveryError('Cannot discover endpoint', details)

      expect(error.message).toBe('Cannot discover endpoint')
      expect(error.details).toEqual(details)
    })

    it('should be instance of OIDCError', () => {
      const error = new DiscoveryError('Discovery failed')

      expect(error).toBeInstanceOf(OIDCError)
      expect(error).toBeInstanceOf(DiscoveryError)
    })
  })

  describe('Error Serialization', () => {
    it('should serialize to JSON with custom properties', () => {
      const error = new TokenExchangeError('Test error', { key: 'value' })

      // Manual serialization that includes custom properties
      const serialized = {
        message: error.message,
        name: error.name,
        code: error.code,
        details: error.details
      }

      expect(serialized.message).toBe('Test error')
      expect(serialized.name).toBe('TokenExchangeError')
      expect(serialized.code).toBe('token_exchange_failed')
      expect(serialized.details).toEqual({ key: 'value' })

      // Note: Standard JSON.stringify(error) doesn't include custom properties
      // This is expected Error behavior in JavaScript
    })

    it('should maintain error properties when caught', () => {
      try {
        throw new StateValidationError('State replay detected', {
          state: 'used-state',
          attempt: 2
        })
      } catch (error) {
        expect(error).toBeInstanceOf(StateValidationError)
        const stateError = error as StateValidationError
        expect(stateError.code).toBe('state_validation_failed')
        expect(stateError.details).toEqual({
          state: 'used-state',
          attempt: 2
        })
      }
    })
  })

  describe('Error Message Patterns', () => {
    it('should support descriptive error messages', () => {
      const errors = [
        new TokenExchangeError('Authorization code exchange failed: invalid_grant'),
        new TokenValidationError('ID token email claim is not verified'),
        new StateValidationError('State parameter does not match expected value'),
        new ConfigurationError('OIDC configuration missing required environment variables'),
        new SessionError('OIDC session cookie is missing or tampered with'),
        new DiscoveryError('Cannot discover OIDC endpoints from well-known URL')
      ]

      errors.forEach(error => {
        expect(error.message.length).toBeGreaterThan(10)
        expect(error.message).toBeTruthy()
      })
    })

    it('should include context in error details', () => {
      const error = new TokenValidationError('Nonce validation failed', {
        expected: 'nonce-123',
        actual: 'nonce-456',
        claim: 'nonce'
      })

      expect(error.details).toHaveProperty('expected')
      expect(error.details).toHaveProperty('actual')
      expect(error.details).toHaveProperty('claim')
    })
  })

  describe('Error Inheritance', () => {
    it('should maintain proper prototype chain', () => {
      const error = new TokenExchangeError('Test')

      expect(Object.getPrototypeOf(error)).toBe(TokenExchangeError.prototype)
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(OIDCError.prototype)
      expect(Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(error)))).toBe(Error.prototype)
    })

    it('should support instanceof checks at all levels', () => {
      const error = new TokenValidationError('Test')

      expect(error instanceof TokenValidationError).toBe(true)
      expect(error instanceof OIDCError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })
})
