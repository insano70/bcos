/**
 * React Query Hooks for Work Item Watchers
 * Phase 7: Watchers and notifications
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { WorkItem } from './use-work-items';

/**
 * Watcher with user details
 */
export interface WatcherWithDetails {
  work_item_watcher_id: string;
  work_item_id: string;
  user_id: string;
  watch_type: 'manual' | 'auto_creator' | 'auto_assignee' | 'auto_commenter';
  notify_status_changes: boolean;
  notify_comments: boolean;
  notify_assignments: boolean;
  notify_due_date: boolean;
  created_at: Date;
  user_name: string;
  user_email: string;
}

/**
 * Watcher preferences update data
 */
export interface WatcherPreferencesUpdate {
  notify_status_changes?: boolean;
  notify_comments?: boolean;
  notify_assignments?: boolean;
  notify_due_date?: boolean;
}

/**
 * Hook to fetch watchers for a work item
 */
export function useWorkItemWatchers(workItemId: string | undefined) {
  return useQuery({
    queryKey: ['work-item-watchers', workItemId],
    queryFn: async () => {
      if (!workItemId) {
        throw new Error('Work item ID is required');
      }

      const data = await apiClient.get<WatcherWithDetails[]>(
        `/api/work-items/${workItemId}/watchers`
      );
      return data;
    },
    enabled: !!workItemId,
  });
}

/**
 * Hook to add current user as watcher
 */
export function useWatchWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workItemId: string) => {
      const data = await apiClient.post<WatcherWithDetails>(`/api/work-items/${workItemId}/watch`);
      return data;
    },
    onSuccess: (_data, workItemId) => {
      // Invalidate watchers list for this work item
      queryClient.invalidateQueries({ queryKey: ['work-item-watchers', workItemId] });

      // Invalidate work item to update watch status
      queryClient.invalidateQueries({ queryKey: ['work-item', workItemId] });

      // Invalidate watched work items list
      queryClient.invalidateQueries({ queryKey: ['watched-work-items'] });
    },
  });
}

/**
 * Hook to remove current user as watcher
 */
export function useUnwatchWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workItemId: string) => {
      await apiClient.delete(`/api/work-items/${workItemId}/watch`);
    },
    onSuccess: (_data, workItemId) => {
      // Invalidate watchers list for this work item
      queryClient.invalidateQueries({ queryKey: ['work-item-watchers', workItemId] });

      // Invalidate work item to update watch status
      queryClient.invalidateQueries({ queryKey: ['work-item', workItemId] });

      // Invalidate watched work items list
      queryClient.invalidateQueries({ queryKey: ['watched-work-items'] });
    },
  });
}

/**
 * Hook to update watcher notification preferences
 */
export function useUpdateWatcherPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      watcherId,
      preferences,
    }: {
      workItemId: string;
      watcherId: string;
      preferences: WatcherPreferencesUpdate;
    }) => {
      const data = await apiClient.patch<WatcherWithDetails>(
        `/api/work-items/${workItemId}/watchers/${watcherId}`,
        preferences
      );
      return data;
    },
    onSuccess: (_data, { workItemId }) => {
      // Invalidate watchers list for this work item
      queryClient.invalidateQueries({ queryKey: ['work-item-watchers', workItemId] });
    },
  });
}

/**
 * Hook to fetch watched work items for current user
 * Phase 7: Watchers and notifications
 */
export function useWatchedWorkItems() {
  return useQuery<WorkItem[], Error>({
    queryKey: ['watched-work-items'],
    queryFn: async () => {
      return await apiClient.get<WorkItem[]>('/api/work-items/watched');
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - watched items may change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
