/**
 * Dashboard Layout Constants
 *
 * Centralized configuration for dashboard grid layout and chart sizing.
 * Used by dashboard rendering components to ensure consistent sizing.
 */

export const DASHBOARD_LAYOUT = {
  /**
   * Grid system configuration
   */
  GRID_COLUMNS: 12,
  ROW_HEIGHT: 150, // pixels per grid row unit
  MARGIN: 10, // pixels between grid items

  /**
   * Chart sizing configuration
   */
  CHART: {
    /**
     * Height multiplier for grid units
     * Chart height = position.h * HEIGHT_MULTIPLIER
     */
    HEIGHT_MULTIPLIER: 150,

    /**
     * Minimum chart height in pixels
     * Ensures charts are never too small to be useful
     */
    MIN_HEIGHT: 250,

    /**
     * Minimum height with padding for responsive containers
     */
    MIN_HEIGHT_WITH_PADDING: 200,

    /**
     * Padding to subtract from container height
     * Accounts for chart header, borders, etc.
     */
    HEIGHT_PADDING: 100,
  },
} as const;

/**
 * Responsive column span breakpoints
 * Maps grid width to responsive Tailwind classes
 */
export const RESPONSIVE_COL_SPANS = {
  SMALL: 'col-span-full sm:col-span-6 xl:col-span-4', // width <= 4
  MEDIUM: 'col-span-full sm:col-span-6', // width <= 6
  LARGE: 'col-span-full lg:col-span-8', // width <= 8
  FULL: 'col-span-full', // width > 8
} as const;

/**
 * Helper function to get responsive column span class based on width
 *
 * @param width - Grid width units (typically from position.w)
 * @returns Tailwind responsive column span classes
 */
export function getResponsiveColSpan(width: number): string {
  if (width <= 4) return RESPONSIVE_COL_SPANS.SMALL;
  if (width <= 6) return RESPONSIVE_COL_SPANS.MEDIUM;
  if (width <= 8) return RESPONSIVE_COL_SPANS.LARGE;
  return RESPONSIVE_COL_SPANS.FULL;
}
