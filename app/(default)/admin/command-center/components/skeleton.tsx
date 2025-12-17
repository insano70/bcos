/**
 * Loading Skeleton Components
 *
 * Provides skeleton loading states for dashboard panels.
 * Improves perceived performance by showing structure while data loads.
 */

/**
 * KPI Card Skeleton
 * Used during initial load of KPI metrics
 */
export function KPISkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="h-4 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-1/2 mb-4 animate-shimmer bg-[length:200%_100%]" />
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-24 animate-shimmer bg-[length:200%_100%]" />
        <div className="h-12 w-12 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded-full animate-shimmer bg-[length:200%_100%]" />
      </div>
      <div className="h-3 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-2/3 animate-shimmer bg-[length:200%_100%]" />
    </div>
  );
}

/**
 * Panel Skeleton
 * Used for security events feed and at-risk users panel
 */
export function PanelSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-1/3 animate-shimmer bg-[length:200%_100%]" />
        <div className="h-8 w-8 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
      </div>
      <div className="space-y-3">
        <div className="h-16 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
        <div className="h-16 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
        <div className="h-16 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

/**
 * Performance Chart Skeleton
 * Used for performance charts in Row 2
 */
export function ChartSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="h-5 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-1/3 mb-6 animate-shimmer bg-[length:200%_100%]" />
      <div className="h-64 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
    </div>
  );
}
