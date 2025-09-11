import { NextRequest } from 'next/server';
import { db, practices } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError, ConflictError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateRequest, validateParams } from '@/lib/api/middleware/validation';
import { practiceUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)

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
