import { NextRequest, NextResponse } from 'next/server';
import { db, practices, templates, users, practice_attributes } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
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
      .where(isNull(practices.deleted_at))
      .orderBy(practices.created_at);

    return NextResponse.json(practicesData);
  } catch (error) {
    console.error('Error fetching practices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch practices' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, domain, template_id, owner_user_id } = body;

    // Validate required fields
    if (!name || !domain || !template_id) {
      return NextResponse.json(
        { error: 'Name, domain, and template_id are required' },
        { status: 400 }
      );
    }

    // Check if domain already exists
    const existingPractice = await db
      .select()
      .from(practices)
      .where(eq(practices.domain, domain))
      .limit(1);

    if (existingPractice.length > 0) {
      return NextResponse.json(
        { error: 'Domain already exists' },
        { status: 409 }
      );
    }

    const [newPractice] = await db
      .insert(practices)
      .values({
        name,
        domain,
        template_id,
        owner_user_id,
        status: 'pending',
      })
      .returning();

    return NextResponse.json(newPractice, { status: 201 });
  } catch (error) {
    console.error('Error creating practice:', error);
    return NextResponse.json(
      { error: 'Failed to create practice' },
      { status: 500 }
    );
  }
}
