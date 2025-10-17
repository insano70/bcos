/**
 * Chart Color Service
 *
 * Centralized color management for chart visualizations.
 * Handles palette selection, color manipulation, and dataset coloring.
 * Extracted from SimplifiedChartTransformer for reusability.
 */

import { getPaletteColors } from '@/lib/services/color-palettes';

/**
 * Get color palette for charts
 *
 * @param paletteId - Palette identifier (e.g., 'default', 'vibrant', 'pastel')
 * @returns Read-only array of color strings
 */
export function getColorPalette(paletteId: string = 'default'): readonly string[] {
  return getPaletteColors(paletteId);
}

/**
 * Adjust color opacity
 * Handles both RGB and hex color formats
 *
 * @param color - Color string (hex or rgb format)
 * @param opacity - Opacity value (0-1)
 * @returns RGBA color string
 */
export function adjustColorOpacity(color: string, opacity: number): string {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }

  // For hex colors, convert to rgba
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get color from palette by index with wraparound
 *
 * @param paletteId - Palette identifier
 * @param index - Index of color to retrieve
 * @returns Color string
 */
export function getColorByIndex(paletteId: string, index: number): string {
  const colors = getPaletteColors(paletteId);
  return colors[index % colors.length] || '#00AEEF';
}

/**
 * Generate array of colors for a given count
 *
 * @param paletteId - Palette identifier
 * @param count - Number of colors needed
 * @returns Array of color strings
 */
export function generateColorArray(paletteId: string, count: number): string[] {
  const colors = getPaletteColors(paletteId);
  const colorArray: string[] = [];

  for (let i = 0; i < count; i++) {
    colorArray.push(colors[i % colors.length] || '#00AEEF');
  }

  return colorArray;
}

/**
 * Apply colors to array with hover effects
 *
 * @param paletteId - Palette identifier
 * @param count - Number of colors needed
 * @returns Object with backgroundColor and hoverBackgroundColor arrays
 */
export function applyColorsWithHover(
  paletteId: string,
  count: number
): { backgroundColor: string[]; hoverBackgroundColor: string[] } {
  const colors = generateColorArray(paletteId, count);

  return {
    backgroundColor: colors,
    hoverBackgroundColor: colors.map((color) => adjustColorOpacity(color, 0.8)),
  };
}
