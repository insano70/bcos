'use client';

import { useEffect, useCallback, useReducer } from 'react';
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

interface FormState {
  title: string;
  instruction: string;
  category: string;
  priority: number;
  exampleQuery: string;
  exampleSQL: string;
}

interface ModalState {
  instructions: SchemaInstruction[];
  isLoading: boolean;
  toast: { show: boolean; message: string };
  mode: 'list' | 'editing' | 'creating';
  editingInstruction: SchemaInstruction | null;
  deleteModal: { isOpen: boolean; instruction: SchemaInstruction | null };
  form: FormState;
}

type ModalAction =
  | { type: 'SET_INSTRUCTIONS'; payload: SchemaInstruction[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SHOW_TOAST'; payload: string }
  | { type: 'HIDE_TOAST' }
  | { type: 'START_EDIT'; payload: SchemaInstruction }
  | { type: 'START_CREATE' }
  | { type: 'CANCEL_FORM' }
  | { type: 'OPEN_DELETE_MODAL'; payload: SchemaInstruction }
  | { type: 'CLOSE_DELETE_MODAL' }
  | { type: 'UPDATE_FORM'; payload: Partial<FormState> };

const initialFormState: FormState = {
  title: '',
  instruction: '',
  category: 'filtering',
  priority: 2,
  exampleQuery: '',
  exampleSQL: '',
};

const initialState: ModalState = {
  instructions: [],
  isLoading: false,
  toast: { show: false, message: '' },
  mode: 'list',
  editingInstruction: null,
  deleteModal: { isOpen: false, instruction: null },
  form: initialFormState,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'SET_INSTRUCTIONS':
      return { ...state, instructions: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SHOW_TOAST':
      return { ...state, toast: { show: true, message: action.payload } };
    case 'HIDE_TOAST':
      return { ...state, toast: { ...state.toast, show: false } };
    case 'START_EDIT':
      return {
        ...state,
        mode: 'editing',
        editingInstruction: action.payload,
        form: {
          title: action.payload.title,
          instruction: action.payload.instruction,
          category: action.payload.category || 'filtering',
          priority: action.payload.priority,
          exampleQuery: action.payload.example_query || '',
          exampleSQL: action.payload.example_sql || '',
        },
      };
    case 'START_CREATE':
      return {
        ...state,
        mode: 'creating',
        editingInstruction: null,
        form: initialFormState,
      };
    case 'CANCEL_FORM':
      return { ...state, mode: 'list', editingInstruction: null, form: initialFormState };
    case 'OPEN_DELETE_MODAL':
      return { ...state, deleteModal: { isOpen: true, instruction: action.payload } };
    case 'CLOSE_DELETE_MODAL':
      return { ...state, deleteModal: { isOpen: false, instruction: null } };
    case 'UPDATE_FORM':
      return { ...state, form: { ...state.form, ...action.payload } };
    default:
      return state;
  }
}

export default function SchemaInstructionsModal({ isOpen, onClose }: SchemaInstructionsModalProps) {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  const fetchInstructions = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await apiClient.get<SchemaInstruction[]>('/api/data/explorer/schema-instructions');
      dispatch({ type: 'SET_INSTRUCTIONS', payload: data });
    } catch (error) {
      clientErrorLog('Failed to fetch instructions:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchInstructions();
    }
  }, [isOpen, fetchInstructions]);

  const handleEdit = (instruction: SchemaInstruction) => {
    dispatch({ type: 'START_EDIT', payload: instruction });
  };

  const handleCreate = () => {
    dispatch({ type: 'START_CREATE' });
  };

  const handleSave = async () => {
    try {
      if (state.editingInstruction) {
        // Update existing
        await apiClient.put(`/api/data/explorer/schema-instructions/${state.editingInstruction.instruction_id}`, {
          title: state.form.title,
          instruction: state.form.instruction,
          category: state.form.category,
          priority: state.form.priority,
          example_query: state.form.exampleQuery || undefined,
          example_sql: state.form.exampleSQL || undefined,
        });
        dispatch({ type: 'SHOW_TOAST', payload: 'Instruction updated' });
      } else {
        // Create new
        await apiClient.post('/api/data/explorer/schema-instructions', {
          title: state.form.title,
          instruction: state.form.instruction,
          category: state.form.category,
          priority: state.form.priority,
          example_query: state.form.exampleQuery || undefined,
          example_sql: state.form.exampleSQL || undefined,
        });
        dispatch({ type: 'SHOW_TOAST', payload: 'Instruction created' });
      }

      dispatch({ type: 'CANCEL_FORM' });
      fetchInstructions();
    } catch (error) {
      clientErrorLog('Save failed:', error);
    }
  };

  const handleDeleteClick = (instruction: SchemaInstruction) => {
    dispatch({ type: 'OPEN_DELETE_MODAL', payload: instruction });
  };

  const confirmDeleteInstruction = async () => {
    if (!state.deleteModal.instruction) return;

    try {
      await apiClient.delete(`/api/data/explorer/schema-instructions/${state.deleteModal.instruction.instruction_id}`);
      dispatch({ type: 'SHOW_TOAST', payload: 'Instruction deleted' });
      dispatch({ type: 'CLOSE_DELETE_MODAL' });
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
      dispatch({ type: 'SHOW_TOAST', payload: instruction.is_active ? 'Instruction disabled' : 'Instruction enabled' });
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
                {(state.mode === 'editing' || state.mode === 'creating') && (
                  <div className="mb-4 p-4 border border-violet-200 dark:border-violet-700 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      {state.mode === 'editing' ? 'Edit Instruction' : 'New Instruction'}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Title *
                        </label>
                        <input
                          type="text"
                          value={state.form.title}
                          onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { title: e.target.value } })}
                          className="form-input w-full"
                          placeholder="e.g., Drug Filtering Rule"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Instruction *
                        </label>
                        <textarea
                          value={state.form.instruction}
                          onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { instruction: e.target.value } })}
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
                            value={state.form.category}
                            onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { category: e.target.value } })}
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
                            value={state.form.priority}
                            onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { priority: Number(e.target.value) } })}
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
                          value={state.form.exampleQuery}
                          onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { exampleQuery: e.target.value } })}
                          className="form-input w-full"
                          placeholder="e.g., Show me all patients on Drug X"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Example SQL (Optional)
                        </label>
                        <textarea
                          value={state.form.exampleSQL}
                          onChange={(e) => dispatch({ type: 'UPDATE_FORM', payload: { exampleSQL: e.target.value } })}
                          rows={2}
                          className="form-textarea w-full font-mono text-sm"
                          placeholder="e.g., SELECT * FROM ih.procedures WHERE procedure_code = 'X'"
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => dispatch({ type: 'CANCEL_FORM' })}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="violet"
                          onClick={handleSave}
                          disabled={!state.form.title.trim() || !state.form.instruction.trim()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {state.isLoading && (
                  <div className="text-center py-8">
                    <Spinner size="md" />
                  </div>
                )}

                {!state.isLoading && state.mode === 'list' && state.instructions.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No schema instructions defined</p>
                    <Button variant="violet" onClick={handleCreate}>
                      Create First Instruction
                    </Button>
                  </div>
                )}

                {!state.isLoading && state.mode === 'list' && state.instructions.length > 0 && (
                  <div className="space-y-4">
                    {state.instructions.map((inst) => (
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
                      {state.instructions.filter(i => i.is_active).length} active / {state.instructions.length} total
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {state.mode === 'list' && (
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

      <Toast type="success" open={state.toast.show} setOpen={(show) => !show && dispatch({ type: 'HIDE_TOAST' })}>
        {state.toast.message}
      </Toast>

      {/* Delete Confirmation Modal */}
      {state.deleteModal.instruction && (
        <DeleteConfirmationModal
          isOpen={state.deleteModal.isOpen}
          setIsOpen={(value) => {
            if (!value) {
              dispatch({ type: 'CLOSE_DELETE_MODAL' });
            }
          }}
          title="Delete Instruction"
          itemName={state.deleteModal.instruction.title}
          message="Are you sure you want to delete this instruction? This action cannot be undone."
          confirmButtonText="Delete Instruction"
          onConfirm={confirmDeleteInstruction}
        />
      )}
    </>
  );
}

