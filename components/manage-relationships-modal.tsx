'use client';

import { useCallback, useMemo, useState } from 'react';
import AddRelationshipModal from '@/components/add-relationship-modal';
import EditRelationshipModal from '@/components/edit-relationship-modal';
import ModalBlank from '@/components/modal-blank';
import {
  useDeleteTypeRelationship,
  useTypeRelationshipsForParent,
  type WorkItemTypeRelationship,
} from '@/lib/hooks/use-work-item-type-relationships';

interface ManageRelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workItemTypeId: string;
  workItemTypeName: string;
}

export default function ManageRelationshipsModal({
  isOpen,
  onClose,
  workItemTypeId,
  workItemTypeName,
}: ManageRelationshipsModalProps) {
  const [isAddRelationshipOpen, setIsAddRelationshipOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<WorkItemTypeRelationship | null>(
    null
  );

  const {
    data: relationships,
    isLoading,
    error,
    refetch,
  } = useTypeRelationshipsForParent(workItemTypeId);
  const deleteRelationship = useDeleteTypeRelationship();

  const handleDeleteRelationship = useCallback(
    async (relationshipId: string, relationshipName: string) => {
      if (
        confirm(
          `Are you sure you want to delete the "${relationshipName}" relationship? This action cannot be undone.`
        )
      ) {
        try {
          await deleteRelationship.mutateAsync(relationshipId);
          refetch();
        } catch (error) {
          console.error('Failed to delete relationship:', error);
        }
      }
    },
    [deleteRelationship, refetch]
  );

  const handleEditRelationship = useCallback((relationship: WorkItemTypeRelationship) => {
    setEditingRelationship(relationship);
  }, []);

  const sortedRelationships = useMemo(() => {
    if (!relationships) return [];
    return [...relationships].sort((a, b) => a.display_order - b.display_order);
  }, [relationships]);

  return (
    <>
      <ModalBlank isOpen={isOpen} setIsOpen={onClose}>
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Manage Type Relationships
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Configure which child types can be created under {workItemTypeName}
            </p>
          </div>

          {/* Add Relationship Button */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setIsAddRelationshipOpen(true)}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
            >
              <svg
                className="fill-current shrink-0 mr-2"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
              </svg>
              <span>Add Child Type Relationship</span>
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Loading relationships...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-600 dark:text-red-400">
                Error loading relationships: {error.message}
              </p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && sortedRelationships.length === 0 && (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                No child type relationships
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by adding a child type relationship.
              </p>
            </div>
          )}

          {/* Relationships List */}
          {!isLoading && !error && sortedRelationships.length > 0 && (
            <div className="space-y-2">
              {sortedRelationships.map((relationship) => (
                <div
                  key={relationship.work_item_type_relationship_id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {relationship.child_type_name}
                      </h4>
                      {relationship.is_required && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                          Required
                        </span>
                      )}
                      {relationship.auto_create && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                          Auto-create
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>Relationship: {relationship.relationship_name}</span>
                      {(relationship.min_count !== null || relationship.max_count !== null) && (
                        <span>
                          Count: {relationship.min_count ?? 0} - {relationship.max_count ?? '∞'}
                        </span>
                      )}
                    </div>

                    {relationship.auto_create && relationship.auto_create_config && (
                      <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        {relationship.auto_create_config.subject_template && (
                          <div>Template: {relationship.auto_create_config.subject_template}</div>
                        )}
                        {relationship.auto_create_config.inherit_fields &&
                          relationship.auto_create_config.inherit_fields.length > 0 && (
                            <div>
                              Inherits: {relationship.auto_create_config.inherit_fields.join(', ')}
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleEditRelationship(relationship)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Edit relationship"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteRelationship(
                          relationship.work_item_type_relationship_id,
                          relationship.relationship_name
                        )
                      }
                      className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                      title="Delete relationship"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </ModalBlank>

      {/* Add Relationship Modal */}
      <AddRelationshipModal
        isOpen={isAddRelationshipOpen}
        onClose={() => setIsAddRelationshipOpen(false)}
        onSuccess={() => {
          setIsAddRelationshipOpen(false);
          refetch();
        }}
        parentTypeId={workItemTypeId}
      />

      {/* Edit Relationship Modal */}
      {editingRelationship && (
        <EditRelationshipModal
          isOpen={true}
          onClose={() => setEditingRelationship(null)}
          onSuccess={() => {
            setEditingRelationship(null);
            refetch();
          }}
          relationship={editingRelationship}
        />
      )}
    </>
  );
}
