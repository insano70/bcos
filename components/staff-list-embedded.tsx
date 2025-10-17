'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useReorderStaff, useStaff } from '@/lib/hooks/use-staff';
import type { StaffMember } from '@/lib/types/practice';
import StaffMemberCard from './staff-member-card';
import StaffMemberFormModal from './staff-member-form-modal';

interface StaffListEmbeddedProps {
  practiceId: string;
}

export default function StaffListEmbedded({ practiceId }: StaffListEmbeddedProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: staff = [], isLoading, error } = useStaff(practiceId);
  const reorderStaff = useReorderStaff();

  const handleEdit = (staffMember: StaffMember) => {
    // Navigate to dedicated edit page
    window.location.href = `/configure/practices/${practiceId}/staff/${staffMember.staff_id}`;
  };

  const handleAdd = () => {
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
  };

  const handleReorder = async (staffId: string, direction: 'up' | 'down') => {
    // Find current staff member and calculate new order
    const currentIndex = staff.findIndex((s) => s.staff_id === staffId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= staff.length) return;

    // Create reorder data - swap display orders
    const currentStaff = staff[currentIndex];
    const targetStaff = staff[newIndex];

    if (!currentStaff || !targetStaff) return;

    const reorderData = [
      { staffId: currentStaff.staff_id, newOrder: targetStaff.display_order },
      { staffId: targetStaff.staff_id, newOrder: currentStaff.display_order },
    ];

    try {
      await reorderStaff.mutateAsync({
        practiceId,
        data: reorderData,
      });

      // Refresh staff list
      queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
    } catch (error) {
      console.error('Error reordering staff:', error);
    }
  };

  const handleModalSuccess = () => {
    // Refresh staff list after successful add/edit
    queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
  };

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center">
          <svg
            className="w-5 h-5 text-red-600 dark:text-red-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading staff</h3>
            <p className="text-red-600 dark:text-red-400 text-sm">
              {error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : 'Failed to load staff members'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Add button */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Staff Members
            {!isLoading && (
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                ({staff.length})
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage your practice's staff profiles and information
          </p>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Add Staff Member
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading staff...</span>
        </div>
      )}

      {/* Staff list */}
      {!isLoading && (
        <div className="space-y-4">
          {staff.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
              <svg
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No staff members yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Add your first staff member to showcase your team on your practice website.
              </p>
              <button
                type="button"
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add First Staff Member
              </button>
            </div>
          ) : (
            staff.map((staffMember, index) => (
              <StaffMemberCard
                key={staffMember.staff_id}
                staffMember={staffMember}
                practiceId={practiceId}
                onEdit={handleEdit}
                onReorder={handleReorder}
                canMoveUp={index > 0}
                canMoveDown={index < staff.length - 1}
              />
            ))
          )}
        </div>
      )}

      {/* Add Staff Modal */}
      <StaffMemberFormModal
        isOpen={isAddModalOpen}
        onClose={handleModalClose}
        practiceId={practiceId}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
