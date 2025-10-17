import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Work Item Attachment interface
 */
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
  uploaded_at: Date;
}

/**
 * Upload attachment data
 */
export interface UploadAttachmentData {
  work_item_id: string;
  file: File;
}

/**
 * Upload attachment response from initial API call
 */
interface UploadAttachmentResponse {
  work_item_attachment_id: string;
  work_item_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  s3_key: string;
  s3_bucket: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  upload_url: string;
}

/**
 * Hook to fetch attachments for a work item
 */
export function useWorkItemAttachments(workItemId: string | undefined) {
  return useQuery({
    queryKey: ['work-item-attachments', workItemId],
    queryFn: async () => {
      if (!workItemId) throw new Error('Work item ID is required');

      const response = await fetch(`/api/work-items/${workItemId}/attachments`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch attachments');
      }

      const data = await response.json();
      return data.data as WorkItemAttachment[];
    },
    enabled: !!workItemId,
  });
}

/**
 * Hook to upload an attachment
 * Two-step process:
 * 1. Call API to get presigned URL and create DB record
 * 2. Upload file directly to S3 using presigned URL
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UploadAttachmentData) => {
      // Step 1: Get presigned upload URL from API
      const response = await fetch(`/api/work-items/${data.work_item_id}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          work_item_id: data.work_item_id,
          file_name: data.file.name,
          file_size: data.file.size,
          file_type: data.file.type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to initiate upload');
      }

      const result = await response.json();
      const uploadData = result.data as UploadAttachmentResponse;

      // Step 2: Upload file to S3 using presigned URL
      const uploadResponse = await fetch(uploadData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': data.file.type,
        },
        body: data.file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      return uploadData;
    },
    onSuccess: (data) => {
      // Invalidate attachments query to refetch the list
      queryClient.invalidateQueries({
        queryKey: ['work-item-attachments', data.work_item_id],
      });
    },
  });
}

/**
 * Hook to delete an attachment
 */
export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await fetch(`/api/work-item-attachments/${attachmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete attachment');
      }

      return attachmentId;
    },
    onSuccess: () => {
      // Invalidate all attachment queries
      queryClient.invalidateQueries({
        queryKey: ['work-item-attachments'],
      });
    },
  });
}

/**
 * Hook to get download URL for an attachment
 */
export function useDownloadAttachment() {
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await fetch(`/api/work-item-attachments/${attachmentId}/download`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get download URL');
      }

      const data = await response.json();
      return data.data.download_url as string;
    },
    onSuccess: (downloadUrl: string) => {
      // Open download URL in new tab
      window.open(downloadUrl, '_blank');
    },
  });
}

/**
 * Utility function to format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Utility function to get file icon based on file type
 */
export function getFileIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType === 'application/pdf') return '📄';
  if (fileType.includes('word')) return '📝';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📊';
  if (fileType.startsWith('text/')) return '📃';
  if (fileType.includes('zip') || fileType.includes('compressed')) return '📦';
  return '📎';
}
