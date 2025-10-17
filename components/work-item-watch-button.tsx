'use client';

/**
 * Watch/Unwatch Button Component for Work Items
 * Phase 7: Watchers and notifications
 */

import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useUnwatchWorkItem, useWatchWorkItem } from '@/lib/hooks/use-work-item-watchers';

interface WorkItemWatchButtonProps {
  workItemId: string;
  isWatching: boolean;
  className?: string;
}

export function WorkItemWatchButton({
  workItemId,
  isWatching: initialIsWatching,
  className = '',
}: WorkItemWatchButtonProps) {
  const [isWatching, setIsWatching] = useState(initialIsWatching);
  const watchMutation = useWatchWorkItem();
  const unwatchMutation = useUnwatchWorkItem();

  const isLoading = watchMutation.isPending || unwatchMutation.isPending;

  const handleToggleWatch = async () => {
    try {
      if (isWatching) {
        await unwatchMutation.mutateAsync(workItemId);
        setIsWatching(false);
        toast.success('You have unwatched this work item');
      } else {
        await watchMutation.mutateAsync(workItemId);
        setIsWatching(true);
        toast.success('You are now watching this work item');
      }
    } catch (_error) {
      toast.error(isWatching ? 'Failed to unwatch work item' : 'Failed to watch work item');
    }
  };

  return (
    <button type="button" onClick={handleToggleWatch}
      disabled={isLoading}
      className={`btn flex items-center gap-2 ${
        isWatching
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      title={
        isWatching
          ? 'Click to stop watching this work item'
          : 'Click to watch this work item for updates'
      }
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isWatching ? (
        <Eye className="h-4 w-4" />
      ) : (
        <EyeOff className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">{isWatching ? 'Watching' : 'Watch'}</span>
    </button>
  );
}
