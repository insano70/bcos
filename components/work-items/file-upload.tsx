'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { formatFileSize, useUploadAttachment } from '@/lib/hooks/use-work-item-attachments';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@/lib/validations/work-item-attachments';

interface FileUploadProps {
  workItemId: string;
  onUploadComplete?: () => void;
}

export default function FileUpload({ workItemId, onUploadComplete }: FileUploadProps) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useUploadAttachment();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      setUploadProgress(null);

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      if (!file) return;

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
        return;
      }

      // Validate file type
      if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
        setError(`File type ${file.type} is not allowed`);
        return;
      }

      try {
        setUploadProgress(0);

        await uploadMutation.mutateAsync({
          work_item_id: workItemId,
          file,
        });

        setUploadProgress(100);
        setTimeout(() => {
          setUploadProgress(null);
          onUploadComplete?.();
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setUploadProgress(null);
      }
    },
    [workItemId, uploadMutation, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_FILE_SIZE,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/markdown': ['.md'],
      'application/zip': ['.zip'],
      'application/x-gzip': ['.gz'],
      'application/x-tar': ['.tar'],
    },
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${
            isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${uploadProgress !== null ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-2">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {isDragActive ? (
            <p className="text-blue-600 dark:text-blue-400 font-medium">Drop file here...</p>
          ) : (
            <>
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Drag and drop a file here, or click to select
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Max size: {formatFileSize(MAX_FILE_SIZE)}
              </p>
            </>
          )}
        </div>
      </div>

      {uploadProgress !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Uploading...
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {uploadMutation.isSuccess && !error && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200">File uploaded successfully!</p>
        </div>
      )}
    </div>
  );
}
