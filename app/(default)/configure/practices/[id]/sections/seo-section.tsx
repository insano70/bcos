'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import type { PracticeFormData } from '../types';

interface SEOSectionProps {
  register: UseFormRegister<PracticeFormData>;
  errors: FieldErrors<PracticeFormData>;
  uid: string;
}

export function SEOSection({ register, errors, uid }: SEOSectionProps) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        SEO Settings
      </h2>

      <div className="space-y-6">
        <div>
          <label
            htmlFor={`${uid}-meta_title`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Meta Title
          </label>
          <input
            type="text"
            id={`${uid}-meta_title`}
            {...register('meta_title')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.meta_title ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Practice Name - Expert Rheumatology Care"
          />
          <FormError>{errors.meta_title?.message}</FormError>
        </div>

        <div>
          <label
            htmlFor={`${uid}-meta_description`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Meta Description
          </label>
          <textarea
            id={`${uid}-meta_description`}
            {...register('meta_description')}
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.meta_description ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Brief description for search engines (160 characters max)..."
            maxLength={160}
          />
          <FormError>{errors.meta_description?.message}</FormError>
        </div>
      </div>
    </Card>
  );
}
