/**
 * Size presets for the Spinner component.
 * Use these for consistency across the application.
 */
const SPINNER_SIZES = {
  /** 16x16 - Button spinners, inline indicators */
  sm: { size: 'w-4 h-4', border: 'border' },
  /** 32x32 - Default content loading */
  md: { size: 'w-8 h-8', border: 'border-2' },
  /** 48x48 - Modal/fullscreen loading */
  lg: { size: 'w-12 h-12', border: 'border-4' },
  /** 64x64 - Full-page auth transitions */
  xl: { size: 'w-16 h-16', border: 'border-4' },
} as const;

export type SpinnerSize = keyof typeof SPINNER_SIZES;

interface SpinnerProps {
  /**
   * Predefined size preset. Use this for consistency.
   * - sm: 16x16 - Button spinners, inline indicators
   * - md: 32x32 - Default content loading
   * - lg: 48x48 - Modal/fullscreen loading
   * - xl: 64x64 - Full-page auth transitions
   * @default "lg"
   */
  size?: SpinnerSize;

  /**
   * Custom Tailwind size classes (e.g. "w-12 h-12").
   * Only use if size presets don't fit your needs.
   */
  sizeClassName?: string;

  /**
   * Custom Tailwind border width classes (e.g. "border-4", "border-2").
   * Only use if size presets don't fit your needs.
   */
  borderClassName?: string;

  /**
   * Tailwind classes for the non-animated track ring.
   * @default "border-violet-200 dark:border-violet-900"
   */
  trackClassName?: string;

  /**
   * Tailwind classes for the animated indicator ring.
   * @default "border-violet-600 dark:border-violet-400"
   */
  indicatorClassName?: string;

  /**
   * Tailwind classes applied to the outer wrapper.
   */
  className?: string;
}

export function Spinner({
  size = 'lg',
  sizeClassName,
  borderClassName,
  trackClassName = 'border-violet-200 dark:border-violet-900',
  indicatorClassName = 'border-violet-600 dark:border-violet-400',
  className = '',
}: SpinnerProps) {
  // Use custom classes if provided, otherwise use size preset
  const resolvedSize = sizeClassName ?? SPINNER_SIZES[size].size;
  const resolvedBorder = borderClassName ?? SPINNER_SIZES[size].border;
  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`${resolvedSize} ${resolvedBorder} ${trackClassName} rounded-full`} />
      <div
        className={`absolute top-0 left-0 ${resolvedSize} ${resolvedBorder} ${indicatorClassName} rounded-full animate-spin`}
        style={{ borderTopColor: 'transparent' }}
      />
    </div>
  );
}

export default Spinner;

