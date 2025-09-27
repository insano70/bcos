/**
 * Token Lifecycle Integration Tests
 * Tests token create → validate → refresh → revoke → cleanup flow
 */

import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup' // Import integration setup for database access
import { TokenManager } from '@/lib/auth/token-manager'
import { createTestUser } from '@/tests/factories/user-factory'

describe('Token Lifecycle Integration', () => {
  let testUser: any

  beforeEach(async () => {
    testUser = await createTestUser({
      email: 'tokentest@example.com',
      password: 'TestPassword123!'
    })
  })

  describe('Complete Token Lifecycle', () => {
    it('should handle create → validate → refresh → revoke → cleanup flow', async () => {
      // 1. Create token pair
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-1',
        deviceName: 'Test Device 1'
      }
      
      const tokenPair = await TokenManager.createTokenPair(
        testUser.user_id,
        deviceInfo,
        false,
        testUser.email
      )
      
      expect(tokenPair.accessToken).toBeDefined()
      expect(tokenPair.refreshToken).toBeDefined()
      expect(tokenPair.sessionId).toBeDefined()
      
      // 2. Validate access token
      const validatedPayload = await TokenManager.validateAccessToken(tokenPair.accessToken)
      expect(validatedPayload).toBeDefined()
      expect(validatedPayload?.sub).toBe(testUser.user_id)
      
      // 3. Refresh tokens
      const newTokenPair = await TokenManager.refreshTokenPair(
        tokenPair.refreshToken,
        deviceInfo
      )
      
      expect(newTokenPair).toBeDefined()
      expect(newTokenPair?.accessToken).toBeDefined()
      expect(newTokenPair?.accessToken).not.toBe(tokenPair.accessToken)
      
      // 4. Revoke refresh token
      const revokeResult = await TokenManager.revokeRefreshToken(
        newTokenPair!.refreshToken,
        'logout'
      )
      
      expect(revokeResult).toBe(true)
      
      // 5. Verify revoked token cannot be used
      const failedRefresh = await TokenManager.refreshTokenPair(
        newTokenPair!.refreshToken,
        deviceInfo
      )
      
      expect(failedRefresh).toBeNull()
      
      // 6. Cleanup expired tokens
      const cleanupCounts = await TokenManager.cleanupExpiredTokens()
      expect(cleanupCounts.refreshTokens).toBeGreaterThanOrEqual(0)
      expect(cleanupCounts.blacklistEntries).toBeGreaterThanOrEqual(0)
    })

    it('should handle token blacklisting', async () => {
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-2',
        deviceName: 'Test Device 2'
      }
      
      // Create token
      const tokenPair = await TokenManager.createTokenPair(
        testUser.user_id,
        deviceInfo,
        false,
        testUser.email
      )
      
      // Validate it works
      const payload1 = await TokenManager.validateAccessToken(tokenPair.accessToken)
      expect(payload1).toBeDefined()
      
      // Revoke all user tokens (should blacklist)
      const revokeAllResult = await TokenManager.revokeAllUserTokens(testUser.user_id)
      expect(revokeAllResult).toBeGreaterThanOrEqual(1)
      
      // Token should now be invalid
      const payload2 = await TokenManager.validateAccessToken(tokenPair.accessToken)
      expect(payload2).toBeNull()
    })

    it('should handle device-specific token management', async () => {
      const device1 = {
        userAgent: 'Chrome Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-chrome',
        deviceName: 'Chrome Device'
      }
      
      const device2 = {
        userAgent: 'Firefox Browser', 
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-firefox',
        deviceName: 'Firefox Device'
      }
      
      // Create tokens for different devices
      const tokens1 = await TokenManager.createTokenPair(testUser.user_id, device1, false, testUser.email)
      const tokens2 = await TokenManager.createTokenPair(testUser.user_id, device2, false, testUser.email)
      
      // Both should be valid
      expect(await TokenManager.validateAccessToken(tokens1.accessToken)).toBeDefined()
      expect(await TokenManager.validateAccessToken(tokens2.accessToken)).toBeDefined()
      
      // Revoke device 1 only
      await TokenManager.revokeRefreshToken(tokens1.refreshToken, 'logout')
      
      // Device 1 should be invalid, device 2 should still work
      expect(await TokenManager.validateAccessToken(tokens1.accessToken)).toBeNull()
      expect(await TokenManager.validateAccessToken(tokens2.accessToken)).toBeDefined()
    })
  })
})
