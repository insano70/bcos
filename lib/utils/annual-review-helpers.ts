import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCompactValue } from '@/lib/utils/format-value';

/**
 * Format measure value based on format type
 * Uses the shared formatCompactValue utility
 */
export function formatMeasureDisplayValue(
  value: number,
  formatType: 'number' | 'currency' | 'percentage'
): string {
  return formatCompactValue(value, { style: formatType });
}

/**
 * Get trend icon and color configuration
 */
export function getTrendDisplay(trend: 'improving' | 'declining' | 'stable') {
  switch (trend) {
    case 'improving':
      return {
        Icon: TrendingUp,
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
        label: 'Improving',
      };
    case 'declining':
      return {
        Icon: TrendingDown,
        color: 'text-rose-500',
        bg: 'bg-rose-500/10',
        label: 'Declining',
      };
    default:
      return {
        Icon: Minus,
        color: 'text-slate-500',
        bg: 'bg-slate-500/10',
        label: 'Stable',
      };
  }
}
