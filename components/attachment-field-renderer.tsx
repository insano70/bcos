'use client';

import { useCallback, useReducer, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { FormLabel } from '@/components/ui/form-label';
import { Spinner } from '@/components/ui/spinner';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';
import {
  useDeleteFieldAttachment,
  useFieldAttachmentDownloadUrl,
  useFieldAttachments,
  useUploadFieldAttachment,
  useFieldAttachmentThumbnailUrl,
} from '@/lib/hooks/use-field-attachments';
import type { WorkItemField } from '@/lib/types/work-item-fields';
import { InlineAlert } from '@/components/ui/inline-alert';

interface AttachmentFieldRendererProps {
  field: WorkItemField;
  workItemId: string;
  value: { attachment_ids?: string[] } | undefined;
  onChange: (value: { attachment_ids: string[] }) => void;
  error?: string | undefined;
}

// ============================================================================
// Attachment State Reducer
// ============================================================================

interface AttachmentState {
  uploadProgress: boolean;
  uploadPercentage: number;
  uploadingFileName: string | null;
  uploadError: string | null;
  deleteModalOpen: boolean;
  attachmentToDelete: string | null;
  isDragging: boolean;
  thumbnailUrls: Record<string, string>;
}

type AttachmentAction =
  | { type: 'UPLOAD_START'; fileName: string }
  | { type: 'UPLOAD_PROGRESS'; percentage: number }
  | { type: 'UPLOAD_SUCCESS' }
  | { type: 'UPLOAD_ERROR'; error: string }
  | { type: 'UPLOAD_RESET' }
  | { type: 'OPEN_DELETE_MODAL'; attachmentId: string }
  | { type: 'CLOSE_DELETE_MODAL' }
  | { type: 'SET_DRAGGING'; isDragging: boolean }
  | { type: 'SET_THUMBNAIL_URL'; attachmentId: string; url: string };

const initialState: AttachmentState = {
  uploadProgress: false,
  uploadPercentage: 0,
  uploadingFileName: null,
  uploadError: null,
  deleteModalOpen: false,
  attachmentToDelete: null,
  isDragging: false,
  thumbnailUrls: {},
};

function attachmentReducer(state: AttachmentState, action: AttachmentAction): AttachmentState {
  switch (action.type) {
    case 'UPLOAD_START':
      return {
        ...state,
        uploadProgress: true,
        uploadPercentage: 0,
        uploadingFileName: action.fileName,
        uploadError: null,
      };
    case 'UPLOAD_PROGRESS':
      return { ...state, uploadPercentage: action.percentage };
    case 'UPLOAD_SUCCESS':
      return { ...state, uploadPercentage: 100 };
    case 'UPLOAD_ERROR':
      return {
        ...state,
        uploadProgress: false,
        uploadPercentage: 0,
        uploadingFileName: null,
        uploadError: action.error,
      };
    case 'UPLOAD_RESET':
      return {
        ...state,
        uploadProgress: false,
        uploadPercentage: 0,
        uploadingFileName: null,
      };
    case 'OPEN_DELETE_MODAL':
      return {
        ...state,
        deleteModalOpen: true,
        attachmentToDelete: action.attachmentId,
      };
    case 'CLOSE_DELETE_MODAL':
      return {
        ...state,
        deleteModalOpen: false,
        attachmentToDelete: null,
      };
    case 'SET_DRAGGING':
      return { ...state, isDragging: action.isDragging };
    case 'SET_THUMBNAIL_URL':
      return {
        ...state,
        thumbnailUrls: {
          ...state.thumbnailUrls,
          [action.attachmentId]: action.url,
        },
      };
    default:
      return state;
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/**
 * File icon SVG components
 */
const FileIcon = ({ type }: { type: string }) => {
  // Image icon
  if (type.startsWith('image/')) {
    return (
      <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }

  // PDF icon
  if (type === 'application/pdf') {
    return (
      <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }

  // Word/Document icon
  if (type.includes('word') || type.includes('document')) {
    return (
      <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }

  // Excel/Spreadsheet icon
  if (type.includes('sheet') || type.includes('excel')) {
    return (
      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }

  // Presentation icon
  if (type.includes('presentation') || type.includes('powerpoint')) {
    return (
      <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    );
  }

  // Archive/Zip icon
  if (type.includes('zip') || type.includes('archive') || type.includes('compress')) {
    return (
      <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    );
  }

  // Default file icon
  return (
    <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

export default function AttachmentFieldRenderer({
  field,
  workItemId,
  value,
  onChange,
  error,
}: AttachmentFieldRendererProps) {
  const fieldId = field.work_item_field_id;
  const attachmentIds = value?.attachment_ids || [];

  // Hooks
  const { data: attachments = [], isLoading } = useFieldAttachments(workItemId, fieldId);
  const uploadMutation = useUploadFieldAttachment();
  const deleteMutation = useDeleteFieldAttachment();
  const downloadMutation = useFieldAttachmentDownloadUrl();
  const thumbnailMutation = useFieldAttachmentThumbnailUrl();

  // Consolidated state management
  const [state, dispatch] = useReducer(attachmentReducer, initialState);
  const {
    uploadProgress,
    uploadPercentage,
    uploadingFileName,
    uploadError,
    deleteModalOpen,
    attachmentToDelete,
    isDragging,
    thumbnailUrls,
  } = state;

  // Max files configuration
  const maxFiles = field.field_config?.attachment_config?.max_files ?? 1;
  const canAddMore = maxFiles === null || attachmentIds.length < maxFiles;

  // Load thumbnails for image attachments
  useEffect(() => {
    const loadThumbnails = async () => {
      for (const attachment of attachments) {
        // Only load thumbnails for images
        if (attachment.is_image && !thumbnailUrls[attachment.work_item_attachment_id]) {
          try {
            const url = await thumbnailMutation.mutateAsync({
              workItemId,
              fieldId,
              attachmentId: attachment.work_item_attachment_id,
            });
            if (url) {
              dispatch({
                type: 'SET_THUMBNAIL_URL',
                attachmentId: attachment.work_item_attachment_id,
                url,
              });
            }
          } catch {
            // Silently fail - thumbnails are optional
          }
        }
      }
    };

    if (attachments.length > 0) {
      loadThumbnails();
    }
  }, [attachments, workItemId, fieldId, thumbnailMutation, thumbnailUrls]);

  // File upload handler
  const handleFileSelect = useCallback(
    async (file: File) => {
      dispatch({ type: 'UPLOAD_START', fileName: file.name });

      // Track current progress for the interval
      let currentProgress = 0;

      try {
        // Validate file size (100MB)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
          throw new Error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
        }

        // Simulate progress (since we don't have real upload progress tracking yet)
        const progressInterval = setInterval(() => {
          if (currentProgress >= 90) {
            clearInterval(progressInterval);
            return;
          }
          currentProgress += 10;
          dispatch({ type: 'UPLOAD_PROGRESS', percentage: currentProgress });
        }, 200);

        // Upload file
        const newAttachment = await uploadMutation.mutateAsync({
          workItemId,
          fieldId,
          file,
        });

        clearInterval(progressInterval);
        dispatch({ type: 'UPLOAD_SUCCESS' });

        // Update field value with new attachment ID
        const updatedIds = [...attachmentIds, newAttachment.work_item_attachment_id];
        onChange({ attachment_ids: updatedIds });

        // Brief delay to show 100% before clearing
        setTimeout(() => {
          dispatch({ type: 'UPLOAD_RESET' });
        }, 500);
      } catch (err) {
        dispatch({
          type: 'UPLOAD_ERROR',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    },
    [workItemId, fieldId, attachmentIds, onChange, uploadMutation]
  );

  // File input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input value to allow re-uploading the same file
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_DRAGGING', isDragging: true });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_DRAGGING', isDragging: false });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_DRAGGING', isDragging: false });

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Download handler
  const handleDownload = async (attachmentId: string) => {
    try {
      const downloadUrl = await downloadMutation.mutateAsync({
        workItemId,
        fieldId,
        attachmentId,
      });

      // Open download URL in new tab
      window.open(downloadUrl, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  };

  // Delete handler
  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteMutation.mutateAsync({
        workItemId,
        fieldId,
        attachmentId,
      });

      // Update field value to remove attachment ID
      const updatedIds = attachmentIds.filter((id) => id !== attachmentId);
      onChange({ attachment_ids: updatedIds });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      dispatch({ type: 'CLOSE_DELETE_MODAL' });
    }
  };

  return (
    <div>
      {/* Label with attachment count badge */}
      <div className="flex items-center gap-2 mb-1">
        <FormLabel required={field.is_required_on_creation}>
          {field.field_label}
        </FormLabel>
        {attachmentIds.length > 0 && (
          <Badge color="violet" size="sm">
            {attachmentIds.length} {attachmentIds.length === 1 ? 'file' : 'files'}
          </Badge>
        )}
      </div>

      {/* Description */}
      {field.field_description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{field.field_description}</p>
      )}

      {/* Max files indicator */}
      {maxFiles !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Maximum {maxFiles} file{maxFiles !== 1 ? 's' : ''} ({attachmentIds.length}/{maxFiles})
        </p>
      )}

      {/* Upload area */}
      {canAddMore && (
        <div
          className={`border-2 border-dashed rounded-lg p-4 mb-4 text-center ${
            isDragging
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/10'
              : 'border-gray-300 dark:border-gray-600'
          } ${uploadProgress ? 'opacity-50 pointer-events-none' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>

            <div>
              <label
                htmlFor={`file-upload-${fieldId}`}
                className="cursor-pointer text-violet-600 hover:text-violet-500 dark:text-violet-400 font-medium"
              >
                Choose a file
              </label>
              <span className="text-gray-500 dark:text-gray-400"> or drag and drop</span>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              PDF, Word, Excel, Images, and more (max 100MB)
            </p>

            <input
              id={`file-upload-${fieldId}`}
              type="file"
              className="sr-only"
              onChange={handleFileInputChange}
              disabled={uploadProgress}
            />
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <Spinner size="sm" trackClassName="border-blue-200 dark:border-blue-800" indicatorClassName="border-blue-500 dark:border-blue-400" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                {uploadingFileName || 'Uploading file...'}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                {uploadPercentage}% complete
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-300 ease-out"
              style={{ width: `${uploadPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <InlineAlert type="error" className="mb-4">
          {uploadError}
        </InlineAlert>
      )}

      {/* Attachments list */}
      {isLoading ? (
        <div className="space-y-2">
          {/* Loading skeleton */}
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="w-8 h-8 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-1/2 animate-shimmer bg-[length:200%_100%]" />
                <div className="h-3 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded w-1/3 animate-shimmer bg-[length:200%_100%]" />
              </div>
            </div>
          ))}
        </div>
      ) : attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.work_item_attachment_id}
              className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              {/* File icon or thumbnail */}
              <div className="flex-shrink-0">
                {attachment.is_image && thumbnailUrls[attachment.work_item_attachment_id] ? (
                  <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {/* biome-ignore lint/performance/noImgElement: Using presigned S3 URLs that can't be optimized by Next Image */}
                    <img
                      src={thumbnailUrls[attachment.work_item_attachment_id]}
                      alt={attachment.file_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <FileIcon type={attachment.file_type} />
                )}
              </div>

              {/* File details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {attachment.file_name}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatFileSize(attachment.file_size)}</span>
                  {attachment.uploaded_by_name && (
                    <>
                      <span>•</span>
                      <span>{attachment.uploaded_by_name}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatRelativeTime(attachment.uploaded_at)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment.work_item_attachment_id)}
                  className="px-3 py-1 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition-colors"
                  disabled={downloadMutation.isPending}
                  title="Download file"
                >
                  {downloadMutation.isPending ? (
                    <span className="flex items-center gap-1">
                      <Spinner size="sm" sizeClassName="h-3 w-3" borderClassName="border-2" />
                      <span>Downloading...</span>
                    </span>
                  ) : (
                    'Download'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({
                      type: 'OPEN_DELETE_MODAL',
                      attachmentId: attachment.work_item_attachment_id,
                    });
                  }}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  disabled={deleteMutation.isPending}
                  title="Delete file"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <svg className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">No attachments yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Upload files using the area above</p>
        </div>
      )}

      {/* Max files reached message */}
      {!canAddMore && maxFiles !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Maximum number of files reached ({maxFiles})
        </p>
      )}

      {/* Validation error */}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}

      {/* Delete confirmation modal */}
      {attachmentToDelete && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          setIsOpen={(open) => {
            if (!open) {
              dispatch({ type: 'CLOSE_DELETE_MODAL' });
            }
          }}
          title="Delete Attachment"
          itemName={
            attachments.find((a) => a.work_item_attachment_id === attachmentToDelete)?.file_name || 'this attachment'
          }
          message="This action cannot be undone. The file will be permanently deleted from storage."
          confirmButtonText="Delete Attachment"
          onConfirm={() => handleDelete(attachmentToDelete)}
        />
      )}
    </div>
  );
}
