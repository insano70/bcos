'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState, useId } from 'react';
import { apiClient } from '@/lib/api/client';
import Toast from './toast';

interface CreateTableMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTableMetadataModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTableMetadataModalProps) {
  const [schemaName, setSchemaName] = useState('ih');
  const [tableName, setTableName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<1 | 2 | 3>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schemaNameId = useId();
  const tableNameId = useId();
  const displayNameId = useId();
  const descriptionId = useId();
  const tierId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient.post('/api/data/explorer/metadata/tables', {
        schema_name: schemaName,
        table_name: tableName,
        display_name: displayName || undefined,
        description: description || undefined,
        tier,
      });

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        resetForm();
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table metadata');
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSchemaName('ih');
    setTableName('');
    setDisplayName('');
    setDescription('');
    setTier(3);
    setError(null);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

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
            <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    Add Table Metadata
                  </Dialog.Title>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    onClick={handleClose}
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor={schemaNameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Schema Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id={schemaNameId}
                        value={schemaName}
                        onChange={(e) => setSchemaName(e.target.value)}
                        className="form-input w-full"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor={tableNameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Table Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id={tableNameId}
                        value={tableName}
                        onChange={(e) => setTableName(e.target.value)}
                        className="form-input w-full"
                        placeholder="e.g., my_custom_table"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor={displayNameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      id={displayNameId}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="form-input w-full"
                      placeholder="Friendly name"
                    />
                  </div>

                  <div>
                    <label htmlFor={descriptionId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      id={descriptionId}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="form-textarea w-full"
                      placeholder="What data does this table contain?"
                    />
                  </div>

                  <div>
                    <label htmlFor={tierId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tier
                    </label>
                    <select
                      id={tierId}
                      value={tier}
                      onChange={(e) => setTier(Number(e.target.value) as 1 | 2 | 3)}
                      className="form-select w-full"
                    >
                      <option value={1}>Tier 1 - Core (Most Important)</option>
                      <option value={2}>Tier 2 - Secondary</option>
                      <option value={3}>Tier 3 - Auxiliary</option>
                    </select>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 mt-6 -mx-4 sm:-mx-6 -mb-4">
                  <div className="flex flex-wrap justify-end space-x-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !tableName.trim()}
                      className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Creating...' : 'Create Table Metadata'}
                    </button>
                  </div>
                </div>
              </form>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Table metadata created successfully
      </Toast>
    </>
  );
}

