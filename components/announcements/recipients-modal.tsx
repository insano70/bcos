'use client';

import { useCallback, useEffect, useState } from 'react';

import { Modal } from '@/components/ui/modal';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Recipients"
      description={announcementSubject}
      className="max-h-[80vh] flex flex-col"
    >
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
    </Modal>
  );
}
