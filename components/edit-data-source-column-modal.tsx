'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { useUpdateDataSourceColumn, type DataSourceColumn, type DataSourceColumnUpdateInput } from '@/lib/hooks/use-data-sources';
import Toast from './toast';

interface EditDataSourceColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  column: DataSourceColumn | null;
  dataSourceId: number;
}

type UpdateColumnForm = DataSourceColumnUpdateInput;

export default function EditDataSourceColumnModal({
  isOpen,
  onClose,
  onSuccess,
  column,
  dataSourceId
}: EditDataSourceColumnModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Always call the hook - hooks must be called in the same order every render
  const updateColumnMutation = useUpdateDataSourceColumn(dataSourceId, column?.column_id || 0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<UpdateColumnForm>({
    // TODO: Add zodResolver once schema types are aligned with interface types
  });

  // Populate form when column changes
  useEffect(() => {
    if (column && isOpen) {
      setValue('display_name', column.display_name);
      setValue('column_description', column.column_description || '');
      setValue('is_filterable', column.is_filterable || false);
      setValue('is_groupable', column.is_groupable || false);
      setValue('is_measure', column.is_measure || false);
      setValue('is_dimension', column.is_dimension || false);
      setValue('is_date_field', column.is_date_field || false);
      setValue('is_measure_type', column.is_measure_type || false);
      setValue('is_time_period', column.is_time_period || false);
      setValue('format_type', column.format_type || undefined);
      setValue('sort_order', column.sort_order || 0);
      setValue('default_aggregation', column.default_aggregation || undefined);
      setValue('is_sensitive', column.is_sensitive || false);
      setValue('access_level', column.access_level || 'all');
      setValue('example_value', column.example_value || undefined);
      setValue('is_active', column.is_active ?? true);
      setValue('display_icon', column.display_icon || false);
      setValue('icon_type', (column.icon_type as 'initials' | 'first_letter' | 'emoji' | undefined) || undefined);
      setValue('icon_color_mode', (column.icon_color_mode as 'auto' | 'fixed' | 'mapped' | undefined) || 'auto');
      setValue('icon_color', column.icon_color || undefined);
    }
  }, [column, isOpen, setValue]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: UpdateColumnForm) => {
    if (!column || !column.column_id) {
      setToastMessage('No column selected for update');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsSubmitting(true);

    try {
      await updateColumnMutation.mutateAsync(data);

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
      // Log client-side column update errors for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating column:', error);
      }
      setToastMessage(error instanceof Error ? error.message : 'Failed to update column');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Transition appear show={isOpen}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-xl">
                  {/* Modal header */}
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                        Edit Data Source Column
                      </h2>
                      <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <span className="sr-only">Close</span>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Modal body */}
                  <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4">
                    <div className="space-y-4">
                      {/* Column Info Display */}
                      {column && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-3">
                          <div className="text-sm">
                            <div className="font-medium text-gray-800 dark:text-gray-100">
                              {column.column_name}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400 mt-1">
                              {column.data_type} • {column.is_active ? 'Active' : 'Inactive'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Display Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Display Name *
                        </label>
                        <input
                          type="text"
                          {...register('display_name')}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.display_name
                              ? 'border-red-500 focus:border-red-500'
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                          placeholder="e.g., User ID, Order Total"
                        />
                        {errors.display_name && (
                          <p className="mt-1 text-sm text-red-500">{errors.display_name.message}</p>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Description
                        </label>
                        <textarea
                          {...register('column_description')}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500"
                          placeholder="Optional description of what this column contains"
                        />
                      </div>

                      {/* Column Functionality */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Column Functionality
                        </label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <input
                              id="edit_is_filterable"
                              type="checkbox"
                              {...register('is_filterable')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_filterable" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Filterable - Can be used in filters
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_groupable"
                              type="checkbox"
                              {...register('is_groupable')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_groupable" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Groupable - Can be used for grouping
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_measure"
                              type="checkbox"
                              {...register('is_measure')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_measure" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Measure - Numeric value for calculations
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_dimension"
                              type="checkbox"
                              {...register('is_dimension')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_dimension" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Dimension - Category for grouping
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_date_field"
                              type="checkbox"
                              {...register('is_date_field')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_date_field" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Date Field - Contains date/time values
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_measure_type"
                              type="checkbox"
                              {...register('is_measure_type')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_measure_type" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Measure Type - Contains formatting information (currency, count, etc.)
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_time_period"
                              type="checkbox"
                              {...register('is_time_period')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_time_period" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Time Period - Contains frequency/period values (Monthly, Weekly, etc.)
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Icon Display Options */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Table Icon Display (for Table charts)
                        </label>
                        <div className="space-y-3">
                          <div className="flex items-center">
                            <input
                              id="edit_display_icon"
                              type="checkbox"
                              {...register('display_icon')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_display_icon" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Display Icon - Show colored icon in first column of table charts
                            </label>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Icon Type
                            </label>
                            <select
                              {...register('icon_type')}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500"
                            >
                              <option value="">None</option>
                              <option value="initials">Initials (e.g., "MCF" for "Missing Consent Forms")</option>
                              <option value="first_letter">First Letter (e.g., "M" for "Missing Consent Forms")</option>
                              <option value="emoji">Emoji (requires icon mapping configuration)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Icon Color Mode
                            </label>
                            <select
                              {...register('icon_color_mode')}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500"
                            >
                              <option value="auto">Auto - Generate color from text</option>
                              <option value="fixed">Fixed - Use same color for all values</option>
                              <option value="mapped">Mapped - Per-value color mapping (requires icon mapping)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Fixed Icon Color (if using Fixed mode)
                            </label>
                            <input
                              type="text"
                              {...register('icon_color')}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500"
                              placeholder="e.g., violet-500, red-500, green-500"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Tailwind color classes: violet-500, sky-500, green-500, red-500, amber-500, indigo-500, etc.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Security Settings */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Security & Access
                        </label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <input
                              id="edit_is_sensitive"
                              type="checkbox"
                              {...register('is_sensitive')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_sensitive" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Sensitive Data - Requires additional permissions
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="edit_is_active"
                              type="checkbox"
                              {...register('is_active')}
                              className="form-checkbox"
                            />
                            <label htmlFor="edit_is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Active - Column is available for use
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Sort Order */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          {...register('sort_order', { valueAsNumber: true })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500"
                          placeholder="0"
                          min="0"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Lower numbers appear first in the column list
                        </p>
                      </div>
                    </div>

                    {/* Modal footer */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? 'Updating...' : 'Update Column'}
                      </button>
                    </div>
                  </form>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Toast Notification */}
      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Column updated successfully!
      </Toast>
    </>
  );
}
