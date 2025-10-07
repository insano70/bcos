import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface WorkItemStatus {
  id: string;
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

/**
 * Fetch statuses for a specific work item type
 */
export function useWorkItemStatuses(workItemTypeId: string | null) {
  return useQuery<WorkItemStatus[], Error>({
    queryKey: ['work-item-statuses', workItemTypeId],
    queryFn: async () => {
      if (!workItemTypeId) {
        return [];
      }
      const data = await apiClient.get<WorkItemStatus[]>(
        `/api/work-item-statuses?work_item_type_id=${workItemTypeId}`
      );
      return data;
    },
    enabled: !!workItemTypeId,
    staleTime: 10 * 60 * 1000, // 10 minutes (statuses change infrequently)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
