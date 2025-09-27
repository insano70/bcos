import type { NextRequest } from 'next/server';
import { db, practices, practice_attributes, templates, users } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, ConflictError, ValidationError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { practiceCreateSchema, practiceQuerySchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import { createRBACOrganizationsService } from '@/lib/services/rbac-organizations-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * RBAC-Enhanced Practices API
 * Integrates practice management with organization-based RBAC
 */

const getPracticesHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'domain', 'status', 'created_at']);
    const query = validateQuery(searchParams, practiceQuerySchema);
    
    // For now, use the existing practices table directly with RBAC filtering
    // TODO: This will be enhanced when we fully map practices to organizations
    
    // Build where conditions
    const whereConditions = [isNull(practices.deleted_at)];
    
    if (query.status) {
      whereConditions.push(eq(practices.status, query.status));
    }
    if (query.template_id) {
      whereConditions.push(eq(practices.template_id, query.template_id));
    }
    
    // Apply RBAC filtering based on user's permissions
    const canReadAllPractices = userContext.all_permissions?.some(p =>
      p.name === 'practices:read:all'
    ) || false;

    const canReadOwnPractices = userContext.all_permissions?.some(p =>
      p.name === 'practices:read:own'
    ) || false;

    // If user can read all practices, no additional filtering needed
    if (!canReadAllPractices) {
      if (canReadOwnPractices) {
        // User can only see practices they own
        whereConditions.push(eq(practices.owner_user_id, userContext.user_id));
      } else {
        // User has no practice read permissions - return empty result
        return createPaginatedResponse([], {
          page: pagination.page,
          limit: pagination.limit,
          total: 0
        });
      }
    }
    
    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(practices)
      .where(and(...whereConditions));
    
    // Get paginated data
    const practicesData = await db
      .select({
        id: practices.practice_id,
        name: practices.name,
        domain: practices.domain,
        status: practices.status,
        template_id: practices.template_id,
        template_name: templates.name,
        owner_email: users.email,
        created_at: practices.created_at,
      })
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .leftJoin(users, eq(practices.owner_user_id, users.user_id))
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(practices.name) : desc(practices.name))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return createPaginatedResponse(practicesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: countResult?.count || 0
    });
    
  } catch (error) {
    console.error('Error fetching practices:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error', 
      500, 
      request
    );
  }
};

const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const validatedData = await validateRequest(request, practiceCreateSchema);
    const { name, domain, template_id, owner_user_id } = validatedData;

    // Check if domain already exists
    const existingPractice = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.domain, domain),
        isNull(practices.deleted_at)
      ))
      .limit(1);

    if (existingPractice.length > 0) {
      throw ConflictError('A practice with this domain already exists');
    }

    // Verify template exists
    const [template] = await db
      .select()
      .from(templates)
      .where(and(
        eq(templates.template_id, template_id),
        eq(templates.is_active, true)
      ))
      .limit(1);
    
    if (!template) {
      throw ValidationError(null, 'Invalid template selected');
    }

    // Create practice
    const [newPractice] = await db
      .insert(practices)
      .values({
        name,
        domain,
        template_id,
        owner_user_id: owner_user_id || userContext.user_id,
        status: 'pending',
      })
      .returning();

    if (!newPractice) {
      throw new Error('Failed to create practice');
    }

    // Create default practice attributes record
    await db
      .insert(practice_attributes)
      .values({
        practice_id: newPractice.practice_id,
        // Default business hours
        business_hours: JSON.stringify({
          sunday: { closed: true },
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
          wednesday: { open: '09:00', close: '17:00', closed: false },
          thursday: { open: '09:00', close: '17:00', closed: false },
          friday: { open: '09:00', close: '17:00', closed: false },
          saturday: { closed: true }
        }),
        // Default empty arrays for JSON fields
        services: JSON.stringify([]),
        insurance_accepted: JSON.stringify([]),
        conditions_treated: JSON.stringify([]),
        gallery_images: JSON.stringify([]),
        // Default brand colors
        primary_color: '#00AEEF',
        secondary_color: '#FFFFFF',
        accent_color: '#44C0AE',
      });

    return createSuccessResponse({
      id: newPractice.practice_id,
      name: newPractice.name,
      domain: newPractice.domain,
      template_id: newPractice.template_id,
      status: newPractice.status,
      owner_user_id: newPractice.owner_user_id,
      created_at: newPractice.created_at,
      updated_at: newPractice.updated_at,
    }, 'Practice created successfully');
    
  } catch (error) {
    console.error('Error creating practice:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error', 
      500, 
      request
    );
  }
};

// Export with RBAC protection
export const GET = rbacRoute(
  getPracticesHandler,
  {
    permission: ['practices:read:own', 'practices:read:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

// Only super admins can create new practices
export const POST = rbacRoute(
  createPracticeHandler,
  {
    ...rbacConfigs.superAdmin,
    rateLimit: 'api'
  }
);