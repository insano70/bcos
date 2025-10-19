/**
 * GET /api/cron/webauthn-cleanup
 * Cron endpoint for WebAuthn challenge cleanup
 *
 * Authentication: Cron secret header (Vercel Cron)
 * Schedule: Every 15 minutes (0,15,30,45 * * * *)
 *
 * This endpoint removes expired WebAuthn challenges to prevent database bloat.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { runWebAuthnCleanup } from '@/lib/jobs/webauthn-cleanup';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // SECURITY: Verify cron secret (Vercel Cron authentication)
    // In production, Vercel automatically adds this header
    // For local testing, you can set CRON_SECRET in .env.local
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      log.security('unauthorized_cron_access', 'high', {
        endpoint: '/api/cron/webauthn-cleanup',
        blocked: true,
        threat: 'unauthorized_cron_invocation',
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run cleanup job
    const challengesRemoved = await runWebAuthnCleanup();

    const duration = Date.now() - startTime;

    log.info('webauthn cleanup cron completed', {
      operation: 'webauthn_cleanup_cron',
      challengesRemoved,
      duration,
      component: 'cron',
    });

    return NextResponse.json({
      success: true,
      challengesRemoved,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('webauthn cleanup cron failed', error, {
      operation: 'webauthn_cleanup_cron',
      duration,
      component: 'cron',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

export const GET = publicRoute(
  handler,
  'Cron endpoint - authenticated via CRON_SECRET header by Vercel Cron. Must be public to receive Vercel Cron requests.',
  { rateLimit: 'api' }
);
