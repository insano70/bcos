import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface WorkItemStatusTransition {
  work_item_status_transition_id: string;
  work_item_type_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkItemTransitionData {
  work_item_type_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed?: boolean;
}

export interface UpdateWorkItemTransitionData {
  is_allowed?: boolean;
}

export interface TransitionFilters {
  from_status_id?: string;
  to_status_id?: string;
}

/**
 * Hook to fetch transitions for a work item type
 */
export function useWorkItemTransitions(
  typeId: string | undefined,
  filters?: TransitionFilters
) {
  return useQuery<WorkItemStatusTransition[], Error>({
    queryKey: ['work-item-transitions', typeId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.from_status_id) {
        params.append('from_status_id', filters.from_status_id);
      }
      if (filters?.to_status_id) {
        params.append('to_status_id', filters.to_status_id);
      }

      const queryString = params.toString();
      const url = `/api/work-item-types/${typeId}/transitions${queryString ? `?${queryString}` : ''}`;

      const response = await apiClient.get<{ transitions: WorkItemStatusTransition[] }>(url);
      return response.transitions;
    },
    enabled: !!typeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch a single work item transition
 */
export function useWorkItemTransition(transitionId: string | undefined) {
  return useQuery<WorkItemStatusTransition, Error>({
    queryKey: ['work-item-transition', transitionId],
    queryFn: async () =>
      await apiClient.get<WorkItemStatusTransition>(`/api/work-item-status-transitions/${transitionId}`),
    enabled: !!transitionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a work item transition
 */
export function useCreateWorkItemTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkItemTransitionData) => {
      return await apiClient.post<WorkItemStatusTransition>(
        `/api/work-item-types/${data.work_item_type_id}/transitions`,
        data
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-transitions', variables.work_item_type_id] });
    },
  });
}

/**
 * Hook to update a work item transition
 */
export function useUpdateWorkItemTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateWorkItemTransitionData;
      typeId: string;
    }) => {
      return await apiClient.patch<WorkItemStatusTransition>(
        `/api/work-item-status-transitions/${id}`,
        data
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-transition', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-transitions', variables.typeId] });
    },
  });
}

/**
 * Hook to delete a work item transition
 */
export function useDeleteWorkItemTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; typeId: string }) => {
      return await apiClient.delete(`/api/work-item-status-transitions/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-item-transition', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-transitions', variables.typeId] });
    },
  });
}
