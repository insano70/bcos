import { NextResponse, type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createBulkUserImportService } from '@/lib/services/bulk-user-import-service';
import type { UserContext } from '@/lib/types/rbac';
import { bulkImportCommitSchema } from '@/lib/validations/bulk-import';

/**
 * POST /api/users/bulk-import/commit
 *
 * Create users from validated import data.
 * Expects rows with resolved organization_id and role_ids.
 * Returns creation results with success/failure per row.
 */
const commitHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();

    // Validate request schema
    const validation = bulkImportCommitSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          message: 'Invalid request data',
          details: errors,
        },
        { status: 400 }
      );
    }

    const { rows } = validation.data;

    // Create users using service
    const service = createBulkUserImportService(userContext);
    const results = await service.createUsers(rows);

    // Calculate counts
    const createdCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    const duration = Date.now() - startTime;

    log.info('bulk import commit completed', {
      operation: 'commit_bulk_import',
      userId: userContext.user_id,
      duration,
      metadata: {
        totalRows: rows.length,
        createdCount,
        failedCount,
        component: 'api',
      },
    });

    return createSuccessResponse({
      created_count: createdCount,
      failed_count: failedCount,
      results,
    });
  } catch (error) {
    log.error('bulk import commit failed', error, {
      operation: 'commit_bulk_import',
      userId: userContext.user_id,
      component: 'api',
    });

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { success: false, error: 'Import failed', message },
      { status: 500 }
    );
  }
};

export const POST = rbacRoute(commitHandler, {
  permission: 'users:create:organization',
  rateLimit: 'upload',
});
