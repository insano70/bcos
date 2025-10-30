'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Field Attachment Hooks
 * React Query hooks for managing custom field attachments
 */

export interface FieldAttachment {
  work_item_attachment_id: string;
  work_item_id: string;
  work_item_field_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  s3_key: string;
  s3_bucket: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
}

export interface CreateFieldAttachmentData {
  work_item_id: string;
  work_item_field_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface CreateFieldAttachmentResponse {
  attachment: FieldAttachment;
  uploadUrl: string;
}

/**
 * Fetch attachments for a specific custom field
 */
export function useFieldAttachments(workItemId: string, fieldId: string) {
  return useQuery({
    queryKey: ['fieldAttachments', workItemId, fieldId],
    queryFn: async () => {
      const response = await fetch(
        `/api/work-items/${workItemId}/fields/${fieldId}/attachments`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch field attachments');
      }

      const data = await response.json();
      return data.attachments as FieldAttachment[];
    },
    enabled: Boolean(workItemId && fieldId),
  });
}

/**
 * Upload a file to a custom field
 * Two-step process: create attachment record + upload to S3
 */
export function useUploadFieldAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      fieldId,
      file,
    }: {
      workItemId: string;
      fieldId: string;
      file: File;
    }) => {
      // Step 1: Create attachment record and get presigned URL
      const createResponse = await fetch(
        `/api/work-items/${workItemId}/fields/${fieldId}/attachments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
          }),
        }
      );

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create attachment');
      }

      const { attachment, uploadUrl } = (await createResponse.json()) as CreateFieldAttachmentResponse;

      // Step 2: Upload file directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      return attachment;
    },
    onSuccess: (_, variables) => {
      // Invalidate field attachments query to refetch
      queryClient.invalidateQueries({
        queryKey: ['fieldAttachments', variables.workItemId, variables.fieldId],
      });

      // Also invalidate work item query if it exists
      queryClient.invalidateQueries({
        queryKey: ['workItem', variables.workItemId],
      });
    },
  });
}

/**
 * Delete a field attachment
 */
export function useDeleteFieldAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      fieldId,
      attachmentId,
    }: {
      workItemId: string;
      fieldId: string;
      attachmentId: string;
    }) => {
      const response = await fetch(
        `/api/work-items/${workItemId}/fields/${fieldId}/attachments/${attachmentId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete attachment');
      }

      return await response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate field attachments query to refetch
      queryClient.invalidateQueries({
        queryKey: ['fieldAttachments', variables.workItemId, variables.fieldId],
      });

      // Also invalidate work item query if it exists
      queryClient.invalidateQueries({
        queryKey: ['workItem', variables.workItemId],
      });
    },
  });
}

/**
 * Get presigned download URL for field attachment
 */
export function useFieldAttachmentDownloadUrl() {
  return useMutation({
    mutationFn: async ({
      workItemId,
      fieldId,
      attachmentId,
    }: {
      workItemId: string;
      fieldId: string;
      attachmentId: string;
    }) => {
      const response = await fetch(
        `/api/work-items/${workItemId}/fields/${fieldId}/attachments/${attachmentId}/download`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate download URL');
      }

      const data = await response.json();
      return data.downloadUrl as string;
    },
  });
}
