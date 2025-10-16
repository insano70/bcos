import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemFieldsService } from '@/lib/services/rbac-work-item-fields-service';
import { workItemFieldUpdateSchema } from '@/lib/validations/work-item-fields';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-item-fields/[id]
 * Get a specific work item field by ID
 */
const getFieldHandler = async (_request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const params = (args[0] as { params: { id: string } }).params;
  const startTime = Date.now();
  const fieldId = params.id as string;

  log.info('Work item field retrieval request initiated', {
    fieldId,
    userId: userContext.user_id,
  });

  try {
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    const field = await fieldsService.getWorkItemFieldById(fieldId);

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

    if (error instanceof Error && error.message.includes('Permission denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to retrieve work item field' }, { status: 500 });
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
const patchFieldHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const params = (args[0] as { params: { id: string } }).params;
  const startTime = Date.now();
  const fieldId = params.id as string;

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
    const field = await fieldsService.updateWorkItemField(fieldId, validatedData as never);

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

    return NextResponse.json({ error: 'Failed to update work item field' }, { status: 500 });
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
const deleteFieldHandler = async (_request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const params = (args[0] as { params: { id: string } }).params;
  const startTime = Date.now();
  const fieldId = params.id as string;

  log.info('Work item field deletion request initiated', {
    fieldId,
    userId: userContext.user_id,
  });

  try {
    const fieldsService = createRBACWorkItemFieldsService(userContext);
    await fieldsService.deleteWorkItemField(fieldId);

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

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Failed to delete work item field' }, { status: 500 });
  }
};

export const DELETE = rbacRoute(deleteFieldHandler, {
  permission: ['work-items:delete:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
