'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import {
  formatFileSize,
  getFileIcon,
  useDeleteAttachment,
  useDownloadAttachment,
  useWorkItemAttachments,
} from '@/lib/hooks/use-work-item-attachments';

interface AttachmentsListProps {
  workItemId: string;
}

export default function AttachmentsList({ workItemId }: AttachmentsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data: attachments, isLoading, error } = useWorkItemAttachments(workItemId);
  const deleteMutation = useDeleteAttachment();
  const downloadMutation = useDownloadAttachment();

  const handleDelete = async (attachmentId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setDeletingId(attachmentId);
    try {
      await deleteMutation.mutateAsync(attachmentId);
    } catch (error) {
      console.error('Failed to delete attachment:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (attachmentId: string) => {
    try {
      await downloadMutation.mutateAsync(attachmentId);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">
          Failed to load attachments: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (!attachments || attachments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p className="text-sm">No attachments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => {
        const isDeleting = deletingId === attachment.work_item_attachment_id;
        const isImage = attachment.file_type.startsWith('image/');

        return (
          <div
            key={attachment.work_item_attachment_id}
            className={`
              border border-gray-200 dark:border-gray-700 rounded-lg p-4
              hover:border-gray-300 dark:hover:border-gray-600
              transition-colors duration-200
              ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            <div className="flex items-start gap-4">
              {/* File Icon/Thumbnail */}
              <div className="flex-shrink-0">
                {isImage ? (
                  <div className="w-16 h-16 rounded border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-2xl">{getFileIcon(attachment.file_type)}</span>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-3xl">{getFileIcon(attachment.file_type)}</span>
                  </div>
                )}
              </div>

              {/* File Details */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {attachment.file_name}
                </h4>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatFileSize(attachment.file_size)}</span>
                  <span>•</span>
                  <span>Uploaded by {attachment.uploaded_by_name || 'Unknown'}</span>
                  <span>•</span>
                  <span>{format(new Date(attachment.uploaded_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handleDownload(attachment.work_item_attachment_id)}
                  disabled={downloadMutation.isPending}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Download"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>

                <button type="button" onClick={() =>
                    handleDelete(attachment.work_item_attachment_id, attachment.file_name)
                  }
                  disabled={isDeleting}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Delete"
                >
                  {isDeleting ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
