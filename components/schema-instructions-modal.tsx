'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import type { SchemaInstruction } from '@/lib/types/data-explorer';
import Toast from './toast';

interface SchemaInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SchemaInstructionsModal({ isOpen, onClose }: SchemaInstructionsModalProps) {
  const [instructions, setInstructions] = useState<SchemaInstruction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<SchemaInstruction | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formInstruction, setFormInstruction] = useState('');
  const [formCategory, setFormCategory] = useState<string>('filtering');
  const [formPriority, setFormPriority] = useState(2);
  const [formExampleQuery, setFormExampleQuery] = useState('');
  const [formExampleSQL, setFormExampleSQL] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchInstructions();
    }
  }, [isOpen]);

  const fetchInstructions = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<SchemaInstruction[]>('/api/data/explorer/schema-instructions');
      setInstructions(data);
    } catch (error) {
      console.error('Failed to fetch instructions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (instruction: SchemaInstruction) => {
    setEditingInstruction(instruction);
    setFormTitle(instruction.title);
    setFormInstruction(instruction.instruction);
    setFormCategory(instruction.category || 'filtering');
    setFormPriority(instruction.priority);
    setFormExampleQuery(instruction.example_query || '');
    setFormExampleSQL(instruction.example_sql || '');
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditingInstruction(null);
    setFormTitle('');
    setFormInstruction('');
    setFormCategory('filtering');
    setFormPriority(2);
    setFormExampleQuery('');
    setFormExampleSQL('');
    setIsCreating(true);
  };

  const handleSave = async () => {
    try {
      if (editingInstruction) {
        // Update existing
        await apiClient.put(`/api/data/explorer/schema-instructions/${editingInstruction.instruction_id}`, {
          title: formTitle,
          instruction: formInstruction,
          category: formCategory,
          priority: formPriority,
          example_query: formExampleQuery || undefined,
          example_sql: formExampleSQL || undefined,
        });
        setToastMessage('Instruction updated');
      } else {
        // Create new
        await apiClient.post('/api/data/explorer/schema-instructions', {
          title: formTitle,
          instruction: formInstruction,
          category: formCategory,
          priority: formPriority,
          example_query: formExampleQuery || undefined,
          example_sql: formExampleSQL || undefined,
        });
        setToastMessage('Instruction created');
      }
      
      setShowToast(true);
      setIsEditing(false);
      setIsCreating(false);
      fetchInstructions();
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this instruction?')) return;

    try {
      await apiClient.delete(`/api/data/explorer/schema-instructions/${id}`);
      setToastMessage('Instruction deleted');
      setShowToast(true);
      fetchInstructions();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleToggleActive = async (instruction: SchemaInstruction) => {
    try {
      await apiClient.put(`/api/data/explorer/schema-instructions/${instruction.instruction_id}`, {
        is_active: !instruction.is_active,
      });
      setToastMessage(instruction.is_active ? 'Instruction disabled' : 'Instruction enabled');
      setShowToast(true);
      fetchInstructions();
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 1) return <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">Critical</span>;
    if (priority === 2) return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">Important</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">Helpful</span>;
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return null;
    return <span className="px-2 py-1 text-xs rounded bg-violet-100 text-violet-800">{category}</span>;
  };

  return (
    <>
      <Transition appear show={isOpen}>
        <Dialog as="div" onClose={onClose}>
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
            <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-4xl w-full max-h-[90vh]">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Schema Instructions
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Global rules that guide AI SQL generation
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="px-4 sm:px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Create/Edit Form */}
                {(isEditing || isCreating) && (
                  <div className="mb-4 p-4 border border-violet-200 dark:border-violet-700 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      {isEditing ? 'Edit Instruction' : 'New Instruction'}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Title *
                        </label>
                        <input
                          type="text"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          className="form-input w-full"
                          placeholder="e.g., Drug Filtering Rule"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Instruction *
                        </label>
                        <textarea
                          value={formInstruction}
                          onChange={(e) => setFormInstruction(e.target.value)}
                          rows={3}
                          className="form-textarea w-full"
                          placeholder="e.g., When filtering by drug names, always use procedure_code column"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Category
                          </label>
                          <select
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value)}
                            className="form-select w-full"
                          >
                            <option value="filtering">Filtering</option>
                            <option value="aggregation">Aggregation</option>
                            <option value="joining">Joining</option>
                            <option value="business_rule">Business Rule</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Priority
                          </label>
                          <select
                            value={formPriority}
                            onChange={(e) => setFormPriority(Number(e.target.value))}
                            className="form-select w-full"
                          >
                            <option value={1}>Critical</option>
                            <option value={2}>Important</option>
                            <option value={3}>Helpful</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Example Question (Optional)
                        </label>
                        <input
                          type="text"
                          value={formExampleQuery}
                          onChange={(e) => setFormExampleQuery(e.target.value)}
                          className="form-input w-full"
                          placeholder="e.g., Show me all patients on Drug X"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Example SQL (Optional)
                        </label>
                        <textarea
                          value={formExampleSQL}
                          onChange={(e) => setFormExampleSQL(e.target.value)}
                          rows={2}
                          className="form-textarea w-full font-mono text-sm"
                          placeholder="e.g., SELECT * FROM ih.procedures WHERE procedure_code = 'X'"
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                            setIsCreating(false);
                          }}
                          className="btn border-gray-200 dark:border-gray-700/60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={!formTitle.trim() || !formInstruction.trim()}
                          className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
                  </div>
                )}

                {!isLoading && !isEditing && !isCreating && instructions.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No schema instructions defined</p>
                    <button
                      type="button"
                      onClick={handleCreate}
                      className="btn bg-violet-500 hover:bg-violet-600 text-white"
                    >
                      Create First Instruction
                    </button>
                  </div>
                )}

                {!isLoading && !isEditing && !isCreating && instructions.length > 0 && (
                  <div className="space-y-4">
                    {instructions.map((inst) => (
                      <div
                        key={inst.instruction_id}
                        className={`p-4 rounded-lg border ${
                          inst.is_active
                            ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {inst.title}
                            </h3>
                            {getPriorityBadge(inst.priority)}
                            {getCategoryBadge(inst.category)}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(inst)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(inst)}
                              className="text-sm text-violet-600 hover:text-violet-700"
                            >
                              {inst.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(inst.instruction_id)}
                              className="text-sm text-red-600 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          {inst.instruction}
                        </p>
                        {inst.example_query && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Example:</p>
                            <p className="text-xs text-gray-800 dark:text-gray-200">
                              Q: {inst.example_query}
                            </p>
                            {inst.example_sql && (
                              <pre className="text-xs text-gray-600 dark:text-gray-400 mt-1 overflow-x-auto">
                                {inst.example_sql}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {instructions.filter(i => i.is_active).length} active / {instructions.length} total
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!isEditing && !isCreating && (
                      <button
                        type="button"
                        onClick={handleCreate}
                        className="btn bg-violet-500 hover:bg-violet-600 text-white"
                      >
                        Add Instruction
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </>
  );
}

