import { NextRequest } from 'next/server';
import { db, practices, practice_attributes } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { requireAuth } from '@/lib/api/middleware/auth';
import { validateRequest, validateParams } from '@/lib/api/middleware/validation';
import { practiceAttributesUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)

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
      business_hours: attributes.business_hours ? JSON.parse(attributes.business_hours) : null,
      services: attributes.services ? JSON.parse(attributes.services) : [],
      insurance_accepted: attributes.insurance_accepted ? JSON.parse(attributes.insurance_accepted) : [],
      conditions_treated: attributes.conditions_treated ? JSON.parse(attributes.conditions_treated) : [],
      gallery_images: attributes.gallery_images ? JSON.parse(attributes.gallery_images) : [],
    }

    return createSuccessResponse(parsedAttributes)
    
  } catch (error) {
    console.error('Error fetching practice attributes:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    // Require authentication
    await requireAuth(request)
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)
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
      business_hours: updatedAttributes.business_hours ? JSON.parse(updatedAttributes.business_hours) : null,
      services: updatedAttributes.services ? JSON.parse(updatedAttributes.services) : [],
      insurance_accepted: updatedAttributes.insurance_accepted ? JSON.parse(updatedAttributes.insurance_accepted) : [],
      conditions_treated: updatedAttributes.conditions_treated ? JSON.parse(updatedAttributes.conditions_treated) : [],
      gallery_images: updatedAttributes.gallery_images ? JSON.parse(updatedAttributes.gallery_images) : [],
    }

    return createSuccessResponse(parsedAttributes, 'Practice attributes updated successfully')
    
  } catch (error) {
    console.error('Error updating practice attributes:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
