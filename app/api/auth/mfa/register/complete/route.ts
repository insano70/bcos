/**
 * POST /api/auth/mfa/register/complete
 * Complete passkey registration flow
 *
 * Authentication: Requires temp token OR full access token
 */

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handler';
import { requireAuth } from '@/lib/api/middleware/auth';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { completeRegistration } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';
import type { RegistrationCompleteRequest, RegistrationCompleteResponse } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  try {
    // Extract IP and user agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || null;

    // Parse request body
    const body = (await request.json()) as RegistrationCompleteRequest;
    const { credential, credential_name, challenge_id } = body;

    if (!credential || !credential_name || !challenge_id) {
      throw new Error('Missing required fields: credential, credential_name, challenge_id');
    }

    // Try full auth first, fall back to temp token
    let userId: string;

    try {
      const session = await requireAuth(request);
      userId = session.user.id;
    } catch {
      // Fall back to temp token
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;
    }

    // Complete registration
    const result = await completeRegistration(
      userId,
      challenge_id,
      credential,
      credential_name,
      ipAddress,
      userAgent
    );

    log.info('Passkey registration completed', {
      userId,
      credentialId: result.credential_id.substring(0, 16),
      credentialName: result.credential_name,
    });

    const response: RegistrationCompleteResponse = {
      success: true,
      credential_id: result.credential_id,
      credential_name: result.credential_name,
    };

    return createSuccessResponse(response, 'Passkey registered successfully');
  } catch (error) {
    log.error('Passkey registration complete failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA registration complete', { rateLimit: 'auth' });
