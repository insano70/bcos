'use client';

import type { ContrastLevel } from '@/lib/utils/color-contrast';

interface ColorContrastBadgeProps {
  level: ContrastLevel;
  ratio: number;
  compact?: boolean;
}

/**
 * Badge showing WCAG contrast compliance level
 */
export default function ColorContrastBadge({
  level,
  ratio,
  compact = false,
}: ColorContrastBadgeProps) {
  const getBadgeStyle = () => {
    switch (level) {
      case 'AAA':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-800 dark:text-green-300',
          border: 'border-green-300 dark:border-green-700',
          icon: '✓✓',
          label: 'AAA',
          description: 'Excellent contrast',
        };
      case 'AA':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-800 dark:text-blue-300',
          border: 'border-blue-300 dark:border-blue-700',
          icon: '✓',
          label: 'AA',
          description: 'Good contrast',
        };
      case 'AA_LARGE':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-800 dark:text-yellow-300',
          border: 'border-yellow-300 dark:border-yellow-700',
          icon: '⚠',
          label: 'AA Large',
          description: 'OK for large text only',
        };
      case 'FAIL':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-800 dark:text-red-300',
          border: 'border-red-300 dark:border-red-700',
          icon: '✗',
          label: 'Fail',
          description: 'Poor contrast - not accessible',
        };
    }
  };

  const style = getBadgeStyle();

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
        title={`${style.description} (${ratio}:1)`}
      >
        <span>{style.icon}</span>
        <span>{style.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${style.bg} ${style.text} ${style.border}`}
    >
      <span className="text-lg">{style.icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{style.label}</span>
          <span className="text-xs opacity-75">{ratio.toFixed(1)}:1</span>
        </div>
        <p className="text-xs opacity-90">{style.description}</p>
      </div>
    </div>
  );
}
