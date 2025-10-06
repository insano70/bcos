/**
 * GET /api/auth/mfa/credentials
 * List user's passkey credentials
 *
 * Authentication: Required (full access token)
 */

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { secureRoute } from '@/lib/api/route-handler';
import { requireAuth } from '@/lib/api/middleware/auth';
import { getUserCredentials } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';
import type { CredentialListItem } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get user's credentials
    const credentials = await getUserCredentials(userId);

    // Sanitize response (remove sensitive fields)
    const sanitizedCredentials: CredentialListItem[] = credentials.map((cred) => ({
      credential_id: cred.credential_id,
      credential_name: cred.credential_name,
      credential_device_type: cred.credential_device_type,
      transports: cred.transports ? JSON.parse(cred.transports) : [],
      created_at: cred.created_at.toISOString(),
      last_used: cred.last_used ? cred.last_used.toISOString() : null,
      backed_up: cred.backed_up,
    }));

    log.info('User passkey credentials listed', {
      userId,
      credentialCount: credentials.length,
    });

    return createSuccessResponse(
      { credentials: sanitizedCredentials },
      'Passkey credentials retrieved successfully'
    );
  } catch (error) {
    log.error('Failed to list passkey credentials', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = secureRoute(handler, { rateLimit: 'api' });
