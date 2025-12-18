/**
 * POST /api/auth/mfa/register/complete
 * Complete passkey registration flow
 *
 * Authentication: Supports both temp token (first-time setup) and full session (adding passkeys)
 * Security: User must have validated credentials (temp token or session)
 * Side Effects: Creates full session if using temp token (first-time setup)
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/middleware/auth';
import { validateRequest } from '@/lib/api/middleware/validation';
import {
  APIError,
  AuthenticationError,
  handleRouteError,
} from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log } from '@/lib/logger';
import type { RegistrationCompleteResponse } from '@/lib/types/webauthn';
import { completePasskeyRegistration } from '@/lib/services/auth/mfa-service';
import { setupSessionWithCookies } from '@/lib/services/auth/session-manager-service';
import { getUserById } from '@/lib/services/auth/user-lookup-service';

import type { RegistrationResponseJSON } from '@simplewebauthn/server';

/**
 * Check if an error is an authentication-related error (401)
 * These are expected when user doesn't have a session but has a temp token
 */
function isAuthenticationError(error: unknown): boolean {
  if (error instanceof APIError && error.statusCode === 401) {
    return true;
  }
  return false;
}

/**
 * Zod schema for WebAuthn registration credential response
 * Validates the structure of the credential from the browser's WebAuthn API
 * Uses passthrough() to preserve exact types from WebAuthn response
 */
const registrationCredentialSchema = z
  .object({
    id: z.string().min(1, 'Credential ID is required'),
    rawId: z.string().min(1, 'Raw credential ID is required'),
    response: z.object({
      clientDataJSON: z.string().min(1, 'Client data JSON is required'),
      attestationObject: z.string().min(1, 'Attestation object is required'),
    }).passthrough(),
    type: z.literal('public-key'),
  })
  .passthrough()
  .transform((val) => val as unknown as RegistrationResponseJSON);

/**
 * Zod schema for MFA registration complete request
 */
const registrationCompleteSchema = z.object({
  credential: registrationCredentialSchema,
  credential_name: z
    .string()
    .min(1, 'Credential name is required')
    .max(100, 'Credential name must be 100 characters or less')
    .transform((val) => val.trim()),
  challenge_id: z
    .string()
    .length(32, 'Challenge ID must be exactly 32 characters'),
});

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Rate limit already applied by publicRoute wrapper - no need to apply here

    let userId: string;
    let isFirstTimeSetup = false;
    let authMethod: 'session' | 'temp_token';

    // Try full authentication first (for users adding additional passkeys)
    try {
      const session = await requireAuth(request);
      userId = session.user.id;
      authMethod = 'session';
    } catch (authError) {
      // Only fall back to temp token for authentication errors (401)
      // Re-throw server errors (500) to avoid masking real problems
      if (!isAuthenticationError(authError)) {
        log.error('Unexpected error during auth check', authError, {
          operation: 'mfa_register_complete',
          component: 'auth',
        });
        throw authError;
      }

      // Fall back to temp token (for first-time MFA setup during login)
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;
      isFirstTimeSetup = true;
      authMethod = 'temp_token';
    }

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Validate request body with Zod schema
    const { credential, credential_name, challenge_id } = await validateRequest(
      request,
      registrationCompleteSchema
    );

    // Use service layer for registration
    const result = await completePasskeyRegistration(
      userId,
      challenge_id,
      credential,
      credential_name, // Already trimmed by Zod transform
      metadata.ipAddress,
      metadata.userAgent
    );

    // If this is first-time setup (using temp token), create full session
    if (isFirstTimeSetup) {
      // Fetch user details using service layer
      const user = await getUserById(userId);

      if (!user || !user.is_active) {
        throw AuthenticationError('User account is inactive');
      }

      // Set up full session with cookies using consolidated utility
      const sessionResult = await setupSessionWithCookies({
        userId: user.user_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        rememberMe: false,
        authMethod: 'mfa_register',
      });

      const duration = Date.now() - startTime;
      log.info('mfa registration completed - first-time setup with session creation', {
        operation: 'mfa_register_complete',
        userId: user.user_id,
        authMethod,
        credentialId: result.credentialId.substring(0, 16),
        credentialName: result.credentialName,
        isFirstTimeSetup: true,
        sessionCreated: true,
        duration,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        component: 'auth',
      });

      return createSuccessResponse(
        {
          success: true,
          credential_id: result.credentialId,
          credential_name: result.credentialName,
          // Include session data for first-time setup
          accessToken: sessionResult.tokenPair.accessToken,
          sessionId: sessionResult.tokenPair.sessionId,
          expiresAt: sessionResult.tokenPair.expiresAt.toISOString(),
          user: sessionResult.user,
          csrfToken: sessionResult.csrfToken,
        },
        'Passkey registered successfully. You are now logged in.'
      );
    }

    const duration = Date.now() - startTime;
    log.info('mfa registration completed - additional credential added', {
      operation: 'mfa_register_complete',
      userId,
      authMethod,
      credentialId: result.credentialId.substring(0, 16),
      credentialName: result.credentialName,
      isFirstTimeSetup: false,
      sessionCreated: false,
      duration,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      component: 'auth',
    });

    const response: RegistrationCompleteResponse = {
      success: true,
      credential_id: result.credentialId,
      credential_name: result.credentialName,
    };

    return createSuccessResponse(response, 'Passkey registered successfully');
  } catch (error) {
    log.error('mfa registration complete failed', error, {
      operation: 'mfa_register_complete',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return handleRouteError(error, 'Passkey registration failed', request);
  }
};

export const POST = publicRoute(handler, 'MFA registration complete', { rateLimit: 'auth' });
