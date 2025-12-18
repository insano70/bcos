'use client';

import { Card } from '@/components/ui/card';
import BusinessHoursEditor from '@/components/business-hours-editor';
import type { BusinessHours } from '@/lib/types/practice';
import { DEFAULT_BUSINESS_HOURS } from '@/lib/constants/practice';

interface BusinessHoursSectionProps {
  businessHours: BusinessHours;
  onChange: (hours: BusinessHours) => void;
}

export function BusinessHoursSection({ businessHours, onChange }: BusinessHoursSectionProps) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Business Hours
      </h2>

      <BusinessHoursEditor
        businessHours={businessHours || DEFAULT_BUSINESS_HOURS}
        onChange={onChange}
        label="Practice Hours"
      />
    </Card>
  );
}
