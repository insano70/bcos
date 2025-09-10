import { NextRequest, NextResponse } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
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

    // Get staff members
    const staff = await db
      .select()
      .from(staff_members)
      .where(eq(staff_members.practice_id, practiceId))
      .where(isNull(staff_members.deleted_at))
      .orderBy(staff_members.display_order);

    // Parse JSON fields
    const parsedStaff = staff.map(member => ({
      ...member,
      specialties: member.specialties ? JSON.parse(member.specialties) : [],
      education: member.education ? JSON.parse(member.education) : [],
    }));

    return NextResponse.json(parsedStaff);
  } catch (error) {
    console.error('Error fetching staff members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch staff members' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    // Prepare staff data, stringify JSON fields
    const staffData = {
      ...body,
      practice_id: practiceId,
      specialties: body.specialties ? JSON.stringify(body.specialties) : null,
      education: body.education ? JSON.stringify(body.education) : null,
    };

    const [newStaff] = await db
      .insert(staff_members)
      .values(staffData)
      .returning();

    return NextResponse.json(newStaff, { status: 201 });
  } catch (error) {
    console.error('Error creating staff member:', error);
    return NextResponse.json(
      { error: 'Failed to create staff member' },
      { status: 500 }
    );
  }
}
