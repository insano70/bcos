/**
 * Period Comparison Color Schemes
 * Color palettes and utilities for period comparison visualization
 */

export interface ColorScheme {
  name: string;
  description: string;
  current: {
    primary: string;
    secondary: string;
    gradient: string[];
  };
  comparison: {
    primary: string;
    secondary: string;
    gradient: string[];
  };
}

/**
 * Predefined color schemes for period comparison
 */
export const PERIOD_COMPARISON_COLOR_SCHEMES: Record<string, ColorScheme> = {
  'default': {
    name: 'Default',
    description: 'Standard blue and gray scheme',
    current: {
      primary: '#3B82F6', // Blue-500
      secondary: '#60A5FA', // Blue-400
      gradient: ['#3B82F6', '#60A5FA', '#93C5FD']
    },
    comparison: {
      primary: '#6B7280', // Gray-500
      secondary: '#9CA3AF', // Gray-400
      gradient: ['#6B7280', '#9CA3AF', '#D1D5DB']
    }
  },
  
  'violet-gray': {
    name: 'Violet & Gray',
    description: 'Violet for current, gray for comparison',
    current: {
      primary: '#8B5CF6', // Violet-500
      secondary: '#A78BFA', // Violet-400
      gradient: ['#8B5CF6', '#A78BFA', '#C4B5FD']
    },
    comparison: {
      primary: '#6B7280', // Gray-500
      secondary: '#9CA3AF', // Gray-400
      gradient: ['#6B7280', '#9CA3AF', '#D1D5DB']
    }
  },
  
  'green-blue': {
    name: 'Green & Blue',
    description: 'Green for current, blue for comparison',
    current: {
      primary: '#10B981', // Emerald-500
      secondary: '#34D399', // Emerald-400
      gradient: ['#10B981', '#34D399', '#6EE7B7']
    },
    comparison: {
      primary: '#3B82F6', // Blue-500
      secondary: '#60A5FA', // Blue-400
      gradient: ['#3B82F6', '#60A5FA', '#93C5FD']
    }
  },
  
  'orange-purple': {
    name: 'Orange & Purple',
    description: 'Orange for current, purple for comparison',
    current: {
      primary: '#F59E0B', // Amber-500
      secondary: '#FBBF24', // Amber-400
      gradient: ['#F59E0B', '#FBBF24', '#FCD34D']
    },
    comparison: {
      primary: '#8B5CF6', // Violet-500
      secondary: '#A78BFA', // Violet-400
      gradient: ['#8B5CF6', '#A78BFA', '#C4B5FD']
    }
  },
  
  'red-teal': {
    name: 'Red & Teal',
    description: 'Red for current, teal for comparison',
    current: {
      primary: '#EF4444', // Red-500
      secondary: '#F87171', // Red-400
      gradient: ['#EF4444', '#F87171', '#FCA5A5']
    },
    comparison: {
      primary: '#14B8A6', // Teal-500
      secondary: '#5EEAD4', // Teal-400
      gradient: ['#14B8A6', '#5EEAD4', '#99F6E4']
    }
  },
  
  'monochrome': {
    name: 'Monochrome',
    description: 'Dark and light gray scheme',
    current: {
      primary: '#374151', // Gray-700
      secondary: '#4B5563', // Gray-600
      gradient: ['#374151', '#4B5563', '#6B7280']
    },
    comparison: {
      primary: '#9CA3AF', // Gray-400
      secondary: '#D1D5DB', // Gray-300
      gradient: ['#9CA3AF', '#D1D5DB', '#E5E7EB']
    }
  }
};

/**
 * Get color scheme by name
 */
export function getColorScheme(schemeName: string): ColorScheme {
  const scheme = PERIOD_COMPARISON_COLOR_SCHEMES[schemeName];
  if (scheme) {
    return scheme;
  }
  const defaultScheme = PERIOD_COMPARISON_COLOR_SCHEMES.default;
  if (!defaultScheme) {
    throw new Error('Default color scheme not found');
  }
  return defaultScheme;
}

