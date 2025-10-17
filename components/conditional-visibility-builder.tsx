'use client';

import { useState } from 'react';
import type { ConditionalVisibilityRule, WorkItemField } from '@/lib/types/work-item-fields';

interface ConditionalVisibilityBuilderProps {
  rules: ConditionalVisibilityRule[];
  onChange: (rules: ConditionalVisibilityRule[]) => void;
  availableFields: WorkItemField[];
  currentFieldId?: string;
}

const OPERATORS: Array<{ value: ConditionalVisibilityRule['operator']; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

export default function ConditionalVisibilityBuilder({
  rules,
  onChange,
  availableFields,
  currentFieldId,
}: ConditionalVisibilityBuilderProps) {
  const [isExpanded, setIsExpanded] = useState(rules.length > 0);

  // Filter out the current field (can't depend on itself)
  const selectableFields = availableFields.filter((f) => f.work_item_field_id !== currentFieldId);

  const addRule = () => {
    const newRule: ConditionalVisibilityRule = {
      field_id: selectableFields[0]?.work_item_field_id || '',
      operator: 'equals',
      value: '',
    };
    onChange([...rules, newRule]);
    setIsExpanded(true);
  };

  const updateRule = (index: number, updates: Partial<ConditionalVisibilityRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates } as ConditionalVisibilityRule;
    onChange(newRules);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const needsValueInput = (operator: ConditionalVisibilityRule['operator']) => {
    return operator !== 'is_empty' && operator !== 'is_not_empty';
  };

  if (selectableFields.length === 0) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add other fields first to enable conditional visibility
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span>Conditional Visibility</span>
          {rules.length > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full">
              {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
            </span>
          )}
        </button>
        {isExpanded && (
          <button
            type="button"
            onClick={addRule}
            className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            + Add Rule
          </button>
        )}
      </div>

      {/* Rules */}
      {isExpanded && (
        <div className="space-y-2 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
          {rules.length === 0 ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400">
              This field will always be visible. Click "Add Rule" to make it conditionally visible.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Show this field when ALL of the following conditions are met:
              </p>
              {rules.map((rule, index) => {
                const selectedField = selectableFields.find(
                  (f) => f.work_item_field_id === rule.field_id
                );

                return (
                  <div
                    key={`${rule.field_id}-${index}`}
                    className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      {/* Field Selector */}
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Field
                        </label>
                        <select
                          value={rule.field_id}
                          onChange={(e) => updateRule(index, { field_id: e.target.value })}
                          className="form-select w-full text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                        >
                          {selectableFields.map((field) => (
                            <option key={field.work_item_field_id} value={field.work_item_field_id}>
                              {field.field_label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Operator Selector */}
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Operator
                        </label>
                        <select
                          value={rule.operator}
                          onChange={(e) =>
                            updateRule(index, {
                              operator: e.target.value as ConditionalVisibilityRule['operator'],
                            })
                          }
                          className="form-select w-full text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Value Input */}
                      {needsValueInput(rule.operator) && (
                        <div className="flex-1">
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Value
                          </label>
                          {selectedField?.field_type === 'dropdown' &&
                          selectedField.field_options ? (
                            <select
                              value={String(rule.value || '')}
                              onChange={(e) => updateRule(index, { value: e.target.value })}
                              className="form-select w-full text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Select value...</option>
                              {selectedField.field_options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : selectedField?.field_type === 'checkbox' ? (
                            <select
                              value={String(rule.value || 'true')}
                              onChange={(e) =>
                                updateRule(index, { value: e.target.value === 'true' })
                              }
                              className="form-select w-full text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="true">Checked</option>
                              <option value="false">Unchecked</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={String(rule.value || '')}
                              onChange={(e) => updateRule(index, { value: e.target.value })}
                              placeholder="Enter value..."
                              className="form-input w-full text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            />
                          )}
                        </div>
                      )}

                      {/* Remove Button */}
                      <div className={needsValueInput(rule.operator) ? 'pt-5' : 'pt-5'}>
                        <button
                          type="button"
                          onClick={() => removeRule(index)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Remove rule"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
