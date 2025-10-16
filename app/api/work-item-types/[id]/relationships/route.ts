import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemTypeRelationshipsService } from '@/lib/services/rbac-work-item-type-relationships-service';
import {
  workItemTypeRelationshipCreateSchema,
  workItemTypeRelationshipsQuerySchema,
} from '@/lib/validations/work-item-type-relationships';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * POST /api/work-item-types/[id]/relationships
 * Create a new type relationship for a work item type
 * Phase 6: Type relationships with auto-creation
 */
const postRelationshipHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: workItemTypeId } = await params;
  const startTime = Date.now();

  log.info('Work item type relationship creation request initiated', {
    workItemTypeId,
    userId: userContext.user_id,
  });

  try {
    // Parse request body
    const body = await request.json();

    // Validate request - ensure parent_type_id matches route param
    const validatedData = workItemTypeRelationshipCreateSchema.parse({
      ...body,
      parent_type_id: workItemTypeId,
    });

    // Create service and relationship
    const relationshipsService = createRBACWorkItemTypeRelationshipsService(userContext);
    const relationship = await relationshipsService.createRelationship(validatedData as never);

    const duration = Date.now() - startTime;

    log.info('Work item type relationship created successfully', {
      relationshipId: relationship.work_item_type_relationship_id,
      parentTypeId: relationship.parent_type_id,
      childTypeId: relationship.child_type_id,
      duration,
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to create work item type relationship', error, {
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

      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (
        error.message.includes('Permission denied') ||
        error.message.includes('permission')
      ) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to create work item type relationship' },
      { status: 500 }
    );
  }
};

export const POST = rbacRoute(postRelationshipHandler, {
  permission: ['work-items:manage:organization', 'work-items:manage:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * GET /api/work-item-types/[id]/relationships
 * Get all type relationships for a work item type (as parent)
 * Phase 6: Type relationships with auto-creation
 */
const getRelationshipsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: workItemTypeId } = await params;
  const startTime = Date.now();

  log.info('Work item type relationships list request initiated', {
    workItemTypeId,
    userId: userContext.user_id,
  });

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      parent_type_id: workItemTypeId,
      child_type_id: searchParams.get('child_type_id') || undefined,
      is_required:
        searchParams.get('is_required') === 'true'
          ? 'true'
          : searchParams.get('is_required') === 'false'
            ? 'false'
            : undefined,
      auto_create:
        searchParams.get('auto_create') === 'true'
          ? 'true'
          : searchParams.get('auto_create') === 'false'
            ? 'false'
            : undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit') ?? '50', 10)
        : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset') ?? '0', 10)
        : undefined,
    };

    // Validate query parameters
    const validatedParams = workItemTypeRelationshipsQuerySchema.parse(queryParams);

    // Get relationships
    const relationshipsService = createRBACWorkItemTypeRelationshipsService(userContext);
    const relationships = await relationshipsService.getRelationships(
      validatedParams as never
    );

    const duration = Date.now() - startTime;

    log.info('Work item type relationships retrieved successfully', {
      workItemTypeId,
      count: relationships.length,
      duration,
    });

    return NextResponse.json(relationships);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve work item type relationships', error, {
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

      if (
        error.message.includes('Permission denied') ||
        error.message.includes('permission')
      ) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to retrieve work item type relationships' },
      { status: 500 }
    );
  }
};

export const GET = rbacRoute(getRelationshipsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
