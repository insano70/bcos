import { NextRequest, NextResponse } from 'next/server';
import { db, templates } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const templatesData = await db
      .select({
        id: templates.template_id,
        name: templates.name,
        slug: templates.slug,
        description: templates.description,
        preview_image_url: templates.preview_image_url,
        is_active: templates.is_active,
        created_at: templates.created_at,
      })
      .from(templates)
      .where(eq(templates.is_active, true))
      .where(isNull(templates.deleted_at))
      .orderBy(templates.name);

    return NextResponse.json(templatesData);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
