'use client';

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authenticatePasskey,
  getWebAuthnErrorMessage,
  isWebAuthnSupported,
} from '@/lib/utils/webauthn-client';
import { getBaseUrl } from './utils/get-base-url';

interface MFAVerifyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (sessionData: {
    user: {
      id: string;
      email: string;
      name: string;
      firstName: string;
      lastName: string;
      role: string;
      emailVerified: boolean;
    };
    sessionId: string;
  }) => void;
  tempToken: string;
  csrfToken: string;
  challenge: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}

export default function MFAVerifyDialog({
  isOpen,
  onClose,
  onSuccess,
  tempToken,
  csrfToken,
  challenge,
  challengeId,
}: MFAVerifyDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAttemptedRef = useRef(false);

  const handleVerifyPasskey = useCallback(async () => {
    if (!isWebAuthnSupported()) {
      setError(
        'Your browser does not support passkeys. Please use a modern browser like Chrome, Safari, or Edge.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Prompt user for passkey authentication (browser interaction)
      const authenticationResponse = await authenticatePasskey(challenge);

      // Step 2: Verify with server
      const verifyResponse = await fetch(`${getBaseUrl()}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          challenge_id: challengeId,
          assertion: authenticationResponse,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'Failed to verify passkey');
      }

      const verifyData = await verifyResponse.json();

      // Success! Call onSuccess with session data
      onSuccess(verifyData.data);
    } catch (err) {
      const errorMessage = getWebAuthnErrorMessage(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [challenge, tempToken, csrfToken, challengeId, onSuccess]);

  // Auto-trigger passkey verification when dialog opens (only once)
  useEffect(() => {
    if (isOpen && !isLoading && !hasAttemptedRef.current) {
      hasAttemptedRef.current = true;
      handleVerifyPasskey();
    }
  }, [isOpen, isLoading, handleVerifyPasskey]);

  // Reset attempt tracking when dialog closes
  useEffect(() => {
    if (!isOpen) {
      hasAttemptedRef.current = false;
    }
  }, [isOpen]);

  const handleRetry = () => {
    setError(null);
    hasAttemptedRef.current = false; // Reset attempt flag to allow retry
    handleVerifyPasskey();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        {/* Backdrop */}
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>

        {/* Dialog content */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="mx-auto max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-blue-600 dark:text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                      {isLoading
                        ? 'Verifying...'
                        : error
                          ? 'Verification Failed'
                          : 'Verify Your Identity'}
                    </DialogTitle>
                  </div>
                </div>
              </div>

              {/* Loading State */}
              {isLoading && !error && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mb-4"></div>
                    <p className="text-gray-700 dark:text-gray-300 text-center">
                      Follow the prompt on your device to verify your identity...
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex gap-3">
                      <svg
                        className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      <div className="text-sm text-blue-900 dark:text-blue-100">
                        <p className="font-medium mb-1">Use your passkey to sign in</p>
                        <p className="text-blue-800 dark:text-blue-200">
                          Use Touch ID, Face ID, Windows Hello, or your security key to continue.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Initial State (shouldn't normally be seen due to auto-trigger) */}
              {!isLoading && !error && (
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-gray-300">
                    Please verify your identity using your passkey to continue.
                  </p>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleVerifyPasskey}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
                    >
                      Verify with Passkey
                    </button>
                  </div>
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
