'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { SchemaInstruction } from '@/lib/types/data-explorer';
import DeleteConfirmationModal from './delete-confirmation-modal';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

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

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [instructionToDelete, setInstructionToDelete] = useState<SchemaInstruction | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formInstruction, setFormInstruction] = useState('');
  const [formCategory, setFormCategory] = useState<string>('filtering');
  const [formPriority, setFormPriority] = useState(2);
  const [formExampleQuery, setFormExampleQuery] = useState('');
  const [formExampleSQL, setFormExampleSQL] = useState('');

  const fetchInstructions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<SchemaInstruction[]>('/api/data/explorer/schema-instructions');
      setInstructions(data);
    } catch (error) {
      clientErrorLog('Failed to fetch instructions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchInstructions();
    }
  }, [isOpen, fetchInstructions]);

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
      clientErrorLog('Save failed:', error);
    }
  };

  const handleDeleteClick = (instruction: SchemaInstruction) => {
    setInstructionToDelete(instruction);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteInstruction = async () => {
    if (!instructionToDelete) return;

    try {
      await apiClient.delete(`/api/data/explorer/schema-instructions/${instructionToDelete.instruction_id}`);
      setToastMessage('Instruction deleted');
      setShowToast(true);
      fetchInstructions();
    } catch (error) {
      clientErrorLog('Delete failed:', error);
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
      clientErrorLog('Toggle failed:', error);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 1) return <Badge color="red" size="sm" shape="rounded">Critical</Badge>;
    if (priority === 2) return <Badge color="blue" size="sm" shape="rounded">Important</Badge>;
    return <Badge color="gray" size="sm" shape="rounded">Helpful</Badge>;
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return null;
    return <Badge color="violet" size="sm" shape="rounded">{category}</Badge>;
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title="Schema Instructions"
        description="Global rules that guide AI SQL generation"
      >
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
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setIsEditing(false);
                            setIsCreating(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="violet"
                          onClick={handleSave}
                          disabled={!formTitle.trim() || !formInstruction.trim()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="text-center py-8">
                    <Spinner size="md" />
                  </div>
                )}

                {!isLoading && !isEditing && !isCreating && instructions.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No schema instructions defined</p>
                    <Button variant="violet" onClick={handleCreate}>
                      Create First Instruction
                    </Button>
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
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleEdit(inst)}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleToggleActive(inst)}
                              className="text-violet-600 hover:text-violet-700"
                            >
                              {inst.is_active ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleDeleteClick(inst)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Delete
                            </Button>
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
                      <Button variant="violet" onClick={handleCreate}>
                        Add Instruction
                      </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
      </Modal>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>

      {/* Delete Confirmation Modal */}
      {instructionToDelete && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          setIsOpen={(value) => {
            setIsDeleteModalOpen(value);
            if (!value) {
              setInstructionToDelete(null);
            }
          }}
          title="Delete Instruction"
          itemName={instructionToDelete.title}
          message="Are you sure you want to delete this instruction? This action cannot be undone."
          confirmButtonText="Delete Instruction"
          onConfirm={confirmDeleteInstruction}
        />
      )}
    </>
  );
}

