'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useEffect, useState, useId } from 'react';
import { useUpdateTableMetadata } from '@/lib/hooks/use-data-explorer';
import type { TableMetadata } from '@/lib/types/data-explorer';
import Toast from './toast';

interface EditTableMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tableMetadata: TableMetadata | null;
}

export default function EditTableMetadataModal({
  isOpen,
  onClose,
  onSuccess,
  tableMetadata,
}: EditTableMetadataModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [rowMeaning, setRowMeaning] = useState('');
  const [tier, setTier] = useState<1 | 2 | 3>(3);
  const [sampleQuestions, setSampleQuestions] = useState('');
  const [commonFilters, setCommonFilters] = useState('');
  const [showToast, setShowToast] = useState(false);

  const updateMetadata = useUpdateTableMetadata();

  const displayNameId = useId();
  const descriptionId = useId();
  const rowMeaningId = useId();
  const tierId = useId();
  const sampleQuestionsId = useId();
  const commonFiltersId = useId();

  useEffect(() => {
    if (tableMetadata && isOpen) {
      setDisplayName(tableMetadata.display_name || '');
      setDescription(tableMetadata.description || '');
      setRowMeaning(tableMetadata.row_meaning || '');
      setTier(tableMetadata.tier);
      setSampleQuestions(tableMetadata.sample_questions?.join('\n') || '');
      setCommonFilters(tableMetadata.common_filters?.join(', ') || '');
    }
  }, [tableMetadata, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tableMetadata) return;

    try {
      await updateMetadata.mutateAsync({
        id: tableMetadata.table_metadata_id,
        data: {
          ...(displayName && { display_name: displayName }),
          ...(description && { description: description }),
          ...(rowMeaning && { row_meaning: rowMeaning }),
          tier: tier,
          ...(sampleQuestions && {
            sample_questions: sampleQuestions.split('\n').filter((q) => q.trim()),
          }),
          ...(commonFilters && {
            common_filters: commonFilters.split(',').map((f) => f.trim()).filter(Boolean),
          }),
        },
      });

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
  };

  const handleClose = () => {
    if (!updateMetadata.isPending) {
      onClose();
    }
  };

  if (!tableMetadata) return null;

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
              {/* Modal header */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    Edit Table Metadata
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
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {tableMetadata.schema_name}.{tableMetadata.table_name}
                </p>
              </div>

              {/* Modal body */}
              <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4">
                <div className="space-y-4">
                  {/* Display Name */}
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
                      placeholder="Friendly name for this table"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label htmlFor={descriptionId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id={descriptionId}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="form-textarea w-full"
                      placeholder="What data does this table contain? This helps the AI understand context."
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Be specific about what each row represents and what business domain it covers.
                    </p>
                  </div>

                  {/* Row Meaning */}
                  <div>
                    <label htmlFor={rowMeaningId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Row Meaning
                    </label>
                    <input
                      type="text"
                      id={rowMeaningId}
                      value={rowMeaning}
                      onChange={(e) => setRowMeaning(e.target.value)}
                      className="form-input w-full"
                      placeholder="e.g., 'Each row represents a patient visit'"
                    />
                  </div>

                  {/* Tier */}
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
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Tier 1 tables are prioritized for AI SQL generation
                    </p>
                  </div>

                  {/* Sample Questions */}
                  <div>
                    <label htmlFor={sampleQuestionsId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sample Questions
                    </label>
                    <textarea
                      id={sampleQuestionsId}
                      value={sampleQuestions}
                      onChange={(e) => setSampleQuestions(e.target.value)}
                      rows={4}
                      className="form-textarea w-full"
                      placeholder={'Enter example questions, one per line:\nWhat is total revenue for January 2024?\nShow me patient visit trends by month\nWhich providers have the highest volume?'}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      One question per line. These help guide users on what to ask.
                    </p>
                  </div>

                  {/* Common Filters */}
                  <div>
                    <label htmlFor={commonFiltersId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Common Filters
                    </label>
                    <input
                      type="text"
                      id={commonFiltersId}
                      value={commonFilters}
                      onChange={(e) => setCommonFilters(e.target.value)}
                      className="form-input w-full"
                      placeholder="practice_uid, date_index, measure, frequency"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Comma-separated list of commonly filtered columns
                    </p>
                  </div>
                </div>

                {/* Modal footer */}
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 mt-6 -mx-4 sm:-mx-6 -mb-4">
                  <div className="flex flex-wrap justify-end space-x-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={updateMetadata.isPending}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateMetadata.isPending || !description.trim()}
                      className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updateMetadata.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>

                {updateMetadata.error && (
                  <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                    Error: {updateMetadata.error.message}
                  </div>
                )}
              </form>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Success Toast */}
      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Table metadata updated successfully
      </Toast>
    </>
  );
}
