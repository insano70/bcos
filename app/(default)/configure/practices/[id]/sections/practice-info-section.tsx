'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { Template } from '@/lib/hooks/use-templates';
import type { PracticeFormData } from '../types';

interface PracticeInfoSectionProps {
  register: UseFormRegister<PracticeFormData>;
  errors: FieldErrors<PracticeFormData>;
  allTemplates: Template[];
  uid: string;
}

export function PracticeInfoSection({
  register,
  errors,
  allTemplates,
  uid,
}: PracticeInfoSectionProps) {
  return (
    <>
      {/* Practice Name */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
          Practice Information
        </h2>

        <div>
          <label
            htmlFor={`${uid}-name`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Practice Name *
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            {...register('name')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.name
                ? 'border-red-500 dark:border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Enter practice name"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>
      </div>

      {/* Template Selection */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
          Website Template
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor={`${uid}-template_id`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Choose Template Design
            </label>
            <select
              id={`${uid}-template_id`}
              {...register('template_id')}
              className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.template_id
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <option value="">Select a template...</option>
              {allTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.description}
                </option>
              ))}
            </select>
            {errors.template_id && (
              <p className="mt-1 text-sm text-red-600">{errors.template_id.message}</p>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> After saving, use the "Preview" button to see how your
              website looks with the new template.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
