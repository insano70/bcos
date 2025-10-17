/**
 * React Query Hooks for Work Item Watchers
 * Phase 7: Watchers and notifications
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

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
 * Note: This endpoint doesn't exist yet, so this is a placeholder
 * for future implementation
 */
export function useWatchedWorkItems() {
  return useQuery({
    queryKey: ['watched-work-items'],
    queryFn: async () => {
      // TODO: Implement endpoint GET /api/work-items/watched
      // For now, return empty array
      return [];
    },
    enabled: false, // Disabled until endpoint is implemented
  });
}
