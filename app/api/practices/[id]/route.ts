import { NextRequest } from 'next/server';
import { db, practices } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError, ConflictError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { practiceUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';
import { practiceRoute, superAdminRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';

const getPracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema)

    // Verify practice exists
    const [practice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1)

    if (!practice) {
      throw NotFoundError('Practice')
    }

    // RBAC: Check if user can access this practice
    // Super admins can access all practices, others need ownership or organization access
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      // TODO: Add organization-based access control when practices are mapped to organizations
      throw new Error('Access denied: You do not have permission to view this practice')
    }

    return createSuccessResponse({
      id: practice.practice_id,
      name: practice.name,
      domain: practice.domain,
      template_id: practice.template_id,
      status: practice.status,
      owner_user_id: practice.owner_user_id,
      created_at: practice.created_at,
      updated_at: practice.updated_at,
    })

  } catch (error) {
    console.error('Error fetching practice:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

const updatePracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema)
    const validatedData = await validateRequest(request, practiceUpdateSchema)

    // Verify practice exists
    const [existingPractice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1)

    if (!existingPractice) {
      throw NotFoundError('Practice')
    }

    // RBAC: Check if user can update this practice
    // Super admins can update all practices, practice owners can update their own
    if (!userContext.is_super_admin && existingPractice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to update this practice')
    }

    // Check domain uniqueness if domain is being updated
    if (validatedData.domain && validatedData.domain !== existingPractice.domain) {
      const [domainExists] = await db
        .select()
        .from(practices)
        .where(and(
          eq(practices.domain, validatedData.domain),
          isNull(practices.deleted_at)
        ))
        .limit(1)
      
      if (domainExists) {
        throw ConflictError('A practice with this domain already exists')
      }
    }

    // Update practice
    const [updatedPractice] = await db
      .update(practices)
      .set({
        ...validatedData,
        updated_at: new Date(),
      })
      .where(eq(practices.practice_id, practiceId))
      .returning()

    if (!updatedPractice) {
      throw new Error('Failed to update practice')
    }

    return createSuccessResponse({
      id: updatedPractice.practice_id,
      name: updatedPractice.name,
      domain: updatedPractice.domain,
      template_id: updatedPractice.template_id,
      status: updatedPractice.status,
      owner_user_id: updatedPractice.owner_user_id,
      created_at: updatedPractice.created_at,
      updated_at: updatedPractice.updated_at,
    }, 'Practice updated successfully')
    
  } catch (error) {
    console.error('Error updating practice:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

const deletePracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema)

    // Verify practice exists before deletion
    const [existingPractice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1)

    if (!existingPractice) {
      throw NotFoundError('Practice')
    }

    // RBAC: Check if user can delete this practice
    // Only super admins can delete practices
    if (!userContext.is_super_admin) {
      throw new Error('Access denied: Only super administrators can delete practices')
    }

    // Soft delete by setting deleted_at
    const [deletedPractice] = await db
      .update(practices)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(practices.practice_id, practiceId))
      .returning()

    if (!deletedPractice) {
      throw new Error('Failed to delete practice')
    }

    return createSuccessResponse(
      { id: deletedPractice.practice_id },
      'Practice deleted successfully'
    )
    
  } catch (error) {
    console.error('Error deleting practice:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export with RBAC protection
export const GET = practiceRoute(
  ['practices:read:own', 'practices:read:all'],
  getPracticeHandler,
  { rateLimit: 'api' }
);

export const PUT = practiceRoute(
  ['practices:update:own', 'practices:manage:all'],
  updatePracticeHandler,
  { rateLimit: 'api' }
);

// Only super admins can delete practices
export const DELETE = superAdminRoute(
  deletePracticeHandler,
  { rateLimit: 'api' }
);
