import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-statuses', variables.work_item_type_id] });
    },
  });
}

/**
 * Hook to update a work item status
 */
export function useUpdateWorkItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWorkItemStatusData }) => {
      return await apiClient.patch<WorkItemStatus>(`/api/work-item-statuses/${id}`, data);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-status', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-statuses', data.work_item_type_id] });
    },
  });
}

/**
 * Hook to delete a work item status
 */
export function useDeleteWorkItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; typeId: string }) => {
      return await apiClient.delete(`/api/work-item-statuses/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-status', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-statuses', variables.typeId] });
    },
  });
}
