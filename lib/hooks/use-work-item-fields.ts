import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  WorkItemField,
  CreateWorkItemFieldData,
  UpdateWorkItemFieldData,
} from '@/lib/types/work-item-fields';

interface WorkItemFieldsQueryParams {
  work_item_type_id: string;
  is_visible?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch all custom fields for a work item type
 */
export function useWorkItemFields(params: WorkItemFieldsQueryParams) {
  return useQuery<WorkItemField[], Error>({
    queryKey: ['work-item-fields', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.is_visible !== undefined) {
        searchParams.append('is_visible', String(params.is_visible));
      }
      if (params.limit !== undefined) {
        searchParams.append('limit', String(params.limit));
      }
      if (params.offset !== undefined) {
        searchParams.append('offset', String(params.offset));
      }

      const url = `/api/work-item-types/${params.work_item_type_id}/fields${
        searchParams.toString() ? `?${searchParams.toString()}` : ''
      }`;

      const data = await apiClient.get<WorkItemField[]>(url);
      return data;
    },
    enabled: !!params.work_item_type_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch a single work item field by ID
 */
export function useWorkItemField(fieldId: string | null) {
  return useQuery<WorkItemField, Error>({
    queryKey: ['work-item-fields', fieldId],
    queryFn: async () => {
      const data = await apiClient.get<WorkItemField>(`/api/work-item-fields/${fieldId}`);
      return data;
    },
    enabled: !!fieldId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new work item field
 */
export function useCreateWorkItemField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkItemFieldData & { work_item_type_id: string }) => {
      const result = await apiClient.post<WorkItemField>(
        `/api/work-item-types/${data.work_item_type_id}/fields`,
        data
      );
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-fields', { work_item_type_id: variables.work_item_type_id }],
      });
    },
  });
}

/**
 * Update an existing work item field
 */
export function useUpdateWorkItemField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fieldId,
      data,
    }: {
      fieldId: string;
      data: UpdateWorkItemFieldData;
    }) => {
      const result = await apiClient.put<WorkItemField>(`/api/work-item-fields/${fieldId}`, data);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-fields', { work_item_type_id: result.work_item_type_id }],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-item-fields', result.work_item_field_id],
      });
    },
  });
}

/**
 * Delete a work item field (soft delete)
 */
export function useDeleteWorkItemField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fieldId: string) => {
      await apiClient.delete(`/api/work-item-fields/${fieldId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item-fields'] });
    },
  });
}

/**
 * Get count of work item fields for a work item type
 */
export function useWorkItemFieldCount(workItemTypeId: string | null) {
  return useQuery<number, Error>({
    queryKey: ['work-item-fields-count', workItemTypeId],
    queryFn: async () => {
      const data = await apiClient.get<WorkItemField[]>(
        `/api/work-item-types/${workItemTypeId}/fields`
      );
      return data.length;
    },
    enabled: !!workItemTypeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
