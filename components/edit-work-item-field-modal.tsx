'use client';

import { useState, useEffect } from 'react';
import ModalBasic from '@/components/modal-basic';
import ConditionalVisibilityBuilder from '@/components/conditional-visibility-builder';
import { useUpdateWorkItemField } from '@/lib/hooks/use-work-item-fields';
import type { WorkItemField, FieldOption, ConditionalVisibilityRule } from '@/lib/types/work-item-fields';

interface EditWorkItemFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  field: WorkItemField | null;
  allFields: WorkItemField[];
}

export default function EditWorkItemFieldModal({
  isOpen,
  onClose,
  onSuccess,
  field,
  allFields,
}: EditWorkItemFieldModalProps) {
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldDescription, setFieldDescription] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [conditionalVisibilityRules, setConditionalVisibilityRules] = useState<ConditionalVisibilityRule[]>([]);

  const updateFieldMutation = useUpdateWorkItemField();

  useEffect(() => {
    if (field) {
      setFieldLabel(field.field_label);
      setFieldDescription(field.field_description || '');
      setIsRequired(field.is_required);
      setIsVisible(field.is_visible);
      setDisplayOrder(field.display_order);
      setOptions(field.field_options || []);
      setConditionalVisibilityRules(field.field_config?.conditional_visibility || []);
    }
  }, [field]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!field) return;

    try {
      await updateFieldMutation.mutateAsync({
        fieldId: field.work_item_field_id,
        data: {
          field_label: fieldLabel,
          field_description: fieldDescription || undefined,
          is_required: isRequired,
          is_visible: isVisible,
          display_order: displayOrder,
          field_options: field.field_type === 'dropdown' ? options : undefined,
          field_config: conditionalVisibilityRules.length > 0 ? { conditional_visibility: conditionalVisibilityRules } : undefined,
        } as never,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  const addOption = () => {
    if (newOptionValue && newOptionLabel) {
      setOptions([...options, { value: newOptionValue, label: newOptionLabel }]);
      setNewOptionValue('');
      setNewOptionLabel('');
    }
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  if (!field) return null;

  return (
    <ModalBasic
      isOpen={isOpen}
      setIsOpen={onClose}
      title="Edit Custom Field"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          {/* Field Name (read-only) */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="field-name-readonly">
              Field Name
            </label>
            <input
              id="field-name-readonly"
              className="form-input w-full font-mono text-sm bg-gray-100 dark:bg-gray-800"
              type="text"
              value={field.field_name}
              readOnly
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Field name cannot be changed</p>
          </div>

          {/* Field Type (read-only) */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="field-type-readonly">
              Field Type
            </label>
            <input
              id="field-type-readonly"
              className="form-input w-full bg-gray-100 dark:bg-gray-800"
              type="text"
              value={field.field_type.replace('_', ' ')}
              readOnly
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Field type cannot be changed</p>
          </div>

          {/* Field Label */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="field-label-edit">
              Field Label <span className="text-red-500">*</span>
            </label>
            <input
              id="field-label-edit"
              className="form-input w-full"
              type="text"
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              required
            />
          </div>

          {/* Dropdown Options */}
          {field.field_type === 'dropdown' && (
            <div>
              <label className="block text-sm font-medium mb-1">Dropdown Options</label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                      {option.label} ({option.value})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="text-red-500 hover:text-red-700"
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
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="form-input flex-1"
                    placeholder="Option value"
                    value={newOptionValue}
                    onChange={(e) => setNewOptionValue(e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-input flex-1"
                    placeholder="Option label"
                    value={newOptionLabel}
                    onChange={(e) => setNewOptionLabel(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={addOption}
                    className="btn bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Field Description */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="field-description-edit">
              Description
            </label>
            <textarea
              id="field-description-edit"
              className="form-textarea w-full"
              rows={3}
              value={fieldDescription}
              onChange={(e) => setFieldDescription(e.target.value)}
            />
          </div>

          {/* Display Order */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="display-order-edit">
              Display Order
            </label>
            <input
              id="display-order-edit"
              className="form-input w-full"
              type="number"
              min="0"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value))}
            />
          </div>

          {/* Conditional Visibility */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <ConditionalVisibilityBuilder
              rules={conditionalVisibilityRules}
              onChange={setConditionalVisibilityRules}
              availableFields={allFields}
              currentFieldId={field.work_item_field_id}
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                id="is-required-edit"
                type="checkbox"
                className="form-checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              <label htmlFor="is-required-edit" className="ml-2 text-sm">
                Required field
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="is-visible-edit"
                type="checkbox"
                className="form-checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
              />
              <label htmlFor="is-visible-edit" className="ml-2 text-sm">
                Visible in forms
              </label>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap justify-end space-x-2">
            <button
              type="button"
              className="btn border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
              disabled={updateFieldMutation.isPending}
            >
              {updateFieldMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </ModalBasic>
  );
}
