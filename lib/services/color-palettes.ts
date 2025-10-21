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
  red: {
    id: 'red',
    name: 'Red',
    description: 'Sequential red palette, ideal for alert metrics and negative trends',
    colors: [
      '#7f1d1d', // Red 900
      '#991b1b', // Red 800
      '#b91c1c', // Red 700
      '#dc2626', // Red 600
      '#ef4444', // Red 500
      '#f87171', // Red 400
      '#fca5a5', // Red 300
      '#fecaca', // Red 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
  yellow: {
    id: 'yellow',
    name: 'Yellow',
    description: 'Sequential yellow palette, perfect for warning metrics and highlights',
    colors: [
      '#713f12', // Yellow 900
      '#854d0e', // Yellow 800
      '#a16207', // Yellow 700
      '#ca8a04', // Yellow 600
      '#eab308', // Yellow 500
      '#facc15', // Yellow 400
      '#fde047', // Yellow 300
      '#fef08a', // Yellow 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
  navy: {
    id: 'navy',
    name: 'Navy',
    description: 'Sequential navy/dark blue palette, professional and corporate',
    colors: [
      '#0c4a6e', // Sky 900
      '#075985', // Sky 800
      '#0369a1', // Sky 700
      '#0284c7', // Sky 600
      '#0ea5e9', // Sky 500
      '#38bdf8', // Sky 400
      '#7dd3fc', // Sky 300
      '#bae6fd', // Sky 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line', 'bar'],
  },
  gray: {
    id: 'gray',
    name: 'Gray',
    description: 'Sequential gray palette, neutral and monochrome for subtle visualizations',
    colors: [
      '#1f2937', // Gray 800
      '#374151', // Gray 700
      '#4b5563', // Gray 600
      '#6b7280', // Gray 500
      '#9ca3af', // Gray 400
      '#d1d5db', // Gray 300
      '#e5e7eb', // Gray 200
      '#f3f4f6', // Gray 100
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area'],
  },
  teal: {
    id: 'teal',
    name: 'Teal',
    description: 'Sequential teal palette, modern and calming for data visualizations',
    colors: [
      '#134e4a', // Teal 900
      '#115e59', // Teal 800
      '#0f766e', // Teal 700
      '#0d9488', // Teal 600
      '#14b8a6', // Teal 500
      '#2dd4bf', // Teal 400
      '#5eead4', // Teal 300
      '#99f6e4', // Teal 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    description: 'Sequential rose/pink palette, softer alternative to red for alerts',
    colors: [
      '#881337', // Rose 900
      '#9f1239', // Rose 800
      '#be123c', // Rose 700
      '#e11d48', // Rose 600
      '#f43f5e', // Rose 500
      '#fb7185', // Rose 400
      '#fda4af', // Rose 300
      '#fecdd3', // Rose 200
    ],
    category: 'sequential' as const,
    recommendedFor: ['stacked-bar', 'area', 'line'],
  },
} as const;

/**
 * Get a color palette by ID
 */
export function getColorPalette(paletteId: string = 'default'): ColorPalette {
  const validIds = [
    'default',
    'blue',
    'green',
    'warm',
    'purple',
    'red',
    'yellow',
    'navy',
    'gray',
    'teal',
    'rose',
  ] as const;
  const id = validIds.includes(paletteId as (typeof validIds)[number]) ? paletteId : 'default';
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
