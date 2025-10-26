'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface ActivityItem {
  work_item_activity_id: string;
  work_item_id: string;
  activity_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

interface WorkItemActivitySectionProps {
  workItemId: string;
}

export default function WorkItemActivitySection({ workItemId }: WorkItemActivitySectionProps) {
  // Fetch activity
  const { data: activity = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['work-item-activity', workItemId],
    queryFn: async () => {
      const response = await apiClient.get<ActivityItem[]>(
        `/api/work-items/${workItemId}/activity`
      );
      return response || [];
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  const formatDate = (date: string) => {
    const dateObj = new Date(date);
    return dateObj.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const _getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'created':
        return (
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-green-600 dark:text-green-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
      case 'updated':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-600 dark:text-blue-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </div>
        );
      case 'commented':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-purple-600 dark:text-purple-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
      case 'status_changed':
        return (
          <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-yellow-600 dark:text-yellow-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-gray-600 dark:text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
    }
  };

  const formatActivityText = (item: ActivityItem) => {
    const userName = item.created_by_name;

    switch (item.activity_type) {
      case 'created':
        return (
          <>
            <span className="font-medium">{userName}</span> created this work item
          </>
        );
      case 'updated':
        if (item.field_name) {
          return (
            <>
              <span className="font-medium">{userName}</span> changed{' '}
              <span className="font-medium">{item.field_name}</span>
              {item.old_value && item.new_value && (
                <>
                  {' '}
                  from{' '}
                  <span className="text-red-600 dark:text-red-400 line-through">
                    {item.old_value}
                  </span>{' '}
                  to <span className="text-green-600 dark:text-green-400">{item.new_value}</span>
                </>
              )}
            </>
          );
        }
        return (
          <>
            <span className="font-medium">{userName}</span> updated this work item
          </>
        );
      case 'commented':
        return (
          <>
            <span className="font-medium">{userName}</span> added a comment
          </>
        );
      case 'status_changed':
        return (
          <>
            <span className="font-medium">{userName}</span> changed status
            {item.old_value && item.new_value && (
              <>
                {' '}
                from <span className="font-medium">{item.old_value}</span> to{' '}
                <span className="font-medium">{item.new_value}</span>
              </>
            )}
          </>
        );
      default:
        return (
          <>
            <span className="font-medium">{userName}</span> {item.activity_type}
          </>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Activity</h2>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading activity...</p>
          </div>
        ) : activity.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No activity yet</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {activity.map((item, idx) => (
                <li key={item.work_item_activity_id}>
                  <div className="relative pb-8">
                    {idx !== activity.length - 1 && (
                      <span
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                        aria-hidden="true"
                      />
                    )}
                    <div className="relative flex space-x-3">
                      <div className="flex-shrink-0">{getActivityIcon(item.activity_type)}</div>
                      <div className="flex-1 min-w-0">
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {formatActivityText(item)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(item.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
