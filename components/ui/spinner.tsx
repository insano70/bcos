interface SpinnerProps {
  /**
   * Tailwind size classes (e.g. "w-12 h-12").
   * @default "w-12 h-12"
   */
  sizeClassName?: string;

  /**
   * Tailwind border width classes (e.g. "border-4", "border-2").
   * @default "border-4"
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
  sizeClassName = 'w-12 h-12',
  borderClassName = 'border-4',
  trackClassName = 'border-violet-200 dark:border-violet-900',
  indicatorClassName = 'border-violet-600 dark:border-violet-400',
  className = '',
}: SpinnerProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`${sizeClassName} ${borderClassName} ${trackClassName} rounded-full`} />
      <div
        className={`absolute top-0 left-0 ${sizeClassName} ${borderClassName} ${indicatorClassName} border-t-transparent rounded-full animate-spin`}
      />
    </div>
  );
}

export default Spinner;

