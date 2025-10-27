'use client';

import { useId, useState } from 'react';
import ModalBasic from '@/components/modal-basic';
import { useCreateWorkItemField } from '@/lib/hooks/use-work-item-fields';
import type { FieldOption, FieldType } from '@/lib/types/work-item-fields';

interface AddWorkItemFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workItemTypeId: string;
}

export default function AddWorkItemFieldModal({
  isOpen,
  onClose,
  onSuccess,
  workItemTypeId,
}: AddWorkItemFieldModalProps) {
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [fieldDescription, setFieldDescription] = useState('');
  const [isRequiredOnCreation, setIsRequiredOnCreation] = useState(false);
  const [isRequiredToComplete, setIsRequiredToComplete] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const fieldLabelId = useId();
  const fieldNameId = useId();
  const fieldTypeId = useId();
  const fieldDescriptionId = useId();
  const displayOrderId = useId();
  const isRequiredOnCreationId = useId();
  const isRequiredToCompleteId = useId();
  const isVisibleId = useId();

  const createFieldMutation = useCreateWorkItemField();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createFieldMutation.mutateAsync({
        work_item_type_id: workItemTypeId,
        field_name: fieldName,
        field_label: fieldLabel,
        field_type: fieldType,
        field_description: fieldDescription || undefined,
        is_required_on_creation: isRequiredOnCreation,
        is_required_to_complete: isRequiredToComplete,
        is_visible: isVisible,
        display_order: displayOrder,
        field_options: fieldType === 'dropdown' ? options : undefined,
      } as never);

      // Reset form
      setFieldName('');
      setFieldLabel('');
      setFieldType('text');
      setFieldDescription('');
      setIsRequiredOnCreation(false);
      setIsRequiredToComplete(false);
      setIsVisible(true);
      setDisplayOrder(0);
      setOptions([]);

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create field:', error);
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

  return (
    <ModalBasic isOpen={isOpen} setIsOpen={onClose} title="Add Custom Field">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          {/* Field Label */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldLabelId}>
              Field Label <span className="text-red-500">*</span>
            </label>
            <input
              id={fieldLabelId}
              className="form-input w-full"
              type="text"
              value={fieldLabel}
              onChange={(e) => {
                setFieldLabel(e.target.value);
                // Auto-generate field name from label
                if (!fieldName) {
                  setFieldName(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '_')
                      .replace(/^_+|_+$/g, '')
                  );
                }
              }}
              required
            />
          </div>

          {/* Field Name */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldNameId}>
              Field Name <span className="text-red-500">*</span>
            </label>
            <input
              id={fieldNameId}
              className="form-input w-full font-mono text-sm"
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              pattern="^[a-z][a-z0-9_]*$"
              title="Must start with lowercase letter and contain only lowercase letters, numbers, and underscores"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Must start with a lowercase letter, use only lowercase letters, numbers, and
              underscores
            </p>
          </div>

          {/* Field Type */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldTypeId}>
              Field Type <span className="text-red-500">*</span>
            </label>
            <select
              id={fieldTypeId}
              className="form-select w-full"
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as FieldType)}
              required
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="datetime">Date & Time</option>
              <option value="dropdown">Dropdown</option>
              <option value="checkbox">Checkbox</option>
              <option value="user_picker">User Picker</option>
            </select>
          </div>

          {/* Dropdown Options */}
          {fieldType === 'dropdown' && (
            <div>
              <label className="block text-sm font-medium mb-1">Dropdown Options</label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={option.value} className="flex items-center gap-2">
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
            <label className="block text-sm font-medium mb-1" htmlFor={fieldDescriptionId}>
              Description
            </label>
            <textarea
              id={fieldDescriptionId}
              className="form-textarea w-full"
              rows={3}
              value={fieldDescription}
              onChange={(e) => setFieldDescription(e.target.value)}
            />
          </div>

          {/* Display Order */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={displayOrderId}>
              Display Order
            </label>
            <input
              id={displayOrderId}
              className="form-input w-full"
              type="number"
              min="0"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10))}
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                id={isRequiredOnCreationId}
                type="checkbox"
                className="form-checkbox"
                checked={isRequiredOnCreation}
                onChange={(e) => setIsRequiredOnCreation(e.target.checked)}
              />
              <label htmlFor={isRequiredOnCreationId} className="ml-2 text-sm">
                Required on Creation
              </label>
            </div>
            <div className="flex items-center">
              <input
                id={isRequiredToCompleteId}
                type="checkbox"
                className="form-checkbox"
                checked={isRequiredToComplete}
                onChange={(e) => setIsRequiredToComplete(e.target.checked)}
              />
              <label htmlFor={isRequiredToCompleteId} className="ml-2 text-sm">
                Required to Complete
              </label>
            </div>
            <div className="flex items-center">
              <input
                id={isVisibleId}
                type="checkbox"
                className="form-checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
              />
              <label htmlFor={isVisibleId} className="ml-2 text-sm">
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
              disabled={createFieldMutation.isPending}
            >
              {createFieldMutation.isPending ? 'Creating...' : 'Create Field'}
            </button>
          </div>
        </div>
      </form>
    </ModalBasic>
  );
}
