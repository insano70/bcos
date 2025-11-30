'use client';

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useState } from 'react';
import {
  getWebAuthnErrorMessage,
  isWebAuthnSupported,
  registerPasskey,
} from '@/lib/utils/webauthn-client';
import { getBaseUrl } from './utils/get-base-url';

interface MFASetupDialogProps {
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
  onSkip?: (sessionData: {
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
  user: {
    id: string;
    email: string;
    name: string;
  };
  skipsRemaining?: number;
  isEnforced?: boolean;
}

export default function MFASetupDialog({
  isOpen,
  onClose: _onClose,
  onSuccess,
  onSkip,
  tempToken,
  csrfToken,
  user,
  skipsRemaining = 0,
  isEnforced = false,
}: MFASetupDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'intro' | 'registering' | 'skip_confirmation'>('intro');
  const [isSkipping, setIsSkipping] = useState(false);

  // Generate passkey name: "<device> Bendcare.com Passkey <date>"
  const generatePasskeyName = (): string => {
    // Get device name from user agent
    const ua = navigator.userAgent;
    let device = 'Unknown Device';

    if (ua.includes('Mac')) {
      device = ua.includes('iPhone') ? 'iPhone' : ua.includes('iPad') ? 'iPad' : 'Mac';
    } else if (ua.includes('Windows')) {
      device = 'Windows PC';
    } else if (ua.includes('Android')) {
      device = 'Android';
    } else if (ua.includes('Linux')) {
      device = 'Linux';
    }

    // Format date as "Jan 6, 2025"
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${device} Bendcare.com Passkey ${date}`;
  };

  const handleSkipClick = () => {
    if (isEnforced || !onSkip) {
      return; // Skip not allowed
    }
    // Show confirmation modal
    setStep('skip_confirmation');
  };

  const handleSkipConfirm = async () => {
    if (isEnforced || !onSkip) {
      return; // Skip not allowed
    }

    setIsSkipping(true);
    setError(null);

    try {
      const response = await fetch(`${getBaseUrl()}/api/auth/mfa/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to skip MFA setup');
      }

      const data = await response.json();
      onSkip(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip MFA setup');
      setStep('intro'); // Go back to intro on error
    } finally {
      setIsSkipping(false);
    }
  };

  const handleSkipCancel = () => {
    setStep('intro');
  };

  const handleBeginSetup = async () => {
    if (!isWebAuthnSupported()) {
      setError(
        'Your browser does not support passkeys. Please use a modern browser like Chrome, Safari, or Edge.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('registering');

    await handleRegisterPasskey();
  };

  const handleRegisterPasskey = async () => {
    try {
      // Step 1: Begin registration (get challenge from server)
      const beginResponse = await fetch(`${getBaseUrl()}/api/auth/mfa/register/begin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
      });

      if (!beginResponse.ok) {
        const errorData = await beginResponse.json();
        throw new Error(errorData.error || 'Failed to begin passkey registration');
      }

      const beginData = await beginResponse.json();
      const options: PublicKeyCredentialCreationOptionsJSON = beginData.data.options;
      const challengeId = beginData.data.challenge_id;

      // Step 2: Prompt user for passkey (browser interaction)
      const registrationResponse = await registerPasskey(options);

      // Step 3: Complete registration (verify with server)
      const passkeyName = generatePasskeyName();

      const completeResponse = await fetch(`${getBaseUrl()}/api/auth/mfa/register/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          challenge_id: challengeId,
          credential: registrationResponse,
          credential_name: passkeyName,
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to complete passkey registration');
      }

      const completeData = await completeResponse.json();

      // Success! Call onSuccess with session data
      onSuccess(completeData.data);
    } catch (err) {
      const errorMessage = getWebAuthnErrorMessage(err);
      setError(errorMessage);
      setStep('intro'); // Go back to intro on error
    } finally {
      setIsLoading(false);
    }
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
                      {step === 'intro' &&
                        (isEnforced ? 'MFA Setup Required' : 'Secure Your Account')}
                      {step === 'skip_confirmation' && 'Skip MFA Setup?'}
                      {step === 'registering' && 'Creating Passkey...'}
                    </DialogTitle>
                  </div>
                </div>
              </div>

              {/* Intro Step */}
              {step === 'intro' && (
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-gray-300">
                    Welcome, <span className="font-medium">{user.name}</span>!
                    {isEnforced
                      ? ' For security compliance, you must now configure passkey authentication.'
                      : ' To protect your account, we recommend passkey authentication.'}
                  </p>

                  {/* Enforcement notice */}
                  {isEnforced && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <div className="flex gap-3">
                        <svg
                          className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        <div className="text-sm text-amber-900 dark:text-amber-100">
                          <p className="font-medium">Setup Required</p>
                          <p className="text-amber-800 dark:text-amber-200 mt-1">
                            You have reached the maximum number of login attempts without MFA. Setup
                            is now required to continue accessing your account.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                        <p className="font-medium mb-1">What is a passkey?</p>
                        <p className="text-blue-800 dark:text-blue-200">
                          Passkeys use your device&apos;s biometric authentication (Touch ID, Face
                          ID, Windows Hello) or security key to keep your account secure without
                          passwords.
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4">
                    {/* Skip button - left side, non-prominent */}
                    {!isEnforced && skipsRemaining > 0 && (
                      <button
                        type="button"
                        onClick={handleSkipClick}
                        disabled={isSkipping || isLoading}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline hover:no-underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Skip for now
                      </button>
                    )}

                    {/* Setup button - right side, prominent */}
                    <button
                      type="button"
                      onClick={handleBeginSetup}
                      disabled={isLoading || isSkipping}
                      className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Setting Up...' : 'Set Up Passkey'}
                    </button>
                  </div>
                </div>
              )}

              {/* Skip Confirmation Step */}
              {step === 'skip_confirmation' && (
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-gray-300">
                    Are you sure you want to skip passkey setup?
                  </p>

                  {/* Warning box */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="flex gap-3">
                      <svg
                        className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div className="text-sm text-amber-900 dark:text-amber-100">
                        <p className="font-medium mb-1">Skip Limit</p>
                        <p className="text-amber-800 dark:text-amber-200">
                          You can skip setup{' '}
                          <span className="font-medium">
                            {skipsRemaining} more {skipsRemaining === 1 ? 'time' : 'times'}
                          </span>
                          . After that, MFA will be required to access your account.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security benefits */}
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
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <div className="text-sm text-blue-900 dark:text-blue-100">
                        <p className="font-medium mb-1">Why set up MFA now?</p>
                        <ul className="text-blue-800 dark:text-blue-200 list-disc list-inside space-y-1">
                          <li>Protects your account from unauthorized access</li>
                          <li>Takes less than 30 seconds to set up</li>
                          <li>More secure than passwords alone</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-4">
                    {/* Cancel button */}
                    <button
                      type="button"
                      onClick={handleSkipCancel}
                      disabled={isSkipping}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Go Back
                    </button>

                    {/* Confirm skip button */}
                    <button
                      type="button"
                      onClick={handleSkipConfirm}
                      disabled={isSkipping}
                      className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSkipping ? 'Skipping...' : 'Yes, Skip for Now'}
                    </button>
                  </div>
                </div>
              )}

              {/* Name Entry Step */}
              {/* Registering Step */}
              {step === 'registering' && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mb-4"></div>
                    <p className="text-gray-700 dark:text-gray-300 text-center">
                      Follow the prompt on your device to create your passkey...
                    </p>
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
