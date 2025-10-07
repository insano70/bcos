/**
 * Period Comparison Test Utilities
 * Test period comparison functionality across all supported chart types
 */

import type { AggAppMeasure } from '@/lib/types/analytics';
import { calculateComparisonDateRange } from './period-comparison';
import { applyPeriodComparisonColors, getColorScheme } from './period-comparison-colors';
import { simplifiedChartTransformer } from './simplified-chart-transformer';

// Extended dataset type with custom properties
interface ExtendedDataset {
  label?: string;
  data?: unknown[];
  [key: string]: unknown;
}

export interface TestResult {
  chartType: string;
  success: boolean;
  error?: string;
  dataPoints: number;
  datasets: number;
  labels: number;
}

export interface PeriodComparisonTestConfig {
  chartTypes: Array<'line' | 'bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'table'>;
  comparisonTypes: Array<'previous_period' | 'same_period_last_year' | 'custom_period'>;
  frequencies: Array<'Monthly' | 'Weekly' | 'Quarterly'>;
}

/**
 * Generate mock data for testing period comparison
 */
export function generateMockPeriodComparisonData(
  frequency: 'Monthly' | 'Weekly' | 'Quarterly' = 'Monthly',
  dataPoints: number = 6
): AggAppMeasure[] {
  const currentData: AggAppMeasure[] = [];
  const comparisonData: AggAppMeasure[] = [];

  const baseDate = new Date('2024-01-01');

  for (let i = 0; i < dataPoints; i++) {
    const currentDate = new Date(baseDate);
    const comparisonDate = new Date(baseDate);

    // Adjust dates based on frequency
    switch (frequency) {
      case 'Monthly':
        currentDate.setMonth(currentDate.getMonth() + i);
        comparisonDate.setMonth(comparisonDate.getMonth() + i - 1);
        break;
      case 'Weekly':
        currentDate.setDate(currentDate.getDate() + i * 7);
        comparisonDate.setDate(comparisonDate.getDate() + (i - 1) * 7);
        break;
      case 'Quarterly':
        currentDate.setMonth(currentDate.getMonth() + i * 3);
        comparisonDate.setMonth(comparisonDate.getMonth() + (i - 1) * 3);
        break;
    }

    // Current period data
    currentData.push({
      practice: 'Test Practice',
      practice_primary: 'TEST',
      practice_uid: 114,
      provider_name: `Provider ${i + 1}`,
      measure: 'Charges by Provider',
      frequency,
      date_index: currentDate.toISOString().split('T')[0] || '',
      measure_value: Math.random() * 10000 + 5000,
      measure_type: 'currency',
      series_id: 'current',
      series_label: 'Current Period',
      series_aggregation: 'sum',
    });

    // Comparison period data
    comparisonData.push({
      practice: 'Test Practice',
      practice_primary: 'TEST',
      practice_uid: 114,
      provider_name: `Provider ${i + 1}`,
      measure: 'Charges by Provider',
      frequency,
      date_index: comparisonDate.toISOString().split('T')[0] || '',
      measure_value: Math.random() * 10000 + 4000,
      measure_type: 'currency',
      series_id: 'comparison',
      series_label: 'Previous Period',
      series_aggregation: 'sum',
    });
  }

  return [...currentData, ...comparisonData];
}

/**
 * Test period comparison transformation for a specific chart type
 */
export function testPeriodComparisonTransformation(
  chartType: 'line' | 'bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'table',
  mockData: AggAppMeasure[]
): TestResult {
  try {
    const chartData = simplifiedChartTransformer.transformDataWithPeriodComparison(
      mockData,
      chartType,
      'provider_name',
      'default'
    );

    return {
      chartType,
      success: true,
      dataPoints: chartData.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0),
      datasets: chartData.datasets.length,
      labels: chartData.labels.length,
    };
  } catch (error) {
    return {
      chartType,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      dataPoints: 0,
      datasets: 0,
      labels: 0,
    };
  }
}

/**
 * Test period comparison date range calculation
 */
