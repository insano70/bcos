import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { db } from '@/lib/db';
import { explorerQueryPatterns } from '@/lib/db/schema';
import { desc, gte } from 'drizzle-orm';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getPatternsHandler = async (
  _request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  try {
    const patterns = await db
      .select()
      .from(explorerQueryPatterns)
      .where(gte(explorerQueryPatterns.usage_count, 2))
      .orderBy(desc(explorerQueryPatterns.usage_count))
      .limit(20);

    log.info('Query patterns retrieved', {
      operation: 'data_explorer_get_patterns',
      patternCount: patterns.length,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse(patterns);
  } catch (error) {
    log.error('Get patterns failed', error as Error, {
      operation: 'data_explorer_get_patterns',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return handleRouteError(error, 'Failed to fetch patterns', _request);
  }
};

export const GET = rbacRoute(getPatternsHandler, {
  permission: ['data-explorer:query:organization', 'data-explorer:query:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

