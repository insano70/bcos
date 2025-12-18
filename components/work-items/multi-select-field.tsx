'use client';

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from '@headlessui/react';
import { memo, useState } from 'react';

/**
 * Multi-Select Field Component
 * Allows selection of multiple options from a dropdown
 * Uses Headless UI Combobox for accessibility and keyboard navigation
 */

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
  error?: string;
  disabled?: boolean;
}

function MultiSelectFieldInner({
  options,
  value,
  onChange,
  placeholder = 'Select options...',
  maxSelections = 100,
  error,
  disabled = false,
}: MultiSelectFieldProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChange = (newValue: string[]) => {
    if (newValue.length <= maxSelections) {
      onChange(newValue);
    }
  };

  const handleRemove = (optionValue: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange([]);
    setSearchQuery('');
  };

  return (
    <div className="w-full space-y-2 relative">
      <Combobox value={value} onChange={handleChange} disabled={disabled} multiple>
        {({ open }) => (
          <>
            <div
              className={`form-input w-full min-h-[42px] flex items-center justify-between ${
                error ? 'border-red-500' : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
                open ? 'ring-2 ring-violet-500 border-violet-500' : ''
              }`}
            >
              <div className="flex flex-1 flex-wrap gap-1 pr-2">
                {selectedOptions.map((option) => (
                  <span
                    key={option.value}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 text-sm"
                  >
                    {option.label}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => handleRemove(option.value, e)}
                        className="hover:text-red-500"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}

                <ComboboxInput
                  className="flex-1 min-w-[120px] border-0 p-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 focus:outline-none disabled:cursor-not-allowed text-sm"
                  placeholder={selectedOptions.length === 0 ? placeholder : 'Search...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  displayValue={() => searchQuery}
                />
              </div>

              <div className="flex items-center gap-2 ml-2">
                {selectedOptions.length > 0 && !disabled && (
                  <button type="button" onClick={handleClear} className="hover:text-red-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
                <ComboboxButton>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </ComboboxButton>
              </div>
            </div>

            <Transition
              show={open}
              enter="transition ease-out duration-100 transform"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-out duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <ComboboxOptions
                static
                className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto focus:outline-none"
              >
                {filteredOptions.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No options found.
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const isSelected = value.includes(option.value);
                    const isMaxReached = value.length >= maxSelections && !isSelected;

                    return (
                      <ComboboxOption
                        key={option.value}
                        value={option.value}
                        disabled={isMaxReached}
                        className={({ focus }) => `
                          flex items-center px-3 py-2 cursor-pointer
                          ${focus ? 'bg-violet-100 dark:bg-violet-900/40' : ''}
                          ${isSelected && !focus ? 'bg-violet-50 dark:bg-violet-900/20' : ''}
                          ${isMaxReached ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          tabIndex={-1}
                          className="form-checkbox mr-2"
                        />
                        <span className="text-sm">{option.label}</span>
                      </ComboboxOption>
                    );
                  })
                )}
              </ComboboxOptions>
            </Transition>
          </>
        )}
      </Combobox>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {value.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {value.length} of {maxSelections} selected
        </p>
      )}
    </div>
  );
}

export const MultiSelectField = memo(MultiSelectFieldInner);
