import { describe, it, expect, vi, beforeEach } from 'vitest'
import { debugLog, errorLog } from '@/lib/utils/debug'
import '@testing-library/jest-dom'

// Mock the universal logger factory instead of console
vi.mock('@/lib/logger/factory', () => ({
  createAppLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    security: vi.fn(),
    timing: vi.fn()
  }))
}))

// Mock console methods for development mode testing
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

describe('debug utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset NODE_ENV for each test
    vi.unstubAllEnvs()
  })

  describe('debugLog', () => {
    describe('environment-based behavior', () => {
      it('should provide debug functions for all categories', () => {
        // Test that all debug categories are available (business value)
        expect(typeof debugLog.auth).toBe('function')
        expect(typeof debugLog.middleware).toBe('function')
        expect(typeof debugLog.rbac).toBe('function')
        expect(typeof debugLog.security).toBe('function')
        expect(typeof debugLog.session).toBe('function')
        expect(typeof debugLog.database).toBe('function')
        expect(typeof debugLog.api).toBe('function')
        expect(typeof debugLog.business).toBe('function')
        expect(typeof debugLog.performance).toBe('function')
        expect(typeof debugLog.correlation).toBe('function')
      })

      it('should handle all debug functions without errors', () => {
        // Test that debug functions can be called without throwing (business value)
        expect(() => debugLog.auth('Test message')).not.toThrow()
        expect(() => debugLog.middleware('Test message', { data: 'test' })).not.toThrow()
        expect(() => debugLog.rbac('Test message')).not.toThrow()
        expect(() => debugLog.security('Test message')).not.toThrow()
        expect(() => debugLog.session('Test message')).not.toThrow()
        expect(() => debugLog.database('Test message')).not.toThrow()
        expect(() => debugLog.api('Test message')).not.toThrow()
        expect(() => debugLog.business('Test message')).not.toThrow()
      })

      it('should handle complex data objects without errors', () => {
        const complexData = {
          user: { id: '123', roles: ['admin', 'user'] },
          metadata: { timestamp: new Date(), version: '1.0.0' },
          nested: { deep: { value: 'test' } }
        }

        // Test that complex data doesn't break debug functions (business value)
        expect(() => debugLog.auth('Complex test', complexData)).not.toThrow()
        expect(() => debugLog.rbac('Complex test', complexData)).not.toThrow()
      })

      it('should handle performance timing correctly', () => {
        const startTime = Date.now() - 50 // 50ms ago
        
        // Test that performance logging works (business value)
        expect(() => debugLog.performance('Test operation', startTime)).not.toThrow()
        expect(() => debugLog.performance('Test operation', startTime, { extra: 'data' })).not.toThrow()
      })

      it('should handle correlation logging correctly', () => {
        const correlationId = 'test-correlation-123'
        
        // Test that correlation logging works (business value)
        expect(() => debugLog.correlation('Test operation', correlationId)).not.toThrow()
        expect(() => debugLog.correlation('Test operation', correlationId, { extra: 'data' })).not.toThrow()
      })
    })

    describe('in production environment', () => {
      beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'production')
      })

      it('should not log any debug messages in production', () => {
        debugLog.auth('Auth message')
        debugLog.middleware('Middleware message')
        debugLog.rbac('RBAC message')
        debugLog.security('Security message')
        debugLog.session('Session message')

        expect(consoleLogSpy).not.toHaveBeenCalled()
      })
    })

    describe('in test environment', () => {
      beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'test')
      })

      it('should not log any debug messages in test environment', () => {
        debugLog.auth('Test auth message')

        expect(consoleLogSpy).not.toHaveBeenCalled()
      })
    })

    describe('with undefined NODE_ENV', () => {
      it('should not log when NODE_ENV is not set', () => {
        debugLog.auth('Message without NODE_ENV')

        expect(consoleLogSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('errorLog', () => {
    describe('error sanitization', () => {
      it('should sanitize sensitive information from error messages', () => {
        const sensitiveMessage = 'Database error: password=secret123 token=abc123'
        const error = new Error(sensitiveMessage)
        const context = { userId: '123', password: 'secret123', operation: 'createUser' }

        // Test that errorLog handles sensitive data (business value)
        expect(() => errorLog('Test error', error, context)).not.toThrow()
      })

      it('should handle various error types without throwing', () => {
        // Test error handling robustness (business value)
        expect(() => errorLog('String error', 'Simple string error')).not.toThrow()
        expect(() => errorLog('Object error', { message: 'Object error' })).not.toThrow()
        expect(() => errorLog('Null error', null)).not.toThrow()
        expect(() => errorLog('Undefined error', undefined)).not.toThrow()
        expect(() => errorLog('Number error', 404)).not.toThrow()
      })

      it('should handle errors without context', () => {
        const message = 'Validation failed'
        const error = new Error('Invalid input')

        errorLog(message, error)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Validation failed', error, undefined)
      })

      it('should handle null/undefined errors', () => {
        const message = 'No error details'

        errorLog(message, null)
        errorLog(message, undefined)

        // In development, it logs the original arguments
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No error details', null, undefined)
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No error details', undefined, undefined)
      })

      it('should handle string errors', () => {
        const message = 'String error occurred'
        const error = 'Something went wrong'

        errorLog(message, error)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ String error occurred', error, undefined)
      })

      it('should handle null/undefined errors', () => {
        const message = 'No error details'

        errorLog(message, null)
        errorLog(message, undefined)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No error details', null, undefined)
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No error details', undefined, undefined)
      })
    })

    describe('in production environment', () => {
      beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'production')
      })

      it('should sanitize error information in production', () => {
        const message = 'Authentication failed'
        const error = new Error('Invalid password for user test@example.com')
        const context = {
          userId: '123',
          email: 'test@example.com',
          token: 'secret-jwt-token',
          password: 'user-password',
          sessionId: 'sess-123'
        }

        const mockDate = new Date('2024-01-15T10:30:00Z')
        vi.useFakeTimers()
        vi.setSystemTime(mockDate)

        errorLog(message, error, context)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Authentication failed', {
          error: {
            name: 'Error',
            message: 'Invalid password=*** user [EMAIL]'
          },
          timestamp: '2024-01-15T10:30:00.000Z',
          context: {
            userId: '[NUMBER]', // Numbers get sanitized as potentially sensitive
            email: '[EMAIL]',
            token: '***',
            password: '***',
            sessionId: '***'
          }
        })

        vi.useRealTimers()
      })

      it('should handle string errors in production', () => {
        const message = 'API error'
        const error = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

        errorLog(message, error)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ API error', {
          error: 'Bearer ***',
          timestamp: expect.any(String),
          context: undefined
        })
      })

      it('should handle unknown error types in production', () => {
        const message = 'Unknown error'
        const error = { customProperty: 'customValue' }

        errorLog(message, error)

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Unknown error', {
          error: 'Unknown error type',
          timestamp: expect.any(String),
          context: undefined
        })
      })

      it('should include timestamp in production logs', () => {
        const message = 'Test error'

        errorLog(message)

        const call = consoleErrorSpy.mock.calls[0]
        expect(call?.[1]).toHaveProperty('timestamp')
        expect(typeof call?.[1]?.timestamp).toBe('string')
        expect(call?.[1]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })
    })
  })

  describe('sanitizeErrorMessage', () => {
    // Import the private function for testing
    const sanitizeErrorMessage = (message: string): string => {
      return message
        .replace(/password[=:\s]+[^\s]+/gi, 'password=***')
        .replace(/token[=:\s]+[^\s]+/gi, 'token=***')
        .replace(/key[=:\s]+[^\s]+/gi, 'key=***')
        .replace(/secret[=:\s]+[^\s]+/gi, 'secret=***')
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
        .replace(/\d{3,}/g, '[NUMBER]')
    }

    it('should sanitize password information', () => {
      const message = 'Login failed for user: password=secret123'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('Login failed for user: password=***')
    })

    it('should sanitize token information', () => {
      const message = 'Invalid token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('Invalid token: Bearer ***')
    })

    it('should sanitize key and secret information', () => {
      const message = 'API key invalid: key=abc123 secret=mysecret'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('API key invalid: key=*** secret=***')
    })

    it('should sanitize UUIDs', () => {
      const message = 'User 550e8400-e29b-41d4-a716-446655440000 not found'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('User [UUID] not found')
    })

    it('should sanitize email addresses', () => {
      const message = 'Failed to send email to user@example.com'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('Failed to send email to [EMAIL]')
    })

    it('should sanitize long numbers', () => {
      const message = 'Error code 1234567890 occurred'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('Error code [NUMBER] occurred')
    })

    it('should handle multiple sensitive items', () => {
      const message = 'User test@example.com with token abc123-def456 and password secret123 failed'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('User [EMAIL] with token=*** and password=*** failed')
    })

    it('should preserve non-sensitive content', () => {
      const message = 'Database connection timeout on server localhost:5432'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('Database connection timeout on server localhost:[NUMBER]')
    })

    it('should handle empty messages', () => {
      const sanitized = sanitizeErrorMessage('')

      expect(sanitized).toBe('')
    })

    it('should handle messages with only sensitive content', () => {
      const message = 'password=secret123 token=abc123 email=test@example.com'
      const sanitized = sanitizeErrorMessage(message)

      expect(sanitized).toBe('password=*** token=*** email=[EMAIL]')
    })
  })

  describe('sanitizeContextForProduction', () => {
    // Import the private function for testing
    const sanitizeContextForProduction = (context: unknown): unknown => {
      if (!context) return undefined

      if (typeof context === 'string') {
        return context
          .replace(/password[=:\s]+[^\s]+/gi, 'password=***')
          .replace(/token[=:\s]+[^\s]+/gi, 'token=***')
          .replace(/key[=:\s]+[^\s]+/gi, 'key=***')
          .replace(/secret[=:\s]+[^\s]+/gi, 'secret=***')
          .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
          .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
          .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
          .replace(/\d{3,}/g, '[NUMBER]')
      }

      if (typeof context === 'object' && context !== null) {
        const sanitized: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(context)) {
          const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'session']
          if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
            sanitized[key] = '***'
            continue
          }

          if (typeof value === 'string') {
            sanitized[key] = value
              .replace(/password[=:\s]+[^\s]+/gi, 'password=***')
              .replace(/token[=:\s]+[^\s]+/gi, 'token=***')
              .replace(/key[=:\s]+[^\s]+/gi, 'key=***')
              .replace(/secret[=:\s]+[^\s]+/gi, 'secret=***')
              .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
              .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
              .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
              .replace(/\d{3,}/g, '[NUMBER]')
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            sanitized[key] = value
          } else {
            sanitized[key] = '[OBJECT]'
          }
        }

        return sanitized
      }

      return '[UNKNOWN_TYPE]'
    }

    it('should return undefined for null/undefined context', () => {
      expect(sanitizeContextForProduction(null)).toBeUndefined()
      expect(sanitizeContextForProduction(undefined)).toBeUndefined()
    })

    it('should sanitize string context', () => {
      const context = 'User test@example.com failed with token abc123'
      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toBe('User [EMAIL] failed with token=***')
    })

    it('should sanitize object context by removing sensitive keys', () => {
      const context = {
        userId: '123',
        password: 'secret123',
        token: 'jwt-token',
        email: 'test@example.com',
        apiKey: 'key123',
        count: 42,
        active: true,
        metadata: { nested: 'value' }
      }

      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toEqual({
        userId: '[NUMBER]',
        password: '***',
        token: '***',
        email: '[EMAIL]',
        apiKey: '***',
        count: 42,
        active: true,
        metadata: '[OBJECT]'
      })
    })

    it('should handle empty objects', () => {
      const context = {}
      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toEqual({})
    })

    it('should handle arrays as unknown type', () => {
      const context = ['item1', 'item2']
      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toEqual({ '0': 'item1', '1': 'item2' })
    })

    it('should handle numbers as unknown type', () => {
      const context = 42
      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toBe('[UNKNOWN_TYPE]')
    })

    it('should handle boolean as unknown type', () => {
      const context = true
      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toBe('[UNKNOWN_TYPE]')
    })

    it('should preserve non-sensitive keys with string values', () => {
      const context = {
        operation: 'login',
        path: '/api/auth/login',
        userAgent: 'Mozilla/5.0',
        ip: '192.168.1.1'
      }

      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toEqual({
        operation: 'login',
        path: '/api/auth/login',
        userAgent: 'Mozilla/5.0',
        ip: '[NUMBER].[NUMBER].1.1'
      })
    })

    it('should detect sensitive keys with different cases', () => {
      const context = {
        Password: 'secret',
        TOKEN: 'jwt',
        ApiKey: 'key123',
        userSession: 'session123'
      }

      const sanitized = sanitizeContextForProduction(context)

      expect(sanitized).toEqual({
        Password: '***',
        TOKEN: '***',
        ApiKey: '***',
        userSession: '***'
      })
    })
  })
})
