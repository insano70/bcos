/**
 * Rate Limiting Security Tests
 *
 * Tests the rate limiting mechanism that protects against DoS attacks.
 * Rate limits are enforced via Redis using a sliding window algorithm.
 *
 * Rate limit configurations:
 * - auth: 20 requests per 15 minutes
 * - mfa: 5 requests per 15 minutes
 * - api: 500 requests per minute
 * - upload: 300 requests per minute
 * - session_read: 500 requests per minute
 * - admin_cli: 1 request per minute
 *
 * IMPORTANT: These tests require Redis to be available. If Redis is not
 * configured, the rate limiting system "fails open" and allows all requests.
 *
 * Part of wide coverage strategy - core security features.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { rateLimitCache } from '@/lib/cache';
import { isRedisAvailable } from '@/lib/redis';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('Rate Limiting Security', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `ratelimit-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('Rate Limit Cache Service', () => {
    it('should allow requests within rate limit', async () => {
      const uniqueIdentifier = `test-ip-${nanoid(8)}`;
      const limit = 5;
      const windowSeconds = 60;

      // First request should be allowed
      const result = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(limit);
      expect(result.current).toBeLessThanOrEqual(limit);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should track request count across multiple requests', async () => {
      const uniqueIdentifier = `test-ip-multi-${nanoid(8)}`;
      const limit = 5;
      const windowSeconds = 60;

      // Make 3 requests
      const result1 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);
      const result2 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);
      const result3 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);

      // If Redis is available, current count should increment
      // If Redis is unavailable, all requests are allowed with current=0
      if (isRedisAvailable()) {
        expect(result1.current).toBe(1);
        expect(result2.current).toBe(2);
        expect(result3.current).toBe(3);
        expect(result3.remaining).toBe(limit - 3);
      } else {
        // Fail-open behavior when Redis unavailable
        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
        expect(result3.allowed).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit when Redis available', async () => {
      // This test only runs when Redis is available
      if (!isRedisAvailable()) {
        // Skip assertion but still run to verify no errors
        const result = await rateLimitCache.checkIpRateLimit(`skip-${nanoid(8)}`, 1, 60);
        expect(result.allowed).toBe(true); // Fail-open behavior
        return;
      }

      const uniqueIdentifier = `test-ip-exceed-${nanoid(8)}`;
      const limit = 2;
      const windowSeconds = 60;

      // Make requests up to and beyond limit
      const result1 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);
      const result2 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);
      const result3 = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false); // Should be blocked
      expect(result3.current).toBe(3);
      expect(result3.remaining).toBe(0);
    });

    it('should provide reset time information', async () => {
      const uniqueIdentifier = `test-ip-reset-${nanoid(8)}`;
      const limit = 10;
      const windowSeconds = 60;

      const result = await rateLimitCache.checkIpRateLimit(uniqueIdentifier, limit, windowSeconds);

      expect(result.resetTime).toBeDefined();
      expect(typeof result.resetTime).toBe('number');
      expect(result.resetTime).toBeGreaterThan(Date.now()); // Reset time should be in the future
      expect(result.resetAt).toBeDefined();
      expect(typeof result.resetAt).toBe('number');
    });

    it('should use different counters for different identifiers', async () => {
      const identifier1 = `test-ip-a-${nanoid(8)}`;
      const identifier2 = `test-ip-b-${nanoid(8)}`;
      const limit = 10;
      const windowSeconds = 60;

      // Make requests with first identifier
      await rateLimitCache.checkIpRateLimit(identifier1, limit, windowSeconds);
      await rateLimitCache.checkIpRateLimit(identifier1, limit, windowSeconds);
      const result1 = await rateLimitCache.checkIpRateLimit(identifier1, limit, windowSeconds);

      // Make requests with second identifier
      const result2 = await rateLimitCache.checkIpRateLimit(identifier2, limit, windowSeconds);

      // Each identifier should have its own counter
      if (isRedisAvailable()) {
        expect(result1.current).toBe(3);
        expect(result2.current).toBe(1);
      } else {
        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
      }
    });
  });

  describe('Rate Limit Types', () => {
    it('should support user-based rate limiting', async () => {
      const userId = `test-user-${nanoid(8)}`;
      const limit = 5;
      const windowSeconds = 60;

      const result = await rateLimitCache.checkUserRateLimit(userId, limit, windowSeconds);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(limit);
    });

    it('should support endpoint-based rate limiting', async () => {
      const endpoint = `/api/test-${nanoid(8)}`;
      const limit = 100;
      const windowSeconds = 60;

      const result = await rateLimitCache.checkEndpointRateLimit(endpoint, limit, windowSeconds);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(limit);
    });

    it('should support global rate limiting', async () => {
      const limit = 1000;
      const windowSeconds = 60;

      const result = await rateLimitCache.checkGlobalRateLimit(limit, windowSeconds);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(limit);
    });
  });

  describe('Graceful Degradation', () => {
    it('should return valid result structure even without Redis', async () => {
      const identifier = `test-graceful-${nanoid(8)}`;
      const limit = 10;
      const windowSeconds = 60;

      const result = await rateLimitCache.checkIpRateLimit(identifier, limit, windowSeconds);

      // Verify result structure regardless of Redis availability
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetTime');
      expect(result).toHaveProperty('resetAt');

      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.current).toBe('number');
      expect(typeof result.limit).toBe('number');
      expect(typeof result.remaining).toBe('number');
      expect(typeof result.resetTime).toBe('number');
      expect(typeof result.resetAt).toBe('number');
    });

    it('should fail open when Redis unavailable', async () => {
      // This test verifies the fail-open behavior described in the implementation
      // When Redis is unavailable, all requests should be allowed
      const identifier = `test-failopen-${nanoid(8)}`;
      const limit = 1; // Very restrictive limit
      const windowSeconds = 60;

      // Even with limit=1, if Redis is unavailable, requests should be allowed
      const result1 = await rateLimitCache.checkIpRateLimit(identifier, limit, windowSeconds);
      const result2 = await rateLimitCache.checkIpRateLimit(identifier, limit, windowSeconds);

      // If Redis is not available, both should be allowed (fail-open)
      if (!isRedisAvailable()) {
        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
        expect(result1.remaining).toBe(limit); // Full limit when failing open
      }
      // If Redis is available, the second request would be blocked (tested elsewhere)
    });
  });

  describe('Rate Limit Reset', () => {
    it('should call reset without error', async () => {
      const identifier = `test-reset-${nanoid(8)}`;
      const limit = 5;
      const windowSeconds = 60;

      // Make some requests
      await rateLimitCache.checkIpRateLimit(identifier, limit, windowSeconds);
      await rateLimitCache.checkIpRateLimit(identifier, limit, windowSeconds);

      // Reset should complete without error
      await expect(
        rateLimitCache.resetRateLimit('ip', identifier)
      ).resolves.not.toThrow();
    });

    it('should handle reset for non-existent identifier', async () => {
      const nonExistentId = `non-existent-${nanoid(8)}`;

      // Reset should complete without error even for non-existent keys
      await expect(
        rateLimitCache.resetRateLimit('ip', nonExistentId)
      ).resolves.not.toThrow();
    });
  });
});
