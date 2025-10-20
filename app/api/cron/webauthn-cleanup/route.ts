/**
 * GET /api/cron/webauthn-cleanup
 * Cron endpoint for WebAuthn challenge cleanup
 *
 * Authentication: Optional CRON_SECRET header (for external cron services like Vercel Cron)
 * Schedule: Every 15 minutes (recommended)
 *
 * For AWS ECS: Call this endpoint via EventBridge Scheduler or invoke runWebAuthnCleanup() directly
 * For Vercel: Set CRON_SECRET environment variable and configure cron in vercel.json
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
    // SECURITY: Optional cron secret verification (only if CRON_SECRET is set)
    // Use this if calling from external cron services (Vercel Cron, etc.)
    // For AWS EventBridge or internal calls, CRON_SECRET is not required
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        log.security('unauthorized_cron_access', 'high', {
          endpoint: '/api/cron/webauthn-cleanup',
          blocked: true,
          threat: 'unauthorized_cron_invocation',
          hasSecret: !!cronSecret,
          hasAuth: !!authHeader,
        });

        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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
  'Cron endpoint for WebAuthn challenge cleanup. Public endpoint with optional CRON_SECRET authentication. Call from AWS EventBridge, ECS Scheduled Task, or external cron services.',
  { rateLimit: 'api' }
);
