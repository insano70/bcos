'use client';

import { useRouter } from 'next/navigation';
import { useWorkItemAncestors } from '@/lib/hooks/use-work-items';

interface WorkItemBreadcrumbsProps {
  workItemId: string;
  currentSubject: string;
}

export default function WorkItemBreadcrumbs({
  workItemId,
  currentSubject,
}: WorkItemBreadcrumbsProps) {
  const router = useRouter();
  const { data: ancestors, isLoading } = useWorkItemAncestors(workItemId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <span>/</span>
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!ancestors || ancestors.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm mb-4 overflow-x-auto" aria-label="Breadcrumb">
      {/* Home / All Work Items */}
      <button
        type="button"
        onClick={() => router.push('/work')}
        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      </button>

      {/* Ancestor Items */}
      {ancestors.map((ancestor, _index) => (
        <div key={ancestor.id} className="flex items-center gap-2 flex-shrink-0">
          <svg
            className="w-4 h-4 text-gray-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <button
            type="button"
            onClick={() => router.push(`/work/${ancestor.id}`)}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-[200px]"
            title={ancestor.subject}
          >
            {ancestor.subject}
          </button>
        </div>
      ))}

      {/* Current Item */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <svg
          className="w-4 h-4 text-gray-400 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span
          className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-[200px]"
          title={currentSubject}
        >
          {currentSubject}
        </span>
      </div>
    </nav>
  );
}
