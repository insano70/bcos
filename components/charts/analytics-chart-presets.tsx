/**
 * Analytics Chart Presets
 *
 * Predefined chart configurations for common use cases.
 * Extracted from analytics-chart.tsx to reduce main component size.
 *
 * Usage:
 * ```tsx
 * import { AnalyticsChartPresets } from '@/components/charts/analytics-chart-presets';
 *
 * <AnalyticsChartPresets.PracticeRevenueTrend startDate="2024-01-01" />
 * ```
 */

import type { FrequencyType, MeasureType } from '@/lib/types/analytics';
import AnalyticsChart from './analytics-chart';

/**
 * Partial props type for presets
 */
type AnalyticsChartPresetProps = Partial<React.ComponentProps<typeof AnalyticsChart>>;

/**
 * Predefined chart configurations for common use cases
 */
export const AnalyticsChartPresets = {
  /**
   * Practice Revenue Trend
   * Line chart showing revenue trends grouped by practice
   */
  PracticeRevenueTrend: (props: AnalyticsChartPresetProps) => (
    <AnalyticsChart
      chartType="line"
      measure={'Charges by Provider' as MeasureType}
      frequency={'Monthly' as FrequencyType}
      groupBy="practice_uid"
      title="Practice Revenue Trend"
      {...props}
    />
  ),

  /**
   * Provider Performance
   * Bar chart showing performance metrics grouped by provider
   */
  ProviderPerformance: (props: AnalyticsChartPresetProps) => (
    <AnalyticsChart
      chartType="bar"
      measure={'Charges by Provider' as MeasureType}
      frequency={'Monthly' as FrequencyType}
      groupBy="provider_uid"
      title="Provider Performance"
      {...props}
    />
  ),

  /**
   * Revenue Distribution
   * Doughnut chart showing revenue distribution by practice
   */
  RevenueDistribution: (props: AnalyticsChartPresetProps) => (
    <AnalyticsChart
      chartType="doughnut"
      measure={'Charges by Provider' as MeasureType}
      frequency={'Monthly' as FrequencyType}
      groupBy="practice_uid"
      title="Revenue Distribution"
      {...props}
    />
  ),
};
