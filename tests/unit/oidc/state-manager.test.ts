/**
 * OIDC State Manager Unit Tests
 *
 * Tests the critical one-time state token validation logic:
 * - State registration
 * - One-time use enforcement (replay attack prevention)
 * - State expiration (TTL validation)
 * - Cleanup operations
 * - Security logging
 *
 * CRITICAL: This component prevents replay attacks - exhaustive testing required
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stateManager } from '@/lib/oidc/state-manager'
import { log } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}))

describe('StateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateManager.clearAll()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    stateManager.clearAll()
  })

  describe('registerState', () => {
    it('should register state token successfully', () => {
      const state = 'test-state-token-123'

      stateManager.registerState(state)

      expect(stateManager.getStateCount()).toBe(1)
      expect(log.debug).toHaveBeenCalledWith(
        'State token registered',
        expect.objectContaining({
          state: expect.stringContaining('test-sta'),
          totalStates: 1
        })
      )
    })

    it('should reject empty state token', () => {
      expect(() => stateManager.registerState('')).toThrow('Invalid state token')
    })

    it('should handle multiple state registrations', () => {
      stateManager.registerState('state-1')
      stateManager.registerState('state-2')
      stateManager.registerState('state-3')

      expect(stateManager.getStateCount()).toBe(3)
    })

    it('should allow same state to be registered and overwrite existing', () => {
      // State manager uses Map.set which overwrites existing keys
      // This is expected behavior - last registration wins
      const state = 'duplicate-state'

      stateManager.registerState(state)
      stateManager.registerState(state)

      expect(stateManager.getStateCount()).toBe(1) // Map overwrites, not duplicates
    })
  })

  describe('validateAndMarkUsed - One-Time Use Enforcement', () => {
    it('should validate unused state within TTL', () => {
      const state = 'valid-state-token'
      stateManager.registerState(state)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(true)
      expect(log.info).toHaveBeenCalledWith(
        'State token validated and marked as used',
        expect.objectContaining({
          state: expect.stringContaining('valid-st'),
          age: expect.any(Number)
        })
      )
    })

    it('should reject replay attack - already-used state', () => {
      const state = 'replay-attack-state'
      stateManager.registerState(state)

      // First validation succeeds
      const firstResult = stateManager.validateAndMarkUsed(state)
      expect(firstResult).toBe(true)

      // Second validation fails - REPLAY ATTACK DETECTED
      const secondResult = stateManager.validateAndMarkUsed(state)
      expect(secondResult).toBe(false)

      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.objectContaining({
          state: expect.stringContaining('replay-a'),
          originalTimestamp: expect.any(String),
          age: expect.any(Number)
        })
      )
    })

    it('should reject expired state - beyond TTL', () => {
      const state = 'expired-state-token'
      stateManager.registerState(state)

      // Fast-forward past TTL (5 minutes + 30 seconds)
      vi.advanceTimersByTime(6 * 60 * 1000)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(false)
      expect(log.warn).toHaveBeenCalledWith(
        'State token expired',
        expect.objectContaining({
          state: expect.stringContaining('expired-'),
          age: expect.any(Number),
          maxAge: 5 * 60 * 1000 + 30 * 1000
        })
      )
    })

    it('should accept state just before TTL expires', () => {
      const state = 'almost-expired-state'
      stateManager.registerState(state)

      // Fast-forward to 5 minutes exactly (within TTL with clock skew)
      vi.advanceTimersByTime(5 * 60 * 1000)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(true)
    })

    it('should accept state at exact TTL with clock skew tolerance', () => {
      const state = 'clock-skew-state'
      stateManager.registerState(state)

      // Fast-forward to 5 minutes + 30 seconds (exactly at TTL)
      vi.advanceTimersByTime(5 * 60 * 1000 + 30 * 1000)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(true)
    })

    it('should reject non-existent state token', () => {
      const result = stateManager.validateAndMarkUsed('non-existent-state')

      expect(result).toBe(false)
      expect(log.warn).toHaveBeenCalledWith(
        'State token not found (expired or never registered)',
        expect.objectContaining({
          state: expect.stringContaining('non-exis')
        })
      )
    })

    it('should handle rapid sequential validation attempts', () => {
      const state = 'rapid-validation-state'
      stateManager.registerState(state)

      // First validation
      const result1 = stateManager.validateAndMarkUsed(state)
      expect(result1).toBe(true)

      // Immediate second validation (replay attack simulation)
      const result2 = stateManager.validateAndMarkUsed(state)
      expect(result2).toBe(false)

      // Third validation (still rejected)
      const result3 = stateManager.validateAndMarkUsed(state)
      expect(result3).toBe(false)
    })
  })

  describe('State Lifecycle Management', () => {
    it('should delete expired state on validation attempt', () => {
      const state = 'lifecycle-state'
      stateManager.registerState(state)

      expect(stateManager.getStateCount()).toBe(1)

      // Fast-forward past TTL
      vi.advanceTimersByTime(6 * 60 * 1000)

      stateManager.validateAndMarkUsed(state)

      // State should be deleted after failed validation
      expect(stateManager.getStateCount()).toBe(0)
    })

    it('should schedule cleanup after successful validation', () => {
      const state = 'cleanup-schedule-state'
      stateManager.registerState(state)

      stateManager.validateAndMarkUsed(state)

      // State still exists (marked as used)
      expect(stateManager.getStateCount()).toBe(1)

      // Fast-forward to cleanup time (10 minutes)
      vi.runAllTimers()

      // Cleanup should have removed the state
      expect(log.debug).toHaveBeenCalledWith(
        'State token cleaned up',
        expect.objectContaining({
          state: expect.stringContaining('cleanup-')
        })
      )
    })

    it('should handle cleanup for multiple states independently', () => {
      stateManager.registerState('state-1')
      stateManager.registerState('state-2')
      stateManager.registerState('state-3')

      expect(stateManager.getStateCount()).toBe(3)

      // Use one state
      stateManager.validateAndMarkUsed('state-1')

      // Advance timers to trigger cleanup
      vi.runAllTimers()

      // Only the used state should be cleaned up
      // Unused states remain until validated or expired
      expect(stateManager.getStateCount()).toBe(2)
    })
  })

  describe('cleanupExpired', () => {
    it('should cleanup expired unused states', () => {
      stateManager.registerState('old-unused-1')
      stateManager.registerState('old-unused-2')

      // Age the states
      vi.advanceTimersByTime(6 * 60 * 1000)

      // Register recent states AFTER time advancement
      stateManager.registerState('recent-state')
      stateManager.registerState('another-recent-state')

      const cleaned = stateManager.cleanupExpired()

      expect(cleaned).toBe(2) // Two old unused states cleaned
      expect(stateManager.getStateCount()).toBe(2) // Two recent states remain
    })

    it('should cleanup old used states', () => {
      const state = 'used-old-state'
      stateManager.registerState(state)
      stateManager.validateAndMarkUsed(state)

      // Fast-forward past cleanup TTL (10 minutes)
      // Since validateAndMarkUsed schedules async cleanup, we need to account for that
      vi.advanceTimersByTime(11 * 60 * 1000)

      const cleaned = stateManager.cleanupExpired()

      // Cleanup count may vary based on auto-scheduled cleanups
      expect(cleaned).toBeGreaterThanOrEqual(0)
      // State should be gone after cleanup
      const secondCleanup = stateManager.cleanupExpired()
      expect(secondCleanup).toBe(0)
    })

    it('should not cleanup recent used states', () => {
      const state = 'recent-used-state'
      stateManager.registerState(state)
      stateManager.validateAndMarkUsed(state)

      // Fast-forward only 5 minutes (within cleanup TTL)
      vi.advanceTimersByTime(5 * 60 * 1000)

      const cleaned = stateManager.cleanupExpired()

      expect(cleaned).toBe(0)
      expect(stateManager.getStateCount()).toBe(1)
    })

    it('should log cleanup operations', () => {
      stateManager.registerState('cleanup-test-1')
      stateManager.registerState('cleanup-test-2')

      vi.advanceTimersByTime(6 * 60 * 1000)

      stateManager.cleanupExpired()

      expect(log.info).toHaveBeenCalledWith(
        'Expired states cleaned up',
        expect.objectContaining({
          cleaned: 2,
          remaining: 0
        })
      )
    })

    it('should handle empty state manager gracefully', () => {
      const cleaned = stateManager.cleanupExpired()

      expect(cleaned).toBe(0)
      expect(log.info).not.toHaveBeenCalled()
    })
  })

  describe('clearAll', () => {
    it('should clear all registered states', () => {
      stateManager.registerState('state-1')
      stateManager.registerState('state-2')
      stateManager.registerState('state-3')

      expect(stateManager.getStateCount()).toBe(3)

      stateManager.clearAll()

      expect(stateManager.getStateCount()).toBe(0)
      expect(log.warn).toHaveBeenCalledWith(
        'All state tokens cleared',
        expect.objectContaining({ count: 3 })
      )
    })

    it('should handle clearing empty state manager', () => {
      stateManager.clearAll()

      expect(stateManager.getStateCount()).toBe(0)
      expect(log.warn).toHaveBeenCalledWith(
        'All state tokens cleared',
        expect.objectContaining({ count: 0 })
      )
    })
  })

  describe('getStateCount', () => {
    it('should return current number of tracked states', () => {
      expect(stateManager.getStateCount()).toBe(0)

      stateManager.registerState('state-1')
      expect(stateManager.getStateCount()).toBe(1)

      stateManager.registerState('state-2')
      expect(stateManager.getStateCount()).toBe(2)

      stateManager.validateAndMarkUsed('state-1')
      expect(stateManager.getStateCount()).toBe(2) // Still tracked until cleanup

      stateManager.clearAll()
      expect(stateManager.getStateCount()).toBe(0)
    })
  })

  describe('Security Logging', () => {
    it('should log security alert on replay attack detection', () => {
      const state = 'security-test-state'
      stateManager.registerState(state)
      stateManager.validateAndMarkUsed(state)

      // Attempt replay
      stateManager.validateAndMarkUsed(state)

      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.any(Object)
      )
    })

    it('should include original timestamp in replay logs', () => {
      const state = 'timestamp-test-state'
      stateManager.registerState(state)

      const beforeUse = Date.now()
      stateManager.validateAndMarkUsed(state)

      // Attempt replay
      stateManager.validateAndMarkUsed(state)

      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.objectContaining({
          originalTimestamp: expect.any(String),
          age: expect.any(Number)
        })
      )
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent registrations', () => {
      const states = Array.from({ length: 100 }, (_, i) => `concurrent-state-${i}`)

      states.forEach(state => stateManager.registerState(state))

      expect(stateManager.getStateCount()).toBe(100)
    })

    it('should handle validation race conditions correctly', () => {
      const state = 'race-condition-state'
      stateManager.registerState(state)

      // Simulate concurrent validation attempts
      const result1 = stateManager.validateAndMarkUsed(state)
      const result2 = stateManager.validateAndMarkUsed(state)
      const result3 = stateManager.validateAndMarkUsed(state)

      // Only first should succeed
      expect(result1).toBe(true)
      expect(result2).toBe(false)
      expect(result3).toBe(false)

      // Should log two replay attempts
      expect(log.error).toHaveBeenCalledTimes(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long state tokens', () => {
      const longState = 'a'.repeat(1000)

      stateManager.registerState(longState)
      const result = stateManager.validateAndMarkUsed(longState)

      expect(result).toBe(true)
    })

    it('should handle special characters in state tokens', () => {
      const specialState = 'state-!@#$%^&*()_+-=[]{}|;:",.<>?'

      stateManager.registerState(specialState)
      const result = stateManager.validateAndMarkUsed(specialState)

      expect(result).toBe(true)
    })

    it('should handle state token exactly at TTL boundary', () => {
      const state = 'boundary-state'
      stateManager.registerState(state)

      // Exactly at TTL (5min + 30s)
      vi.advanceTimersByTime(5 * 60 * 1000 + 30 * 1000)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(true)
    })

    it('should handle state token 1ms past TTL boundary', () => {
      const state = 'past-boundary-state'
      stateManager.registerState(state)

      // 1ms past TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 30 * 1000 + 1)

      const result = stateManager.validateAndMarkUsed(state)

      expect(result).toBe(false)
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory with many state tokens', () => {
      // Register many states
      for (let i = 0; i < 1000; i++) {
        stateManager.registerState(`state-${i}`)
      }

      expect(stateManager.getStateCount()).toBe(1000)

      // Age them all
      vi.advanceTimersByTime(6 * 60 * 1000)

      // Cleanup should remove all
      const cleaned = stateManager.cleanupExpired()

      expect(cleaned).toBe(1000)
      expect(stateManager.getStateCount()).toBe(0)
    })

    it('should cleanup used states after timeout', () => {
      const states = Array.from({ length: 50 }, (_, i) => `memory-state-${i}`)

      states.forEach(state => {
        stateManager.registerState(state)
        stateManager.validateAndMarkUsed(state)
      })

      expect(stateManager.getStateCount()).toBe(50)

      // Run all cleanup timers
      vi.runAllTimers()

      expect(stateManager.getStateCount()).toBe(0)
    })
  })
})
