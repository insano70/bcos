import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/lib/db';
import { isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const usersData = await db
      .select({
        id: users.user_id,
        first_name: users.first_name,
        last_name: users.last_name,
        email: users.email,
        email_verified: users.email_verified,
        is_active: users.is_active,
        created_at: users.created_at,
        deleted_at: users.deleted_at,
      })
      .from(users)
      .where(isNull(users.deleted_at))
      .orderBy(users.created_at);

    return NextResponse.json(usersData);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
