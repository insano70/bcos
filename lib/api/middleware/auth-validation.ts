/**
 * Auth Validation Helper
 *
 * Provides centralized validation methods for authentication-related checks.
 * Consolidates repeated validation patterns across auth routes into reusable functions.
 *
 * Usage:
 * ```typescript
 * import { AuthValidator } from '@/lib/api/middleware/auth-validation';
 *
 * // In route handlers:
 * const session = AuthValidator.requireSession(session, request);
 * const refreshToken = await AuthValidator.requireRefreshToken(request);
 * const userContext = AuthValidator.requireUserContext(session, request);
 * await AuthValidator.requireValidCSRF(request);
 * ```
 */

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import type { AuthSession } from '@/lib/api/route-handlers/types';
import type { UserContext } from '@/lib/types/rbac';
import { verifyCSRFToken } from '@/lib/security/csrf';

/**
 * Validation result types
 */
export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  response: Response;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Options for validation methods
 */
export interface ValidationOptions {
  /** Custom error message */
  message?: string;
  /** Custom HTTP status code */
  statusCode?: number;
}

/**
 * AuthValidator - Centralized authentication validation utilities
 *
 * All methods return ValidationResult<T> or throw with appropriate HTTP responses.
 * Provides both "require" methods (throw on failure) and "validate" methods (return result).
 */
export const AuthValidator = {
  /**
   * Validates that a session exists
   * Returns ValidationResult with session or error response
   */
  validateSession(
    session: AuthSession | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): ValidationResult<AuthSession> {
    if (!session) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'Authentication required',
          options?.statusCode ?? 401,
          request
        ),
      };
    }
    return { success: true, data: session };
  },

  /**
   * Requires a valid session - returns session or throws error response
   * Use in route handlers where session is mandatory
   */
  requireSession(
    session: AuthSession | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): AuthSession {
    const result = this.validateSession(session, request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Validates that a refresh token exists in cookies
   * Returns ValidationResult with token or error response
   */
  async validateRefreshToken(
    request: NextRequest,
    options?: ValidationOptions
  ): Promise<ValidationResult<string>> {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'No active session found',
          options?.statusCode ?? 400,
          request
        ),
      };
    }
    return { success: true, data: refreshToken };
  },

  /**
   * Requires a valid refresh token - returns token or throws error response
   * Use in route handlers where refresh token is mandatory
   */
  async requireRefreshToken(request: NextRequest, options?: ValidationOptions): Promise<string> {
    const result = await this.validateRefreshToken(request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Validates that user context exists in session
   * Returns ValidationResult with context or error response
   */
  validateUserContext(
    session: AuthSession | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): ValidationResult<UserContext> {
    if (!session?.userContext) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'User context not found',
          options?.statusCode ?? 404,
          request
        ),
      };
    }
    return { success: true, data: session.userContext };
  },

  /**
   * Requires valid user context - returns context or throws error response
   * Use in route handlers where RBAC context is mandatory
   */
  requireUserContext(
    session: AuthSession | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): UserContext {
    const result = this.validateUserContext(session, request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Validates CSRF token from request
   * Returns ValidationResult with boolean or error response
   */
  async validateCSRF(
    request: NextRequest,
    options?: ValidationOptions
  ): Promise<ValidationResult<true>> {
    const isValid = await verifyCSRFToken(request);
    if (!isValid) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'CSRF token validation failed',
          options?.statusCode ?? 403,
          request
        ),
      };
    }
    return { success: true, data: true };
  },

  /**
   * Requires valid CSRF token - returns true or throws error response
   * Use in route handlers for state-changing operations
   */
  async requireValidCSRF(request: NextRequest, options?: ValidationOptions): Promise<true> {
    const result = await this.validateCSRF(request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Validates session ID exists
   * Returns ValidationResult with sessionId or error response
   */
  validateSessionId(
    sessionId: string | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): ValidationResult<string> {
    if (!sessionId) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'Invalid session',
          options?.statusCode ?? 401,
          request
        ),
      };
    }
    return { success: true, data: sessionId };
  },

  /**
   * Requires valid session ID - returns sessionId or throws error response
   */
  requireSessionId(
    sessionId: string | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): string {
    const result = this.validateSessionId(sessionId, request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Validates user is active
   * Returns ValidationResult with user or error response
   */
  validateActiveUser<T extends { is_active?: boolean | null }>(
    user: T | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): ValidationResult<T> {
    if (!user) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'User not found',
          options?.statusCode ?? 404,
          request
        ),
      };
    }
    if (!user.is_active) {
      return {
        success: false,
        response: createErrorResponse(
          options?.message ?? 'User account is inactive',
          options?.statusCode ?? 401,
          request
        ),
      };
    }
    return { success: true, data: user };
  },

  /**
   * Requires active user - returns user or throws error response
   */
  requireActiveUser<T extends { is_active?: boolean | null }>(
    user: T | undefined | null,
    request: NextRequest,
    options?: ValidationOptions
  ): T {
    const result = this.validateActiveUser(user, request, options);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },

  /**
   * Composite validation: session + CSRF
   * Use for state-changing operations that require both
   */
  async validateSessionWithCSRF(
    session: AuthSession | undefined | null,
    request: NextRequest
  ): Promise<ValidationResult<AuthSession>> {
    // First validate CSRF
    const csrfResult = await this.validateCSRF(request);
    if (!csrfResult.success) {
      return csrfResult;
    }

    // Then validate session
    return this.validateSession(session, request);
  },

  /**
   * Composite requirement: session + CSRF
   * Returns session or throws appropriate error
   */
  async requireSessionWithCSRF(
    session: AuthSession | undefined | null,
    request: NextRequest
  ): Promise<AuthSession> {
    await this.requireValidCSRF(request);
    return this.requireSession(session, request);
  },

  /**
   * Composite validation: session + refresh token + CSRF
   * Use for logout and session management operations
   */
  async validateFullAuth(
    session: AuthSession | undefined | null,
    request: NextRequest
  ): Promise<
    ValidationResult<{
      session: AuthSession;
      refreshToken: string;
    }>
  > {
    // Validate CSRF first
    const csrfResult = await this.validateCSRF(request);
    if (!csrfResult.success) {
      return csrfResult;
    }

    // Validate session
    const sessionResult = this.validateSession(session, request);
    if (!sessionResult.success) {
      return sessionResult;
    }

    // Validate refresh token
    const tokenResult = await this.validateRefreshToken(request);
    if (!tokenResult.success) {
      return tokenResult;
    }

    return {
      success: true,
      data: {
        session: sessionResult.data,
        refreshToken: tokenResult.data,
      },
    };
  },

  /**
   * Composite requirement: session + refresh token + CSRF
   * Returns both or throws appropriate error
   */
  async requireFullAuth(
    session: AuthSession | undefined | null,
    request: NextRequest
  ): Promise<{ session: AuthSession; refreshToken: string }> {
    const result = await this.validateFullAuth(session, request);
    if (!result.success) {
      throw result.response;
    }
    return result.data;
  },
} as const;

/**
 * Type guard to check if validation succeeded
 */
export function isValidationSuccess<T>(
  result: ValidationResult<T>
): result is ValidationSuccess<T> {
  return result.success === true;
}

/**
 * Type guard to check if validation failed
 */
export function isValidationFailure<T>(result: ValidationResult<T>): result is ValidationFailure {
  return result.success === false;
}
