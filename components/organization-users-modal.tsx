'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type Organization,
  type OrganizationUser,
  useOrganizationUsers,
  useUpdateOrganizationUsers,
} from '@/lib/hooks/use-organizations';
import DataTable, { type DataTableColumn } from './data-table-standard';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

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
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                  Current Member
                </span>
              ) : (
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400 rounded-full">
                  Not a Member
                </span>
              )}
            </div>
          ),
        },
      ],
      [handleToggleUser, isSubmitting]
    );

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose} className="relative z-50">
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as="div"
            enter="transition ease-in-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="transition ease-in-out duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden w-full max-w-5xl max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
                <div className="flex justify-between items-center">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Manage Users
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {organization?.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-50"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                      <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                    </svg>
                  </button>
                </div>
              </div>

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
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting || isLoading}
                    className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </Transition>
  );
}
