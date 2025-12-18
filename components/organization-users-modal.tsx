'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import {
  type Organization,
  type OrganizationUser,
  useOrganizationUsers,
  useUpdateOrganizationUsers,
} from '@/lib/hooks/use-organizations';
import DataTable, { type DataTableColumn } from './data-table-standard';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Button } from '@/components/ui/button';

interface OrganizationUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  organization: Organization | null;
}

export default function OrganizationUsersModal({
  isOpen,
  onClose,
  onSuccess,
  organization,
}: OrganizationUsersModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const { data: users = [], isLoading, error } = useOrganizationUsers(organization?.id || '');
  const updateOrganizationUsers = useUpdateOrganizationUsers();

  // Initialize selected users when data loads
  useEffect(() => {
    if (users.length > 0) {
      const initialSelected = new Set(users.filter((u) => u.is_member).map((u) => u.user_id));
      setSelectedUserIds(initialSelected);
    }
  }, [users]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedUserIds(new Set());
    }
  }, [isOpen]);

  // Transform users to include selection state and id field for DataTable
  const usersWithSelection = useMemo(() => {
    return users.map((user) => ({
      ...user,
      id: user.user_id, // DataTable requires 'id' field
      isSelected: selectedUserIds.has(user.user_id),
    }));
  }, [users, selectedUserIds]);

  // Handle checkbox toggle
  const handleToggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  const handleSave = async () => {
    if (!organization) return;

    setIsSubmitting(true);

    try {
      // Calculate diff: compare current selection with original membership
      const originalMemberIds = new Set(users.filter((u) => u.is_member).map((u) => u.user_id));
      const currentSelectedIds = selectedUserIds;

      const add_user_ids = Array.from(currentSelectedIds).filter(
        (id) => !originalMemberIds.has(id)
      );
      const remove_user_ids = Array.from(originalMemberIds).filter(
        (id) => !currentSelectedIds.has(id)
      );

      // Only send request if there are changes
      if (add_user_ids.length === 0 && remove_user_ids.length === 0) {
        setToastMessage('No changes to save');
        setShowToast(true);
        setTimeout(() => {
          setShowToast(false);
          onClose();
        }, 2000);
        return;
      }

      const result = await updateOrganizationUsers.mutateAsync({
        organizationId: organization.id,
        data: {
          add_user_ids,
          remove_user_ids,
        },
      });

      setToastMessage(
        `Successfully updated: ${result.added} users added, ${result.removed} users removed`
      );
      setShowToast(true);

      setTimeout(() => {
        setShowToast(false);
        onClose();
        onSuccess?.();
      }, 2000);
    } catch (error) {
      clientErrorLog('Error updating organization users:', error);
      setToastMessage('Failed to update organization users');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Define table columns
  const columns: DataTableColumn<OrganizationUser & { id: string; isSelected: boolean }>[] =
    useMemo(
      () => [
        {
          key: 'checkbox',
          header: '',
          align: 'center',
          render: (user) => (
            <input
              type="checkbox"
              checked={user.isSelected}
              onChange={() => handleToggleUser(user.user_id)}
              disabled={isSubmitting}
              className="form-checkbox h-4 w-4 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
            />
          ),
        },
        {
          key: 'first_name',
          header: 'Name',
          sortable: true,
          render: (user) => (
            <div className="flex items-center">
              <div className="w-8 h-8 shrink-0 mr-2">
                <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-medium">
                  {user.first_name.charAt(0)}
                  {user.last_name.charAt(0)}
                </div>
              </div>
              <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                {user.first_name} {user.last_name}
              </div>
            </div>
          ),
        },
        {
          key: 'email',
          header: 'Email',
          sortable: true,
          render: (user) => (
            <div className="text-left text-sm text-gray-600 dark:text-gray-400">{user.email}</div>
          ),
        },
        {
          key: 'is_member',
          header: 'Status',
          sortable: true,
          align: 'center',
          render: (user) => (
            <div className="text-center">
              {user.is_member ? (
                <Badge color="blue" size="sm">Current Member</Badge>
              ) : (
                <Badge color="gray" size="sm">Not a Member</Badge>
              )}
            </div>
          ),
        },
      ],
      [handleToggleUser, isSubmitting]
    );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="full"
        title="Manage Users"
        description={organization?.name}
        preventClose={isSubmitting}
        className="max-h-[85vh] flex flex-col"
      >
        {/* Data Table */}
        <div className="flex-1 overflow-hidden px-12">
                {error ? (
                  <div className="py-6">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <p className="text-red-600 dark:text-red-400">
                        Error loading users: {error.message}
                      </p>
                    </div>
                  </div>
                ) : (
                  <DataTable
                    title="Users"
                    data={usersWithSelection}
                    columns={columns}
                    pagination={{ itemsPerPage: 10 }}
                    selectionMode="none"
                    isLoading={isLoading}
                    searchable={true}
                    searchPlaceholder="Search by name or email..."
                    densityToggle={false}
                    resizable={false}
                    stickyHeader={true}
                    exportable={false}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-between items-center">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedUserIds.size} of {users.length} users selected
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isLoading}
                    loading={isSubmitting}
                    loadingText="Saving..."
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
      </Modal>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </>
  );
}
