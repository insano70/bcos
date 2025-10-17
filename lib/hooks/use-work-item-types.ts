import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface WorkItemType {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkItemTypesQueryParams {
  organization_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch all work item types with optional filtering
 * Returns global types (organization_id = null) and organization-specific types
 */
export function useWorkItemTypes(params?: WorkItemTypesQueryParams) {
  return useQuery<WorkItemType[], Error>({
    queryKey: ['work-item-types', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      const url = `/api/work-item-types${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const data = await apiClient.get<WorkItemType[]>(url);
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (types change infrequently)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Fetch active work item types only
 * Convenience hook for most common use case
 */
export function useActiveWorkItemTypes() {
  return useWorkItemTypes({ is_active: true });
}

/**
 * Fetch a single work item type by ID
 */
export function useWorkItemType(id: string | undefined) {
  return useQuery<WorkItemType, Error>({
    queryKey: ['work-item-type', id],
    queryFn: async () => {
      if (!id) throw new Error('Work item type ID is required');
      return await apiClient.get<WorkItemType>(`/api/work-item-types/${id}`);
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Create a new work item type
 * Phase 4: User-configurable work item types
 */
export function useCreateWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      organization_id: string;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      is_active?: boolean;
    }) => {
      return await apiClient.post<WorkItemType>('/api/work-item-types', data);
    },
    onSuccess: () => {
      // Invalidate and refetch work item types
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
    },
  });
}

/**
 * Update an existing work item type
 * Phase 4: User-configurable work item types
 */
export function useUpdateWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        is_active?: boolean;
      };
    }) => {
      return await apiClient.patch<WorkItemType>(`/api/work-item-types/${id}`, data);
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and specific type queries
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-type', variables.id] });
    },
  });
}

/**
 * Delete a work item type (soft delete)
 * Phase 4: User-configurable work item types
 */
export function useDeleteWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await apiClient.delete(`/api/work-item-types/${id}`);
    },
    onSuccess: (_, id) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-type', id] });
    },
  });
}
