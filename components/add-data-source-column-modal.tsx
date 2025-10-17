'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  type DataSourceColumnCreateInput,
  useCreateDataSourceColumn,
} from '@/lib/hooks/use-data-sources';
import Toast from './toast';

interface AddDataSourceColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  dataSourceId: number;
}

type CreateColumnForm = DataSourceColumnCreateInput;

export default function AddDataSourceColumnModal({
  isOpen,
  onClose,
  onSuccess,
  dataSourceId,
}: AddDataSourceColumnModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [_toastMessage, setToastMessage] = useState('');
  const [_toastType, setToastType] = useState<'success' | 'error'>('success');

  const createColumnMutation = useCreateDataSourceColumn(dataSourceId);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateColumnForm>({
    // TODO: Add zodResolver once schema types are aligned with interface types
    defaultValues: {
      data_source_id: dataSourceId,
      column_name: '',
      display_name: '',
      data_type: 'text',
      sort_order: 0,
      access_level: 'all',
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateColumnForm) => {
    setIsSubmitting(true);

    try {
      await createColumnMutation.mutateAsync({
        ...data,
        data_source_id: dataSourceId,
      });

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
      // Log client-side column creation errors for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating column:', error);
      }
      setToastMessage(error instanceof Error ? error.message : 'Failed to add column');
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
                        Add Data Source Column
                      </h2>
                      <button type="button" onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <span className="sr-only">Close</span>
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Modal body */}
                  <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4">
                    <div className="space-y-4">
                      {/* Column Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Column Name *
                        </label>
                        <input
                          type="text"
                          {...register('column_name', {
                            required: 'Column name is required',
                            pattern: {
                              value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
                              message:
                                'Column name must start with a letter and contain only letters, numbers, and underscores',
                            },
                          })}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.column_name
                              ? 'border-red-500 focus:border-red-500'
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                          placeholder="e.g., user_id, order_total"
                        />
                        {errors.column_name && (
                          <p className="mt-1 text-sm text-red-500">{errors.column_name.message}</p>
                        )}
                      </div>

                      {/* Display Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Display Name *
                        </label>
                        <input
                          type="text"
                          {...register('display_name', { required: 'Display name is required' })}
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

                      {/* Data Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Data Type *
                        </label>
                        <select
                          {...register('data_type', { required: 'Data type is required' })}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.data_type
                              ? 'border-red-500 focus:border-red-500'
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                        >
                          <option value="text">Text</option>
                          <option value="integer">Integer</option>
                          <option value="decimal">Decimal</option>
                          <option value="boolean">Boolean</option>
                          <option value="date">Date</option>
                          <option value="timestamp">Timestamp</option>
                          <option value="json">JSON</option>
                        </select>
                        {errors.data_type && (
                          <p className="mt-1 text-sm text-red-500">{errors.data_type.message}</p>
                        )}
                      </div>

                      {/* Column Functionality */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Column Functionality
                        </label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <input
                              id="add_is_filterable"
                              type="checkbox"
                              {...register('is_filterable')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_filterable"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Filterable - Can be used in filters
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_groupable"
                              type="checkbox"
                              {...register('is_groupable')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_groupable"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Groupable - Can be used for grouping
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_measure"
                              type="checkbox"
                              {...register('is_measure')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_measure"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Measure - Numeric value for calculations
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_dimension"
                              type="checkbox"
                              {...register('is_dimension')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_dimension"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Dimension - Category for grouping
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_date_field"
                              type="checkbox"
                              {...register('is_date_field')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_date_field"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Date Field - Contains date/time values
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_measure_type"
                              type="checkbox"
                              {...register('is_measure_type')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_measure_type"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Measure Type - Contains formatting information (currency, count, etc.)
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_time_period"
                              type="checkbox"
                              {...register('is_time_period')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_time_period"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Time Period - Contains frequency/period values (Monthly, Weekly, etc.)
                            </label>
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
                              id="add_is_sensitive"
                              type="checkbox"
                              {...register('is_sensitive')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_sensitive"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Sensitive Data - Requires additional permissions
                            </label>
                          </div>

                          <div className="flex items-center">
                            <input
                              id="add_is_active"
                              type="checkbox"
                              {...register('is_active')}
                              className="form-checkbox"
                            />
                            <label
                              htmlFor="add_is_active"
                              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              Active - Column is available for use
                            </label>
                          </div>
                        </div>
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
                        {isSubmitting ? 'Adding...' : 'Add Column'}
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
        Column added successfully!
      </Toast>
    </>
  );
}
