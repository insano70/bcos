import { NextRequest, NextResponse } from 'next/server';
import { db, practices, practice_attributes } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: practiceId } = await params;

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

    // Get practice attributes
    const [attributes] = await db
      .select()
      .from(practice_attributes)
      .where(eq(practice_attributes.practice_id, practiceId))
      .limit(1);

    if (!attributes) {
      return NextResponse.json(
        { error: 'Practice attributes not found' },
        { status: 404 }
      );
    }

    // Parse JSON fields
    const parsedAttributes = {
      ...attributes,
      business_hours: attributes.business_hours ? JSON.parse(attributes.business_hours) : null,
      services: attributes.services ? JSON.parse(attributes.services) : [],
      insurance_accepted: attributes.insurance_accepted ? JSON.parse(attributes.insurance_accepted) : [],
      conditions_treated: attributes.conditions_treated ? JSON.parse(attributes.conditions_treated) : [],
      gallery_images: attributes.gallery_images ? JSON.parse(attributes.gallery_images) : [],
    };

    return NextResponse.json(parsedAttributes);
  } catch (error) {
    console.error('Error fetching practice attributes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch practice attributes' },
      { status: 500 }
    );
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
