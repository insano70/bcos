'use client';

import { useState } from 'react';
import type { ColorPalette } from '@/lib/utils/color-palettes';
import { COLOR_PALETTES } from '@/lib/utils/color-palettes';

interface ColorPaletteSelectorProps {
  onSelectPalette: (colors: { primary: string; secondary: string; accent: string }) => void;
  currentColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

/**
 * Compact Color Palette Selector Component
 * Displays predefined color palettes in a collapsible accordion
 */
export default function ColorPaletteSelector({
  onSelectPalette,
  currentColors,
}: ColorPaletteSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Check if a palette is currently applied
  const isPaletteApplied = (palette: ColorPalette) => {
    if (!currentColors) return false;
    return (
      currentColors.primary === palette.colors.primary &&
      currentColors.secondary === palette.colors.secondary &&
      currentColors.accent === palette.colors.accent
    );
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Color Palette Templates
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {COLOR_PALETTES.length} pre-designed color schemes
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {isOpen ? 'Click to collapse' : 'Click to expand'}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
          {/* Compact Palette Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 mt-4">
            {COLOR_PALETTES.map((palette) => {
              const isApplied = isPaletteApplied(palette);

              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => onSelectPalette(palette.colors)}
                  className={`relative p-2 rounded border transition-all text-left ${
                    isApplied
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm'
                  }`}
                >
                  {/* Applied Indicator */}
                  {isApplied && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Color Swatches - Horizontal Strip */}
                  <div className="flex gap-1 mb-2">
                    <div
                      className="flex-1 h-8 rounded border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: palette.colors.primary }}
                    />
                    <div
                      className="flex-1 h-8 rounded border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: palette.colors.secondary }}
                    />
                    <div
                      className="flex-1 h-8 rounded border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: palette.colors.accent }}
                    />
                  </div>

                  {/* Palette Name */}
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">
                    {palette.name}
                  </div>

                  {/* Hex Codes - Always Visible */}
                  <div className="space-y-0.5 text-xs font-mono text-gray-600 dark:text-gray-400">
                    <div className="truncate">{palette.colors.primary}</div>
                    <div className="truncate">{palette.colors.secondary}</div>
                    <div className="truncate">{palette.colors.accent}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
