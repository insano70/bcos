'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';

interface HierarchyItem {
  work_item_id: string;
  subject: string;
  status_name: string;
  priority: string;
  depth: number;
}

interface WorkItemHierarchySectionProps {
  workItemId: string;
}

export default function WorkItemHierarchySection({ workItemId }: WorkItemHierarchySectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  // Fetch ancestors
  const { data: ancestors = [] } = useQuery<HierarchyItem[]>({
    queryKey: ['work-item-ancestors', workItemId],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: HierarchyItem[] }>(
        `/api/work-items/${workItemId}/ancestors`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch children
  const { data: children = [] } = useQuery<HierarchyItem[]>({
    queryKey: ['work-item-children', workItemId],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: HierarchyItem[] }>(
        `/api/work-items/${workItemId}/children`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      case 'high':
        return 'text-orange-600 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const handleItemClick = (itemId: string) => {
    router.push(`/work/${itemId}`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Hierarchy
        </h3>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-4 pt-0 space-y-4">
          {/* Ancestors */}
          {ancestors.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Parent Items
              </h4>
              <div className="space-y-2">
                {ancestors.map((item) => (
                  <button
                    key={item.work_item_id}
                    type="button"
                    onClick={() => handleItemClick(item.work_item_id)}
                    className="w-full text-left p-2 rounded border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.status_name}
                          </span>
                          <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        </div>
                      </div>
                      <svg
                        className="w-4 h-4 text-gray-400 shrink-0 mt-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Current Item Indicator */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Current Item</span>
          </div>

          {/* Children */}
          {children.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Sub-items ({children.length})
              </h4>
              <div className="space-y-2">
                {children.map((item) => (
                  <button
                    key={item.work_item_id}
                    type="button"
                    onClick={() => handleItemClick(item.work_item_id)}
                    className="w-full text-left p-2 rounded border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.status_name}
                          </span>
                          <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        </div>
                      </div>
                      <svg
                        className="w-4 h-4 text-gray-400 shrink-0 mt-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {ancestors.length === 0 && children.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No parent or child items
            </p>
          )}
        </div>
      )}
    </div>
  );
}
