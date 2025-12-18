'use client';

import { useState } from 'react';
import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import { FormLabel } from '@/components/ui/form-label';
import type { PracticeFormData } from '../types';

interface RatingsIntegrationSectionProps {
  register: UseFormRegister<PracticeFormData>;
  errors: FieldErrors<PracticeFormData>;
  watch: UseFormWatch<PracticeFormData>;
  setValue: UseFormSetValue<PracticeFormData>;
  uid: string;
}

export function RatingsIntegrationSection({
  register,
  errors,
  watch,
  setValue: _setValue,
  uid,
}: RatingsIntegrationSectionProps) {
  const ratingsEnabled = watch('ratings_feed_enabled') as boolean;
  const practiceSlug = watch('practice_slug') as string | undefined;
  const [testingSlug, setTestingSlug] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: { responseCount: number; scoreValue: number };
  } | null>(null);

  const handleTestConnection = async () => {
    if (!practiceSlug) {
      setTestResult({
        success: false,
        message: 'Please enter a practice slug first',
      });
      return;
    }

    setTestingSlug(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/clinect/ratings/${practiceSlug}`);

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: 'Connection successful! Ratings data found.',
          data: {
            responseCount: data.data.response_count,
            scoreValue: data.data.score_value,
          },
        });
      } else {
        setTestResult({
          success: false,
          message: 'Could not find ratings for this slug. Please verify with Clinect.',
        });
      }
    } catch (_error) {
      setTestResult({
        success: false,
        message: 'Connection failed. Please check your network connection.',
      });
    } finally {
      setTestingSlug(false);
    }
  };

  return (
    <Card radius="lg">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Ratings Integration
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Display live patient ratings and reviews from Clinect on your practice website.
        </p>
      </div>

      {/* Enable Toggle */}
      <div className="mb-6">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('ratings_feed_enabled')}
            className="w-5 h-5 text-violet-500 border-gray-300 rounded focus:ring-violet-500 dark:border-gray-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable Clinect Ratings Feed
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Show live ratings and reviews from verified patients
            </p>
          </div>
        </label>
      </div>

      {/* Practice Slug Field (only shown when enabled) */}
      {ratingsEnabled && (
        <div className="space-y-4 border-t pt-6 dark:border-gray-700">
          <div>
            <FormLabel htmlFor={`practice-slug-${uid}`} required className="mb-2">
              Practice Slug
            </FormLabel>
            <input
              type="text"
              id={`practice-slug-${uid}`}
              {...register('practice_slug')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
              placeholder="e.g., michelle-wands"
            />
            {errors.practice_slug && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.practice_slug.message}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              This slug is provided by Clinect and uniquely identifies your practice in their
              system. Must contain only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {/* Test Connection Button */}
          <div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!practiceSlug || testingSlug}
              className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed dark:disabled:bg-gray-600 dark:focus:ring-offset-gray-800"
            >
              {testingSlug ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-4 rounded-lg ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  testResult.success
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-red-800 dark:text-red-300'
                }`}
              >
                {testResult.message}
              </p>
              {testResult.success && testResult.data && (
                <div className="mt-2 text-xs text-green-700 dark:text-green-400">
                  <p>Reviews: {testResult.data.responseCount}</p>
                  <p>Score: {testResult.data.scoreValue}/100</p>
                </div>
              )}
            </div>
          )}

          {/* Warning Message */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Enabling Clinect ratings will replace any local reviews you have configured.
                  Your local reviews will remain in the database and can be restored by
                  disabling this feature.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

