/**
 * Period Comparison Legend Utilities
 * Enhanced legend generation for charts with period comparison data
 */

export interface LegendItem {
  text: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  pointStyle: string;
  hidden: boolean;
  datasetIndex: number;
}

export interface PeriodComparisonLegendOptions {
  showComparisonIndicators?: boolean;
  comparisonIcon?: string;
  currentIcon?: string;
  false?: boolean;
}

/**
 * Enhanced legend label generator for period comparison charts
 */
export function createPeriodComparisonLegendLabels(
  options: PeriodComparisonLegendOptions = {}
) {
  const {
    
    comparisonIcon = '📊',
    currentIcon = '📈',
    
  } = options;

  return function generateLabels(chart: any): LegendItem[] {
    const originalLabels = chart.options?.plugins?.legend?.labels?.generateLabels?.(chart) || [];
    
    return originalLabels.map((item: LegendItem) => {
      const dataset = chart.data.datasets[item.datasetIndex];
      const isComparison = dataset.label?.includes('Previous') || 
                          dataset.label?.includes('Last Year') ||
                          dataset.label?.includes('Ago');

      if (isComparison) {
        return {
          ...item,
          text: `${comparisonIcon} ${item.text}`,
          // Add visual styling for comparison items
          fillStyle: adjustColorOpacity(item.fillStyle, 0.7),
          strokeStyle: adjustColorOpacity(item.strokeStyle, 0.7),
        };
      } else if (!isComparison) {
        return {
          ...item,
          text: `${currentIcon} ${item.text}`,
        };
      }

      return item;
    });
  };
}

/**
 * Enhanced legend onClick handler for period comparison charts
 */
export function createPeriodComparisonLegendOnClick(
  chart: any,
  options: PeriodComparisonLegendOptions = {}
) {
  return function onClick(_event: MouseEvent, legendItem: LegendItem, _legend: any) {
    const dataset = chart.data.datasets[legendItem.datasetIndex];
    const isComparison = dataset.label?.includes('Previous') || 
                        dataset.label?.includes('Last Year') ||
                        dataset.label?.includes('Ago');

    if (isComparison) {
      // For comparison datasets, show a tooltip explaining the comparison
      console.log(`Comparison period: ${dataset.label}`);
      // You could show a modal or tooltip here explaining the comparison
    }

    // Default legend toggle behavior
    chart.toggleDataVisibility(legendItem.datasetIndex);
    chart.update();
  };
}

/**
 * Create a custom HTML legend for period comparison charts
 */
export function createPeriodComparisonHtmlLegend(
  chart: any,
  container: HTMLElement,
  options: PeriodComparisonLegendOptions = {}
) {
  const {
    comparisonIcon = '📊',
    currentIcon = '📈'
  } = options;

  // Clear existing legend
  while (container.firstChild) {
    container.firstChild.remove();
  }

  const datasets = chart.data.datasets;
  const currentDatasets: any[] = [];
  const comparisonDatasets: any[] = [];

  // Separate current and comparison datasets
  datasets.forEach((dataset: any, index: number) => {
    const isComparison = dataset.label?.includes('Previous') || 
                        dataset.label?.includes('Last Year') ||
                        dataset.label?.includes('Ago');
    
    if (isComparison) {
      comparisonDatasets.push({ ...dataset, index });
    } else {
      currentDatasets.push({ ...dataset, index });
    }
  });

  // Create legend sections
  if (currentDatasets.length > 0) {
    const currentSection = document.createElement('div');
    currentSection.className = 'legend-section mb-3';
    
    const currentTitle = document.createElement('div');
    currentTitle.className = 'legend-title text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
    currentTitle.textContent = `${currentIcon} Current Period`;
    currentSection.appendChild(currentTitle);

    currentDatasets.forEach(dataset => {
      const item = createLegendItem(dataset, chart, false);
      currentSection.appendChild(item);
    });

    container.appendChild(currentSection);
  }

  if (comparisonDatasets.length > 0) {
    const comparisonSection = document.createElement('div');
    comparisonSection.className = 'legend-section';
    
    const comparisonTitle = document.createElement('div');
    comparisonTitle.className = 'legend-title text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
    comparisonTitle.textContent = `${comparisonIcon} Comparison Period`;
    comparisonSection.appendChild(comparisonTitle);

    comparisonDatasets.forEach(dataset => {
      const item = createLegendItem(dataset, chart, false, true);
      comparisonSection.appendChild(item);
    });

    container.appendChild(comparisonSection);
  }
}

/**
 * Create a single legend item
 */
function createLegendItem(dataset: any, chart: any, _false: boolean, isComparison: boolean = false) {
  const li = document.createElement('li');
  li.className = 'legend-item flex items-center space-x-2 mb-1 cursor-pointer';
  
  // Color indicator
  const colorIndicator = document.createElement('div');
  colorIndicator.className = 'w-3 h-3 rounded-sm';
  colorIndicator.style.backgroundColor = isComparison 
    ? adjustColorOpacity(dataset.backgroundColor, 0.7)
    : dataset.backgroundColor;
  colorIndicator.style.border = `1px solid ${isComparison 
    ? adjustColorOpacity(dataset.borderColor, 0.7)
    : dataset.borderColor}`;
  
  // Label
  const label = document.createElement('span');
  label.className = 'text-sm text-gray-600 dark:text-gray-400';
  label.textContent = dataset.label;
  
  // Value (if available)
  const value = document.createElement('span');
  value.className = 'text-sm font-medium text-gray-900 dark:text-gray-100 ml-auto';
  
  // Calculate total value for this dataset
  const total = dataset.data.reduce((sum: number, val: number) => sum + (val || 0), 0);
  if (total > 0) {
    // Format value based on measure type
    const measureType = dataset.measureType || 'number';
    value.textContent = formatValue(total, measureType);
  }
  
  li.appendChild(colorIndicator);
  li.appendChild(label);
  li.appendChild(value);
  
  // Click handler
  li.addEventListener('click', () => {
    chart.toggleDataVisibility(dataset.index);
    chart.update();
  });
  
  return li;
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
 * Format value based on measure type
 */
function formatValue(value: number, measureType: string): string {
  switch (measureType) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    
    case 'percentage':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value / 100);
    
    case 'count':
      return new Intl.NumberFormat('en-US').format(value);
    
    default:
      return value.toString();
  }
}
