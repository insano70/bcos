/**
 * Refresh Icon Component
 *
 * Shared refresh icon with loading animation state.
 * Extracted from duplicate inline SVGs across Command Center components.
 */

'use client';

interface RefreshIconProps {
  loading?: boolean;
  className?: string;
}

export default function RefreshIcon({ loading = false, className = 'w-4 h-4' }: RefreshIconProps) {
  return (
    <svg
      className={`${className} ${loading ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}





