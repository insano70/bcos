'use client';

/**
 * Watch/Unwatch Button Component for Work Items
 * Phase 7: Watchers and notifications
 */

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
    <Button
      variant={isWatching ? 'blue' : 'secondary'}
      onClick={handleToggleWatch}
      loading={isLoading}
      className={className}
      title={
        isWatching
          ? 'Click to stop watching this work item'
          : 'Click to watch this work item for updates'
      }
      leftIcon={isWatching ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    >
      <span className="hidden sm:inline">{isWatching ? 'Watching' : 'Watch'}</span>
    </Button>
  );
}
