/**
 * Cache Warming API Endpoint
 * POST /api/admin/cache/warm
 * 
 * Manually trigger cache warming for data sources
 * Requires super admin permissions
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
import { NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { dataSourceCache } from '@/lib/cache';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const warmCacheHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    // Require super admin
    if (!userContext.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden - Super admin required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { dataSourceId } = body;

    let result: { entriesCached: number; totalRows: number; duration: number; skipped?: boolean; dataSourcesWarmed?: number };
    if (dataSourceId) {
      // Warm specific data source
      result = await dataSourceCache.warmDataSource(parseInt(dataSourceId, 10));
      log.info('Data source cache warmed via API', {
        userId: userContext.user_id,
        dataSourceId,
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

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error('Cache warming failed via API', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cache warming failed' },
      { status: 500 }
    );
  }
};

// Use rbacRoute with authentication (super admin check is done in handler)
export const POST = rbacRoute(warmCacheHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

