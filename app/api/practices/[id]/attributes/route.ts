import { NextRequest } from 'next/server';
import { db, practices, practice_attributes } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { practiceAttributesUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac'
import { logger } from '@/lib/logger';
import { 
  parseBusinessHours, 
  parseServices, 
  parseInsuranceAccepted, 
  parseConditionsTreated, 
  parseGalleryImages 
} from '@/lib/utils/json-parser';

const getPracticeAttributesHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;
  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

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

    // RBAC: Check if user can access this practice's attributes
    // Super admins can access all, practice owners can access their own practice attributes
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to view attributes for this practice')
    }

    // Get practice attributes
    const [attributes] = await db
      .select()
      .from(practice_attributes)
      .where(eq(practice_attributes.practice_id, practiceId))
      .limit(1)

    if (!attributes) {
      throw NotFoundError('Practice attributes')
    }

    // Parse JSON fields safely
    const parsedAttributes = {
      ...attributes,
      business_hours: parseBusinessHours(attributes.business_hours),
      services: parseServices(attributes.services),
      insurance_accepted: parseInsuranceAccepted(attributes.insurance_accepted),
      conditions_treated: parseConditionsTreated(attributes.conditions_treated),
      gallery_images: parseGalleryImages(attributes.gallery_images),
    }

    return createSuccessResponse(parsedAttributes)
    
  } catch (error) {
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    const errorStack = error && typeof error === 'object' && 'stack' in error ? String(error.stack) : undefined;
    
    logger.error('Error fetching practice attributes', {
      error: errorMessage,
      stack: errorStack,
      practiceId,
      operation: 'fetchPracticeAttributes'
    })
    return createErrorResponse(errorMessage, 500, request)
  }
}

const updatePracticeAttributesHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;
  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;
    const validatedData = await validateRequest(request, practiceAttributesUpdateSchema)

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

    // RBAC: Check if user can update this practice's attributes
    // Super admins can update all, practice owners can update their own practice attributes
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to update attributes for this practice')
    }

    // Prepare data for update, stringify JSON fields
    const updateData = {
      ...validatedData,
      business_hours: validatedData.business_hours ? JSON.stringify(validatedData.business_hours) : null,
      services: validatedData.services ? JSON.stringify(validatedData.services) : null,
      insurance_accepted: validatedData.insurance_accepted ? JSON.stringify(validatedData.insurance_accepted) : null,
      conditions_treated: validatedData.conditions_treated ? JSON.stringify(validatedData.conditions_treated) : null,
      gallery_images: validatedData.gallery_images ? JSON.stringify(validatedData.gallery_images) : null,
      updated_at: new Date(),
    }

    // Update practice attributes
    const [updatedAttributes] = await db
      .update(practice_attributes)
      .set(updateData)
      .where(eq(practice_attributes.practice_id, practiceId))
      .returning()

    if (!updatedAttributes) {
      throw NotFoundError('Practice attributes')
    }

    // Parse JSON fields for response
    const parsedAttributes = {
      ...updatedAttributes,
      business_hours: parseBusinessHours(updatedAttributes.business_hours),
      services: parseServices(updatedAttributes.services),
      insurance_accepted: parseInsuranceAccepted(updatedAttributes.insurance_accepted),
      conditions_treated: parseConditionsTreated(updatedAttributes.conditions_treated),
      gallery_images: parseGalleryImages(updatedAttributes.gallery_images),
    }

    return createSuccessResponse(parsedAttributes, 'Practice attributes updated successfully')
    
  } catch (error) {
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    const errorStack = error && typeof error === 'object' && 'stack' in error ? String(error.stack) : undefined;
    
    logger.error('Error updating practice attributes', {
      error: errorMessage,
      stack: errorStack,
      practiceId,
      operation: 'updatePracticeAttributes'
    })
    return createErrorResponse(errorMessage, 500, request)
  }
}

// Export with RBAC protection
export const GET = rbacRoute(
  getPracticeAttributesHandler,
  {
    permission: ['practices:read:own', 'practices:read:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

export const PUT = rbacRoute(
  updatePracticeAttributesHandler,
  {
    permission: ['practices:update:own', 'practices:manage:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
