import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { validateAnonymousToken, validateAuthenticatedToken } from '@/lib/security/csrf-unified';

/**
 * CSRF Token Validation Endpoint
 * Validates CSRF tokens without side effects (no state changes)
 * Used by client-side code to check token validity before making requests
 */

// Validation schema for the request
const validateTokenSchema = z.object({
  validateOnly: z.boolean().optional().default(true),
  token: z.string().optional(), // Optional - will use header token if not provided
});

const validateTokenHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.info('CSRF token validation request initiated', {
    endpoint: '/api/csrf/validate',
    method: 'POST',
    operation: 'csrf_validate',
    component: 'security',
  });

  try {
    // Rate limit already applied by publicRoute wrapper - no need to apply here

    // Validate request body (optional)
    const validationStartTime = Date.now();
    const validatedData = await validateRequest(request, validateTokenSchema);
    log.info('Request validation completed', {
      duration: Date.now() - validationStartTime,
      operation: 'csrf_validate',
      component: 'security',
    });

    // Get token to validate
    const headerToken = request.headers.get('x-csrf-token');
    const tokenToValidate = validatedData.token || headerToken;

    if (!tokenToValidate) {
      log.info('CSRF validation request missing token', {
        hasHeaderToken: !!headerToken,
        hasBodyToken: !!validatedData.token,
        operation: 'csrf_validate',
        component: 'security',
      });

      return createSuccessResponse(
        {
          valid: false,
          reason: 'missing_token',
          details: 'No CSRF token provided in header or request body',
        },
        'Token validation completed'
      );
    }

    // Validate token structure and content
    const validationStart = Date.now();

    try {
      // Determine token type by parsing the token itself, not the endpoint
      let isValidToken = false;
      let validationReason = 'unknown';
      let tokenType = 'unknown';

      // Parse token to determine its type
      try {
        const [encodedPayload] = tokenToValidate.split('.');
        if (encodedPayload) {
          const payload = JSON.parse(atob(encodedPayload));
          tokenType = payload.type || 'unknown';
        }
      } catch (_parseError) {
        validationReason = 'invalid_token_format';
        isValidToken = false;
      }

      if (tokenType === 'anonymous') {
        // Validate as anonymous token
        isValidToken = await validateAnonymousToken(request, tokenToValidate);
        validationReason = isValidToken ? 'anonymous_token_valid' : 'anonymous_token_invalid';
      } else if (tokenType === 'authenticated') {
        // Validate as authenticated token
        isValidToken = await validateAuthenticatedToken(tokenToValidate);
        validationReason = isValidToken
          ? 'authenticated_token_valid'
          : 'authenticated_token_invalid';
      } else {
        validationReason = 'unknown_token_type';
        isValidToken = false;
      }

      log.info('Token validation completed', {
        duration: Date.now() - validationStart,
        operation: 'csrf_validate',
        component: 'security',
      });

      // Log validation result for monitoring
      if (isValidToken) {
        log.info('CSRF token validation successful', {
          tokenType: tokenType,
          validationReason,
          operation: 'csrf_validate',
          component: 'security',
        });
      } else {
        log.security('csrf_token_validation_failed', 'low', {
          endpoint: '/api/csrf/validate',
          reason: validationReason,
          tokenType: tokenType,
          tokenLength: tokenToValidate.length,
        });
      }

      const totalDuration = Date.now() - startTime;
      log.info('Total validation duration', {
        duration: totalDuration,
        operation: 'csrf_validate',
        component: 'security',
      });

      return createSuccessResponse(
        {
          valid: isValidToken,
          reason: validationReason,
          tokenType: tokenType,
          validationDuration: totalDuration,
        },
        'Token validation completed'
      );
    } catch (validationError) {
      log.error('CSRF token validation error', validationError, {
        tokenLength: tokenToValidate.length,
        operation: 'csrf_validate',
        component: 'security',
      });

      return createSuccessResponse(
        {
          valid: false,
          reason: 'validation_error',
          details:
            validationError instanceof Error ? validationError.message : 'Unknown validation error',
        },
        'Token validation completed with error'
      );
    }
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('CSRF validation endpoint error', error, {
      totalDuration,
      operation: 'csrf_validate',
      component: 'security',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Additional GET endpoint for simple health checks
const healthCheckHandler = async (request: NextRequest) => {
  // Simple token presence check without validation
  const headerToken = request.headers.get('x-csrf-token');
  const cookieToken = request.cookies.get('csrf-token')?.value;

  log.info('CSRF health check', {
    hasHeaderToken: !!headerToken,
    hasCookieToken: !!cookieToken,
    operation: 'csrf_health_check',
    component: 'security',
  });

  return createSuccessResponse(
    {
      hasHeaderToken: !!headerToken,
      hasCookieToken: !!cookieToken,
      endpoint: '/api/csrf/validate',
      methods: ['POST', 'GET'],
    },
    'CSRF validation endpoint health check'
  );
};

// Export handlers with proper route protection
// These are public routes since they're used for token validation before authentication
export const POST = publicRoute(
  validateTokenHandler,
  'CSRF token validation must be available for token health checks',
  { rateLimit: 'auth' }
);

export const GET = publicRoute(
  healthCheckHandler,
  'CSRF health check must be available for monitoring',
  { rateLimit: 'api' }
);
