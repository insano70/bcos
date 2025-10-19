'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { PracticeFormData } from '../types';

interface ContentSectionProps {
  register: UseFormRegister<PracticeFormData>;
  errors: FieldErrors<PracticeFormData>;
  uid: string;
}

export function ContentSection({ register, errors, uid }: ContentSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Website Content
      </h2>

      <div className="space-y-6">
        <div>
          <label
            htmlFor={`${uid}-welcome_message`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Welcome Message
          </label>
          <input
            type="text"
            id={`${uid}-welcome_message`}
            {...register('welcome_message')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.welcome_message ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Welcome to our rheumatology practice"
          />
          {errors.welcome_message && <p className="mt-1 text-sm text-red-600">{errors.welcome_message.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-about_text`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            About Text
          </label>
          <textarea
            id={`${uid}-about_text`}
            {...register('about_text')}
            rows={4}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.about_text ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Describe your practice, experience, and approach to care..."
          />
          {errors.about_text && <p className="mt-1 text-sm text-red-600">{errors.about_text.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-mission_statement`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Mission Statement
          </label>
          <textarea
            id={`${uid}-mission_statement`}
            {...register('mission_statement')}
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.mission_statement ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Your practice's mission and values..."
          />
          {errors.mission_statement && <p className="mt-1 text-sm text-red-600">{errors.mission_statement.message}</p>}
        </div>
      </div>
    </div>
  );
}
