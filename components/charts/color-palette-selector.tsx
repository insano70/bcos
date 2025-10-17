'use client';

import { getAllPalettes, getColorPalette } from '@/lib/services/color-palettes';

interface ColorPaletteSelectorProps {
  value: string;
  onChange: (paletteId: string) => void;
  className?: string;
}

export default function ColorPaletteSelector({
  value,
  onChange,
  className = '',
}: ColorPaletteSelectorProps) {
  const palettes = getAllPalettes();
  const selectedPalette = getColorPalette(value);

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Color Palette
      </label>

      {/* Dropdown Select */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      >
        {palettes.map((palette) => (
          <option key={palette.id} value={palette.id}>
            {palette.name} ({palette.category === 'sequential' ? 'Sequential' : 'Categorical'})
          </option>
        ))}
      </select>

      {/* Selected Palette Preview */}
      <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
        {/* Color swatches */}
        <div className="flex items-center space-x-1.5 mb-2">
          {selectedPalette.colors.slice(0, 8).map((color) => (
            <div
              key={color}
              className="w-6 h-6 rounded border border-gray-300 dark:border-gray-500 shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Description */}
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">
          {selectedPalette.description}
        </p>

        {/* Recommended for */}
        {selectedPalette.recommendedFor.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Best for:</span>{' '}
            {selectedPalette.recommendedFor.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
