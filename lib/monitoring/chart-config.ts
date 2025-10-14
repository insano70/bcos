/**
 * Chart Configuration Utility for Monitoring Dashboard
 * 
 * Provides shared Chart.js configuration using existing chartjs-config patterns.
 * Maintains consistency with application charts while supporting monitoring-specific needs.
 */

import type { ChartOptions } from 'chart.js';

export const BRAND_COLOR = '#00AEEF'; // violet-500 in Tailwind theme

/**
 * Get base chart options for monitoring charts
 */
export function getBaseChartOptions(darkMode: boolean, chartColors: Record<string, unknown>): Partial<ChartOptions> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
          font: {
            family: 'Inter, sans-serif',
            size: 12,
            weight: 500,
          },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: darkMode ? chartColors.tooltipBgColor.dark : chartColors.tooltipBgColor.light,
        titleColor: darkMode ? chartColors.tooltipTitleColor.dark : chartColors.tooltipTitleColor.light,
        bodyColor: darkMode ? chartColors.tooltipBodyColor.dark : chartColors.tooltipBodyColor.light,
        borderColor: darkMode ? chartColors.tooltipBorderColor.dark : chartColors.tooltipBorderColor.light,
        borderWidth: 1,
      },
    },
  };
}

/**
 * Get time-series scale configuration
 */
export function getTimeScaleConfig(darkMode: boolean, chartColors: Record<string, unknown>) {
  return {
    type: 'time' as const,
    time: {
      unit: 'minute' as const,
      displayFormats: {
        minute: 'HH:mm',
      },
    },
    grid: {
      display: false,
    },
    ticks: {
      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
    },
  };
}

/**
 * Get linear scale configuration
 */
export function getLinearScaleConfig(
  darkMode: boolean,
  chartColors: Record<string, unknown>,
  title: string,
  beginAtZero = true
) {
  return {
    beginAtZero,
    title: {
      display: true,
      text: title,
      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
    },
    grid: {
      color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
    },
    ticks: {
      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
    },
  };
}

