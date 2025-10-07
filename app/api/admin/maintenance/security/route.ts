/**
 * POST /api/admin/maintenance/security
 * Trigger security maintenance cleanup (expired challenges, etc.)
 *
 * Authentication: Requires admin role
 * Can be called manually or via external cron service (e.g., Vercel Cron, AWS EventBridge)
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { adminRoute } from '@/lib/api/route-handler';
import { cleanupExpiredChallenges } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    log.info('Security maintenance triggered', {
      triggeredBy: 'admin',
    });

    // Cleanup expired WebAuthn challenges
    const challengesDeleted = await cleanupExpiredChallenges();

    const duration = Date.now() - startTime;

    log.info('Security maintenance completed', {
      duration,
      challengesDeleted,
    });

    return createSuccessResponse(
      {
        challengesDeleted,
        duration,
      },
      'Security maintenance completed successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(
      'Security maintenance failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        duration,
      }
    );

    return createErrorResponse(
      error instanceof Error ? error.message : 'Security maintenance failed',
      500,
      request
    );
  }
};

export const POST = adminRoute(handler);
