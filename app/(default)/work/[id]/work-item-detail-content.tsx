'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkItem, useUpdateWorkItem, useDeleteWorkItem } from '@/lib/hooks/use-work-items';
import WorkItemHierarchySection from '@/components/work-items/work-item-hierarchy-section';
import WorkItemCommentsSection from '@/components/work-items/work-item-comments-section';
import WorkItemActivitySection from '@/components/work-items/work-item-activity-section';
import WorkItemAttachmentsSection from '@/components/work-items/work-item-attachments-section';
import EditWorkItemModal from '@/components/edit-work-item-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';

interface WorkItemDetailContentProps {
  workItemId: string;
}

export default function WorkItemDetailContent({ workItemId }: WorkItemDetailContentProps) {
  const router = useRouter();
  const { data: workItem, isLoading, error, refetch } = useWorkItem(workItemId);
  const updateWorkItem = useUpdateWorkItem();
  const deleteWorkItem = useDeleteWorkItem();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity' | 'history'>('details');

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this work item? This action cannot be undone.')) {
      try {
        await deleteWorkItem.mutateAsync(workItemId);
        router.push('/work');
      } catch (error) {
        console.error('Failed to delete work item:', error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading work item...</p>
        </div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-600 dark:text-red-400">
            {error ? `Error loading work item: ${error.message}` : 'Work item not found'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/work')}
            className="mt-4 text-sm text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
          >
            Back to work items
          </button>
        </div>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'high':
        return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'Not set';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => router.push('/work')}
            className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 16 16">
              <path d="M9.4 13.4l1.4-1.4-4-4 4-4-1.4-1.4L4 8z" />
            </svg>
            Back to work items
          </button>

          <div className="flex gap-2">
            <ProtectedComponent
              permissions={['work-items:update:own', 'work-items:update:organization', 'work-items:update:all']}
              requireAll={false}
            >
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                  <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                </svg>
                <span className="ml-2">Edit</span>
              </button>
            </ProtectedComponent>

            <ProtectedComponent
              permissions={['work-items:delete:organization', 'work-items:delete:all']}
              requireAll={false}
            >
              <button
                type="button"
                onClick={handleDelete}
                className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-red-600 dark:text-red-400"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                  <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                </svg>
                <span className="ml-2">Delete</span>
              </button>
            </ProtectedComponent>
          </div>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
                {workItem.subject}
              </h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(workItem.priority)}`}>
                {workItem.priority.charAt(0).toUpperCase() + workItem.priority.slice(1)}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center">
                <span className="font-medium mr-1">Type:</span>
                {workItem.work_item_type_name}
              </div>
              <div className="flex items-center">
                <span className="font-medium mr-1">Status:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                  {workItem.status_name}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-medium mr-1">Assigned to:</span>
                {workItem.assigned_to_name || 'Unassigned'}
              </div>
              <div className="flex items-center">
                <span className="font-medium mr-1">Due:</span>
                {formatDate(workItem.due_date)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'comments'
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Comments
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'activity'
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Activity
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Description */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Description
                </h2>
                <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {workItem.description || 'No description provided.'}
                </div>
              </div>

              {/* Attachments */}
              <WorkItemAttachmentsSection workItemId={workItemId} />
            </div>
          )}

          {activeTab === 'comments' && (
            <WorkItemCommentsSection workItemId={workItemId} />
          )}

          {activeTab === 'activity' && (
            <WorkItemActivitySection workItemId={workItemId} />
          )}
        </div>

        <div className="lg:col-span-1">
          {/* Hierarchy */}
          <WorkItemHierarchySection workItemId={workItemId} />

          {/* Details Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Details
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Created by</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {workItem.created_by_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Created at</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(workItem.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Last updated</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(workItem.updated_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Organization</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {workItem.organization_name}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditWorkItemModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            setIsEditModalOpen(false);
            refetch();
          }}
          workItem={workItem}
        />
      )}
    </div>
  );
}
