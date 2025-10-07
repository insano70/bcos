import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface WorkItem {
  id: string;
  work_item_type_id: string;
  work_item_type_name: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  description: string | null;
  status_id: string;
  status_name: string;
  status_category: string;
  priority: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
}

interface WorkItemsQueryParams {
  work_item_type_id?: string;
  organization_id?: string;
  status_id?: string;
  status_category?: string;
  priority?: string;
  assigned_to?: string;
  created_by?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch all work items with optional filtering
 */
export function useWorkItems(params?: WorkItemsQueryParams) {
  return useQuery<WorkItem[], Error>({
    queryKey: ['work-items', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      const url = `/api/work-items${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const data = await apiClient.get<WorkItem[]>(url);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch a single work item by ID
 */
export function useWorkItem(id: string | null) {
  return useQuery<WorkItem, Error>({
    queryKey: ['work-items', id],
    queryFn: async () => {
      const data = await apiClient.get<WorkItem>(`/api/work-items/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new work item
 */
export function useCreateWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<WorkItem>) => {
      const result = await apiClient.post<WorkItem>('/api/work-items', data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
  });
}

/**
 * Update an existing work item
 */
export function useUpdateWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WorkItem> }) => {
      const result = await apiClient.put<WorkItem>(`/api/work-items/${id}`, { data });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      queryClient.invalidateQueries({ queryKey: ['work-items', variables.id] });
    },
  });
}

/**
 * Delete a work item (soft delete)
 */
export function useDeleteWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/work-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
  });
}
