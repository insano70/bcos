'use client';

import { useState } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  defaultColor: string;
  description?: string;
}

export default function ColorPicker({
  label,
  value,
  onChange,
  defaultColor,
  description,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayColor = value || defaultColor;

  const presetColors = [
    // Brand defaults
    '#00AEEF',
    '#FFFFFF',
    '#44C0AE',
    // Blues
    '#2563eb',
    '#3b82f6',
    '#1d4ed8',
    '#1e40af',
    // Greens
    '#059669',
    '#10b981',
    '#047857',
    '#065f46',
    // Purples
    '#7c3aed',
    '#8b5cf6',
    '#6d28d9',
    '#5b21b6',
    // Reds
    '#dc2626',
    '#ef4444',
    '#b91c1c',
    '#991b1b',
    // Oranges/Ambers
    '#ea580c',
    '#f97316',
    '#d97706',
    '#92400e',
    // Grays
    '#374151',
    '#4b5563',
    '#6b7280',
    '#001620',
  ];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {description && <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center space-x-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500"
        >
          <div
            className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
            style={{ backgroundColor: displayColor }}
          />
          <span className="text-gray-900 dark:text-gray-100 font-mono text-sm">
            {displayColor.toUpperCase()}
          </span>
          <svg
            className="w-4 h-4 text-gray-400 ml-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
            <div className="space-y-3">
              {/* Custom color input */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Custom Color
                </label>
                <input
                  type="color"
                  value={displayColor}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full h-8 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                />
              </div>

              {/* Preset colors */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Preset Colors
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        onChange(color);
                        setIsOpen(false);
                      }}
                      className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Reset to default */}
              <button
                type="button"
                onClick={() => {
                  onChange(defaultColor);
                  setIsOpen(false);
                }}
                className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-1"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
