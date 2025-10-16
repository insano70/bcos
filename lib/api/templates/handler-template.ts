// @ts-nocheck
/**
 * ============================================================================
 * API HANDLER TEMPLATE
 * ============================================================================
 *
 * This is a TEMPLATE file with placeholder syntax (e.g., [Resource], [resource])
 * that must be replaced when copying to create actual API endpoints.
 *
 * TypeScript checking is disabled for this file via @ts-nocheck directive.
 *
 * Use this template when creating new API endpoints.
 * Follow the gold standard pattern from app/api/users/route.ts
 *
 * BEFORE YOU START:
 * 1. Ensure you have a service layer created (lib/services/rbac-[resource]-service.ts)
 * 2. Ensure you have validation schemas (lib/validations/[resource].ts)
 * 3. Review docs/api/STANDARDS.md for detailed guidelines
 *
 * STEPS TO USE THIS TEMPLATE:
 * 1. Copy this file to your API route location (e.g., app/api/[resource]/route.ts)
 * 2. Replace all [Resource] with your resource name (e.g., User, Practice, Chart)
 * 3. Replace [resource] with lowercase resource name (e.g., user, practice, chart)
 * 4. Replace [operation] with the operation (e.g., get, create, update, delete)
 * 5. Update permission names to match your resource
 * 6. Remove sections you don't need (e.g., if no pagination needed)
 * 7. Delete the @ts-nocheck directive and this header comment block
 *
 * ============================================================================
 */

/**
 * ============================================================================
 * EXAMPLE 1: LIST ENDPOINT WITH PAGINATION
 * ============================================================================
 *
 * Use this pattern for:
 * - GET /api/[resources] (collection endpoint)
 * - Returns list of items with pagination
 * - Supports filtering, sorting, and search
 */

import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { log } from '@/lib/logger';
import { createRBAC[Resource]Service } from '@/lib/services/rbac-[resource]-service';
import type { UserContext } from '@/lib/types/rbac';
import { [resource]QuerySchema } from '@/lib/validations/[resource]';

/**
 * List [Resources] with pagination
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - sortBy: string (e.g., 'name', 'created_at')
 * - sortOrder: 'asc' | 'desc'
 * - [Add your specific filters]
 *
 * @example
 * GET /api/[resources]?page=1&limit=20&status=active
 */
