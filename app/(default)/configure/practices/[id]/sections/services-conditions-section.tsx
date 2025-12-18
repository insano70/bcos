'use client';

import { Card } from '@/components/ui/card';
import ServicesEditor from '@/components/services-editor';
import ConditionsEditor from '@/components/conditions-editor';

interface ServicesConditionsSectionProps {
  services: string[];
  conditions: string[];
  onServicesChange: (services: string[]) => void;
  onConditionsChange: (conditions: string[]) => void;
}

export function ServicesConditionsSection({
  services,
  conditions,
  onServicesChange,
  onConditionsChange,
}: ServicesConditionsSectionProps) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Services & Conditions
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ServicesEditor
          services={services}
          onChange={onServicesChange}
          label="Services Offered"
          placeholder="Enter service (e.g., Rheumatoid Arthritis Treatment)"
        />

        <ConditionsEditor
          conditions={conditions}
          onChange={onConditionsChange}
          label="Conditions Treated"
          placeholder="Enter condition (e.g., Lupus)"
        />
      </div>
    </Card>
  );
}
