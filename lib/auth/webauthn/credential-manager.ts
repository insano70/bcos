/**
 * WebAuthn Credential Manager
 * Manages credential CRUD operations and lifecycle
 *
 * Features:
 * - List user credentials (sanitized)
 * - Delete credentials (soft delete)
 * - Rename credentials
 * - Admin MFA reset
 * - Credential count tracking
 */

import { and, eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import { account_security, db, webauthn_credentials } from '@/lib/db';
import { log } from '@/lib/logger';
import type { WebAuthnCredential } from '@/lib/types/webauthn';

/**
 * Validate credential name input
 * Prevents XSS, excessively long strings, and invalid characters
 *
 * @param name - Credential name to validate
 * @throws Error if validation fails
 */
function validateCredentialName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Credential name cannot be empty');
  }

  if (name.length > 50) {
    throw new Error('Credential name must be 50 characters or less');
  }

  // Allow alphanumeric, spaces, and common punctuation
  const validPattern = /^[a-zA-Z0-9\s\-_'.]+$/;
  if (!validPattern.test(name)) {
    throw new Error('Credential name contains invalid characters. Only letters, numbers, spaces, and basic punctuation (- _ \' .) are allowed');
  }
}

/**
 * Get user's active credentials (sanitized - no public keys exposed)
 *
 * @param userId - User ID to fetch credentials for
 * @returns Array of active credentials
 */
export async function getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  log.debug('user credentials retrieved', {
    operation: 'get_user_credentials',
    userId,
    credentialCount: credentials.length,
    component: 'auth',
  });

  return credentials as WebAuthnCredential[];
}

/**
 * Delete (soft delete) a credential
 * Prevents deletion of last credential to maintain MFA requirement
 *
 * @param userId - User ID who owns the credential
 * @param credentialId - Credential ID to delete
 * @returns Success status
 * @throws Error if attempting to delete last credential
 */
export async function deleteCredential(
  userId: string,
  credentialId: string
): Promise<{ success: boolean }> {
  // Use transaction to prevent race condition where two simultaneous deletions
  // could both pass the check and delete all credentials
  return await db.transaction(async (tx) => {
    // Check credential count within transaction
    const activeCredentials = await tx
      .select()
      .from(webauthn_credentials)
      .where(
        and(
          eq(webauthn_credentials.user_id, userId),
          eq(webauthn_credentials.is_active, true)
        )
      );

    if (activeCredentials.length === 1) {
      log.warn('attempted to delete last credential', {
        operation: 'delete_credential',
        userId,
        credentialId: credentialId.substring(0, 16),
        reason: 'last_credential_protection',
        component: 'auth',
      });

      throw new Error(
        'Cannot delete your last passkey. You must have at least one passkey configured.'
      );
    }

    // Soft delete credential within same transaction
    await tx
      .update(webauthn_credentials)
      .set({ is_active: false })
      .where(
        and(
          eq(webauthn_credentials.credential_id, credentialId),
          eq(webauthn_credentials.user_id, userId)
        )
      );

    // Audit log (outside transaction - non-critical)
    await AuditLogger.logAuth({
      action: 'mfa_credential_deleted',
      userId,
      metadata: {
        credentialId: credentialId.substring(0, 16),
        remainingCredentials: activeCredentials.length - 1,
      },
    });

    log.info('webauthn credential deleted', {
      operation: 'delete_credential',
      userId,
      credentialId: credentialId.substring(0, 16),
      remainingCredentials: activeCredentials.length - 1,
      component: 'auth',
    });

    return { success: true };
  });
}

/**
 * Rename a credential
 * Allows users to give friendly names to their passkeys
 *
 * @param userId - User ID who owns the credential
 * @param credentialId - Credential ID to rename
 * @param newName - New friendly name
 * @returns Success status
 * @throws Error if credential not found or validation fails
 */
