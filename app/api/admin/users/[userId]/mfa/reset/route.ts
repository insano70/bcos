/**
 * POST /api/admin/users/:userId/mfa/reset
 * Admin: Reset MFA for a user (delete all passkeys, disable MFA)
 *
 * Authentication: Required (admin only)
 * Side Effects: Revokes all user sessions
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/middleware/auth';
import { AuthorizationError, createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { authRoute, type AuthSession } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { revokeAllUserTokens } from '@/lib/auth/tokens';
import { adminResetMFA } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const handler = async (request: NextRequest, session?: AuthSession, ...args: unknown[]) => {
  try {
    // Require admin authentication
    await requireAdmin(request);
    const adminUserId = session?.user.id;

    if (!adminUserId) {
      throw new Error('Admin user ID not found in session');
    }

    // Get target user ID from URL
    const { userId: targetUserId } = await extractRouteParams(args[0], userIdParamsSchema);

    // Prevent admin from resetting their own MFA (security measure)
    if (adminUserId === targetUserId) {
      throw AuthorizationError('Cannot reset your own MFA. Please contact another administrator.');
    }

    log.info('Admin MFA reset initiated', {
      adminUserId,
      targetUserId,
    });

    // Reset MFA
    const result = await adminResetMFA(adminUserId, targetUserId);

    // Revoke all user sessions for security
    const revokedSessions = await revokeAllUserTokens(targetUserId, 'admin_action');

    log.info('Admin MFA reset completed', {
      adminUserId,
      targetUserId,
      credentialsRemoved: result.credentials_removed,
      sessionsRevoked: revokedSessions,
    });

    return createSuccessResponse(
      {
        success: true,
        credentials_removed: result.credentials_removed,
        sessions_revoked: revokedSessions,
      },
      'MFA reset successfully. User must re-configure passkey on next login.'
    );
  } catch (error) {
    log.error('Admin MFA reset failed', error instanceof Error ? error : new Error(String(error)), {
      operation: 'admin_mfa_reset',
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = authRoute(handler, { rateLimit: 'api' });
