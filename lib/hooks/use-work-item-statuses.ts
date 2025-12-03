import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface WorkItemStatus {
  work_item_status_id: string;
  work_item_type_id: string;
  status_name: string;
  status_category: string;
  is_initial: boolean;
  is_final: boolean;
  color: string | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkItemStatusData {
  work_item_type_id: string;
  status_name: string;
  status_category: string;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string | null;
  display_order?: number;
}

export interface UpdateWorkItemStatusData {
  status_name?: string;
  status_category?: string;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string | null;
  display_order?: number;
}

/**
 * Hook to fetch statuses for a work item type
 */
export function useWorkItemStatuses(typeId: string | undefined) {
  return useQuery<WorkItemStatus[], Error>({
    queryKey: ['work-item-statuses', typeId],
    queryFn: async () => {
      const response = await apiClient.get<{ statuses: WorkItemStatus[] }>(
        `/api/work-item-types/${typeId}/statuses`
      );
      return response.statuses;
    },
    enabled: !!typeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch a single work item status
 */
export function useWorkItemStatus(statusId: string | undefined) {
  return useQuery<WorkItemStatus, Error>({
    queryKey: ['work-item-status', statusId],
    queryFn: async () => await apiClient.get<WorkItemStatus>(`/api/work-item-statuses/${statusId}`),
    enabled: !!statusId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a work item status
 * Includes optimistic updates for immediate UI feedback
 */
export function useCreateWorkItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkItemStatusData) => {
      return await apiClient.post<WorkItemStatus>(
        `/api/work-item-types/${data.work_item_type_id}/statuses`,
        data
      );
    },
    // Optimistic update: immediately add to cache before server responds
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-statuses', data.work_item_type_id] });

      // Snapshot the previous values
      const previousStatuses = queryClient.getQueryData<WorkItemStatus[]>([
        'work-item-statuses',
        data.work_item_type_id,
      ]);

      // Create optimistic status with temporary ID
      const optimisticStatus: WorkItemStatus = {
        work_item_status_id: `temp-${Date.now()}`,
        work_item_type_id: data.work_item_type_id,
        status_name: data.status_name,
        status_category: data.status_category,
        is_initial: data.is_initial ?? false,
        is_final: data.is_final ?? false,
        color: data.color ?? null,
        display_order: data.display_order ?? (previousStatuses?.length ?? 0),
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Optimistically update cache
      queryClient.setQueryData<WorkItemStatus[]>(
        ['work-item-statuses', data.work_item_type_id],
        (old) => (old ? [...old, optimisticStatus] : [optimisticStatus])
      );

      return { previousStatuses, typeId: data.work_item_type_id };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          ['work-item-statuses', context.typeId],
          context.previousStatuses
        );
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: ['work-item-statuses', variables.work_item_type_id],
      });
    },
  });
}

/**
 * Hook to update a work item status
 * Includes optimistic updates for immediate UI feedback
 */
export function useUpdateWorkItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      typeId: string;
      data: UpdateWorkItemStatusData;
    }) => {
      return await apiClient.patch<WorkItemStatus>(`/api/work-item-statuses/${id}`, data);
    },
    // Optimistic update: immediately update cache before server responds
    onMutate: async ({ id, typeId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-statuses', typeId] });
      await queryClient.cancelQueries({ queryKey: ['work-item-status', id] });

      // Snapshot the previous values
      const previousStatuses = queryClient.getQueryData<WorkItemStatus[]>([
        'work-item-statuses',
        typeId,
      ]);
      const previousStatus = queryClient.getQueryData<WorkItemStatus>(['work-item-status', id]);

      // Optimistically update the list cache
      queryClient.setQueryData<WorkItemStatus[]>(['work-item-statuses', typeId], (old) => {
        if (!old) return old;
        return old.map((status) =>
          status.work_item_status_id === id
            ? { ...status, ...data, updated_at: new Date() }
            : status
        );
      });

      // Optimistically update the individual status cache
      queryClient.setQueryData<WorkItemStatus>(['work-item-status', id], (old) => {
        if (!old) return old;
        return { ...old, ...data, updated_at: new Date() };
      });

      return { previousStatuses, previousStatus, typeId };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(['work-item-statuses', context.typeId], context.previousStatuses);
      }
      if (context?.previousStatus) {
        queryClient.setQueryData(['work-item-status', id], context.previousStatus);
      }
    },
    onSettled: (data, __, { id }) => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['work-item-status', id] });
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['work-item-statuses', data.work_item_type_id] });
      }
    },
  });
}

/**
 * Hook to delete a work item status
 * Includes optimistic updates for immediate UI feedback
 */
export function useDeleteWorkItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; typeId: string }) => {
      return await apiClient.delete(`/api/work-item-statuses/${id}`);
    },
    // Optimistic update: immediately remove from cache before server responds
    onMutate: async ({ id, typeId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-statuses', typeId] });
      await queryClient.cancelQueries({ queryKey: ['work-item-status', id] });

      // Snapshot the previous values
      const previousStatuses = queryClient.getQueryData<WorkItemStatus[]>([
        'work-item-statuses',
        typeId,
      ]);
      const previousStatus = queryClient.getQueryData<WorkItemStatus>(['work-item-status', id]);

      // Optimistically remove from cache
      queryClient.setQueryData<WorkItemStatus[]>(['work-item-statuses', typeId], (old) => {
        if (!old) return old;
        return old.filter((status) => status.work_item_status_id !== id);
      });

      // Remove individual status cache
      queryClient.removeQueries({ queryKey: ['work-item-status', id] });

      return { previousStatuses, previousStatus, typeId };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(['work-item-statuses', context.typeId], context.previousStatuses);
      }
      if (context?.previousStatus) {
        queryClient.setQueryData(['work-item-status', id], context.previousStatus);
      }
    },
    onSettled: (_, __, { id, typeId }) => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['work-item-status', id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-statuses', typeId] });
    },
  });
}
