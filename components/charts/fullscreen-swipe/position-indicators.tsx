'use client';

/**
 * Position Indicators Component
 *
 * Dot indicators showing current position in chart sequence.
 * Collapses to numeric display for more than 10 items.
 */

interface PositionIndicatorsProps {
  /** Total number of items */
  total: number;
  /** Current item index (0-based) */
  current: number;
  /** Callback when indicator is clicked */
  onSelect?: (index: number) => void;
  /** Additional CSS classes */
  className?: string;
}

export default function PositionIndicators({
  total,
  current,
  onSelect,
  className = '',
}: PositionIndicatorsProps) {
  // Collapse indicators if more than 10
  const showCollapsed = total > 10;

  if (showCollapsed) {
    // Show: "X / Y" format for many items
    return (
      <div className={`flex items-center justify-center gap-1 ${className}`}>
        <span className="text-xs text-gray-400">
          {current + 1} / {total}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect?.(index)}
          className={`rounded-full transition-all duration-200 ${
            index === current
              ? 'w-6 h-2 bg-violet-500'
              : 'w-2 h-2 bg-gray-400 hover:bg-gray-300'
          }`}
          aria-label={`Go to chart ${index + 1}`}
          aria-current={index === current ? 'true' : undefined}
        />
      ))}
    </div>
  );
}

