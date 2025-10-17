import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACWorkItemFieldsService } from '@/lib/services/rbac-work-item-fields-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  workItemFieldCreateSchema,
  workItemFieldsQuerySchema,
} from '@/lib/validations/work-item-fields';

/**
 * POST /api/work-item-types/[id]/fields
 * Create a new custom field for a work item type
 */
const postFieldHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: { id: string } }).params;
  const startTime = Date.now();
  const workItemTypeId = params.id as string;

  log.info('Work item field creation request initiated', {
    workItemTypeId,
    userId: userContext.user_id,
  });

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedData = workItemFieldCreateSchema.parse({
      ...body,
      work_item_type_id: workItemTypeId,
    });

    // Create service and field
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    const field = await fieldsService.createWorkItemField(validatedData as never);

    const duration = Date.now() - startTime;

    log.info('Work item field created successfully', {
      workItemFieldId: field.work_item_field_id,
      workItemTypeId,
      fieldName: field.field_name,
      duration,
    });

    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to create work item field', error, {
      workItemTypeId,
      userId: userContext.user_id,
      duration,
    });

    if (error instanceof Error) {
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Validation failed', details: error.message },
          { status: 400 }
        );
      }

      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Failed to create work item field' }, { status: 500 });
  }
};

export const POST = rbacRoute(postFieldHandler, {
  permission: ['work-items:create:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * GET /api/work-item-types/[id]/fields
 * Get all custom fields for a work item type
 */
const getFieldsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: { id: string } }).params;
  const startTime = Date.now();
  const workItemTypeId = params.id as string;

  log.info('Work item fields list request initiated', {
    workItemTypeId,
    userId: userContext.user_id,
  });

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      work_item_type_id: workItemTypeId,
      is_visible: searchParams.get('is_visible')
        ? searchParams.get('is_visible') === 'true'
        : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit') ?? '0', 10) : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset') ?? '0', 10)
        : undefined,
    };

    // Validate query parameters
    const validatedParams = workItemFieldsQuerySchema.parse(queryParams);

    // Get fields
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    const fields = await fieldsService.getWorkItemFields(validatedParams as never);

    const duration = Date.now() - startTime;

    log.info('Work item fields retrieved successfully', {
      workItemTypeId,
      count: fields.length,
      duration,
    });

    return NextResponse.json(fields);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve work item fields', error, {
      workItemTypeId,
      userId: userContext.user_id,
      duration,
    });

    if (error instanceof Error) {
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: error.message },
          { status: 400 }
        );
      }

      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Failed to retrieve work item fields' }, { status: 500 });
  }
};

export const GET = rbacRoute(getFieldsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
