// Shared utility functions for data table components

export type DensityMode = 'normal' | 'compact';

/** Default number of items per page for standard tables */
export const DEFAULT_ITEMS_PER_PAGE = 10;

/** Default number of items per page for editable tables (higher to reduce pagination during editing) */
export const DEFAULT_EDITABLE_ITEMS_PER_PAGE = 50;

/**
 * Get CSS classes for row/cell padding based on density mode
 */
export function getDensityClasses(density: DensityMode): string {
  return density === 'compact' ? 'py-2' : 'py-3';
}

/**
 * Get CSS classes for text/content alignment
 */
export function getAlignmentClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'text-center justify-center';
  if (align === 'right') return 'text-right justify-end';
  return 'text-left';
}