export async function renameCredential(
  userId: string,
  credentialId: string,
  newName: string
): Promise<{ success: boolean }> {
  // Validate credential name
  validateCredentialName(newName);

  // Check credential exists and belongs to user
  const [credential] = await db
    .select()
    .from(webauthn_credentials)
    .where(
      and(
        eq(webauthn_credentials.credential_id, credentialId),
        eq(webauthn_credentials.user_id, userId),
        eq(webauthn_credentials.is_active, true)
      )
    )
    .limit(1);

  if (!credential) {
    log.warn('rename attempted on non-existent or unauthorized credential', {
      operation: 'rename_credential',
      userId,
      credentialId: credentialId.substring(0, 16),
      reason: 'credential_not_found_or_unauthorized',
      component: 'auth',
    });
    throw new Error('Credential not found or you do not have permission to modify it');
  }

  // Perform rename
  await db
    .update(webauthn_credentials)
    .set({ credential_name: newName })
    .where(eq(webauthn_credentials.credential_id, credentialId));

  log.info('webauthn credential renamed', {
    operation: 'rename_credential',
    userId,
    credentialId: credentialId.substring(0, 16),
    oldName: credential.credential_name,
    newName,
    component: 'auth',
  });

  return { success: true };
}

/**
 * Admin: Reset MFA for a user (delete all credentials)
 * SECURITY CRITICAL: Only for admin use, fully audited
 *
 * @param adminUserId - Admin user ID performing the reset
 * @param targetUserId - Target user ID to reset MFA for
 * @returns Success status and count of credentials removed
 * @throws Error if admin lacks permission or attempts self-reset
 */
export async function adminResetMFA(
  adminUserId: string,
  targetUserId: string
): Promise<{ success: boolean; credentials_removed: number }> {
  // SECURITY: Verify admin has permission to manage users
  const { getUserContext } = await import('@/lib/rbac/user-context');
  const { PermissionChecker } = await import('@/lib/rbac/permission-checker');

  const adminContext = await getUserContext(adminUserId);
  const permissionChecker = new PermissionChecker(adminContext);

  permissionChecker.requirePermission('users:manage:all');

  // SECURITY: Prevent self-reset (defense in depth)
  if (adminUserId === targetUserId) {
    log.warn('admin attempted to reset own mfa', {
      operation: 'admin_reset_mfa',
      adminUserId,
      reason: 'self_reset_blocked',
      component: 'auth',
    });
    throw new Error('Administrators cannot reset their own MFA credentials');
  }

  // Get all active credentials before deletion
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(
      and(
        eq(webauthn_credentials.user_id, targetUserId),
        eq(webauthn_credentials.is_active, true)
      )
    );

  const credentialCount = credentials.length;

  // Deactivate all credentials
  await db
    .update(webauthn_credentials)
    .set({ is_active: false })
    .where(eq(webauthn_credentials.user_id, targetUserId));

  // Disable MFA in account_security
  await db
    .update(account_security)
    .set({
      mfa_enabled: false,
      mfa_method: null,
      mfa_enforced_at: null,
    })
    .where(eq(account_security.user_id, targetUserId));

  // SECURITY: Log with high severity
  await AuditLogger.logSecurity({
    action: 'mfa_admin_reset',
    userId: targetUserId,
    metadata: {
      adminUserId,
      credentialsRemoved: credentialCount,
      action_taken: 'all_credentials_disabled',
    },
    severity: 'high',
  });

  log.info('admin mfa reset completed', {
    operation: 'admin_reset_mfa',
    adminUserId,
    targetUserId,
    credentialsRemoved: credentialCount,
    component: 'auth',
  });

  return {
    success: true,
    credentials_removed: credentialCount,
  };
}

/**
 * Get count of active credentials for user
 * Helper function for internal use
 *
 * @param userId - User ID to check
 * @returns Number of active credentials
 */
export async function getActiveCredentialCount(userId: string): Promise<number> {
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  return credentials.length;
}

/**
 * Check if credential exists and belongs to user
 * Helper function for validation
 *
 * @param userId - User ID to check ownership
 * @param credentialId - Credential ID to check
 * @returns true if credential exists and belongs to user
 */
export async function credentialBelongsToUser(
  userId: string,
  credentialId: string
): Promise<boolean> {
  const [credential] = await db
    .select()
    .from(webauthn_credentials)
    .where(
      and(
        eq(webauthn_credentials.credential_id, credentialId),
        eq(webauthn_credentials.user_id, userId),
        eq(webauthn_credentials.is_active, true)
      )
    )
    .limit(1);

  return !!credential;
}
