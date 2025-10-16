/**
 * Rate Limit Middleware
 *
 * Applies rate limiting to requests based on IP address.
 * Delegates to existing applyRateLimit() function with timing tracking.
 *
 * Extracted from:
 * - rbacRoute lines 78-86
 * - publicRoute lines 430-438
 * - authRoute lines 467-475
 *
 * Features:
 * - Optional rate limiting (skip if limitType not provided)
 * - Supports 'auth', 'api', 'upload' limit types
 * - Automatic timing tracking
 * - Throws RateLimitError if exceeded (handled by error handler)
 *
 * Usage:
 * ```typescript
 * const middleware = new RateLimitMiddleware('api');
 * const result = await middleware.execute(request, context);
 * // Rate limit checked, timing recorded
 * ```
 */

import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { log } from '@/lib/logger';
import type { Middleware, MiddlewareResult, RouteContext } from '../types';

export class RateLimitMiddleware implements Middleware {
  name = 'rateLimit';

  constructor(private limitType?: 'auth' | 'api' | 'upload') {}

  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    // Skip if no rate limit configured
    if (!this.limitType) {
      return { success: true, context };
    }

    // Apply rate limiting (throws RateLimitError if exceeded)
    const endTiming = context.timingTracker.start('rateLimit');
    await applyRateLimit(request, this.limitType);
    endTiming();

    // Log successful rate limit check
    log.info('Rate limit check completed', {
      duration: context.timingTracker.getTiming('rateLimit'),
      limitType: this.limitType,
    });

    return { success: true, context };
  }
}
