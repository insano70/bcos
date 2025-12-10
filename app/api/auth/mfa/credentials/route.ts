/**
 * GET /api/auth/mfa/credentials
 * List user's passkey credentials
 *
 * Authentication: Required (full access token)
 */

import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/middleware/auth';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { authRoute } from '@/lib/api/route-handlers';
import { getUserCredentials } from '@/lib/auth/webauthn';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { CredentialListItem } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

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

    const duration = Date.now() - startTime;

    const deviceTypes = credentials.reduce(
      (acc, cred) => {
        const type = cred.credential_device_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const backedUpCount = credentials.filter((c) => c.backed_up).length;
    const recentlyUsed = credentials.filter((c) => {
      if (!c.last_used) return false;
      const daysSinceUse = (Date.now() - c.last_used.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUse <= 30;
    }).length;

    log.info(`mfa credentials list completed - returned ${credentials.length} passkeys`, {
      operation: 'list_mfa_credentials',
      userId,
      results: {
        returned: credentials.length,
        backedUp: backedUpCount,
        recentlyUsed30d: recentlyUsed,
        deviceTypes,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'auth',
    });

    return createSuccessResponse(
      { credentials: sanitizedCredentials },
      'Passkey credentials retrieved successfully'
    );
  } catch (error) {
    log.error('Failed to list passkey credentials', error, {
      operation: 'list_mfa_credentials',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return handleRouteError(error, 'Failed to list passkey credentials', request);
  }
};

export const GET = authRoute(handler, { rateLimit: 'session_read' });
