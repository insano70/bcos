/**
 * Cache Warming API Endpoint
 * POST /api/admin/cache/warm
 *
 * Manually trigger cache warming for data sources
 * Requires settings:update:all permission (super admin only)
 *
 * Body Parameters (optional):
 * - dataSourceId: number - Warm specific data source, or omit to warm all
 *
 * Features:
 * - Distributed locking (prevents concurrent warming)
 * - Returns warming statistics
 * - Comprehensive logging
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dataSourceCache } from '@/lib/cache';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const cacheWarmSchema = z.object({
  dataSourceId: z.union([z.string(), z.number()]).optional(),
});

const warmCacheHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const body = await request.json().catch(() => ({}));
    const validatedBody = cacheWarmSchema.parse(body);
    const { dataSourceId } = validatedBody;

    let result: {
      entriesCached?: number;
      totalRows: number;
      duration: number;
      skipped?: boolean;
      dataSourcesWarmed?: number;
      totalEntriesCached?: number;
    };
    if (dataSourceId !== undefined) {
      // Warm specific data source
      const parsedId = typeof dataSourceId === 'string' ? parseInt(dataSourceId, 10) : dataSourceId;
      result = await dataSourceCache.warmDataSource(parsedId);
      log.info('Data source cache warmed via API', {
        userId: userContext.user_id,
        dataSourceId: parsedId,
        ...result,
      });
    } else {
      // Warm all data sources
      result = await dataSourceCache.warmAllDataSources();
      log.info('All data sources cache warmed via API', {
        userId: userContext.user_id,
        ...result,
      });
    }

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Cache warming failed via API', error);
    return handleRouteError(error, 'Cache warming failed', request);
  }
};

// Use rbacRoute with settings:update:all permission (super admin only)
export const POST = rbacRoute(warmCacheHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
