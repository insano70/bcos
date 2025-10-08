import type { NextRequest } from 'next/server';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateQuery } from '@/lib/api/middleware/validation';
import { workItemTypeQuerySchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemTypesService } from '@/lib/services/rbac-work-item-types-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-item-types
 * List work item types with filtering and pagination
 */
const getWorkItemTypesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List work item types request initiated', {
    operation: 'list_work_item_types',
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const { searchParams } = new URL(request.url);

    const validationStart = Date.now();
    const query = validateQuery(searchParams, workItemTypeQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get work item types with automatic permission-based filtering
    const workItemTypesStart = Date.now();
    const workItemTypes = await workItemTypesService.getWorkItemTypes({
      organization_id: query.organization_id,
      is_active: query.is_active,
      limit: query.limit,
      offset: query.offset,
    });
    log.db('SELECT', 'work_item_types', Date.now() - workItemTypesStart, {
      rowCount: workItemTypes.length,
    });

    // Get total count
    const countStart = Date.now();
    const totalCount = await workItemTypesService.getWorkItemTypeCount({
      organization_id: query.organization_id,
      is_active: query.is_active,
    });
    log.db('SELECT', 'work_item_types_count', Date.now() - countStart, { rowCount: 1 });

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

    const totalDuration = Date.now() - startTime;
    log.info('Work item types list retrieved successfully', {
      workItemTypesReturned: workItemTypes.length,
      totalCount,
      totalDuration,
    });

    return createPaginatedResponse(responseData, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Work item types list request failed', error, {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
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

  log.info('Create work item type request initiated', {
    operation: 'create_work_item_type',
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const body = await request.json();
    const validationStart = Date.now();
    const { workItemTypeCreateSchema } = await import('@/lib/validations/work-items');
    const validatedData = workItemTypeCreateSchema.parse(body);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create work item type (filter out undefined values)
    const createStart = Date.now();
    const newType = await workItemTypesService.createWorkItemType({
      organization_id: validatedData.organization_id,
      name: validatedData.name,
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.icon !== undefined && { icon: validatedData.icon }),
      ...(validatedData.color !== undefined && { color: validatedData.color }),
      ...(validatedData.is_active !== undefined && { is_active: validatedData.is_active }),
    });
    log.db('INSERT', 'work_item_types', Date.now() - createStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item type created successfully', {
      workItemTypeId: newType.work_item_type_id,
      totalDuration,
    });

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
    const totalDuration = Date.now() - startTime;

    log.error('Create work item type request failed', error, {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
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
