/**
 * SSO Authentication Service - OIDC/SAML Helper
 *
 * Provides centralized SSO user lookup and validation for authentication flows.
 * Extracts common SSO logic from OIDC callback route.
 *
 * SECURITY FEATURES:
 * - User provisioning validation (user must exist)
 * - Active status checking
 * - Email domain validation
 * - Comprehensive audit logging
 *
 * REPLACES DIRECT SQL IN:
 * - /api/auth/oidc/callback (line 346 - user lookup)
 *
 * USAGE:
 * ```typescript
 * import { lookupSSOUser, validateSSOUser } from '@/lib/services/auth/sso-auth-service';
 *
 * // Lookup user by email (SSO flow)
 * const user = await lookupSSOUser(email, 'oidc', ipAddress, userAgent);
 *
 * // Validate user for SSO authentication
 * const result = await validateSSOUser(email, 'oidc', ipAddress, userAgent);
 * ```
 */

import { AuditLogger } from '@/lib/api/services/audit';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { User } from './user-lookup-service';
import { getUserByEmail } from './user-lookup-service';
import { SSOValidationError, SSOValidationErrorCode } from './errors';

// Re-export for backward compatibility
export { SSOValidationError, SSOValidationErrorCode };

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * SSO authentication method
 */
export type SSOMethod = 'oidc' | 'saml';

/**
 * SSO user validation result
 */
export interface SSOUserValidationResult {
  user: User;
  isNewUser: boolean; // true if this is first-time SSO login
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Lookup user for SSO authentication
 *
 * REPLACES:
 * - /api/auth/oidc/callback user lookup (line 346)
 *
 * SECURITY:
 * - Validates user exists (fail-closed: no auto-provisioning)
 * - Checks user is active
 * - Logs all lookup attempts for audit trail
 *
 * @param email - User email from SSO provider
 * @param method - SSO method (oidc or saml)
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns User object if valid
 * @throws {SSOValidationError} If user not found or inactive
 */
export async function lookupSSOUser(
  email: string,
  method: SSOMethod,
  ipAddress: string,
  userAgent: string | null
): Promise<User> {
  const startTime = Date.now();

  log.debug('sso user lookup initiated', {
    operation: 'lookup_sso_user',
    email: email.replace(/(.{2}).*@/, '$1***@'),
    method,
    component: 'auth',
  });

  // Get user by email (cached)
  const user = await getUserByEmail(email);

  if (!user) {
    const duration = Date.now() - startTime;

    log.warn('sso user not found - user not provisioned', {
      operation: 'lookup_sso_user',
      email: email.replace(/(.{2}).*@/, '$1***@'),
      method,
      reason: 'user_not_provisioned',
      duration,
      component: 'auth',
    });

    await AuditLogger.logAuth({
      action: 'login_failed',
      email,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        authMethod: method,
        reason: 'user_not_provisioned',
      },
    });

    throw new SSOValidationError(
      SSOValidationErrorCode.USER_NOT_PROVISIONED,
      'User account not found. Please contact your administrator to provision your account.',
      { email, method }
    );
  }

  // Check if user is active
  if (!user.is_active) {
    const duration = Date.now() - startTime;

    log.warn('sso user inactive', {
      operation: 'lookup_sso_user',
      userId: user.user_id,
      email: email.replace(/(.{2}).*@/, '$1***@'),
      method,
      reason: 'user_not_active',
      duration,
      component: 'auth',
    });

    await AuditLogger.logAuth({
      action: 'login_failed',
      userId: user.user_id,
      email,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        authMethod: method,
        reason: 'user_not_active',
      },
    });

    throw new SSOValidationError(
      SSOValidationErrorCode.USER_INACTIVE,
      'Your account is not active. Please contact your administrator.',
      { userId: user.user_id, email, method }
    );
  }

  // Check if user is deleted
  if (user.deleted_at) {
    const duration = Date.now() - startTime;

    log.warn('sso user deleted', {
      operation: 'lookup_sso_user',
      userId: user.user_id,
      email: email.replace(/(.{2}).*@/, '$1***@'),
      method,
      reason: 'user_deleted',
      deletedAt: user.deleted_at.toISOString(),
      duration,
      component: 'auth',
    });

    await AuditLogger.logAuth({
      action: 'login_failed',
      userId: user.user_id,
      email,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        authMethod: method,
        reason: 'user_deleted',
        deletedAt: user.deleted_at.toISOString(),
      },
    });

    throw new SSOValidationError(
      SSOValidationErrorCode.USER_INACTIVE,
      'This account has been deleted.',
      { userId: user.user_id, email, method }
    );
  }

  const duration = Date.now() - startTime;

  log.info('sso user lookup successful', {
    operation: 'lookup_sso_user',
    userId: user.user_id,
    email: email.replace(/(.{2}).*@/, '$1***@'),
    method,
    isActive: user.is_active,
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return user;
}

/**
 * Validate user for SSO authentication
 *
 * WRAPPER around lookupSSOUser() with additional validation context
 *
 * @param email - User email from SSO provider
 * @param method - SSO method (oidc or saml)
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns Validation result with user info
 * @throws {SSOValidationError} If validation fails
 */
export async function validateSSOUser(
  email: string,
  method: SSOMethod,
  ipAddress: string,
  userAgent: string | null
): Promise<SSOUserValidationResult> {
  const startTime = Date.now();

  log.debug('sso user validation initiated', {
    operation: 'validate_sso_user',
    email: email.replace(/(.{2}).*@/, '$1***@'),
    method,
    component: 'auth',
  });

  // Lookup user (throws if not found or inactive)
  const user = await lookupSSOUser(email, method, ipAddress, userAgent);

  // Check if this is the user's first SSO login
  // (If password_hash is null, they were provisioned for SSO-only)
  const isNewUser = !user.password_hash;

  const duration = Date.now() - startTime;

  log.info('sso user validation successful', {
    operation: 'validate_sso_user',
    userId: user.user_id,
    email: email.replace(/(.{2}).*@/, '$1***@'),
    method,
    isNewUser,
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return {
    user,
    isNewUser,
  };
}

/**
 * Validate email domain against allowed domains
 *
 * SECURITY:
 * - Prevents unauthorized SSO logins from wrong domains
 * - Configurable allowed domains list
 *
 * @param email - User email to validate
 * @param allowedDomains - Array of allowed email domains (optional)
 * @returns true if domain is allowed, false otherwise
 * @throws {SSOValidationError} If domain validation is enabled and email domain is not allowed
 */
export function validateEmailDomain(email: string, allowedDomains?: string[]): boolean {
  // If no domain restrictions, allow all
  if (!allowedDomains || allowedDomains.length === 0) {
    return true;
  }

  const emailDomain = email.split('@')[1]?.toLowerCase();

  if (!emailDomain) {
    throw new SSOValidationError(
      SSOValidationErrorCode.EMAIL_DOMAIN_INVALID,
      'Invalid email format',
      { email }
    );
  }

  const isAllowed = allowedDomains.some((domain) => emailDomain === domain.toLowerCase());

  if (!isAllowed) {
    log.security('sso_email_domain_rejected', 'medium', {
      action: 'domain_validation_failed',
      emailDomain,
      allowedDomains,
      blocked: true,
      threat: 'unauthorized_domain_login',
    });

    throw new SSOValidationError(
      SSOValidationErrorCode.EMAIL_DOMAIN_INVALID,
      `Email domain '${emailDomain}' is not authorized for SSO login.`,
      { email, emailDomain, allowedDomains }
    );
  }

  return true;
}
