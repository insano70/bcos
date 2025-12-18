'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReorderStaff, useStaff } from '@/lib/hooks/use-staff';
import type { StaffMember } from '@/lib/types/practice';
import { Spinner } from '@/components/ui/spinner';
import StaffMemberCard from './staff-member-card';
import StaffMemberFormModal from './staff-member-form-modal';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { InlineAlert } from '@/components/ui/inline-alert';

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
      clientErrorLog('Error reordering staff:', error);
    }
  };

  const handleModalSuccess = () => {
    // Refresh staff list after successful add/edit
    queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
  };

  if (error) {
    return (
      <InlineAlert type="error" title="Error loading staff">
        {error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Failed to load staff members'}
      </InlineAlert>
    );
  }

  return (
    <div>
      {/* Header with Add button */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
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

        <Button
          type="button"
          variant="blue"
          size="md"
          onClick={handleAdd}
          disabled={isLoading}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Staff Member
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner
            sizeClassName="w-6 h-6"
            borderClassName="border-2"
            trackClassName="border-current opacity-25"
            indicatorClassName="border-current opacity-75"
            className="text-gray-400"
          />
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No staff members yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Add your first staff member to showcase your team on your practice website.
              </p>
              <Button
                type="button"
                variant="blue"
                size="md"
                onClick={handleAdd}
              >
                Add First Staff Member
              </Button>
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
