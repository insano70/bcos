'use client';

import { useState, useId } from 'react';

interface SpecialtiesInputProps {
  value: string[];
  onChange: (specialties: string[]) => void;
  label?: string;
  placeholder?: string;
  maxItems?: number;
}

export default function SpecialtiesInput({
  value = [],
  onChange,
  label = 'Specialties',
  placeholder = 'Enter specialty (e.g., Lupus, Arthritis)',
  maxItems = 10
}: SpecialtiesInputProps) {
  const [newSpecialty, setNewSpecialty] = useState('');
  const uid = useId();

  const addSpecialty = () => {
    const trimmed = newSpecialty.trim();
    if (trimmed && !value.includes(trimmed) && value.length < maxItems) {
      onChange([...value, trimmed]);
      setNewSpecialty('');
    }
  };

  const removeSpecialty = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSpecialty();
    }
  };

  return (
    <div>
      <label htmlFor={`${uid}-specialties`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      
      {/* Current specialties */}
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((specialty, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {specialty}
              <button
                type="button"
                onClick={() => removeSpecialty(index)}
                className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-600 hover:bg-blue-200 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      
      {/* Add new specialty */}
      <div className="flex gap-2">
        <input
          id={`${uid}-specialties`}
          type="text"
          value={newSpecialty}
          onChange={(e) => setNewSpecialty(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={value.length >= maxItems}
        />
        <button
          type="button"
          onClick={addSpecialty}
          disabled={!newSpecialty.trim() || value.includes(newSpecialty.trim()) || value.length >= maxItems}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
      
      {value.length >= maxItems && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
          Maximum {maxItems} specialties allowed
        </p>
      )}
      
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Press Enter or click Add to include a specialty
      </p>
    </div>
  );
}
