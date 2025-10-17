'use client';

import { useId, useState } from 'react';
import type { Education } from '@/lib/types/practice';

interface EducationInputProps {
  value: Education[];
  onChange: (education: Education[]) => void;
  label?: string;
  maxItems?: number;
}

export default function EducationInput({
  value = [],
  onChange,
  label = 'Education',
  maxItems = 10,
}: EducationInputProps) {
  const [newEducation, setNewEducation] = useState<Education>({
    degree: '',
    school: '',
    year: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const _uid = useId();

  const addEducation = () => {
    const { degree, school, year } = newEducation;
    if (degree.trim() && school.trim() && year.trim() && value.length < maxItems) {
      onChange([
        ...value,
        {
          degree: degree.trim(),
          school: school.trim(),
          year: year.trim(),
        },
      ]);
      setNewEducation({ degree: '', school: '', year: '' });
      setIsAdding(false);
    }
  };

  const removeEducation = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateEducation = (index: number, field: keyof Education, newValue: string) => {
    const updated = value.map((edu, i) => (i === index ? { ...edu, [field]: newValue } : edu));
    onChange(updated);
  };

  const isFormValid =
    newEducation.degree.trim() && newEducation.school.trim() && newEducation.year.trim();

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>

      {/* Current education entries */}
      {value.length > 0 && (
        <div className="space-y-3 mb-4">
          {value.map((edu, index) => (
            <div key={index} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                    placeholder="Degree (e.g., MD, PhD)"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={edu.school}
                    onChange={(e) => updateEducation(index, 'school', e.target.value)}
                    placeholder="School/Institution"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={edu.year}
                    onChange={(e) => updateEducation(index, 'year', e.target.value)}
                    placeholder="Year (e.g., 2010)"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEducation(index)}
                  className="ml-3 p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md"
                  title="Remove education entry"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new education entry */}
      {!isAdding && value.length < maxItems && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <svg
            className="w-5 h-5 inline mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Add Education Entry
        </button>
      )}

      {/* New education form */}
      {isAdding && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <input
              type="text"
              value={newEducation.degree}
              onChange={(e) => setNewEducation({ ...newEducation, degree: e.target.value })}
              placeholder="Degree (e.g., MD, PhD)"
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={newEducation.school}
              onChange={(e) => setNewEducation({ ...newEducation, school: e.target.value })}
              placeholder="School/Institution"
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={newEducation.year}
              onChange={(e) => setNewEducation({ ...newEducation, year: e.target.value })}
              placeholder="Year (e.g., 2010)"
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewEducation({ degree: '', school: '', year: '' });
              }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addEducation}
              disabled={!isFormValid}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Education
            </button>
          </div>
        </div>
      )}

      {value.length >= maxItems && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
          Maximum {maxItems} education entries allowed
        </p>
      )}
    </div>
  );
}
