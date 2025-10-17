import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACWorkItemTypesService } from '@/lib/services/rbac-work-item-types-service';
import type { UserContext } from '@/lib/types/rbac';
import { workItemTypeQuerySchema } from '@/lib/validations/work-items';

/**
 * GET /api/work-item-types
 * List work item types with filtering and pagination
 */
const getWorkItemTypesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(searchParams, workItemTypeQuerySchema);

    // Create RBAC service and get work item types
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    const workItemTypes = await workItemTypesService.getWorkItemTypes({
      organization_id: query.organization_id,
      is_active: query.is_active,
      limit: query.limit,
      offset: query.offset,
    });

    const totalCount = await workItemTypesService.getWorkItemTypeCount({
      organization_id: query.organization_id,
      is_active: query.is_active,
    });

    const responseData = workItemTypes.map((type) => ({
      id: type.work_item_type_id,
      organization_id: type.organization_id,
      organization_name: type.organization_name,
      name: type.name,
      description: type.description,
      icon: type.icon,
      color: type.color,
      is_active: type.is_active,
      created_by: type.created_by,
      created_by_name: type.created_by_name,
      created_at: type.created_at,
      updated_at: type.updated_at,
    }));

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      organization_id: query.organization_id,
      is_active: query.is_active,
    });

    const activeCount = workItemTypes.filter((t) => t.is_active).length;
    const inactiveCount = workItemTypes.length - activeCount;

    log.info(`work item types list completed - returned ${workItemTypes.length} of ${totalCount}`, {
      operation: 'list_work_item_types',
      resourceType: 'work_item_types',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      filters,
      results: {
        returned: workItemTypes.length,
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
        pageSize: query.limit || 50,
      },
      duration,
      slow: duration > 1000,
      component: 'work-items',
    });

    return createPaginatedResponse(responseData, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    log.error('work item types list failed', error, {
      operation: 'list_work_item_types',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemTypesHandler, {
  permission: 'work-items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * POST /api/work-item-types
 * Create a new work item type
 */
const createWorkItemTypeHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { workItemTypeCreateSchema } = await import('@/lib/validations/work-items');
    const validatedData = workItemTypeCreateSchema.parse(body);

    // Create RBAC service and work item type
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    const newType = await workItemTypesService.createWorkItemType({
      organization_id: validatedData.organization_id,
      name: validatedData.name,
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.icon !== undefined && { icon: validatedData.icon }),
      ...(validatedData.color !== undefined && { color: validatedData.color }),
      ...(validatedData.is_active !== undefined && { is_active: validatedData.is_active }),
    });

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('work_item_type', {
      resourceId: String(newType.work_item_type_id),
      resourceName: newType.name,
      userId: userContext.user_id,
      duration,
      metadata: {
        organizationId: newType.organization_id,
        icon: newType.icon,
        color: newType.color,
        isActive: newType.is_active,
        hasDescription: !!newType.description,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      id: newType.work_item_type_id,
      organization_id: newType.organization_id,
      organization_name: newType.organization_name,
      name: newType.name,
      description: newType.description,
      icon: newType.icon,
      color: newType.color,
      is_active: newType.is_active,
      created_by: newType.created_by,
      created_by_name: newType.created_by_name,
      created_at: newType.created_at,
      updated_at: newType.updated_at,
    });
  } catch (error) {
    log.error('work item type creation failed', error, {
      operation: 'create_work_item_type',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const POST = rbacRoute(createWorkItemTypeHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
