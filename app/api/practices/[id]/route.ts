import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceParamsSchema, practiceUpdateSchema } from '@/lib/validations/practice';

const getPracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practice with automatic RBAC checking
    const practice = await practicesService.getPracticeById(practiceId);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    // Enriched read log with practice context
    const template = logTemplates.crud.read('practice', {
      resourceId: practice.id,
      resourceName: practice.name,
      userId: userContext.user_id,
      found: true,
      duration: Date.now() - startTime,
      metadata: {
        domain: practice.domain,
        status: practice.status,
        templateId: practice.template_id,
        ownerId: practice.owner_user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      id: practice.id,
      name: practice.name,
      domain: practice.domain,
      template_id: practice.template_id,
      status: practice.status,
      owner_user_id: practice.owner_user_id,
      created_at: practice.created_at,
      updated_at: practice.updated_at,
    });
  } catch (error) {
    log.error('Get practice failed', error, {
      operation: 'read_practice',
      practiceId,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const updatePracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;
    const validatedData = await validateRequest(request, practiceUpdateSchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get current state BEFORE update for change tracking
    const before = await practicesService.getPracticeById(practiceId);
    if (!before) {
      throw NotFoundError('Practice');
    }

    // Update practice with automatic RBAC checking
    const updatedPractice = await practicesService.updatePractice(practiceId, {
      name: validatedData.name,
      domain: validatedData.domain,
      template_id: validatedData.template_id,
      status: validatedData.status,
    });

    // Calculate changes for audit trail
    const changes = calculateChanges(
      {
        name: before.name,
        domain: before.domain,
        template_id: before.template_id,
        status: before.status,
      },
      {
        name: updatedPractice.name,
        domain: updatedPractice.domain,
        template_id: updatedPractice.template_id,
        status: updatedPractice.status,
      }
    );

    // Enriched update log with change tracking
    const template = logTemplates.crud.update('practice', {
      resourceId: updatedPractice.id,
      resourceName: updatedPractice.name,
      userId: userContext.user_id,
      changes,
      duration: Date.now() - startTime,
      metadata: {
        domain: updatedPractice.domain,
        status: updatedPractice.status,
        templateId: updatedPractice.template_id,
        ownerId: updatedPractice.owner_user_id,
        ...(changes.status && { statusChange: `${changes.status.from} -> ${changes.status.to}` }),
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: updatedPractice.id,
        name: updatedPractice.name,
        domain: updatedPractice.domain,
        template_id: updatedPractice.template_id,
        status: updatedPractice.status,
        owner_user_id: updatedPractice.owner_user_id,
        created_at: updatedPractice.created_at,
        updated_at: updatedPractice.updated_at,
      },
      'Practice updated successfully'
    );
  } catch (error) {
    log.error('Update practice failed', error, {
      operation: 'update_practice',
      practiceId,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const deletePracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practice info BEFORE deletion for logging
    const practice = await practicesService.getPracticeById(practiceId);
    if (!practice) {
      throw NotFoundError('Practice');
    }

    // Delete practice with automatic RBAC checking
    await practicesService.deletePractice(practiceId);

    // Enriched deletion log with practice context
    const template = logTemplates.crud.delete('practice', {
      resourceId: practiceId,
      resourceName: practice.name,
      userId: userContext.user_id,
      soft: false,
      duration: Date.now() - startTime,
      metadata: {
        domain: practice.domain,
        status: practice.status,
        templateId: practice.template_id,
        ownerId: practice.owner_user_id,
        isSuperAdmin: userContext.is_super_admin,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ id: practiceId }, 'Practice deleted successfully');
  } catch (error) {
    log.error('Delete practice failed', error, {
      operation: 'delete_practice',
      practiceId,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getPracticeHandler, {
  permission: ['practices:read:own', 'practices:read:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updatePracticeHandler, {
  permission: ['practices:update:own', 'practices:manage:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

// Only super admins can delete practices
export const DELETE = rbacRoute(deletePracticeHandler, {
  ...rbacConfigs.superAdmin,
  rateLimit: 'api',
});
