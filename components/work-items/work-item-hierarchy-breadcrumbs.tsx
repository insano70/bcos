'use client';

import Link from 'next/link';
import { useWorkItem, useWorkItemAncestors } from '@/lib/hooks/use-work-items';

export interface WorkItemHierarchyBreadcrumbsProps {
  workItemId: string;
}

export default function WorkItemHierarchyBreadcrumbs({
  workItemId,
}: WorkItemHierarchyBreadcrumbsProps) {
  const { data: ancestors = [] } = useWorkItemAncestors(workItemId);
  const { data: currentItem } = useWorkItem(workItemId);

  if (ancestors.length === 0 && !currentItem) return null;

  const breadcrumbs = [...ancestors, currentItem].filter(
    (item): item is NonNullable<typeof item> => item !== null && item !== undefined
  );

  return (
    <nav
      className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4"
      aria-label="Breadcrumb"
    >
      {/* Home icon */}
      <Link
        href="/work"
        className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      </Link>

      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <div key={item.id} className="flex items-center space-x-2">
            {/* Separator */}
            <svg
              className="w-4 h-4 text-gray-400 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>

            {/* Breadcrumb item */}
            {isLast ? (
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">
                {item.subject}
              </span>
            ) : (
              <Link
                href={`/work/${item.id}`}
                className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors truncate max-w-xs"
              >
                {item.subject}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
