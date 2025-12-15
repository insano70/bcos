import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACWorkItemFieldsService } from '@/lib/services/rbac-work-item-fields-service';
import type { UserContext } from '@/lib/types/rbac';
import { workItemFieldUpdateSchema } from '@/lib/validations/work-item-fields';

/**
 * GET /api/work-item-fields/[id]
 * Get a specific work item field by ID
 */
const getFieldHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ id: string }> };
  const resolvedParams = await params;
  const startTime = Date.now();
  const fieldId = resolvedParams.id;

  log.info('Work item field retrieval request initiated', {
    fieldId,
    userId: userContext.user_id,
  });

  try {
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    const field = await fieldsService.getById(fieldId);

    if (!field) {
      log.warn('Work item field not found', {
        fieldId,
        userId: userContext.user_id,
      });
      return NextResponse.json({ error: 'Work item field not found' }, { status: 404 });
    }

    const duration = Date.now() - startTime;

    log.info('Work item field retrieved successfully', {
      fieldId,
      duration,
    });

    return NextResponse.json(field);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve work item field', error, {
      fieldId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to retrieve work item field', _request);
  }
};

export const GET = rbacRoute(getFieldHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * PATCH /api/work-item-fields/[id]
 * Update a work item field
 */
const patchFieldHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ id: string }> };
  const resolvedParams = await params;
  const startTime = Date.now();
  const fieldId = resolvedParams.id;

  log.info('Work item field update request initiated', {
    fieldId,
    userId: userContext.user_id,
  });

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedData = workItemFieldUpdateSchema.parse(body);

    // Update field
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    const field = await fieldsService.update(fieldId, validatedData as never);

    const duration = Date.now() - startTime;

    log.info('Work item field updated successfully', {
      fieldId,
      duration,
    });

    return NextResponse.json(field);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to update work item field', error, {
      fieldId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to update work item field', request);
  }
};

export const PATCH = rbacRoute(patchFieldHandler, {
  permission: ['work-items:update:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-item-fields/[id]
 * Delete a work item field (soft delete)
 */
const deleteFieldHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ id: string }> };
  const resolvedParams = await params;
  const startTime = Date.now();
  const fieldId = resolvedParams.id;

  log.info('Work item field deletion request initiated', {
    fieldId,
    userId: userContext.user_id,
  });

  try {
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    await fieldsService.delete(fieldId);

    const duration = Date.now() - startTime;

    log.info('Work item field deleted successfully', {
      fieldId,
      duration,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to delete work item field', error, {
      fieldId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to delete work item field', _request);
  }
};

export const DELETE = rbacRoute(deleteFieldHandler, {
  permission: ['work-items:delete:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
