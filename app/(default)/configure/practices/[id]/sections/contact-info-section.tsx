'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { PracticeFormData } from '../types';

interface ContactInfoSectionProps {
  register: UseFormRegister<PracticeFormData>;
  errors: FieldErrors<PracticeFormData>;
  uid: string;
}

export function ContactInfoSection({ register, errors, uid }: ContactInfoSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Contact Information
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor={`${uid}-phone`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Phone Number
          </label>
          <input
            type="tel"
            id={`${uid}-phone`}
            {...register('phone')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.phone ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="(555) 123-4567"
          />
          {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-email`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Email Address
          </label>
          <input
            type="email"
            id={`${uid}-email`}
            {...register('email')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="info@practice.com"
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-address_line1`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Address Line 1
          </label>
          <input
            type="text"
            id={`${uid}-address_line1`}
            {...register('address_line1')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.address_line1 ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="123 Medical Center Drive"
          />
          {errors.address_line1 && <p className="mt-1 text-sm text-red-600">{errors.address_line1.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-address_line2`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Address Line 2
          </label>
          <input
            type="text"
            id={`${uid}-address_line2`}
            {...register('address_line2')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.address_line2 ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Suite 200"
          />
          {errors.address_line2 && <p className="mt-1 text-sm text-red-600">{errors.address_line2.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-city`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            City
          </label>
          <input
            type="text"
            id={`${uid}-city`}
            {...register('city')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.city ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Denver"
          />
          {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-state`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            State
          </label>
          <input
            type="text"
            id={`${uid}-state`}
            {...register('state')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.state ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="CO"
          />
          {errors.state && <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>}
        </div>

        <div>
          <label
            htmlFor={`${uid}-zip_code`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            ZIP Code
          </label>
          <input
            type="text"
            id={`${uid}-zip_code`}
            {...register('zip_code')}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.zip_code ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="80202"
          />
          {errors.zip_code && <p className="mt-1 text-sm text-red-600">{errors.zip_code.message}</p>}
        </div>
      </div>
    </div>
  );
}
