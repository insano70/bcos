'use client';

import { useState, useEffect } from 'react';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';

export interface AutoCreateConfig {
  subject_template?: string;
  field_values?: Record<string, string>;
  inherit_fields?: string[];
}

interface AutoCreateConfigBuilderProps {
  childTypeId: string;
  value: AutoCreateConfig | null;
  onChange: (config: AutoCreateConfig | null) => void;
  disabled?: boolean;
}

const STANDARD_FIELDS = [
  { name: 'subject', label: 'Subject' },
  { name: 'description', label: 'Description' },
  { name: 'priority', label: 'Priority' },
  { name: 'assigned_to', label: 'Assigned To' },
  { name: 'due_date', label: 'Due Date' },
];

export default function AutoCreateConfigBuilder({
  childTypeId,
  value,
  onChange,
  disabled = false,
}: AutoCreateConfigBuilderProps) {
  const [subjectTemplate, setSubjectTemplate] = useState(value?.subject_template || '');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(value?.field_values || {});
  const [inheritFields, setInheritFields] = useState<string[]>(value?.inherit_fields || []);
  const [showHelp, setShowHelp] = useState(false);

  const { data: customFields = [], isLoading } = useWorkItemFields({
    work_item_type_id: childTypeId,
    is_visible: true,
  });

  // Update parent when internal state changes
  useEffect(() => {
    const config: AutoCreateConfig = {};

    if (subjectTemplate) {
      config.subject_template = subjectTemplate;
    }

    if (Object.keys(fieldValues).length > 0) {
      config.field_values = fieldValues;
    }

    if (inheritFields.length > 0) {
      config.inherit_fields = inheritFields;
    }

    // Only send config if at least one field is set
    if (Object.keys(config).length > 0) {
      onChange(config);
    } else {
      onChange(null);
    }
  }, [subjectTemplate, fieldValues, inheritFields, onChange]);

  const handleAddFieldValue = () => {
    const newField = customFields.find((f) => !fieldValues[f.field_name]);
    if (newField) {
      setFieldValues({
        ...fieldValues,
        [newField.field_name]: '',
      });
    }
  };

  const handleRemoveFieldValue = (fieldName: string) => {
    const newFieldValues = { ...fieldValues };
    delete newFieldValues[fieldName];
    setFieldValues(newFieldValues);
  };

  const handleFieldValueChange = (fieldName: string, template: string) => {
    setFieldValues({
      ...fieldValues,
      [fieldName]: template,
    });
  };

  const handleToggleInheritField = (fieldName: string) => {
    if (inheritFields.includes(fieldName)) {
      setInheritFields(inheritFields.filter((f) => f !== fieldName));
    } else {
      setInheritFields([...inheritFields, fieldName]);
    }
  };

  const insertToken = (token: string, target: 'subject' | string) => {
    if (target === 'subject') {
      setSubjectTemplate((prev) => prev + token);
    } else {
      setFieldValues((prev) => ({
        ...prev,
        [target]: (prev[target] || '') + token,
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading field configuration...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Subject Template */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject Template
          </label>
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showHelp ? 'Hide' : 'Show'} Template Help
          </button>
        </div>

        {showHelp && (
          <div className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-gray-700 dark:text-gray-300">
            <p className="font-medium mb-1">Template Syntax:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <code className="bg-white dark:bg-gray-800 px-1 rounded">
                  {'{parent.field_name}'}
                </code>{' '}
                - Standard field from parent (e.g., {'{parent.subject}'})
              </li>
              <li>
                <code className="bg-white dark:bg-gray-800 px-1 rounded">
                  {'{parent.custom.field_name}'}
                </code>{' '}
                - Custom field from parent
              </li>
            </ul>
            <p className="mt-2">
              Example: "Patient Record for {'{parent.custom.patient_name}'}"
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="e.g., Patient Record for {parent.subject}"
            disabled={disabled}
            className="form-input w-full"
          />
        </div>

        {/* Quick insert buttons for subject */}
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center mr-2">
            Quick insert:
          </span>
          {STANDARD_FIELDS.slice(0, 3).map((field) => (
            <button
              key={field.name}
              type="button"
              onClick={() => insertToken(`{parent.${field.name}}`, 'subject')}
              disabled={disabled}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {'{parent.' + field.name + '}'}
            </button>
          ))}
        </div>
      </div>

      {/* Field Values Mapping */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Pre-populate Custom Fields
          </label>
          {customFields.length > Object.keys(fieldValues).length && (
            <button
              type="button"
              onClick={handleAddFieldValue}
              disabled={disabled}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              + Add Field Mapping
            </button>
          )}
        </div>

        {Object.keys(fieldValues).length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic">
            No custom field mappings configured
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(fieldValues).map(([fieldName, template]) => {
              const field = customFields.find((f) => f.field_name === fieldName);
              return (
                <div key={fieldName} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      {field?.field_label || fieldName}
                    </div>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={template}
                        onChange={(e) => handleFieldValueChange(fieldName, e.target.value)}
                        placeholder={`Template for ${field?.field_label || fieldName}`}
                        disabled={disabled}
                        className="form-input w-full text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFieldValue(fieldName)}
                        disabled={disabled}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                        title="Remove mapping"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                          <path d="M5 7h6v2H5V7z" />
                        </svg>
                      </button>
                    </div>
                    {/* Quick insert for this field */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {STANDARD_FIELDS.slice(0, 3).map((stdField) => (
                        <button
                          key={stdField.name}
                          type="button"
                          onClick={() => insertToken(`{parent.${stdField.name}}`, fieldName)}
                          disabled={disabled}
                          className="text-xs px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          {'{parent.' + stdField.name + '}'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inherit Fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Inherit Standard Fields
        </label>
        <div className="space-y-1">
          {STANDARD_FIELDS.map((field) => (
            <label
              key={field.name}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                type="checkbox"
                checked={inheritFields.includes(field.name)}
                onChange={() => handleToggleInheritField(field.name)}
                disabled={disabled}
                className="form-checkbox"
              />
              {field.label}
            </label>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Selected fields will be copied from parent to child work item
        </div>
      </div>

      {/* Preview */}
      {(subjectTemplate || Object.keys(fieldValues).length > 0 || inheritFields.length > 0) && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Configuration Preview
          </div>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            {subjectTemplate && (
              <div>
                <span className="font-medium">Subject:</span> {subjectTemplate}
              </div>
            )}
            {Object.keys(fieldValues).length > 0 && (
              <div>
                <span className="font-medium">Custom Fields:</span>{' '}
                {Object.keys(fieldValues).length} mapped
              </div>
            )}
            {inheritFields.length > 0 && (
              <div>
                <span className="font-medium">Inherited:</span>{' '}
                {inheritFields.map((f) => STANDARD_FIELDS.find((sf) => sf.name === f)?.label || f).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
