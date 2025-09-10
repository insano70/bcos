import { NextRequest, NextResponse } from 'next/server';
import { db, practices } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: practiceId } = await params;

    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.practice_id, practiceId))
      .where(isNull(practices.deleted_at))
      .limit(1);

    if (!practice) {
      return NextResponse.json({ message: 'Practice not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: practice.practice_id,
      name: practice.name,
      domain: practice.domain,
      template_id: practice.template_id,
      status: practice.status,
      owner_user_id: practice.owner_user_id,
      created_at: practice.created_at,
      updated_at: practice.updated_at,
    });
  } catch (error) {
    console.error('Error fetching practice:', error);
    return NextResponse.json(
      { message: 'Failed to fetch practice', error: error instanceof Error ? error.message : 'Unknown error' },
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
    const [existingPractice] = await db
      .select()
      .from(practices)
      .where(eq(practices.practice_id, practiceId))
      .where(isNull(practices.deleted_at))
      .limit(1);

    if (!existingPractice) {
      return NextResponse.json({ message: 'Practice not found' }, { status: 404 });
    }

    // Update practice
    const [updatedPractice] = await db
      .update(practices)
      .set({
        ...body,
        updated_at: new Date(),
      })
      .where(eq(practices.practice_id, practiceId))
      .returning();

    return NextResponse.json({
      id: updatedPractice.practice_id,
      name: updatedPractice.name,
      domain: updatedPractice.domain,
      template_id: updatedPractice.template_id,
      status: updatedPractice.status,
      owner_user_id: updatedPractice.owner_user_id,
      created_at: updatedPractice.created_at,
      updated_at: updatedPractice.updated_at,
    });
  } catch (error) {
    console.error('Error updating practice:', error);
    return NextResponse.json(
      { message: 'Failed to update practice', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: practiceId } = await params;

    // Soft delete by setting deleted_at
    const [deletedPractice] = await db
      .update(practices)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(practices.practice_id, practiceId))
      .returning();

    if (!deletedPractice) {
      return NextResponse.json({ message: 'Practice not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Practice deleted successfully' });
  } catch (error) {
    console.error('Error deleting practice:', error);
    return NextResponse.json(
      { message: 'Failed to delete practice', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
