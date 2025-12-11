/**
 * Work Items Loading State
 *
 * This loading component is shown during route transitions within the work section.
 * It displays a table skeleton to indicate work items data is loading.
 */

import { Skeleton, TableSkeleton } from '@/components/ui/loading-skeleton';

export default function WorkLoading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page Header Skeleton */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-64" />
          </div>
        </div>

        {/* Table Content */}
        <TableSkeleton rows={8} columns={7} />
      </div>
    </div>
  );
}






