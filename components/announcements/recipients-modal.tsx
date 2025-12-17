'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface Recipient {
  user_id: string;
  email: string;
  name: string;
}

interface RecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementSubject: string;
}

/**
 * Recipients Modal
 * Displays the list of users targeted by a specific announcement
 * Read-only view using ModalBasic pattern
 */
export default function RecipientsModal({
  isOpen,
  onClose,
  announcementId,
  announcementSubject,
}: RecipientsModalProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecipients = useCallback(async () => {
    if (!announcementId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ recipients: Recipient[] }>(
        `/api/configure/announcements/${announcementId}/recipients`
      );
      setRecipients(response.recipients ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, [announcementId]);

  useEffect(() => {
    if (isOpen && announcementId) {
      fetchRecipients();
    }
  }, [isOpen, announcementId, fetchRecipients]);

  const getInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const getAvatarColor = (userId: string): string => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index] || 'bg-gray-500';
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={onClose}>
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
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden max-w-lg w-full max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <div>
                  <Dialog.Title className="font-semibold text-gray-800 dark:text-gray-100">
                    Recipients
                  </Dialog.Title>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
                    {announcementSubject}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  aria-label="Close"
                  className="p-0"
                >
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="md" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-red-500">
                  <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-sm font-medium">{error}</p>
                </div>
              ) : recipients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <p className="text-sm font-medium">No recipients</p>
                  <p className="text-xs mt-1">This announcement has no specific recipients</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recipients.map((recipient) => (
                    <div key={recipient.user_id} className="px-5 py-3 flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full ${getAvatarColor(recipient.user_id)} flex items-center justify-center text-sm font-medium text-white`}
                      >
                        {getInitials(recipient.name)}
                      </div>
                      {/* Name and Email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {recipient.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {recipient.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
              </p>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
