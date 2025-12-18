'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useDeleteStaff } from '@/lib/hooks/use-staff';
import type { StaffMember } from '@/lib/types/practice';
import { getActiveStatusColor } from '@/lib/utils/badge-colors';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface StaffMemberCardProps {
  staffMember: StaffMember;
  practiceId: string;
  onEdit: (staffMember: StaffMember) => void;
  onReorder?: (staffId: string, direction: 'up' | 'down') => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export default function StaffMemberCard({
  staffMember,
  practiceId,
  onEdit,
  onReorder,
  canMoveUp = false,
  canMoveDown = false,
}: StaffMemberCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const deleteStaff = useDeleteStaff();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteStaff.mutateAsync({
        practiceId,
        staffId: staffMember.staff_id,
      });

      // Refresh staff list
      queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
      setShowDeleteConfirm(false);
    } catch (error) {
      clientErrorLog('Error deleting staff member:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Photo */}
        <div className="flex-shrink-0">
          {staffMember.photo_url ? (
            // biome-ignore lint/performance/noImgElement: Staff member photos from external sources
            <img
              src={staffMember.photo_url}
              alt={staffMember.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {staffMember.name}
              </h3>
              {staffMember.title && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{staffMember.title}</p>
              )}
              {staffMember.credentials && (
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {staffMember.credentials}
                </p>
              )}
            </div>

            {/* Status badge */}
            <Badge color={getActiveStatusColor(staffMember.is_active)}>
              {staffMember.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          {/* Specialties */}
          {staffMember.specialties && staffMember.specialties.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1">
                {staffMember.specialties.slice(0, 3).map((specialty) => (
                  <Badge key={specialty} color="blue" size="sm" shape="rounded">
                    {specialty}
                  </Badge>
                ))}
                {staffMember.specialties.length > 3 && (
                  <Badge color="gray" size="sm" shape="rounded">
                    +{staffMember.specialties.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Bio preview */}
          {staffMember.bio && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {staffMember.bio}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        {/* Reorder buttons */}
        <div className="flex gap-1">
          {onReorder && (
            <>
              <button
                type="button"
                onClick={() => onReorder(staffMember.staff_id, 'up')}
                disabled={!canMoveUp}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Move up"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onReorder(staffMember.staff_id, 'down')}
                disabled={!canMoveDown}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Move down"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Edit/Delete actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(staffMember)}
            className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            Edit
          </button>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm border border-red-600 text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-2 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
