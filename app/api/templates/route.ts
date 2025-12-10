import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { log } from '@/lib/logger';
import { createRBACTemplatesService } from '@/lib/services/rbac-templates-service';
import type { UserContext } from '@/lib/types/rbac';
import { templateQuerySchema } from '@/lib/validations/template';

const getTemplatesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List templates request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'slug', 'created_at']);
    const query = validateQuery(searchParams, templateQuerySchema);

    // Use templates service with RBAC
    const templatesService = createRBACTemplatesService(userContext);
    const result = await templatesService.getTemplates({
      ...(query.is_active !== undefined && { is_active: query.is_active }),
      ...(query.search && { search: query.search }),
      limit: pagination.limit,
      offset: pagination.offset,
      sortField: sort.sortBy as 'name' | 'slug' | 'created_at',
      sortOrder: sort.sortOrder as 'asc' | 'desc',
    });

    // Map template_id to id for backwards compatibility
    const templatesData = result.templates.map((t) => ({
      id: t.template_id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      preview_image_url: t.preview_image_url,
      is_active: t.is_active,
      created_at: t.created_at,
    }));

    log.info('Templates list retrieved successfully', {
      count: templatesData.length,
      total: result.total,
      duration: Date.now() - startTime,
    });

    return createPaginatedResponse(templatesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
    });
  } catch (error) {
    log.error('List templates failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id,
    });

    return handleRouteError(error, 'Failed to list templates', request);
  }
};

// Export with RBAC protection - templates can be read by organization members
export const GET = rbacRoute(getTemplatesHandler, {
  permission: 'templates:read:organization',
  rateLimit: 'api',
});
