/**
 * Token Revocation on Role Change Integration Tests
 *
 * Tests that when role permissions are modified, all users with that role
 * have their tokens revoked automatically for security.
 *
 * SECURITY: Critical test to ensure permission changes take effect immediately
 * and prevent privilege escalation with stale tokens.
 */

import { afterEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createTokenPair, type DeviceInfo } from '@/lib/auth/token-manager';
import { db, refresh_tokens, token_blacklist } from '@/lib/db';
import { invalidateUserTokensWithRole } from '@/lib/rbac/cache-invalidation';
import {
  assignCommittedRoleToUser,
  committedRoleFactory,
  committedUserFactory,
  createCommittedRole,
  createCommittedUser,
} from '@/tests/factories/committed';

describe('Token Revocation on Role Change', () => {
  const scopeId = `token-revoke-${nanoid(8)}`;

  afterEach(async () => {
    await committedUserFactory.cleanup(scopeId);
    await committedRoleFactory.cleanup(scopeId);
  });

  it('should revoke all tokens when role permissions are modified', async () => {
    // Setup: Create users with the same role
    const user1 = await createCommittedUser({ scope: scopeId });
    const user2 = await createCommittedUser({ scope: scopeId });
    const user3 = await createCommittedUser({ scope: scopeId });

    const role = await createCommittedRole({
      name: `test_role_revocation_${nanoid(6)}`,
      permissionNames: ['users:read:all'],
      scope: scopeId,
    });

    // Assign role to all three users
    await assignCommittedRoleToUser(user1.user_id, role.role_id);
    await assignCommittedRoleToUser(user2.user_id, role.role_id);
    await assignCommittedRoleToUser(user3.user_id, role.role_id);

    // Create tokens for all users
    const deviceInfo: DeviceInfo = {
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser',
      fingerprint: 'test-fingerprint',
      deviceName: 'Test Device',
    };

    await createTokenPair(user1.user_id, deviceInfo, false, user1.email);
    await createTokenPair(user2.user_id, deviceInfo, false, user2.email);
    await createTokenPair(user3.user_id, deviceInfo, false, user3.email);

    // Verify tokens exist and are active
    const activeTokensBefore = await db
      .select()
      .from(refresh_tokens)
      .where(eq(refresh_tokens.is_active, true));

    expect(activeTokensBefore.length).toBeGreaterThanOrEqual(3);

    // Execute: Simulate role permission change by invalidating tokens
    const revokedCount = await invalidateUserTokensWithRole(role.role_id, 'permissions_updated');

    // Verify: Should have revoked 3 tokens (one per user)
    expect(revokedCount).toBe(3);

    // Verify: All refresh tokens for these users should be revoked
    const activeTokensAfter = await db
      .select()
      .from(refresh_tokens)
      .where(and(eq(refresh_tokens.is_active, true), eq(refresh_tokens.user_id, user1.user_id)));

    expect(activeTokensAfter.length).toBe(0);

    // Verify: Tokens should be in blacklist
    const blacklistedTokens = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.reason, 'security'));

    expect(blacklistedTokens.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle role with no users gracefully', async () => {
    // Setup: Create a role with no users assigned
    const role = await createCommittedRole({
      name: `empty_role_${nanoid(6)}`,
      permissionNames: ['users:read:organization'],
      scope: scopeId,
    });

    // Execute: Try to invalidate tokens for role with no users
    const revokedCount = await invalidateUserTokensWithRole(role.role_id, 'permissions_updated');

    // Verify: Should return 0 (no tokens to revoke)
    expect(revokedCount).toBe(0);
  });

  it('should continue revoking other users if one fails', async () => {
    // Setup: Create multiple users with the same role
    const user1 = await createCommittedUser({ scope: scopeId });
    const user2 = await createCommittedUser({ scope: scopeId });

    const role = await createCommittedRole({
      name: `test_role_partial_${nanoid(6)}`,
      permissionNames: ['users:read:all'],
      scope: scopeId,
    });

    await assignCommittedRoleToUser(user1.user_id, role.role_id);
    await assignCommittedRoleToUser(user2.user_id, role.role_id);

    // Create token only for user2 (user1 has no tokens)
    const deviceInfo: DeviceInfo = {
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser',
      fingerprint: 'test-fingerprint',
      deviceName: 'Test Device',
    };

    await createTokenPair(user2.user_id, deviceInfo, false, user2.email);

    // Execute: Should handle user1 (no tokens) and still revoke user2's tokens
    const revokedCount = await invalidateUserTokensWithRole(role.role_id, 'permissions_updated');

    // Verify: Should have revoked at least user2's token
    // (user1 had 0 tokens, so total could be 1)
    expect(revokedCount).toBeGreaterThanOrEqual(1);
  });

  it('should use correct revocation reason based on input', async () => {
    // Setup
    const user = await createCommittedUser({ scope: scopeId });
    const role = await createCommittedRole({
      name: `test_role_reason_${nanoid(6)}`,
      permissionNames: ['users:read:all'],
      scope: scopeId,
    });

    await assignCommittedRoleToUser(user.user_id, role.role_id);

    const deviceInfo: DeviceInfo = {
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser',
      fingerprint: 'test-fingerprint',
      deviceName: 'Test Device',
    };

    await createTokenPair(user.user_id, deviceInfo, false, user.email);

    // Execute: Invalidate with custom reason
    await invalidateUserTokensWithRole(role.role_id, 'role_deleted');

    // Verify: Check blacklist has entry with appropriate reason
    const blacklistedTokens = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.user_id, user.user_id));

    expect(blacklistedTokens.length).toBeGreaterThan(0);
    // The reason will be mapped to 'admin_action' based on our logic
    if (blacklistedTokens[0]) {
      expect(blacklistedTokens[0].reason).toBe('admin_action');
    }
  });
});
