/**
 * Period Comparison Legend Utilities
 * Enhanced legend generation for charts with period comparison data
 */

import type { Chart, LegendItem } from 'chart.js';

// Extended dataset type with custom properties
interface ExtendedDataset {
  label?: string;
  data?: unknown[];
  [key: string]: unknown;
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
): (chart: Chart) => LegendItem[] {
  const { comparisonIcon = '📊', currentIcon = '📈' } = options;

  return function generateLabels(chart: Chart): LegendItem[] {
    const originalLabels = chart.options?.plugins?.legend?.labels?.generateLabels?.(chart) || [];

    return originalLabels.map((item: LegendItem) => {
      if (item.datasetIndex === undefined) return item;
      const dataset = chart.data.datasets[item.datasetIndex] as ExtendedDataset;
      const isComparison =
        dataset?.label?.includes('Previous') ||
        dataset?.label?.includes('Last Year') ||
        dataset?.label?.includes('Ago');

      if (isComparison) {
        return {
          ...item,
          text: `${comparisonIcon} ${item.text}`,
          // Add visual styling for comparison items
          fillStyle: adjustColorOpacity(item.fillStyle as string, 0.7),
          strokeStyle: adjustColorOpacity(item.strokeStyle as string, 0.7),
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
  chart: Chart,
  _options: PeriodComparisonLegendOptions = {}
): (event: MouseEvent, legendItem: LegendItem, legend: unknown) => void {
  return function onClick(_event: MouseEvent, legendItem: LegendItem, _legend: unknown): void {
    if (legendItem.datasetIndex === undefined) return;
    const dataset = chart.data.datasets[legendItem.datasetIndex] as ExtendedDataset;
    const isComparison =
      dataset?.label?.includes('Previous') ||
      dataset?.label?.includes('Last Year') ||
      dataset?.label?.includes('Ago');

    if (isComparison) {
      // For comparison datasets, could show a modal or tooltip here explaining the comparison
      // Currently just toggles visibility like non-comparison datasets
    }

    // Default legend toggle behavior
    if (legendItem.datasetIndex !== undefined) {
      chart.toggleDataVisibility(legendItem.datasetIndex);
      chart.update();
    }
  };
}

/**
 * Create a custom HTML legend for period comparison charts
 */
export function createPeriodComparisonHtmlLegend(
  chart: Chart,
  container: HTMLElement,
  options: PeriodComparisonLegendOptions = {}
): void {
  const { comparisonIcon = '📊', currentIcon = '📈' } = options;

  // Clear existing legend
  while (container.firstChild) {
    container.firstChild.remove();
  }

  const datasets = chart.data.datasets;
  const currentDatasets: ExtendedDataset[] = [];
  const comparisonDatasets: ExtendedDataset[] = [];

  // Separate current and comparison datasets
  datasets.forEach((dataset: unknown, index: number) => {
    const extendedDataset = dataset as ExtendedDataset;
    const isComparison =
      extendedDataset?.label?.includes('Previous') ||
      extendedDataset?.label?.includes('Last Year') ||
      extendedDataset?.label?.includes('Ago');

    if (isComparison) {
      comparisonDatasets.push({ ...extendedDataset, index });
    } else {
      currentDatasets.push({ ...extendedDataset, index });
    }
  });

  // Create legend sections
  if (currentDatasets.length > 0) {
    const currentSection = document.createElement('div');
    currentSection.className = 'legend-section mb-3';

    const currentTitle = document.createElement('div');
    currentTitle.className =
      'legend-title text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
    currentTitle.textContent = `${currentIcon} Current Period`;
    currentSection.appendChild(currentTitle);

    currentDatasets.forEach((dataset) => {
      const item = createLegendItem(dataset, chart, false);
      currentSection.appendChild(item);
    });

    container.appendChild(currentSection);
  }

  if (comparisonDatasets.length > 0) {
    const comparisonSection = document.createElement('div');
    comparisonSection.className = 'legend-section';

    const comparisonTitle = document.createElement('div');
    comparisonTitle.className =
      'legend-title text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
    comparisonTitle.textContent = `${comparisonIcon} Comparison Period`;
    comparisonSection.appendChild(comparisonTitle);

    comparisonDatasets.forEach((dataset) => {
      const item = createLegendItem(dataset, chart, false, true);
      comparisonSection.appendChild(item);
    });

    container.appendChild(comparisonSection);
  }
}

/**
 * Create a single legend item
 */
function createLegendItem(
  dataset: ExtendedDataset,
  chart: Chart,
  _false: boolean,
  isComparison: boolean = false
) {
  const li = document.createElement('li');
  li.className = 'legend-item flex items-center space-x-2 mb-1 cursor-pointer';

  // Color indicator
  const colorIndicator = document.createElement('div');
  colorIndicator.className = 'w-3 h-3 rounded-sm';
  const backgroundColor = dataset.backgroundColor as string;
  const borderColor = dataset.borderColor as string;
  colorIndicator.style.backgroundColor = isComparison
    ? adjustColorOpacity(backgroundColor, 0.7)
    : backgroundColor;
  colorIndicator.style.border = `1px solid ${
    isComparison ? adjustColorOpacity(borderColor, 0.7) : borderColor
  }`;

  // Label
  const label = document.createElement('span');
  label.className = 'text-sm text-gray-600 dark:text-gray-400';
  label.textContent = dataset.label || '';

  // Value (if available)
  const value = document.createElement('span');
  value.className = 'text-sm font-medium text-gray-900 dark:text-gray-100 ml-auto';

  // Calculate total value for this dataset
  if (dataset.data && Array.isArray(dataset.data)) {
    const total = dataset.data.reduce((sum: number, val: unknown) => {
      const numVal = typeof val === 'number' ? val : 0;
      return sum + numVal;
    }, 0);
    if (total > 0) {
      // Format value based on measure type
      const measureType = (dataset.measureType as string) || 'number';
      value.textContent = formatValue(total, measureType);
    }
  }

  li.appendChild(colorIndicator);
  li.appendChild(label);
  li.appendChild(value);

  // Click handler
  li.addEventListener('click', () => {
    const index = dataset.index as number | undefined;
    if (index !== undefined) {
      chart.toggleDataVisibility(index);
      chart.update();
    }
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
