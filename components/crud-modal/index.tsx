'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import Toast from '../toast';
import FieldRenderer from './field-renderer';
import type { CrudModalProps } from './types';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Button } from '@/components/ui/button';

const sizeClasses = {
  sm: 'max-w-sm',     // 384px
  md: 'max-w-md',     // 448px
  lg: 'max-w-lg',     // 512px
  xl: 'max-w-xl',     // 576px
  '2xl': 'max-w-2xl', // 672px
  '3xl': 'max-w-3xl', // 768px
  '4xl': 'max-w-4xl', // 896px
  '5xl': 'max-w-5xl', // 1024px
  '6xl': 'max-w-6xl', // 1152px
  '7xl': 'max-w-7xl', // 1280px
};

export default function CrudModal<TFormData extends FieldValues = FieldValues, TEntity = unknown>({
  mode,
  entity,
  title,
  resourceName,
  isOpen,
  onClose,
  onSuccess,
  schema,
  defaultValues,
  fields,
  onSubmit,
  size = 'md',
  submitButtonText,
  cancelButtonText = 'Cancel',
  beforeSubmit,
  afterSuccess,
  showSuccessToast = true,
  successMessage,
}: CrudModalProps<TFormData, TEntity>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Store defaultValues in a ref to avoid triggering effects on every render
  const defaultValuesRef = useRef(defaultValues);
  useEffect(() => {
    defaultValuesRef.current = defaultValues;
  }, [defaultValues]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<TFormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: defaultValues as never,
  });

  // Populate form when entity data changes (edit mode)
  useEffect(() => {
    if (mode === 'edit' && entity && isOpen) {
      // Reset form with entity data to ensure clean state
      reset(entity as never);
      // Clear any previous error state when opening modal
      setShowErrorToast(false);
      setErrorMessage('');
    } else if (mode === 'create' && isOpen) {
      // Reset to default values when opening in create mode
      reset(defaultValuesRef.current as never);
      // Clear any previous error state when opening modal
      setShowErrorToast(false);
      setErrorMessage('');
    }
  }, [entity, isOpen, mode, reset]);

  const handleFormSubmit = async (data: TFormData) => {
    setIsSubmitting(true);

    try {
      // Apply transform if provided
      const submittedData = beforeSubmit ? beforeSubmit(data) : data;

      // Call the provided submit handler
      await onSubmit(submittedData);

      // Show success toast (will remain visible after modal closes)
      if (showSuccessToast) {
        setShowToast(true);
        // Auto-hide toast after 3 seconds
        setTimeout(() => setShowToast(false), 3000);
      }

      // Close modal immediately for snappy UX
      reset();
      onClose();

      // Trigger callbacks (like refetch) immediately
      // These will update the page in the background
      onSuccess?.();
      afterSuccess?.();
    } catch (error) {
      // Extract user-friendly error message and display to user
      let message = `Failed to ${mode === 'create' ? 'create' : 'update'} ${resourceName}`;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }
      
      // Show error toast to user
      setErrorMessage(message);
      setShowErrorToast(true);
      // Auto-hide error toast after 5 seconds
      setTimeout(() => setShowErrorToast(false), 5000);
      
      // Log for debugging
      clientErrorLog(`Error ${mode === 'create' ? 'creating' : 'updating'} ${resourceName}:`, error);
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

  // Get current form values for visibility checks
  const formValues = watch();

  // Filter fields by visibility first
  const visibleFields = fields.filter((field) => {
    if (field.visible === undefined) return true;
    if (typeof field.visible === 'function') {
      return field.visible(formValues as never);
    }
    return field.visible;
  });

  // Separate full-width from left/right column fields
  const fullWidthFields = visibleFields.filter((f) => !f.column || f.column === 'full');
  const leftColumnFields = visibleFields.filter((f) => f.column === 'left');
  const rightColumnFields = visibleFields.filter((f) => f.column === 'right');
  const hasTwoColumnLayout = leftColumnFields.length > 0 || rightColumnFields.length > 0;

  // Default submit button text
  const defaultSubmitText = mode === 'create'
    ? `Create ${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}`
    : `Update ${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}`;

  const finalSubmitText = submitButtonText || defaultSubmitText;

  // Default success message
  const defaultSuccessMessage = mode === 'create'
    ? `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} created successfully!`
    : `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} updated successfully!`;

  const finalSuccessMessage = successMessage || defaultSuccessMessage;

  return (
    <>
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
            <DialogPanel
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden ${sizeClasses[size]} w-full max-h-full`}
            >
              {/* Modal header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
                <div className="flex justify-between items-center">
                  <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    {title}
                  </Dialog.Title>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Close"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="p-0"
                  >
                    <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                      <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                    </svg>
                  </Button>
                </div>
              </div>

              {/* Modal content */}
              <div className="px-6 py-6 max-h-[calc(100vh-16rem)] overflow-y-auto">
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
                  {/* Render full-width fields first */}
                  {fullWidthFields.map((field) => (
                    <FieldRenderer
                      key={String(field.name)}
                      field={field}
                      register={register}
                      errors={errors}
                      watch={watch}
                      setValue={setValue}
                      isSubmitting={isSubmitting}
                    />
                  ))}

                  {/* Render two-column layout if we have left/right fields */}
                  {hasTwoColumnLayout && (
                    <div className="grid grid-cols-2 gap-6">
                      {/* Left column */}
                      <div className="space-y-6">
                        {leftColumnFields.map((field) => (
                          <FieldRenderer
                            key={String(field.name)}
                            field={field}
                            register={register}
                            errors={errors}
                            watch={watch}
                            setValue={setValue}
                            isSubmitting={isSubmitting}
                          />
                        ))}
                      </div>

                      {/* Right column */}
                      <div className="space-y-6">
                        {rightColumnFields.map((field) => (
                          <FieldRenderer
                            key={String(field.name)}
                            field={field}
                            register={register}
                            errors={errors}
                            watch={watch}
                            setValue={setValue}
                            isSubmitting={isSubmitting}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="secondary"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    {cancelButtonText}
                  </Button>
                  <Button
                    variant="blue"
                    onClick={handleSubmit(handleFormSubmit)}
                    loading={isSubmitting}
                    loadingText={`${mode === 'create' ? 'Creating' : 'Updating'}...`}
                  >
                    {finalSubmitText}
                  </Button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Success Toast */}
      {showSuccessToast && (
        <Toast
          type="success"
          open={showToast}
          setOpen={setShowToast}
          className="fixed bottom-4 right-4 z-[60]"
        >
          {finalSuccessMessage}
        </Toast>
      )}

      {/* Error Toast */}
      <Toast
        type="error"
        open={showErrorToast}
        setOpen={setShowErrorToast}
        className="fixed bottom-4 right-4 z-[60]"
      >
        {errorMessage}
      </Toast>
    </>
  );
}