const get[Resources]Handler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  log.info('List [resources] request initiated', {
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  });

  try {
    // 1. Extract and validate query parameters
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'created_at', 'updated_at']);
    const query = validateQuery(searchParams, [resource]QuerySchema);

    log.info('Query parameters validated', {
      page: pagination.page,
      limit: pagination.limit,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    });

    // 2. Create service instance
    const [resource]Service = createRBAC[Resource]Service(userContext);

    // 3. Execute operation through service
    const [resources] = await [resource]Service.get[Resources]({
      // Pass your specific filters
      // e.g., status: query.status,
      // e.g., search: query.search,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    });

    // 4. Get total count for pagination
    const totalCount = await [resource]Service.get[Resource]Count({
      // Same filters as above (without limit/offset)
    });

    log.info('[Resources] list retrieved successfully', {
      count: [resources].length,
      total: totalCount,
      duration: Date.now() - startTime
    });

    // 5. Return paginated response
    return createPaginatedResponse([resources], {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount
    });

  } catch (error) {
    log.error('List [resources] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const GET = rbacRoute(
  get[Resources]Handler,
  {
    permission: ['[resource]:read:own', '[resource]:read:organization', '[resource]:read:all'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

/**
 * ============================================================================
 * EXAMPLE 2: DETAIL ENDPOINT WITH ROUTE PARAMS
 * ============================================================================
 *
 * Use this pattern for:
 * - GET /api/[resources]/[id] (detail endpoint)
 * - Returns single item by ID
 * - Requires route parameter extraction
 */

import { NotFoundError } from '@/lib/api/responses/error';
import { extractRouteParams } from '@/lib/api/utils/params';
import { [resource]ParamsSchema } from '@/lib/validations/[resource]';

/**
 * Get single [resource] by ID
 *
 * @example
 * GET /api/[resources]/123e4567-e89b-12d3-a456-426614174000
 */
const get[Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    // 1. Extract and validate route parameters
    const { id: [resource]Id } = await extractRouteParams(args[0], [resource]ParamsSchema);

    log.info('Get [resource] request initiated', {
      [resource]Id,
      requestingUserId: userContext.user_id
    });

    // 2. Create service instance
    const [resource]Service = createRBAC[Resource]Service(userContext);

    // 3. Get [resource] by ID (service handles RBAC)
    const [resource] = await [resource]Service.get[Resource]ById([resource]Id);

    // 4. Check if found
    if (![resource]) {
      throw NotFoundError('[Resource]');
    }

    log.info('[Resource] retrieved successfully', {
      [resource]Id,
      duration: Date.now() - startTime
    });

    // 5. Return success response
    return createSuccessResponse([resource]);

  } catch (error) {
    log.error('Get [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    // Return appropriate status code
    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      statusCode,
      request
    );
  }
};

// Export with RBAC protection
export const GET = rbacRoute(
  get[Resource]Handler,
  {
    permission: ['[resource]:read:own', '[resource]:read:organization', '[resource]:read:all'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

/**
 * ============================================================================
 * EXAMPLE 3: CREATE ENDPOINT WITH BODY VALIDATION
 * ============================================================================
 *
 * Use this pattern for:
 * - POST /api/[resources] (create endpoint)
 * - Accepts JSON body
 * - Validates input with Zod schema
 */

import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { [resource]CreateSchema } from '@/lib/validations/[resource]';

/**
 * Create new [resource]
 *
 * Request Body:
 * - [field1]: string
 * - [field2]: string
 * - [Add your specific fields]
 *
 * @example
 * POST /api/[resources]
 * Body: { "name": "Example", "description": "..." }
 */
const create[Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  log.info('Create [resource] request initiated', {
    createdByUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  });

  try {
    // 1. Validate request body
    const validatedData = await validateRequest(request, [resource]CreateSchema);

    log.info('[Resource] data validated', {
      // Log non-sensitive fields
      // e.g., name: validatedData.name
    });

    // 2. Create service instance
    const [resource]Service = createRBAC[Resource]Service(userContext);

    // 3. Create [resource] through service
    const new[Resource] = await [resource]Service.create[Resource]({
      ...validatedData,
      // Add any server-side fields
      // e.g., organization_id: userContext.current_organization_id
    });

    log.info('[Resource] created successfully', {
      [resource]Id: new[Resource].id,
      createdByUserId: userContext.user_id,
      duration: Date.now() - startTime
    });

    // 4. Return success response with created resource
    return createSuccessResponse(
      new[Resource],
      '[Resource] created successfully'
    );

  } catch (error) {
    log.error('Create [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const POST = rbacRoute(
  create[Resource]Handler,
  {
    permission: '[resource]:create:organization',
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

/**
 * ============================================================================
 * EXAMPLE 4: UPDATE ENDPOINT WITH PARTIAL DATA
 * ============================================================================
 *
 * Use this pattern for:
 * - PUT/PATCH /api/[resources]/[id] (update endpoint)
 * - Accepts partial JSON body
 * - Updates only provided fields
 */

import { [resource]UpdateSchema } from '@/lib/validations/[resource]';

/**
 * Update [resource]
 *
 * All fields are optional (partial update)
 *
 * @example
 * PUT /api/[resources]/123e4567-e89b-12d3-a456-426614174000
 * Body: { "name": "Updated Name" }
 */
const update[Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    // 1. Extract route parameters
    const { id: [resource]Id } = await extractRouteParams(args[0], [resource]ParamsSchema);

    log.info('Update [resource] request initiated', {
      [resource]Id,
      requestingUserId: userContext.user_id
    });

    // 2. Validate request body (partial update)
    const updateData = await validateRequest(request, [resource]UpdateSchema);

    log.info('[Resource] update data validated', {
      [resource]Id,
      updateFields: Object.keys(updateData)
    });

    // 3. Create service instance
    const [resource]Service = createRBAC[Resource]Service(userContext);

    // 4. Update [resource] through service (service handles RBAC)
    const updated[Resource] = await [resource]Service.update[Resource](
      [resource]Id,
      updateData
    );

    log.info('[Resource] updated successfully', {
      [resource]Id,
      updatedFields: Object.keys(updateData),
      duration: Date.now() - startTime
    });

    // 5. Return success response
    return createSuccessResponse(
      updated[Resource],
      '[Resource] updated successfully'
    );

  } catch (error) {
    log.error('Update [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      statusCode,
      request
    );
  }
};

// Export with RBAC protection
export const PUT = rbacRoute(
  update[Resource]Handler,
  {
    permission: ['[resource]:update:own', '[resource]:update:organization', '[resource]:manage:all'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

// Can also export as PATCH for partial updates
export const PATCH = rbacRoute(
  update[Resource]Handler,
  {
    permission: ['[resource]:update:own', '[resource]:update:organization', '[resource]:manage:all'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

/**
 * ============================================================================
 * EXAMPLE 5: DELETE ENDPOINT (SOFT DELETE)
 * ============================================================================
 *
 * Use this pattern for:
 * - DELETE /api/[resources]/[id] (delete endpoint)
 * - Soft delete (sets deleted_at timestamp)
 * - Returns success message only
 */

/**
 * Delete [resource] (soft delete)
 *
 * @example
 * DELETE /api/[resources]/123e4567-e89b-12d3-a456-426614174000
 */
const delete[Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    // 1. Extract route parameters
    const { id: [resource]Id } = await extractRouteParams(args[0], [resource]ParamsSchema);

    log.info('Delete [resource] request initiated', {
      [resource]Id,
      requestingUserId: userContext.user_id
    });

    // 2. Create service instance
    const [resource]Service = createRBAC[Resource]Service(userContext);

    // 3. Delete [resource] through service (service handles RBAC)
    await [resource]Service.delete[Resource]([resource]Id);

    log.info('[Resource] deleted successfully', {
      [resource]Id,
      deletedByUserId: userContext.user_id,
      duration: Date.now() - startTime
    });

    // 4. Return success response (no data for delete)
    return createSuccessResponse(
      null,
      '[Resource] deleted successfully'
    );

  } catch (error) {
    log.error('Delete [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      statusCode,
      request
    );
  }
};

// Export with RBAC protection
export const DELETE = rbacRoute(
  delete[Resource]Handler,
  {
    permission: ['[resource]:delete:organization', '[resource]:manage:all'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

/**
 * ============================================================================
 * SPECIAL CASE: PUBLIC ENDPOINT (NO AUTHENTICATION)
 * ============================================================================
 *
 * Use this pattern for:
 * - Public endpoints (contact forms, health checks, etc.)
 * - No authentication required
 * - Rate limiting still applies
 */

import { publicRoute } from '@/lib/api/route-handlers';

/**
 * Public endpoint example
 * No authentication required
 *
 * @example
 * POST /api/contact
 */
const publicEndpointHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.info('Public endpoint request initiated');

  try {
    // 1. Validate request
    const validatedData = await validateRequest(request, someSchema);

    // 2. Process request (no service layer for public endpoints usually)
    // e.g., send email, log contact form, etc.

    log.info('Public endpoint completed', {
      duration: Date.now() - startTime
    });

    return createSuccessResponse(null, 'Request processed successfully');

  } catch (error) {
    log.error('Public endpoint failed', error, {
      duration: Date.now() - startTime
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export as public route
export const POST = publicRoute(
  publicEndpointHandler,
  'Allow visitors to [description of what endpoint does]',
  { rateLimit: 'api' }
);

/**
 * ============================================================================
 * QUICK REFERENCE CHECKLIST
 * ============================================================================
 *
 * Before committing your API endpoint, verify:
 *
 * Structure:
 * - [ ] Handler follows naming convention: [operation][Resource]Handler
 * - [ ] Imports in correct order (see STANDARDS.md)
 * - [ ] Uses service layer for all DB operations
 * - [ ] No direct `db` imports in handler
 *
 * Validation:
 * - [ ] Query params validated with validateQuery()
 * - [ ] Request body validated with validateRequest()
 * - [ ] Route params validated with extractRouteParams()
 *
 * Logging:
 * - [ ] Logs on operation start (log.info)
 * - [ ] Logs on success with metrics
 * - [ ] Logs on error with context
 * - [ ] Uses startTime for duration tracking
 *
 * Responses:
 * - [ ] Uses createSuccessResponse() for single items
 * - [ ] Uses createPaginatedResponse() for lists
 * - [ ] Uses createErrorResponse() for errors
 * - [ ] No NextResponse.json() or new Response()
 *
 * RBAC:
 * - [ ] Wrapped with rbacRoute() or publicRoute()
 * - [ ] Permissions specified correctly
 * - [ ] No manual RBAC checks in handler
 * - [ ] Service layer handles all permission enforcement
 *
 * Type Safety:
 * - [ ] No `any` types
 * - [ ] All parameters typed
 * - [ ] Return types explicit (if needed)
 * - [ ] TypeScript strict mode compliant
 *
 * Testing:
 * - [ ] Tests exist in __tests__/route.test.ts
 * - [ ] Test coverage >85%
 * - [ ] Tests cover happy path and error cases
 * - [ ] RBAC boundaries tested
 *
 * Documentation:
 * - [ ] JSDoc comment on handler
 * - [ ] Example usage in comment
 * - [ ] Complex logic explained
 *
 * ============================================================================
 */
