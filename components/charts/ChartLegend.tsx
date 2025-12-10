/**
 * Chart Legend Component
 *
 * Declarative React component for rendering chart legends.
 * Replaces imperative DOM manipulation with React patterns.
 *
 * Features:
 * - Sorts legend items by total value (descending)
 * - Shows formatted totals for each dataset
 * - Click to toggle dataset visibility
 * - Supports period comparison legends
 *
 * Single Responsibility: Legend rendering only
 */

'use client';

import { memo, useEffect, useState } from 'react';
import type { Chart, Chart as ChartType, ChartTypeRegistry } from 'chart.js';
import type { ChartData } from '@/lib/types/analytics';
import { formatValue } from '@/lib/utils/chart-data/formatters/value-formatter';
import { createPeriodComparisonHtmlLegend } from '@/lib/utils/period-comparison-legend';
import { ScrollableLegendContainer } from '@/components/ui/scrollable-legend';

/**
 * Legend item data structure
 */
interface LegendItem {
  text: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  datasetIndex: number;
  total: number;
}

/**
 * Props for ChartLegend component
 */
interface ChartLegendProps {
  chart: ChartType | null;
  chartData: ChartData;
  hasPeriodComparison: boolean;
  frequency?: string;
}

/**
 * Individual legend item component
 */
const LegendItemComponent = memo(function LegendItemComponent({
  item,
  measureType,
  onClick,
}: {
  item: LegendItem;
  measureType: string;
  onClick: () => void;
}) {
  return (
    <li
      className="flex items-center justify-between px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center flex-1 min-w-0">
        <span
          className="block w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
          style={{
            backgroundColor: item.fillStyle,
            borderColor: item.strokeStyle,
            borderWidth: `${item.lineWidth}px`,
          }}
        />
        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 mr-1">
          {formatValue(item.total, measureType)}
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[90px]">{item.text}</span>
      </div>
    </li>
  );
});

/**
 * Chart Legend Component
 *
 * Renders chart legend with clickable items to toggle dataset visibility.
 * Automatically calculates totals and sorts by value.
 *
 * @param props - Component props
 * @returns Legend component
 */
function ChartLegendInner({
  chart,
  chartData,
  hasPeriodComparison,
  frequency = 'Monthly',
}: ChartLegendProps) {
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);

  // Generate legend items when chart changes
  useEffect(() => {
    if (!chart) {
      setLegendItems([]);
      return;
    }

    if (hasPeriodComparison) {
      // For period comparison, use the specialized legend generator
      // Note: This uses DOM manipulation internally, which we'll keep for now
      // to maintain compatibility with the existing period comparison implementation
      const ul = document.createElement('ul');
      createPeriodComparisonHtmlLegend(
        chart as Chart<keyof ChartTypeRegistry>,
        ul,
        {}
      );

      // We'll use a ref-based approach for period comparison
      // This is a temporary compromise to avoid breaking existing functionality
      setLegendItems([]);
      return;
    }

    // Generate standard legend items
    const items =
      chart.options.plugins?.legend?.labels?.generateLabels?.(
        chart as Chart<keyof ChartTypeRegistry>
      ) || [];

    // Calculate totals and create legend items
    const itemsWithTotals = items.map((item) => {
      const dataset = chart.data.datasets[item.datasetIndex!];
      const dataArray = dataset?.data || [];
      const total = dataArray.reduce((sum: number, value: unknown) => {
        if (typeof value === 'number') {
          return sum + value;
        } else if (value && typeof value === 'object' && 'y' in value) {
          const yValue = (value as { y: unknown }).y;
          return sum + (typeof yValue === 'number' ? yValue : 0);
        }
        return sum;
      }, 0) as number;

      return {
        text: item.text,
        fillStyle: String(item.fillStyle),
        strokeStyle: String(item.strokeStyle),
        lineWidth: item.lineWidth || 0,
        datasetIndex: item.datasetIndex!,
        total,
      };
    });

    // Sort by total value (descending)
    itemsWithTotals.sort((a, b) => b.total - a.total);

    setLegendItems(itemsWithTotals);
  }, [chart, hasPeriodComparison, frequency]);

  /**
   * Handle legend item click to toggle dataset visibility
   */
  const handleItemClick = (datasetIndex: number) => {
    if (!chart) return;

    const meta = chart.getDatasetMeta(datasetIndex);
    meta.hidden = !meta.hidden;
    chart.update();
  };

  // Don't render anything for period comparison (handled by legacy DOM manipulation)
  if (hasPeriodComparison) {
    return null;
  }

  if (legendItems.length === 0) {
    return null;
  }

  const measureType = chartData.measureType || 'number';

  return (
    <ScrollableLegendContainer maxHeight={64} className="mb-3">
      <ul className="flex flex-wrap gap-x-1 gap-y-0.5">
        {legendItems.map((item) => (
          <LegendItemComponent
            key={item.datasetIndex}
            item={item}
            measureType={measureType}
            onClick={() => handleItemClick(item.datasetIndex)}
          />
        ))}
      </ul>
    </ScrollableLegendContainer>
  );
}

const ChartLegend = memo(ChartLegendInner);
export default ChartLegend;
