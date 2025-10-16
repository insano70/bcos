'use client';

/**
 * Transition Validation Builder Component
 * Phase 7: Advanced Workflows & Automation
 *
 * Allows admins to configure validation rules for status transitions:
 * - Required fields (must be filled before transition)
 * - Custom validation rules with operators
 */

import { useState } from 'react';
import { X, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';

export interface ValidationRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: string;
  message: string;
}

export interface ValidationConfig {
  required_fields: string[];
  custom_rules: ValidationRule[];
}

interface TransitionValidationBuilderProps {
  workItemTypeId: string;
  initialConfig?: ValidationConfig | null;
  onChange: (config: ValidationConfig) => void;
}

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
] as const;

export function TransitionValidationBuilder({
  workItemTypeId,
  initialConfig,
  onChange,
}: TransitionValidationBuilderProps) {
  const { data: fields = [], isLoading } = useWorkItemFields({
    work_item_type_id: workItemTypeId,
  });
  const [showPreview, setShowPreview] = useState(false);

  const [requiredFields, setRequiredFields] = useState<string[]>(
    initialConfig?.required_fields || []
  );

  const [customRules, setCustomRules] = useState<ValidationRule[]>(
    initialConfig?.custom_rules || []
  );

  const handleRequiredFieldToggle = (fieldId: string) => {
    const newRequired = requiredFields.includes(fieldId)
      ? requiredFields.filter((id) => id !== fieldId)
      : [...requiredFields, fieldId];

    setRequiredFields(newRequired);
    onChange({
      required_fields: newRequired,
      custom_rules: customRules,
    });
  };

  const handleAddCustomRule = () => {
    const newRule: ValidationRule = {
      field: '',
      operator: 'equals',
      value: '',
      message: '',
    };
    const newRules = [...customRules, newRule];
    setCustomRules(newRules);
    onChange({
      required_fields: requiredFields,
      custom_rules: newRules,
    });
  };

  const handleRemoveCustomRule = (index: number) => {
    const newRules = customRules.filter((_, i) => i !== index);
    setCustomRules(newRules);
    onChange({
      required_fields: requiredFields,
      custom_rules: newRules,
    });
  };

  const handleCustomRuleChange = (
    index: number,
    field: keyof ValidationRule,
    value: string
  ) => {
    const newRules = customRules.map((rule, i) =>
      i === index ? { ...rule, [field]: value } : rule
    );
    setCustomRules(newRules);
    onChange({
      required_fields: requiredFields,
      custom_rules: newRules,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500 dark:text-gray-400">Loading fields...</div>
      </div>
    );
  }

  const validationConfig: ValidationConfig = {
    required_fields: requiredFields,
    custom_rules: customRules,
  };

  return (
    <div className="space-y-6">
      {/* Required Fields Section */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Required Fields
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select fields that must be filled before this transition can occur.
        </p>

        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700/60 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/20">
          {fields.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No custom fields defined for this work item type
            </div>
          ) : (
            fields.map((field) => (
              <label
                key={field.work_item_field_id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={requiredFields.includes(field.work_item_field_id)}
                  onChange={() => handleRequiredFieldToggle(field.work_item_field_id)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {field.field_label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({field.field_type})
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Custom Rules Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Custom Validation Rules
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Define custom rules that must pass before this transition can occur.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddCustomRule}
            className="btn-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Rule
          </button>
        </div>

        <div className="space-y-3">
          {customRules.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No custom rules defined. Click "Add Rule" to create one.
            </div>
          ) : (
            customRules.map((rule, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700/60 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Rule #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomRule(index)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Field
                    </label>
                    <select
                      value={rule.field}
                      onChange={(e) =>
                        handleCustomRuleChange(index, 'field', e.target.value)
                      }
                      className="form-select w-full text-sm"
                    >
                      <option value="">Select field...</option>
                      {fields.map((field) => (
                        <option key={field.work_item_field_id} value={field.work_item_field_id}>
                          {field.field_label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Operator
                    </label>
                    <select
                      value={rule.operator}
                      onChange={(e) =>
                        handleCustomRuleChange(
                          index,
                          'operator',
                          e.target.value
                        )
                      }
                      className="form-select w-full text-sm"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Value
                  </label>
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) =>
                      handleCustomRuleChange(index, 'value', e.target.value)
                    }
                    placeholder="Enter comparison value..."
                    className="form-input w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Error Message
                  </label>
                  <input
                    type="text"
                    value={rule.message}
                    onChange={(e) =>
                      handleCustomRuleChange(index, 'message', e.target.value)
                    }
                    placeholder="Message to show if validation fails..."
                    className="form-input w-full text-sm"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview Section */}
      <div className="border-t border-gray-200 dark:border-gray-700/60 pt-4">
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          {showPreview ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {showPreview ? 'Hide' : 'Show'} Configuration Preview
        </button>

        {showPreview && (
          <div className="mt-3">
            <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(validationConfig, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
