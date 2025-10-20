/**
 * POST /api/auth/mfa/register/complete
 * Complete passkey registration flow
 *
 * Authentication: Supports both temp token (first-time setup) and full session (adding passkeys)
 * Security: User must have validated credentials (temp token or session)
 * Side Effects: Creates full session if using temp token (first-time setup)
 */

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/middleware/auth';
import { AuthenticationError, createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { COOKIE_NAMES } from '@/lib/auth/cookie-names';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log } from '@/lib/logger';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { setCSRFToken } from '@/lib/security/csrf-unified';
import type {
  RegistrationCompleteRequest,
  RegistrationCompleteResponse,
} from '@/lib/types/webauthn';
import { completePasskeyRegistration } from '@/lib/services/auth/mfa-service';
import { createAuthSession } from '@/lib/services/auth/session-manager-service';
import { getUserById } from '@/lib/services/auth/user-lookup-service';

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
    } catch {
      // Fall back to temp token (for first-time MFA setup during login)
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;
      isFirstTimeSetup = true;
      authMethod = 'temp_token';
    }

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Parse request body
    const body = (await request.json()) as RegistrationCompleteRequest;
    const { credential, credential_name, challenge_id } = body;

    // Validate required fields
    if (!credential || !credential_name || !challenge_id) {
      throw new Error('Missing required fields: credential, credential_name, challenge_id');
    }

    // Validate credential_name
    if (typeof credential_name !== 'string') {
      throw new Error('Invalid credential_name: must be a string');
    }

    const trimmedName = credential_name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Invalid credential_name: cannot be empty');
    }

    if (trimmedName.length > 100) {
      throw new Error('Invalid credential_name: maximum length is 100 characters');
    }

    // Validate challenge_id format (nanoid: alphanumeric with - and _)
    if (typeof challenge_id !== 'string' || challenge_id.length !== 32) {
      throw new Error('Invalid challenge_id format');
    }

    // Use service layer for registration
    const result = await completePasskeyRegistration(
      userId,
      challenge_id,
      credential,
      trimmedName,
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

      // Build device info for session creation
      const { generateDeviceFingerprint, generateDeviceName } = await import(
        '@/lib/auth/tokens'
      );
      const deviceFingerprint = generateDeviceFingerprint(
        metadata.ipAddress,
        metadata.userAgent || 'unknown'
      );
      const deviceName = generateDeviceName(metadata.userAgent || 'unknown');

      const deviceInfo = {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent || 'unknown',
        fingerprint: deviceFingerprint,
        deviceName,
      };

      // Create session using service layer
      const tokenPair = await createAuthSession({
        userId: user.user_id,
        deviceInfo,
        rememberMe: false,
        email: user.email,
      });

      // Set secure httpOnly cookies
      const cookieStore = await cookies();
      const isSecureEnvironment = process.env.NODE_ENV === 'production';
      const maxAge = 7 * 24 * 60 * 60; // 7 days

      cookieStore.set(COOKIE_NAMES.REFRESH_TOKEN, tokenPair.refreshToken, {
        httpOnly: true,
        secure: isSecureEnvironment,
        sameSite: 'strict',
        path: '/',
        maxAge,
      });

      cookieStore.set(COOKIE_NAMES.ACCESS_TOKEN, tokenPair.accessToken, {
        httpOnly: true,
        secure: isSecureEnvironment,
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60, // 15 minutes
      });

      // Get user context
      const userContext = await getCachedUserContextSafe(user.user_id);
      const userRoles = userContext?.roles?.map((r) => r.name) || [];
      const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

      const csrfToken = await setCSRFToken(user.user_id);

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
          accessToken: tokenPair.accessToken,
          sessionId: tokenPair.sessionId,
          expiresAt: tokenPair.expiresAt.toISOString(),
          user: {
            id: user.user_id,
            email: user.email,
            name: `${user.first_name} ${user.last_name}`,
            firstName: user.first_name,
            lastName: user.last_name,
            role: primaryRole,
            emailVerified: user.email_verified,
            roles: userRoles,
            permissions: userContext?.all_permissions?.map((p) => p.name) || [],
          },
          csrfToken,
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

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA registration complete', { rateLimit: 'auth' });
