'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorDisplay } from '@/components/error-display';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useCreatePractice } from '@/lib/hooks/use-practices';
import { useTemplates } from '@/lib/hooks/use-templates';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

// Form validation schema
const createPracticeSchema = z.object({
  name: z
    .string()
    .min(1, 'Practice name is required')
    .max(255, 'Practice name must not exceed 255 characters')
    .trim(),
  domain: z
    .string()
    .min(1, 'Domain is required')
    .max(255, 'Domain must not exceed 255 characters')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Domain must contain only letters, numbers, dots, and hyphens')
    .transform((val) => val.toLowerCase()),
  template_id: z.string().uuid('Invalid template ID'),
});

type CreatePracticeForm = z.infer<typeof createPracticeSchema>;

interface AddPracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddPracticeModal({ isOpen, onClose, onSuccess }: AddPracticeModalProps) {
  const nameId = useId();
  const domainId = useId();
  const templateId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const createPractice = useCreatePractice();
  const { data: templates, isLoading: templatesLoading } = useTemplates();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<CreatePracticeForm>({
    resolver: zodResolver(createPracticeSchema),
    defaultValues: {
      name: '',
      domain: '',
      template_id: '',
    },
  });

  // Pre-select Classic Professional template when templates load
  useEffect(() => {
    if (templates && templates.length > 0) {
      const classicTemplate = templates.find(
        (template) => template.slug === 'classic-professional'
      );
      if (classicTemplate) {
        setValue('template_id', classicTemplate.id);
      }
    }
  }, [templates, setValue]);

  const selectedTemplateId = watch('template_id');

  const onSubmit = async (data: CreatePracticeForm) => {
    setIsSubmitting(true);

    try {
      const practiceData = {
        name: data.name,
        domain: data.domain,
        template_id: data.template_id,
      };

      await createPractice.mutateAsync(practiceData);

      // Show success toast
      setShowToast(true);

      // Reset form and close modal after a brief delay to show toast
      setTimeout(() => {
        reset();
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      // Log client-side practice creation errors for debugging
      clientErrorLog('Error creating practice:', error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        title="Add New Practice"
        preventClose={isSubmitting}
      >
        {/* Modal content */}
        <div className="px-6 py-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Practice Name */}
                <div>
                  <label
                    htmlFor={nameId}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Practice Name *
                  </label>
                  <input
                    type="text"
                    id={nameId}
                    {...register('name')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.name
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter practice name"
                    disabled={isSubmitting}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Domain */}
                <div>
                  <label
                    htmlFor={domainId}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Domain *
                  </label>
                  <input
                    type="text"
                    id={domainId}
                    {...register('domain')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.domain
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter domain (e.g. my-practice-name)"
                    disabled={isSubmitting}
                  />
                  {errors.domain && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.domain.message}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This will be used for your practice website URL
                  </p>
                </div>

                {/* Template Selection */}
                <div>
                  <label
                    htmlFor={templateId}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Template *
                  </label>
                  <select
                    id={templateId}
                    {...register('template_id')}
                    disabled={isSubmitting || templatesLoading}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.template_id
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <option value="">
                      {templatesLoading ? 'Loading templates...' : 'Select a template'}
                    </option>
                    {templates?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {errors.template_id && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.template_id.message}
                    </p>
                  )}
                  {selectedTemplateId && templates && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {templates.find((t) => t.id === selectedTemplateId)?.description}
                    </p>
                  )}
                </div>

                {/* Error display */}
                {createPractice.error && (
                  <ErrorDisplay
                    variant="alert"
                    error={createPractice.error instanceof Error
                      ? createPractice.error.message
                      : 'An error occurred while creating the practice'}
                  />
                )}
              </form>
            </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="blue"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting || templatesLoading}
              loading={isSubmitting}
              loadingText="Creating Practice..."
            >
              Create Practice
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Toast */}
      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Practice created successfully!
      </Toast>
    </>
  );
}
