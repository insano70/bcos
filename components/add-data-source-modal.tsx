'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { useCreateDataSource, type CreateDataSourceData } from '@/lib/hooks/use-data-sources';
import Toast from './toast';

interface CreateDataSourceForm {
  data_source_name: string;
  data_source_description: string;
  table_name: string;
  schema_name: string;
  database_type: string;
  is_active: boolean;
  requires_auth: boolean;
}

interface AddDataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddDataSourceModal({ isOpen, onClose, onSuccess }: AddDataSourceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const createDataSourceMutation = useCreateDataSource();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<CreateDataSourceForm>({
    defaultValues: {
      data_source_name: '',
      data_source_description: '',
      table_name: '',
      schema_name: '',
      database_type: 'postgresql',
      is_active: true,
      requires_auth: true,
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateDataSourceForm) => {
    setIsSubmitting(true);
    
    try {
      const createData: CreateDataSourceData = {
        data_source_name: data.data_source_name,
        data_source_description: data.data_source_description.trim() || undefined,
        table_name: data.table_name,
        schema_name: data.schema_name,
        database_type: data.database_type,
        is_active: data.is_active,
        requires_auth: data.requires_auth,
      };

      const result = await createDataSourceMutation.mutateAsync(createData);
      
      setToastMessage(`Data source "${result.data_source_name}" created successfully!`);
      setToastType('success');
      setShowToast(true);
      
      // Wait a moment to show success message before closing
      setTimeout(() => {
        reset();
        onSuccess?.();
        onClose();
      }, 1000);
      
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Failed to create data source');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formData = watch();

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
                        Add Data Source
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
                      {/* Data Source Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Data Source Name *
                        </label>
                        <input
                          type="text"
                          {...register('data_source_name')}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.data_source_name 
                              ? 'border-red-500 focus:border-red-500' 
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                          placeholder="Enter a descriptive name for the data source"
                        />
                        {errors.data_source_name && (
                          <p className="mt-1 text-sm text-red-500">{errors.data_source_name.message}</p>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Description
                        </label>
                        <textarea
                          {...register('data_source_description')}
                          rows={3}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.data_source_description 
                              ? 'border-red-500 focus:border-red-500' 
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                          placeholder="Optional description of what this data source contains"
                        />
                        {errors.data_source_description && (
                          <p className="mt-1 text-sm text-red-500">{errors.data_source_description.message}</p>
                        )}
                      </div>

                      {/* Database Configuration */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Schema Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Schema Name *
                          </label>
                          <input
                            type="text"
                            {...register('schema_name')}
                            className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                              errors.schema_name 
                                ? 'border-red-500 focus:border-red-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                            }`}
                            placeholder="e.g., ih, public"
                          />
                          {errors.schema_name && (
                            <p className="mt-1 text-sm text-red-500">{errors.schema_name.message}</p>
                          )}
                        </div>

                        {/* Table Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Table Name *
                          </label>
                          <input
                            type="text"
                            {...register('table_name')}
                            className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                              errors.table_name 
                                ? 'border-red-500 focus:border-red-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                            }`}
                            placeholder="e.g., agg_app_measures"
                          />
                          {errors.table_name && (
                            <p className="mt-1 text-sm text-red-500">{errors.table_name.message}</p>
                          )}
                        </div>
                      </div>

                      {/* Database Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Database Type
                        </label>
                        <select
                          {...register('database_type')}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            errors.database_type 
                              ? 'border-red-500 focus:border-red-500' 
                              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                          }`}
                        >
                          <option value="postgresql">PostgreSQL</option>
                          <option value="mysql">MySQL</option>
                          <option value="sqlite">SQLite</option>
                          <option value="mariadb">MariaDB</option>
                        </select>
                        {errors.database_type && (
                          <p className="mt-1 text-sm text-red-500">{errors.database_type.message}</p>
                        )}
                      </div>

                      {/* Settings */}
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <input
                            id="is_active"
                            type="checkbox"
                            {...register('is_active')}
                            className="form-checkbox"
                          />
                          <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Active
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            id="requires_auth"
                            type="checkbox"
                            {...register('requires_auth')}
                            className="form-checkbox"
                          />
                          <label htmlFor="requires_auth" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Requires Authentication
                          </label>
                        </div>
                      </div>

                      {/* Current Table Preview */}
                      {formData.schema_name && formData.table_name && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                Table Reference Preview
                              </p>
                              <p className="text-sm text-blue-700 dark:text-blue-300 font-mono">
                                {formData.schema_name}.{formData.table_name}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
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
                        {isSubmitting ? 'Creating...' : 'Create Data Source'}
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
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </>
  );
}
