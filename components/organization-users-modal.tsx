'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import {
  useOrganizationUsers,
  useUpdateOrganizationUsers,
  type OrganizationUser,
  type Organization,
} from '@/lib/hooks/use-organizations';
import Toast from './toast';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const itemsPerPage = 10;

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
      setSearchQuery('');
      setCurrentPage(1);
      setSelectedUserIds(new Set());
    }
  }, [isOpen]);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }

    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.first_name.toLowerCase().includes(query) ||
        user.last_name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  // Paginate filtered users
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

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

  // Handle select all on current page
  const handleSelectAll = useCallback(() => {
    const allSelected = paginatedUsers.every((user) => selectedUserIds.has(user.user_id));

    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      paginatedUsers.forEach((user) => {
        if (allSelected) {
          newSet.delete(user.user_id);
        } else {
          newSet.add(user.user_id);
        }
      });
      return newSet;
    });
  }, [paginatedUsers, selectedUserIds]);

  const handleSave = async () => {
    if (!organization) return;

    setIsSubmitting(true);

    try {
      // Calculate diff: compare current selection with original membership
      const originalMemberIds = new Set(users.filter((u) => u.is_member).map((u) => u.user_id));
      const currentSelectedIds = selectedUserIds;

      const add_user_ids = Array.from(currentSelectedIds).filter((id) => !originalMemberIds.has(id));
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating organization users:', error);
      }
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Check if all users on current page are selected
  const allCurrentPageSelected =
    paginatedUsers.length > 0 && paginatedUsers.every((user) => selectedUserIds.has(user.user_id));

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Manage Users - {organization?.name}
                </Dialog.Title>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-50"
                >
                  <div className="sr-only">Close</div>
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search by first name, last name, or email..."
                disabled={isSubmitting}
                className="form-input w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredUsers.length} of {users.length} users
              </p>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500 dark:text-gray-400">Loading users...</div>
                </div>
              ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400">Error loading users: {error.message}</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500 dark:text-gray-400">
                    {searchQuery ? 'No users found matching your search' : 'No users available'}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select All */}
                  <div className="flex items-center py-3 px-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={handleSelectAll}
                      disabled={isSubmitting}
                      className="form-checkbox h-4 w-4 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
                    />
                    <label className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Select all on this page
                    </label>
                  </div>

                  {/* User Rows */}
                  {paginatedUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center py-3 px-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user.user_id)}
                        onChange={() => handleToggleUser(user.user_id)}
                        disabled={isSubmitting}
                        className="form-checkbox h-4 w-4 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
                      />
                      <div className="ml-4 flex-1">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                      {user.is_member && (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                          Current Member
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700/60">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isSubmitting}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || isSubmitting}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-3">
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
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </Transition>
  );
}
