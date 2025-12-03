'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-md w-full max-h-full">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Add New Practice
                </Dialog.Title>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-50"
                >
                  <div className="sr-only">Close</div>
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </button>
              </div>
            </div>

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
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {createPractice.error instanceof Error
                        ? createPractice.error.message
                        : 'An error occurred while creating the practice'}
                    </p>
                  </div>
                )}
              </form>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleSubmit(onSubmit)}
                  disabled={isSubmitting || templatesLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating Practice...' : 'Create Practice'}
                </button>
              </div>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      {/* Success Toast */}
      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Practice created successfully!
      </Toast>
    </Transition>
  );
}
