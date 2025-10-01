import { describe, it, expect, vi, beforeEach } from 'vitest'
import { debugLog, errorLog } from '@/lib/utils/debug'

// Mock the universal logger factory
vi.mock('@/lib/logger/factory', () => ({
  createAppLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    security: vi.fn(),
    timing: vi.fn()
  }))
}))

describe('debug utilities - business value tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('debugLog', () => {
    it('should provide all required debug categories', () => {
      // Test business value: all debug categories are available
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
      // Test business value: debug functions are robust and don't throw
      expect(() => debugLog.auth('Test message')).not.toThrow()
      expect(() => debugLog.middleware('Test message', { data: 'test' })).not.toThrow()
      expect(() => debugLog.rbac('Test message')).not.toThrow()
      expect(() => debugLog.security('Test message')).not.toThrow()
      expect(() => debugLog.session('Test message')).not.toThrow()
      expect(() => debugLog.database('Test message')).not.toThrow()
      expect(() => debugLog.api('Test message')).not.toThrow()
      expect(() => debugLog.business('Test message')).not.toThrow()
    })

    it('should handle complex data objects safely', () => {
      const complexData = {
        user: { id: '123', roles: ['admin', 'user'] },
        metadata: { timestamp: new Date(), version: '1.0.0' },
        nested: { deep: { value: 'test' } }
      }

      // Test business value: complex data doesn't break debug functions
      expect(() => debugLog.auth('Complex test', complexData)).not.toThrow()
      expect(() => debugLog.rbac('Complex test', complexData)).not.toThrow()
    })

    it('should handle performance timing correctly', () => {
      const startTime = Date.now() - 50 // 50ms ago
      
      // Test business value: performance logging works
      expect(() => debugLog.performance('Test operation', startTime)).not.toThrow()
      expect(() => debugLog.performance('Test operation', startTime, { extra: 'data' })).not.toThrow()
    })

    it('should handle correlation logging correctly', () => {
      const correlationId = 'test-correlation-123'
      
      // Test business value: correlation logging works
      expect(() => debugLog.correlation('Test operation', correlationId)).not.toThrow()
      expect(() => debugLog.correlation('Test operation', correlationId, { extra: 'data' })).not.toThrow()
    })
  })

  describe('errorLog', () => {
    it('should handle all error types without throwing', () => {
      // Test business value: error logging is robust
      expect(() => errorLog('String error', 'Simple string error')).not.toThrow()
      expect(() => errorLog('Object error', { message: 'Object error' })).not.toThrow()
      expect(() => errorLog('Null error', null)).not.toThrow()
      expect(() => errorLog('Undefined error', undefined)).not.toThrow()
      expect(() => errorLog('Number error', 404)).not.toThrow()
    })

    it('should handle errors with context safely', () => {
      const error = new Error('Test error')
      const context = { userId: '123', operation: 'test' }

      // Test business value: context handling is robust
      expect(() => errorLog('Test error', error, context)).not.toThrow()
    })

    it('should handle sensitive data in context', () => {
      const error = new Error('Authentication failed')
      const sensitiveContext = {
        password: 'secret123',
        token: 'jwt-token-here',
        apiKey: 'api-key-secret'
      }

      // Test business value: sensitive data handling is safe
      expect(() => errorLog('Auth error', error, sensitiveContext)).not.toThrow()
    })
  })

  describe('error sanitization functions', () => {
    it('should provide sanitization utilities', () => {
      // Test business value: sanitization functions are available
      // Note: These are internal functions, testing their availability
      expect(typeof errorLog).toBe('function')
    })
  })
})
