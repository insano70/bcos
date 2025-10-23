'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import Toast from '@/components/toast';
import type { Template } from '@/lib/hooks/use-templates';
import type {
  Practice,
  PracticeAttributes,
  StaffMember,
  BusinessHours,
} from '@/lib/types/practice';
import { DEFAULT_BUSINESS_HOURS } from '@/lib/constants/practice';
import { PracticeInfoSection } from './sections/practice-info-section';
import { ContactInfoSection } from './sections/contact-info-section';
import { ContentSection } from './sections/content-section';
import { ServicesConditionsSection } from './sections/services-conditions-section';
import { BusinessHoursSection } from './sections/business-hours-section';
import { BrandingSection } from './sections/branding-section';
import { StaffSection } from './sections/staff-section';
import { SEOSection } from './sections/seo-section';
import type { PracticeFormData } from './types';
import { usePracticeConfigForm } from './hooks/use-practice-config-form';
import { usePracticeMutations } from './hooks/use-practice-mutations';

interface PracticeConfigFormProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  allTemplates: Template[];
}

export default function PracticeConfigForm({
  practice,
  attributes: initialAttributes,
  allTemplates,
}: PracticeConfigFormProps) {
  const practiceId = practice.practice_id;
  const queryClient = useQueryClient();
  const uid = useId();

  // Toast state
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Use custom hooks for form management and mutations
  const { form, isLoading, currentPractice, setCurrentPractice } = usePracticeConfigForm({
    practice,
    initialAttributes,
  });

  const { mutateAsync, isPending } = usePracticeMutations({
    practiceId,
    currentPracticeName: currentPractice.name,
    currentTemplateId: currentPractice.template_id,
    onSuccess: () => {
      // Update local practice state if name/template changed
      const formValues = form.getValues();
      if (
        formValues.name !== currentPractice.name ||
        formValues.template_id !== currentPractice.template_id
      ) {
        setCurrentPractice((prev) => ({
          ...prev,
          name: formValues.name,
          template_id: formValues.template_id,
        }));
      }

      // Show success toast
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    },
    onError: (error) => {
      // Show error toast
      setErrorMessage(error.message || 'Failed to update practice settings');
      setShowErrorToast(true);
      setTimeout(() => setShowErrorToast(false), 5000);
    },
  });

  const onSubmit = async (data: PracticeFormData) => {
    await mutateAsync(data);
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = form;

  const handlePreview = () => {
    // Open preview in new tab
    window.open(`/template-preview/${practiceId}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-3 text-gray-600">Loading practice configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Practice Configuration
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure your practice information and website content
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Practice Info Section */}
        <PracticeInfoSection
          register={register}
          errors={errors}
          allTemplates={allTemplates}
          uid={uid}
        />

        {/* Branding Section */}
        <BrandingSection
          practiceId={practiceId}
          watch={watch}
          setValue={setValue}
          queryClient={queryClient}
          register={register}
        />

        {/* Contact Info Section */}
        <ContactInfoSection register={register} errors={errors} uid={uid} />

        {/* Content Section */}
        <ContentSection register={register} errors={errors} uid={uid} />

        {/* Services & Conditions Section */}
        <ServicesConditionsSection
          services={watch('services') || []}
          conditions={watch('conditions_treated') || []}
          onServicesChange={(services) => setValue('services', services, { shouldDirty: true })}
          onConditionsChange={(conditions) =>
            setValue('conditions_treated', conditions, { shouldDirty: true })
          }
        />

        {/* Business Hours Section */}
        <BusinessHoursSection
          businessHours={(watch('business_hours') || DEFAULT_BUSINESS_HOURS) as BusinessHours}
          onChange={(hours) => setValue('business_hours', hours, { shouldDirty: true })}
        />

        {/* Staff Section */}
        <StaffSection practiceId={practiceId} />

        {/* SEO Section */}
        <SEOSection register={register} errors={errors} uid={uid} />

        {/* Submit */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={handlePreview}
            className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>Preview Website</span>
          </button>

          <div className="flex space-x-4">
            <button
              type="button"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isDirty || isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>

      {/* Success Toast */}
      <Toast
        type="success"
        open={showSuccessToast}
        setOpen={setShowSuccessToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Practice configuration saved successfully!
      </Toast>

      {/* Error Toast */}
      <Toast
        type="error"
        open={showErrorToast}
        setOpen={setShowErrorToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {errorMessage}
      </Toast>
    </div>
  );
}
