import { useQuery } from '@tanstack/react-query';
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
