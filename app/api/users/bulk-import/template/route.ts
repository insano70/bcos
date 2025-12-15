import { NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { generateCSVTemplate } from '@/lib/utils/csv-import';

/**
 * GET /api/users/bulk-import/template
 *
 * Download CSV template for bulk user import.
 * Returns a CSV file with headers and example data.
 */
const getTemplateHandler = async (_request: Request, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Generate template content
    const templateContent = generateCSVTemplate();

    // Create response with CSV file
    const response = new NextResponse(templateContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="user-import-template.csv"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

    const duration = Date.now() - startTime;

    log.info('bulk import template downloaded', {
      operation: 'download_bulk_import_template',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return response;
  } catch (error) {
    log.error('bulk import template download failed', error, {
      operation: 'download_bulk_import_template',
      userId: userContext.user_id,
      component: 'api',
    });
    throw error;
  }
};

export const GET = rbacRoute(getTemplateHandler, {
  permission: 'users:create:organization',
  rateLimit: 'api',
});
