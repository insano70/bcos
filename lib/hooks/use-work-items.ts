import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  custom_fields?: Record<string, unknown> | undefined; // Phase 3: Custom field values
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

export interface CreateWorkItemInput {
  work_item_type_id: string;
  organization_id?: string | undefined;
  subject: string;
  description?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | undefined;
  due_date?: string | undefined;
  parent_work_item_id?: string | undefined;
}

export interface UpdateWorkItemInput {
  subject?: string | undefined;
  description?: string | undefined;
  status_id?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | undefined;
  due_date?: string | undefined;
  started_at?: string | undefined;
  completed_at?: string | undefined;
  custom_fields?: Record<string, unknown> | undefined;
}

/**
 * Create a new work item
 */
export function useCreateWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkItemInput) => {
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
    mutationFn: async ({ id, data }: { id: string; data: UpdateWorkItemInput }) => {
      const result = await apiClient.put<WorkItem>(`/api/work-items/${id}`, data);
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

// ==================== Phase 2: Hierarchy Operations ====================

/**
 * Fetch children of a work item
 */
export function useWorkItemChildren(parentId: string | null) {
  return useQuery<WorkItem[], Error>({
    queryKey: ['work-item-children', parentId],
    queryFn: async () => {
      const data = await apiClient.get<WorkItem[]>(`/api/work-items/${parentId}/children`);
      return data || [];
    },
    enabled: !!parentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch ancestors (breadcrumb trail) of a work item
 */
export function useWorkItemAncestors(workItemId: string | null) {
  return useQuery<WorkItem[], Error>({
    queryKey: ['work-item-ancestors', workItemId],
    queryFn: async () => {
      const data = await apiClient.get<WorkItem[]>(`/api/work-items/${workItemId}/ancestors`);
      return data || [];
    },
    enabled: !!workItemId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Move a work item to a new parent
 */
export function useMoveWorkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      newParentId,
    }: {
      workItemId: string;
      newParentId: string | null;
    }) => {
      const result = await apiClient.post<WorkItem>(`/api/work-items/${workItemId}/move`, {
        parent_work_item_id: newParentId,
      });
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate the moved item and all hierarchy-related queries
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      queryClient.invalidateQueries({ queryKey: ['work-items', variables.workItemId] });
      if (variables.newParentId) {
        queryClient.invalidateQueries({
          queryKey: ['work-items', variables.newParentId, 'children'],
        });
      }
    },
  });
}

// ==================== Phase 2: Comments ====================

export interface WorkItemComment {
  work_item_comment_id: string;
  work_item_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  user_id: string;
  user_name: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface CommentsQueryParams {
  work_item_id: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch comments for a work item
 */
export function useWorkItemComments(params: CommentsQueryParams) {
  return useQuery<WorkItemComment[], Error>({
    queryKey: ['work-item-comments', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const data = await apiClient.get<WorkItemComment[]>(
        `/api/work-items/${params.work_item_id}/comments?${searchParams.toString()}`
      );
      return data;
    },
    enabled: !!params.work_item_id,
    staleTime: 2 * 60 * 1000, // 2 minutes (comments change frequently)
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new comment on a work item
 */
export function useCreateWorkItemComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      work_item_id: string;
      parent_comment_id?: string | null;
      comment_text: string;
    }) => {
      const result = await apiClient.post<WorkItemComment>(
        `/api/work-items/${data.work_item_id}/comments`,
        data
      );
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-comments', { work_item_id: variables.work_item_id }],
      });
    },
  });
}

/**
 * Update an existing comment
 */
export function useUpdateWorkItemComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      commentId,
      comment_text,
    }: {
      workItemId: string;
      commentId: string;
      comment_text: string;
    }) => {
      const result = await apiClient.put<WorkItemComment>(
        `/api/work-items/${workItemId}/comments/${commentId}`,
        { comment_text }
      );
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-comments', { work_item_id: variables.workItemId }],
      });
    },
  });
}

/**
 * Delete a comment
 */
export function useDeleteWorkItemComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workItemId, commentId }: { workItemId: string; commentId: string }) => {
      await apiClient.delete(`/api/work-items/${workItemId}/comments/${commentId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-comments', { work_item_id: variables.workItemId }],
      });
    },
  });
}

// ==================== Phase 2: Activity ====================

export interface WorkItemActivity {
  work_item_activity_id: string;
  work_item_id: string;
  user_id: string;
  user_name: string;
  activity_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  created_at: Date;
}

interface ActivityQueryParams {
  work_item_id: string;
  activity_type?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch activity log for a work item
 */
export function useWorkItemActivity(params: ActivityQueryParams) {
  return useQuery<WorkItemActivity[], Error>({
    queryKey: ['work-item-activity', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const data = await apiClient.get<WorkItemActivity[]>(
        `/api/work-items/${params.work_item_id}/activity?${searchParams.toString()}`
      );
      return data;
    },
    enabled: !!params.work_item_id,
    staleTime: 1 * 60 * 1000, // 1 minute (activity is frequently updated)
    gcTime: 5 * 60 * 1000,
  });
}

// ==================== Phase 2: Attachments ====================

export interface WorkItemAttachment {
  work_item_attachment_id: string;
  work_item_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  s3_key: string;
  s3_bucket: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: Date;
}

interface AttachmentsQueryParams {
  work_item_id: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch attachments for a work item
 */
export function useWorkItemAttachments(params: AttachmentsQueryParams) {
  return useQuery<WorkItemAttachment[], Error>({
    queryKey: ['work-item-attachments', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const data = await apiClient.get<WorkItemAttachment[]>(
        `/api/work-items/${params.work_item_id}/attachments?${searchParams.toString()}`
      );
      return data;
    },
    enabled: !!params.work_item_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Upload an attachment to a work item
 */
export function useUploadWorkItemAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      work_item_id: string;
      file_name: string;
      file_size: number;
      file_type: string;
      s3_key: string;
      s3_bucket: string;
    }) => {
      const result = await apiClient.post<WorkItemAttachment>(
        `/api/work-items/${data.work_item_id}/attachments`,
        data
      );
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-attachments', { work_item_id: variables.work_item_id }],
      });
    },
  });
}

/**
 * Delete an attachment
 */
export function useDeleteWorkItemAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      attachmentId,
    }: {
      workItemId: string;
      attachmentId: string;
    }) => {
      await apiClient.delete(`/api/work-items/${workItemId}/attachments/${attachmentId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-attachments', { work_item_id: variables.workItemId }],
      });
    },
  });
}