/**
 * Get all available color schemes
 */
export function getAllColorSchemes(): ColorScheme[] {
  return Object.values(PERIOD_COMPARISON_COLOR_SCHEMES);
}

/**
 * Apply period comparison colors to chart datasets
 */
export function applyPeriodComparisonColors(
  datasets: any[],
  colorScheme: ColorScheme,
  chartType: 'line' | 'bar' | 'area' | 'pie' | 'doughnut' | 'horizontal-bar' | 'progress-bar' | 'table' = 'bar'
): any[] {
  return datasets.map((dataset, _index) => {
    const isComparison = dataset.label?.includes('Previous') || 
                        dataset.label?.includes('Last Year') ||
                        dataset.label?.includes('Ago');
    
    const colors = isComparison ? colorScheme.comparison : colorScheme.current;
    
    switch (chartType) {
      case 'line':
      case 'area':
        return {
          ...dataset,
          borderColor: colors.primary,
          backgroundColor: colors.secondary,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.primary,
          pointHoverBackgroundColor: colors.secondary,
          pointHoverBorderColor: colors.primary,
        };
      
      case 'bar':
      case 'horizontal-bar':
        return {
          ...dataset,
          backgroundColor: colors.primary,
          borderColor: colors.primary,
          hoverBackgroundColor: colors.secondary,
          hoverBorderColor: colors.secondary,
        };
      
      case 'pie':
      case 'doughnut':
        return {
          ...dataset,
          backgroundColor: colors.gradient,
          borderColor: colors.primary,
          hoverBackgroundColor: colors.gradient.map(color => adjustColorOpacity(color, 0.8)),
          hoverBorderColor: colors.secondary,
        };
      
      default:
        return {
          ...dataset,
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        };
    }
  });
}

/**
 * Generate period comparison color palette
 */
export function generatePeriodComparisonPalette(
  colorScheme: ColorScheme,
  chartType: 'line' | 'bar' | 'area' | 'pie' | 'doughnut' | 'horizontal-bar' | 'progress-bar' | 'table' = 'bar'
): {
  current: string | string[];
  comparison: string | string[];
} {
  switch (chartType) {
    case 'line':
    case 'area':
      return {
        current: colorScheme.current.primary,
        comparison: colorScheme.comparison.primary,
      };
    
    case 'bar':
    case 'horizontal-bar':
      return {
        current: colorScheme.current.primary,
        comparison: colorScheme.comparison.primary,
      };
    
    case 'pie':
    case 'doughnut':
      return {
        current: colorScheme.current.gradient,
        comparison: colorScheme.comparison.gradient,
      };
    
    default:
      return {
        current: colorScheme.current.primary,
        comparison: colorScheme.comparison.primary,
      };
  }
}

/**
 * Adjust color opacity
 */
function adjustColorOpacity(color: string, opacity: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  
  if (color.startsWith('rgba(')) {
    return color.replace(/,\s*[\d.]+\)$/, `, ${opacity})`);
  }
  
  return color;
}

/**
 * Get color scheme recommendations based on chart type and data
 */
export function getRecommendedColorScheme(
  chartType: 'line' | 'bar' | 'area' | 'pie' | 'doughnut' | 'horizontal-bar' | 'progress-bar' | 'table',
  dataContext?: 'financial' | 'healthcare' | 'general'
): string {
  switch (dataContext) {
    case 'financial':
      return chartType === 'line' ? 'green-blue' : 'default';
    
    case 'healthcare':
      return chartType === 'bar' ? 'violet-gray' : 'default';
    
    default:
      switch (chartType) {
        case 'line':
          return 'green-blue';
        case 'bar':
        case 'horizontal-bar':
          return 'default';
        case 'area':
          return 'violet-gray';
        case 'pie':
        case 'doughnut':
          return 'orange-purple';
        default:
          return 'default';
      }
  }
}