export function testPeriodComparisonDateRanges(
  comparisonType: 'previous_period' | 'same_period_last_year' | 'custom_period',
  frequency: 'Monthly' | 'Weekly' | 'Quarterly'
): TestResult {
  try {
    const startDate = '2024-06-01';
    const endDate = '2024-06-30';

    const comparisonConfig = {
      enabled: true,
      comparisonType,
      ...(comparisonType === 'custom_period' ? { customPeriodOffset: 2 } : {}),
      labelFormat: 'Test Label',
    };

    const _comparisonRange = calculateComparisonDateRange(
      startDate,
      endDate,
      frequency,
      comparisonConfig
    );

    return {
      chartType: `${comparisonType}-${frequency}`,
      success: true,
      dataPoints: 1,
      datasets: 1,
      labels: 1,
    };
  } catch (error) {
    return {
      chartType: `${comparisonType}-${frequency}`,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      dataPoints: 0,
      datasets: 0,
      labels: 0,
    };
  }
}

/**
 * Test color scheme application
 */
export function testColorSchemeApplication(
  chartType: 'line' | 'bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'table',
  mockData: AggAppMeasure[]
): TestResult {
  try {
    const chartData = simplifiedChartTransformer.transformDataWithPeriodComparison(
      mockData,
      chartType,
      'provider_name',
      'default'
    );

    const colorScheme = getColorScheme('default');
    const coloredDatasets = applyPeriodComparisonColors(
      chartData.datasets as ExtendedDataset[],
      colorScheme,
      chartType
    );

    return {
      chartType: `${chartType}-colors`,
      success: true,
      dataPoints: coloredDatasets.reduce((sum: number, dataset: ExtendedDataset) => {
        const data = dataset.data as unknown[] | undefined;
        return sum + (data?.length || 0);
      }, 0),
      datasets: coloredDatasets.length,
      labels: chartData.labels.length,
    };
  } catch (error) {
    return {
      chartType: `${chartType}-colors`,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      dataPoints: 0,
      datasets: 0,
      labels: 0,
    };
  }
}

/**
 * Run comprehensive period comparison tests
 */
export function runPeriodComparisonTests(
  config: PeriodComparisonTestConfig = {
    chartTypes: ['line', 'bar', 'horizontal-bar', 'progress-bar', 'doughnut'],
    comparisonTypes: ['previous_period', 'same_period_last_year', 'custom_period'],
    frequencies: ['Monthly', 'Weekly', 'Quarterly'],
  }
): TestResult[] {
  const results: TestResult[] = [];

  // Test chart type transformations
  for (const chartType of config.chartTypes) {
    const mockData = generateMockPeriodComparisonData('Monthly', 6);
    results.push(testPeriodComparisonTransformation(chartType, mockData));
    results.push(testColorSchemeApplication(chartType, mockData));
  }

  // Test date range calculations
  for (const comparisonType of config.comparisonTypes) {
    for (const frequency of config.frequencies) {
      results.push(testPeriodComparisonDateRanges(comparisonType, frequency));
    }
  }

  return results;
}

/**
 * Generate test report
 */
export function generateTestReport(results: TestResult[]): string {
  const totalTests = results.length;
  const successfulTests = results.filter((r) => r.success).length;
  const failedTests = results.filter((r) => !r.success);

  let report = `Period Comparison Test Report\n`;
  report += `================================\n\n`;
  report += `Total Tests: ${totalTests}\n`;
  report += `Successful: ${successfulTests}\n`;
  report += `Failed: ${failedTests.length}\n`;
  report += `Success Rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%\n\n`;

  if (failedTests.length > 0) {
    report += `Failed Tests:\n`;
    report += `-------------\n`;
    failedTests.forEach((test) => {
      report += `- ${test.chartType}: ${test.error}\n`;
    });
  }

  report += `\nSuccessful Tests:\n`;
  report += `----------------\n`;
  results
    .filter((r) => r.success)
    .forEach((test) => {
      report += `- ${test.chartType}: ${test.datasets} datasets, ${test.dataPoints} data points\n`;
    });

  return report;
}
