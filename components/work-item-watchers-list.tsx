'use client';

/**
 * Watchers List & Preferences Component
 * Phase 7: Watchers and notifications
 */

import { Settings } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  useUpdateWatcherPreferences,
  useWorkItemWatchers,
  type WatcherWithDetails,
} from '@/lib/hooks/use-work-item-watchers';

interface WorkItemWatchersListProps {
  workItemId: string;
  currentUserId: string;
}

export function WorkItemWatchersList({ workItemId, currentUserId }: WorkItemWatchersListProps) {
  const { data: watchers, isLoading } = useWorkItemWatchers(workItemId);
  const [editingWatcherId, setEditingWatcherId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" className="text-gray-400" />
      </div>
    );
  }

  if (!watchers || watchers.length === 0) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">No watchers yet</div>;
  }

  return (
    <div className="space-y-3">
      {watchers.map((watcher) => (
        <WatcherItem
          key={watcher.work_item_watcher_id}
          watcher={watcher}
          workItemId={workItemId}
          currentUserId={currentUserId}
          isEditing={editingWatcherId === watcher.work_item_watcher_id}
          onEditToggle={() =>
            setEditingWatcherId(
              editingWatcherId === watcher.work_item_watcher_id
                ? null
                : watcher.work_item_watcher_id
            )
          }
        />
      ))}
    </div>
  );
}

interface WatcherItemProps {
  watcher: WatcherWithDetails;
  workItemId: string;
  currentUserId: string;
  isEditing: boolean;
  onEditToggle: () => void;
}

function WatcherItem({
  watcher,
  workItemId,
  currentUserId,
  isEditing,
  onEditToggle,
}: WatcherItemProps) {
  const updatePreferences = useUpdateWatcherPreferences();
  const [preferences, setPreferences] = useState({
    notify_status_changes: watcher.notify_status_changes,
    notify_comments: watcher.notify_comments,
    notify_assignments: watcher.notify_assignments,
    notify_due_date: watcher.notify_due_date,
  });

  const isCurrentUser = watcher.user_id === currentUserId;
  const isAutoWatcher = watcher.watch_type !== 'manual';

  const handleSavePreferences = async () => {
    try {
      await updatePreferences.mutateAsync({
        workItemId,
        watcherId: watcher.work_item_watcher_id,
        preferences,
      });
      toast.success('Notification preferences updated');
      onEditToggle();
    } catch (_error) {
      toast.error('Failed to update preferences');
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800">
      <div className="flex-shrink-0 mt-1">
        <Avatar
          size="md"
          name={watcher.user_name}
          userId={watcher.user_id}
        />
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 dark:text-gray-100">{watcher.user_name}</span>
          {isCurrentUser && (
            <Badge color="blue" size="sm">You</Badge>
          )}
          {isAutoWatcher && (
            <Badge color="gray" size="sm">Auto</Badge>
          )}
        </div>

        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{watcher.user_email}</div>

        {isEditing ? (
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notification Preferences
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_status_changes}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notify_status_changes: e.target.checked,
                  })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Status changes</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_comments}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notify_comments: e.target.checked,
                  })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">New comments</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_assignments}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notify_assignments: e.target.checked,
                  })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Assignment changes</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_due_date}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notify_due_date: e.target.checked,
                  })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Due date reminders</span>
            </label>

            <div className="flex gap-2 mt-3">
              <Button
                variant="blue"
                size="sm"
                onClick={handleSavePreferences}
                disabled={updatePreferences.isPending}
                loading={updatePreferences.isPending}
              >
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={onEditToggle}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          isCurrentUser && (
            <button type="button" onClick={onEditToggle}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
            >
              <Settings className="h-3 w-3" />
              Preferences
            </button>
          )
        )}
      </div>

      {!isEditing && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {watcher.watch_type === 'auto_creator' && 'Creator'}
          {watcher.watch_type === 'auto_assignee' && 'Assignee'}
          {watcher.watch_type === 'auto_commenter' && 'Commenter'}
          {watcher.watch_type === 'manual' && 'Manual'}
        </div>
      )}
    </div>
  );
}
