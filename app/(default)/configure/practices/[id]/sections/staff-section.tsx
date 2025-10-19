'use client';

import StaffListEmbedded from '@/components/staff-list-embedded';

interface StaffSectionProps {
  practiceId: string;
}

export function StaffSection({ practiceId }: StaffSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
      <StaffListEmbedded practiceId={practiceId} />
    </div>
  );
}
