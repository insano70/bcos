'use client';

import { Card } from '@/components/ui/card';
import StaffListEmbedded from '@/components/staff-list-embedded';

interface StaffSectionProps {
  practiceId: string;
}

export function StaffSection({ practiceId }: StaffSectionProps) {
  return (
    <Card>
      <StaffListEmbedded practiceId={practiceId} />
    </Card>
  );
}
