import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { loginSchema } from '@/lib/validations/auth';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

import { publicRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { generateAnonymousToken } from '@/lib/security/csrf-unified';
import {
  authenticateWithPassword,
  AuthStatus,
} from '@/lib/services/auth/password-auth-service';

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 * Now uses password-auth-service for complete authentication flow
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Rate limit already applied by publicRoute wrapper
    const validatedData = await validateRequest(request, loginSchema);
    const { email, password, remember } = validatedData;

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Authenticate using service layer - this handles all validation, MFA checks, etc.
    const authResult = await authenticateWithPassword({
      email,
      password,
      remember: remember || false,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      request,
    });

    const duration = Date.now() - startTime;

    // Handle different authentication results based on discriminated union
    // SECURITY NOTE: Password authentication NEVER returns AuthStatus.SUCCESS
    // SUCCESS only comes from MFA completion routes (/mfa/verify, /mfa/skip, /mfa/register/complete)
    switch (authResult.status) {
      case AuthStatus.MFA_REQUIRED: {
        // MFA verification needed - return temp token and challenge
        const csrfToken = await generateAnonymousToken(request);

        log.info('login password verified - mfa challenge issued', {
          operation: 'login',
          userId: authResult.user.id,
          mfaStatus: 'required',
          challengeId: authResult.challengeId.substring(0, 8),
          duration,
          ipAddress: metadata.ipAddress,
          component: 'auth',
        });

        return createSuccessResponse(
          {
            status: 'mfa_required',
            requiresMFA: true,
            tempToken: authResult.tempToken,
            challenge: authResult.challenge,
            challengeId: authResult.challengeId,
            challenge_id: authResult.challengeId,
            csrfToken,
          },
          'MFA verification required'
        );
      }

      case AuthStatus.MFA_SETUP_OPTIONAL: {
        // MFA setup offered but can be skipped
        const csrfToken = await generateAnonymousToken(request);

        log.info('login password verified - mfa setup offered (optional)', {
          operation: 'login',
          userId: authResult.user.id,
          mfaStatus: 'setup_optional',
          skipsRemaining: authResult.skipsRemaining,
          duration,
          ipAddress: metadata.ipAddress,
          component: 'auth',
        });

        return createSuccessResponse(
          {
            status: 'mfa_setup_optional',
            requiresMFASetup: true,
            canSkip: true,
            skipsRemaining: authResult.skipsRemaining,
            tempToken: authResult.tempToken,
            user: authResult.user,
            csrfToken,
          },
          `MFA setup recommended. You have ${authResult.skipsRemaining} skip${authResult.skipsRemaining === 1 ? '' : 's'} remaining.`
        );
      }

      case AuthStatus.MFA_SETUP_ENFORCED: {
        // MFA setup mandatory - no skips remaining
        const csrfToken = await generateAnonymousToken(request);

        log.info('login password verified - mfa setup enforced (no skips)', {
          operation: 'login',
          userId: authResult.user.id,
          mfaStatus: 'setup_enforced',
          duration,
          ipAddress: metadata.ipAddress,
          component: 'auth',
        });

        return createSuccessResponse(
          {
            status: 'mfa_setup_enforced',
            requiresMFASetup: true,
            canSkip: false,
            skipsRemaining: 0,
            tempToken: authResult.tempToken,
            user: authResult.user,
            csrfToken,
          },
          'MFA setup is required to complete login.'
        );
      }

      // NOTE: AuthStatus.SUCCESS case removed - password authentication never returns SUCCESS
      // Type system now enforces this at compile time (PasswordAuthResult union type)

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = authResult;
        throw new Error(`Unhandled auth result type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Login failed', error, {
      operation: 'login',
      duration,
      component: 'auth',
    });

    return handleRouteError(error, 'Login failed', request);
  }
};

// Export with publicRoute wrapper for rate limiting
export const POST = publicRoute(loginHandler, 'Login endpoint', { rateLimit: 'auth' });
