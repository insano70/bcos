/**
 * Responsive Chart Types
 * TypeScript interfaces and types for responsive chart functionality
 */

export interface ResponsiveChartProps {
  responsive?: boolean; // Enable responsive behavior (default: false for backwards compatibility)
  minHeight?: number; // Minimum height for responsive charts (default: 200px)
  maxHeight?: number; // Maximum height for responsive charts (default: 800px)
  aspectRatio?: number; // Fixed aspect ratio (width/height) for responsive charts
}

export interface ResponsiveChartContainerProps {
  children: React.ReactElement;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
}

export interface ResponsiveDimensionOptions {
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
  debounceMs?: number;
}

// Configuration for dashboard chart positioning with responsive support
export interface ResponsiveDashboardChartConfig {
  position: {
    x: number;
    y: number;
    w: number; // Grid width units
    h: number; // Grid height units
  };
  responsive?: ResponsiveChartProps;
}

// Enhanced chart definition with responsive options
export interface ResponsiveChartDefinition {
  chart_name: string;
  chart_type: 'line' | 'bar' | 'doughnut';
  responsive_config?: ResponsiveChartProps;
  // ... other chart definition properties
}

/**
 * Utility type for components that can be either fixed or responsive
 */
export type FlexibleChartProps<T = {}> = T & {
  // Traditional fixed sizing (backwards compatibility)
  width?: number;
  height?: number;
} & ResponsiveChartProps;

/**
 * Hook return type for responsive dimensions
 */
export interface UseResponsiveChartDimensions {
  dimensions: ChartDimensions;
  isReady: boolean; // Whether dimensions have been calculated
}

export default ResponsiveChartProps;
