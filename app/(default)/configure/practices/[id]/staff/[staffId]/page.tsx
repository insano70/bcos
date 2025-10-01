export const metadata = {
  title: 'Edit Staff Member - BCOS',
  description: 'Edit practice staff member information',
};

import { and, eq, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import StaffMemberForm from '@/components/staff-member-form';
import { db, practices, staff_members } from '@/lib/db';
import { transformStaffMember } from '@/lib/types/transformers';

async function getStaffMemberData(practiceId: string, staffId: string) {
  // Verify practice exists
  const [practice] = await db
    .select()
    .from(practices)
    .where(and(eq(practices.practice_id, practiceId), isNull(practices.deleted_at)))
    .limit(1);

  if (!practice) return null;

  // Get staff member
  const [staffMember] = await db
    .select()
    .from(staff_members)
    .where(
      and(
        eq(staff_members.staff_id, staffId),
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      )
    )
    .limit(1);

  if (!staffMember) return null;

  return {
    practice: {
      practice_id: practice.practice_id,
      name: practice.name,
      domain: practice.domain,
    },
    staffMember: transformStaffMember(staffMember),
  };
}

export default async function EditStaffMemberPage({
  params,
}: {
  params: Promise<{ id: string; staffId: string }>;
}) {
  const { id: practiceId, staffId } = await params;
  const data = await getStaffMemberData(practiceId, staffId);

  if (!data) {
    notFound();
  }

  return (
    <div className="px-4 py-8 mx-auto w-full max-w-[96rem] sm:px-6 lg:px-8">
      <div className="mb-8 sm:flex sm:items-center sm:justify-between">
        <div className="mb-4 sm:mb-0">
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-2">
              <li className="inline-flex items-center">
                <a
                  href="/configure/practices"
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Practices
                </a>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <a
                    href={`/configure/practices/${practiceId}`}
                    className="ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 md:ml-2"
                  >
                    {data.practice.name}
                  </a>
                </div>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="ml-1 text-gray-400 md:ml-2">Edit Staff Member</span>
                </div>
              </li>
            </ol>
          </nav>
          <h1 className="text-2xl font-bold text-gray-800 md:text-3xl dark:text-gray-100">
            Edit Staff Member: {data.staffMember.name}
          </h1>
        </div>
      </div>

      <StaffMemberForm practiceId={practiceId} staffMember={data.staffMember} mode="edit" />
    </div>
  );
}
