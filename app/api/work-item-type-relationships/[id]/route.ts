import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACWorkItemTypeRelationshipsService } from '@/lib/services/rbac-work-item-type-relationships-service';
import type { UserContext } from '@/lib/types/rbac';
import { workItemTypeRelationshipUpdateSchema } from '@/lib/validations/work-item-type-relationships';

/**
 * GET /api/work-item-type-relationships/[id]
 * Get a specific type relationship by ID
 * Phase 6: Type relationships with auto-creation
 */
const getRelationshipHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: relationshipId } = await params;
  const startTime = Date.now();

  log.info('Work item type relationship get request initiated', {
    relationshipId,
    userId: userContext.user_id,
  });

  try {
    const relationshipsService = createRBACWorkItemTypeRelationshipsService(userContext);
    const relationship = await relationshipsService.getRelationshipById(relationshipId);

    if (!relationship) {
      return NextResponse.json({ error: 'Work item type relationship not found' }, { status: 404 });
    }

    const duration = Date.now() - startTime;

    log.info('Work item type relationship retrieved successfully', {
      relationshipId,
      duration,
    });

    return NextResponse.json(relationship);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve work item type relationship', error, {
      relationshipId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to retrieve work item type relationship');
  }
};

export const GET = rbacRoute(getRelationshipHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * PATCH /api/work-item-type-relationships/[id]
 * Update a type relationship
 * Phase 6: Type relationships with auto-creation
 */
const patchRelationshipHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: relationshipId } = await params;
  const startTime = Date.now();

  log.info('Work item type relationship update request initiated', {
    relationshipId,
    userId: userContext.user_id,
  });

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedData = workItemTypeRelationshipUpdateSchema.parse(body);

    // Update relationship
    const relationshipsService = createRBACWorkItemTypeRelationshipsService(userContext);
    const relationship = await relationshipsService.updateRelationship(
      relationshipId,
      validatedData as never
    );

    const duration = Date.now() - startTime;

    log.info('Work item type relationship updated successfully', {
      relationshipId,
      duration,
    });

    return NextResponse.json(relationship);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to update work item type relationship', error, {
      relationshipId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to update work item type relationship');
  }
};

export const PATCH = rbacRoute(patchRelationshipHandler, {
  permission: ['work-items:manage:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-item-type-relationships/[id]
 * Delete (soft delete) a type relationship
 * Phase 6: Type relationships with auto-creation
 */
const deleteRelationshipHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: relationshipId } = await params;
  const startTime = Date.now();

  log.info('Work item type relationship deletion request initiated', {
    relationshipId,
    userId: userContext.user_id,
  });

  try {
    const relationshipsService = createRBACWorkItemTypeRelationshipsService(userContext);
    await relationshipsService.deleteRelationship(relationshipId);

    const duration = Date.now() - startTime;

    log.info('Work item type relationship deleted successfully', {
      relationshipId,
      duration,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to delete work item type relationship', error, {
      relationshipId,
      userId: userContext.user_id,
      duration,
    });

    return handleRouteError(error, 'Failed to delete work item type relationship');
  }
};

export const DELETE = rbacRoute(deleteRelationshipHandler, {
  permission: ['work-items:manage:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
