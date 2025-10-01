export const metadata = {
  title: 'Edit Practice - BCOS',
  description: 'Edit rheumatology practice configuration',
};

import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, practice_attributes, practices, staff_members, templates } from '@/lib/db';
import type { PracticeAttributes } from '@/lib/types/practice';
import {
  transformPractice,
  transformPracticeAttributes,
  transformStaffMember,
  transformTemplate,
} from '@/lib/types/transformers';
import PracticeConfigForm from './practice-config-form';

async function getPracticeData(practiceId: string) {
  const [practice] = await db
    .select()
    .from(practices)
    .where(eq(practices.practice_id, practiceId))
    .limit(1);

  if (!practice) return null;

  const [attributes] = await db
    .select()
    .from(practice_attributes)
    .where(eq(practice_attributes.practice_id, practiceId))
    .limit(1);

  const staff = await db
    .select()
    .from(staff_members)
    .where(eq(staff_members.practice_id, practiceId))
    .orderBy(staff_members.display_order);

  const allTemplates = await db.select().from(templates).where(eq(templates.is_active, true));

  return {
    practice: transformPractice(practice),
    attributes: attributes ? transformPracticeAttributes(attributes) : ({} as PracticeAttributes),
    staff: staff.map(transformStaffMember),
    allTemplates: allTemplates.map(transformTemplate),
  };
}

export default async function EditPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPracticeData(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="px-4 py-8 mx-auto w-full max-w-[96rem] sm:px-6 lg:px-8">
      <div className="mb-8 sm:flex sm:items-center sm:justify-between">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold text-gray-800 md:text-3xl dark:text-gray-100">
            Edit Practice: {data.practice.name}
          </h1>
        </div>
      </div>

      <PracticeConfigForm
        practice={data.practice}
        attributes={data.attributes}
        staff={data.staff}
        allTemplates={data.allTemplates}
      />
    </div>
  );
}
