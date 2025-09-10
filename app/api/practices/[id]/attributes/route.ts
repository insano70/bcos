import { NextRequest } from 'next/server';
import { db, practices, practice_attributes } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
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
      .where(eq(practices.practice_id, practiceId))
      .where(isNull(practices.deleted_at))
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
    return createErrorResponse(error, 500, request)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: practiceId } = await params;
    const body = await request.json();

    // Verify practice exists
    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.practice_id, practiceId))
      .limit(1);

    if (!practice) {
      return NextResponse.json(
        { error: 'Practice not found' },
        { status: 404 }
      );
    }

    // Prepare data for update, stringify JSON fields
    const updateData = {
      ...body,
      business_hours: body.business_hours ? JSON.stringify(body.business_hours) : null,
      services: body.services ? JSON.stringify(body.services) : null,
      insurance_accepted: body.insurance_accepted ? JSON.stringify(body.insurance_accepted) : null,
      conditions_treated: body.conditions_treated ? JSON.stringify(body.conditions_treated) : null,
      gallery_images: body.gallery_images ? JSON.stringify(body.gallery_images) : null,
      updated_at: new Date(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.practice_attribute_id;
    delete updateData.practice_id;

    const [updatedAttributes] = await db
      .update(practice_attributes)
      .set(updateData)
      .where(eq(practice_attributes.practice_id, practiceId))
      .returning();

    return NextResponse.json(updatedAttributes);
  } catch (error) {
    console.error('Error updating practice attributes:', error);
    return NextResponse.json(
      { error: 'Failed to update practice attributes' },
      { status: 500 }
    );
  }
}
