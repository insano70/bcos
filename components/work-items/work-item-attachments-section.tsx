'use client';

import { useState } from 'react';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import AttachmentsList from './attachments-list';
import FileUpload from './file-upload';

interface WorkItemAttachmentsSectionProps {
  workItemId: string;
}

/**
 * Complete attachments section for a work item
 * Includes file upload (with RBAC) and attachments list
 *
 * Usage in work item detail page:
 * <WorkItemAttachmentsSection workItemId={workItem.work_item_id} />
 */
export default function WorkItemAttachmentsSection({
  workItemId,
}: WorkItemAttachmentsSectionProps) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Attachments</h3>

        <ProtectedComponent
          permissions={[
            'work-items:update:own',
            'work-items:update:organization',
            'work-items:update:all',
          ]}
          requireAll={false}
        >
          <button type="button" onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
          >
            {showUpload ? 'Cancel' : 'Upload File'}
          </button>
        </ProtectedComponent>
      </div>

      {/* File Upload Area (only visible when user clicks Upload) */}
      {showUpload && (
        <ProtectedComponent
          permissions={[
            'work-items:update:own',
            'work-items:update:organization',
            'work-items:update:all',
          ]}
          requireAll={false}
        >
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <FileUpload
              workItemId={workItemId}
              onUploadComplete={() => {
                setShowUpload(false);
              }}
            />
          </div>
        </ProtectedComponent>
      )}

      {/* Attachments List */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <AttachmentsList workItemId={workItemId} />
      </div>
    </div>
  );
}
