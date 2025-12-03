'use client';

import { useEffect, useState } from 'react';
import {
  useWorkItemAttachments,
  useWorkItemChildren,
  useWorkItemComments,
} from '@/lib/hooks/use-work-items';
import ModalBasic from './modal-basic';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface DeleteWorkItemModalProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  workItemId: string;
  workItemSubject: string;
  onConfirm: (workItemId: string) => Promise<void>;
}

export default function DeleteWorkItemModal({
  isOpen,
  setIsOpen,
  workItemId,
  workItemSubject,
  onConfirm,
}: DeleteWorkItemModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImpact, setShowImpact] = useState(false);

  // Fetch related data for impact assessment
  const { data: children } = useWorkItemChildren(isOpen ? workItemId : null);
  const { data: comments } = useWorkItemComments({
    work_item_id: isOpen ? workItemId : '',
    limit: 1000,
  });
  const { data: attachments } = useWorkItemAttachments({
    work_item_id: isOpen ? workItemId : '',
    limit: 1000,
  });

  const childCount = children?.length || 0;
  const commentCount = comments?.length || 0;
  const attachmentCount = attachments?.length || 0;
  const hasImpact = childCount > 0 || commentCount > 0 || attachmentCount > 0;

  useEffect(() => {
    if (isOpen && hasImpact) {
      setShowImpact(true);
    }
  }, [isOpen, hasImpact]);

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm(workItemId);
      setIsOpen(false);
    } catch (error) {
      clientErrorLog('Delete failed:', error);
      // Error will be handled by parent component
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      setIsOpen(false);
      setShowImpact(false);
    }
  };

  return (
    <ModalBasic isOpen={isOpen} setIsOpen={setIsOpen} title="Delete Work Item">
      <div className="px-5 py-4">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 mx-auto mb-4">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Delete Work Item
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Are you sure you want to delete <strong>"{workItemSubject}"</strong>? This action cannot
            be undone.
          </p>

          {/* Impact Assessment */}
          {showImpact && hasImpact && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-left">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                    This will also delete:
                  </h4>
                  <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                    {childCount > 0 && (
                      <li className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          <strong>{childCount}</strong> child work item{childCount !== 1 ? 's' : ''}
                        </span>
                      </li>
                    )}
                    {commentCount > 0 && (
                      <li className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          <strong>{commentCount}</strong> comment{commentCount !== 1 ? 's' : ''}
                        </span>
                      </li>
                    )}
                    {attachmentCount > 0 && (
                      <li className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          <strong>{attachmentCount}</strong> attachment
                          {attachmentCount !== 1 ? 's' : ''}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
          <button
            type="button"
            className="btn-sm border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 w-full sm:w-auto mt-3 sm:mt-0"
            onClick={handleCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-sm bg-red-500 hover:bg-red-600 text-white w-full sm:w-auto disabled:opacity-50 flex items-center justify-center"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Deleting...
              </>
            ) : (
              'Delete Work Item'
            )}
          </button>
        </div>
      </div>
    </ModalBasic>
  );
}
