'use client';

import { useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { Spinner } from '@/components/ui/spinner';

interface ImageUploadProps {
  currentImage?: string;
  onImageUploaded: (url: string) => void;
  practiceId?: string;
  staffId?: string; // Required for 'provider' type uploads
  type: 'logo' | 'hero' | 'provider' | 'gallery';
  label: string;
  className?: string;
}

export default function ImageUpload({
  currentImage,
  onImageUploaded,
  practiceId,
  staffId,
  type,
  label,
  className = '',
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      if (practiceId) {
        formData.append('practiceId', practiceId);
      }
      if (staffId) {
        formData.append('staffId', staffId);
      }

      // Use apiClient for automatic CSRF token handling
      const result = await apiClient.post<{ url: string }>('/api/upload', formData);
      
      // The service layer has already updated the database
      // Just notify the parent component to refresh/update UI
      onImageUploaded(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>

      <div className="flex items-center space-x-4">
        {/* Current image preview */}
        {currentImage && (
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
            {/* biome-ignore lint/performance/noImgElement: User-uploaded images from external sources */}
            <img src={currentImage} alt="Current image" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Upload button */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <Spinner
                  sizeClassName="w-4 h-4"
                  borderClassName="border-2"
                  trackClassName="border-current opacity-25"
                  indicatorClassName="border-current opacity-75"
                  className="mr-2"
                />
                Uploading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                {currentImage ? 'Change Image' : 'Upload Image'}
              </>
            )}
          </button>

          {error && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{error}</p>}

          <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
            JPG, PNG, or WebP. Max 5MB.
          </p>
        </div>
      </div>
    </div>
  );
}
