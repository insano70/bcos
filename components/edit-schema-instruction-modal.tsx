'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState, useEffect, useId } from 'react';
import { apiClient } from '@/lib/api/client';
import type { SchemaInstruction } from '@/lib/types/data-explorer';
import Toast from './toast';

interface EditSchemaInstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  instruction: SchemaInstruction | null;
}

export default function EditSchemaInstructionModal({
  isOpen,
  onClose,
  onSuccess,
  instruction,
}: EditSchemaInstructionModalProps) {
  const [title, setTitle] = useState('');
  const [instructionText, setInstructionText] = useState('');
  const [category, setCategory] = useState('filtering');
  const [priority, setPriority] = useState(2);
  const [exampleQuery, setExampleQuery] = useState('');
  const [exampleSQL, setExampleSQL] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const titleId = useId();
  const instructionId = useId();
  const categoryId = useId();
  const priorityId = useId();
  const exampleQueryId = useId();
  const exampleSQLId = useId();

  useEffect(() => {
    if (instruction && isOpen) {
      setTitle(instruction.title);
      setInstructionText(instruction.instruction);
      setCategory(instruction.category || 'filtering');
      setPriority(instruction.priority);
      setExampleQuery(instruction.example_query || '');
      setExampleSQL(instruction.example_sql || '');
    }
  }, [instruction, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction) return;

    setIsSubmitting(true);

    try {
      await apiClient.put(`/api/data/explorer/schema-instructions/${instruction.instruction_id}`, {
        title,
        instruction: instructionText,
        category,
        priority,
        example_query: exampleQuery || undefined,
        example_sql: exampleSQL || undefined,
      });

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to update instruction:', error);
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
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
                    Edit Schema Instruction
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
                  <div>
                    <label htmlFor={titleId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id={titleId}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="form-input w-full"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor={instructionId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Instruction <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id={instructionId}
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      rows={3}
                      className="form-textarea w-full"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor={categoryId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Category
                      </label>
                      <select
                        id={categoryId}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="form-select w-full"
                      >
                        <option value="filtering">Filtering</option>
                        <option value="aggregation">Aggregation</option>
                        <option value="joining">Joining</option>
                        <option value="business_rule">Business Rule</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor={priorityId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Priority
                      </label>
                      <select
                        id={priorityId}
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                        className="form-select w-full"
                      >
                        <option value={1}>Critical</option>
                        <option value={2}>Important</option>
                        <option value={3}>Helpful</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor={exampleQueryId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Example Question (Optional)
                    </label>
                    <input
                      type="text"
                      id={exampleQueryId}
                      value={exampleQuery}
                      onChange={(e) => setExampleQuery(e.target.value)}
                      className="form-input w-full"
                      placeholder="e.g., Show me all patients on Drug X"
                    />
                  </div>

                  <div>
                    <label htmlFor={exampleSQLId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Example SQL (Optional)
                    </label>
                    <textarea
                      id={exampleSQLId}
                      value={exampleSQL}
                      onChange={(e) => setExampleSQL(e.target.value)}
                      rows={2}
                      className="form-textarea w-full font-mono text-sm"
                      placeholder="e.g., SELECT * FROM ih.procedures WHERE procedure_code = 'X'"
                    />
                  </div>
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 mt-6 -mx-4 sm:-mx-6 -mb-4">
                  <div className="flex flex-wrap justify-end space-x-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="btn border-gray-200 dark:border-gray-700/60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !title.trim() || !instructionText.trim()}
                      className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Instruction updated successfully
      </Toast>
    </>
  );
}

