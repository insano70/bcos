/**
 * Color Palette Service
 * Provides predefined color palettes for charts with different visual characteristics
 */

export interface ColorPalette {
  id: string;
  name: string;
  description: string;
  colors: readonly string[];
  category: 'sequential' | 'categorical';
  recommendedFor: readonly string[];
}

/**
 * Predefined color palettes for charts
 */
export const COLOR_PALETTES = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'Mixed categorical palette with high contrast for distinct categories',
    colors: [
      '#00AEEF', // Bright cyan
      '#67bfff', // Light blue
      '#3ec972', // Green
      '#f0bb33', // Yellow
      '#ff5656', // Red
      '#8B5CF6', // Purple
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#10B981', // Emerald
      '#3B82F6', // Blue
      '#6366F1', // Indigo
      '#EC4899', // Pink
    ],
    category: 'categorical' as const,
    recommendedFor: ['bar', 'line', 'doughnut'],
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    description: 'Sequential blue palette from dark to light, ideal for stacked visualizations',
    colors: [
      '#104D66', // Dark teal-blue (violet-700)
      '#195E79', // Medium dark teal (violet-600)
      '#007bad', // Medium blue (violet-800)
      '#00AEEF', // Bright cyan (violet-500)
      '#33c3ff', // Light cyan (violet-400)
      '#66d2ff', // Lighter cyan (violet-300)
      '#99e1ff', // Very light cyan (violet-200)
      '#ccf0ff', // Ultra light cyan (violet-100)
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area'],
  },
  green: {
    id: 'green',
    name: 'Green',
    description: 'Sequential green palette, perfect for growth metrics and positive trends',
    colors: [
      '#064e3b', // Dark emerald
      '#065f46', // Emerald 800
      '#047857', // Emerald 700
      '#059669', // Emerald 600
      '#10b981', // Emerald 500
      '#34d399', // Emerald 400
      '#6ee7b7', // Emerald 300
      '#a7f3d0', // Emerald 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    description: 'Sequential warm palette (red/orange/yellow), ideal for alert metrics',
    colors: [
      '#7c2d12', // Orange 900
      '#9a3412', // Orange 800
      '#c2410c', // Orange 700
      '#ea580c', // Orange 600
      '#f97316', // Orange 500
      '#fb923c', // Orange 400
      '#fdba74', // Orange 300
      '#fed7aa', // Orange 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area'],
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    description: 'Sequential purple palette, elegant for premium themes',
    colors: [
      '#581c87', // Purple 900
      '#6b21a8', // Purple 800
      '#7e22ce', // Purple 700
      '#9333ea', // Purple 600
      '#a855f7', // Purple 500
      '#c084fc', // Purple 400
      '#d8b4fe', // Purple 300
      '#e9d5ff', // Purple 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
} as const;

/**
 * Get a color palette by ID
 */
export function getColorPalette(paletteId: string = 'default'): ColorPalette {
  const validIds = ['default', 'blue', 'green', 'warm', 'purple'] as const;
  const id = validIds.includes(paletteId as typeof validIds[number]) ? paletteId : 'default';
  return COLOR_PALETTES[id as keyof typeof COLOR_PALETTES];
}

/**
 * Get colors array from a palette
 */
export function getPaletteColors(paletteId: string = 'default'): readonly string[] {
  const palette = getColorPalette(paletteId);
  return palette.colors;
}

/**
 * Get all available palettes
 */
export function getAllPalettes(): ColorPalette[] {
  return Object.values(COLOR_PALETTES);
}

/**
 * Get recommended palette for a chart type
 */
export function getRecommendedPalette(chartType: string): string {
  switch (chartType) {
    case 'stacked-bar':
      return 'blue';
    case 'area':
      return 'blue';
    default:
      return 'default';
  }
}
