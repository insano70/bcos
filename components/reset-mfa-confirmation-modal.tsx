'use client';

import { useState } from 'react';
import ModalBasic from './modal-basic';
import { Button } from '@/components/ui/button';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface ResetMFAConfirmationModalProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  userName: string;
  userEmail: string;
  credentialCount: number;
  onConfirm: () => Promise<void>;
}

export default function ResetMFAConfirmationModal({
  isOpen,
  setIsOpen,
  userName,
  userEmail,
  credentialCount,
  onConfirm,
}: ResetMFAConfirmationModalProps) {
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsResetting(true);
      await onConfirm();
      setIsOpen(false);
    } catch (error) {
      clientErrorLog('MFA reset failed:', error);
      // Error will be handled by parent component
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancel = () => {
    if (!isResetting) {
      setIsOpen(false);
    }
  };

  return (
    <ModalBasic isOpen={isOpen} setIsOpen={setIsOpen} title="Reset MFA">
      <div className="px-5 py-4">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/20 mx-auto mb-4">
          <svg
            className="w-6 h-6 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Reset MFA for {userName}
          </h3>
          <div className="text-left bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              <strong>User:</strong> {userEmail}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Current MFA credentials:</strong> {credentialCount} passkey
              {credentialCount !== 1 ? 's' : ''}
            </p>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            This action will:
          </p>
          <ul className="text-left text-sm text-gray-600 dark:text-gray-400 mb-4 space-y-1">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Delete all {credentialCount} registered passkey{credentialCount !== 1 ? 's' : ''}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Disable MFA on the account</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Allow the user to set up MFA again from scratch</span>
            </li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-500 italic">
            The user will need to register new passkeys after this reset.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={isResetting}
            fullWidth
            className="sm:w-auto mt-3 sm:mt-0"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            loading={isResetting}
            loadingText="Resetting MFA..."
            fullWidth
            className="sm:w-auto bg-amber-500 hover:bg-amber-600"
          >
            Reset MFA
          </Button>
        </div>
      </div>
    </ModalBasic>
  );
}
