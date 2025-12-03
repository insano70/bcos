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

export interface CreateWorkItemTypeInput {
  organization_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

/**
 * Create a new work item type
 * Phase 4: User-configurable work item types
 * Includes optimistic updates for immediate UI feedback
 */
export function useCreateWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkItemTypeInput) => {
      return await apiClient.post<WorkItemType>('/api/work-item-types', data);
    },
    // Optimistic update: immediately add to cache before server responds
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-types'] });

      // Snapshot the previous values
      const previousWorkItemTypes = queryClient.getQueryData<WorkItemType[]>(['work-item-types']);

      // Create optimistic work item type with temporary ID
      const optimisticWorkItemType: WorkItemType = {
        id: `temp-${Date.now()}`,
        organization_id: data.organization_id,
        organization_name: null,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        is_active: data.is_active ?? true,
        created_by: null,
        created_by_name: 'You',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Optimistically update cache
      queryClient.setQueryData<WorkItemType[]>(['work-item-types'], (old) => {
        return old ? [...old, optimisticWorkItemType] : [optimisticWorkItemType];
      });

      return { previousWorkItemTypes };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousWorkItemTypes) {
        queryClient.setQueryData(['work-item-types'], context.previousWorkItemTypes);
      }
    },
    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
    },
  });
}

export interface UpdateWorkItemTypeInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

/**
 * Update an existing work item type
 * Phase 4: User-configurable work item types
 * Includes optimistic updates for immediate UI feedback
 */
export function useUpdateWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateWorkItemTypeInput;
    }) => {
      return await apiClient.patch<WorkItemType>(`/api/work-item-types/${id}`, data);
    },
    // Optimistic update: immediately update cache before server responds
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-types'] });
      await queryClient.cancelQueries({ queryKey: ['work-item-type', id] });

      // Snapshot the previous values
      const previousWorkItemTypes = queryClient.getQueryData<WorkItemType[]>(['work-item-types']);
      const previousWorkItemType = queryClient.getQueryData<WorkItemType>(['work-item-type', id]);

      // Optimistically update the list cache
      queryClient.setQueryData<WorkItemType[]>(['work-item-types'], (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === id ? { ...item, ...data, updated_at: new Date() } : item
        );
      });

      // Optimistically update the individual item cache
      queryClient.setQueryData<WorkItemType>(['work-item-type', id], (old) => {
        if (!old) return old;
        return { ...old, ...data, updated_at: new Date() };
      });

      return { previousWorkItemTypes, previousWorkItemType };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousWorkItemTypes) {
        queryClient.setQueryData(['work-item-types'], context.previousWorkItemTypes);
      }
      if (context?.previousWorkItemType) {
        queryClient.setQueryData(['work-item-type', id], context.previousWorkItemType);
      }
    },
    onSettled: (_, __, { id }) => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-type', id] });
    },
  });
}

/**
 * Delete a work item type (soft delete)
 * Phase 4: User-configurable work item types
 * Includes optimistic updates for immediate UI feedback
 */
export function useDeleteWorkItemType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await apiClient.delete(`/api/work-item-types/${id}`);
    },
    // Optimistic update: immediately remove from cache before server responds
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['work-item-types'] });
      await queryClient.cancelQueries({ queryKey: ['work-item-type', id] });

      // Snapshot the previous values
      const previousWorkItemTypes = queryClient.getQueryData<WorkItemType[]>(['work-item-types']);
      const previousWorkItemType = queryClient.getQueryData<WorkItemType>(['work-item-type', id]);

      // Optimistically remove from cache
      queryClient.setQueryData<WorkItemType[]>(['work-item-types'], (old) => {
        if (!old) return old;
        return old.filter((item) => item.id !== id);
      });

      // Remove individual item cache
      queryClient.removeQueries({ queryKey: ['work-item-type', id] });

      return { previousWorkItemTypes, previousWorkItemType, deletedId: id };
    },
    onError: (_err, id, context) => {
      // Rollback on error
      if (context?.previousWorkItemTypes) {
        queryClient.setQueryData(['work-item-types'], context.previousWorkItemTypes);
      }
      if (context?.previousWorkItemType) {
        queryClient.setQueryData(['work-item-type', id], context.previousWorkItemType);
      }
    },
    onSettled: (_, __, id) => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['work-item-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-type', id] });
    },
  });
}
