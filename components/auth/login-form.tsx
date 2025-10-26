'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiClient } from '@/lib/api/client';
import { loginSchema } from '@/lib/validations/auth';
import MFASetupDialog from './mfa-setup-dialog';
import MFAVerifyDialog from './mfa-verify-dialog';
import { useAuth } from './rbac-auth-provider';

type LoginFormData = {
  email: string;
  password: string;
  remember: boolean;
};

interface LoginFormProps {
  onSuccess?: () => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [defaultDashboardId, setDefaultDashboardId] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const router = useRouter();
  const searchParams = useSearchParams();
  const paramCallbackUrl = searchParams.get('callbackUrl') || searchParams.get('returnUrl');
  const oidcError = searchParams.get('error'); // OIDC error from callback

  // Determine callback URL: use param if provided, otherwise use default dashboard if set, else /dashboard
  const callbackUrl =
    paramCallbackUrl ||
    (defaultDashboardId ? `/dashboard/view/${defaultDashboardId}` : '/dashboard');
  const {
    login,
    isAuthenticated,
    csrfToken,
    mfaRequired,
    mfaSetupRequired,
    mfaSetupEnforced,
    mfaSkipsRemaining,
    mfaTempToken,
    mfaChallenge,
    mfaChallengeId,
    mfaUser,
    completeMFASetup,
    completeMFAVerification,
    clearMFAState,
  } = useAuth();

  // Fetch default dashboard on mount
  useEffect(() => {
    const fetchDefaultDashboard = async () => {
      try {
        const data = await apiClient.get<{ defaultDashboard?: { dashboard_id: string; dashboard_name: string } }>(
          '/api/admin/analytics/dashboards/default'
        );

        if (data.defaultDashboard?.dashboard_id) {
          setDefaultDashboardId(data.defaultDashboard.dashboard_id);
          console.log('Default dashboard found', {
            dashboardName: data.defaultDashboard.dashboard_name,
            dashboardId: data.defaultDashboard.dashboard_id,
          });
        }
      } catch (error) {
        // Silently fail - just use /dashboard as fallback
        console.log('No default dashboard configured or error fetching', { error });
      }
    };

    fetchDefaultDashboard();
  }, []);

  // Debug MFA state changes
  useEffect(() => {
    console.log('MFA State', {
      mfaRequired,
      mfaSetupRequired,
      hasTempToken: !!mfaTempToken,
      hasUser: !!mfaUser,
      hasChallenge: !!mfaChallenge,
      isAuthenticated,
      isSubmitting,
    });
  }, [
    mfaRequired,
    mfaSetupRequired,
    mfaTempToken,
    mfaUser,
    mfaChallenge,
    isAuthenticated,
    isSubmitting,
  ]);

  // Map OIDC error codes to user-friendly messages
  const oidcErrorMessages: Record<string, string> = {
    oidc_provider_error:
      'Unable to start Microsoft sign-in. Please try again or use email and password.',
    oidc_state_mismatch: 'Microsoft authentication failed due to security check. Please try again.',
    oidc_state_replay: 'Session expired or already used. Please try again.',
    oidc_session_hijack: 'Security validation failed. Please try again from your original device.',
    oidc_token_exchange_failed: 'Authentication with Microsoft failed. Please try again.',
    oidc_token_validation_failed: 'Microsoft token validation failed. Please try again.',
    oidc_email_not_verified:
      'Your email must be verified in Microsoft. Contact your administrator.',
    oidc_domain_not_allowed: 'Your email domain is not authorized. Contact your administrator.',
    oidc_invalid_profile: 'Invalid profile data received from Microsoft. Please try again.',
    user_not_provisioned:
      'Your account is not authorized for this application. Contact your administrator.',
    user_inactive: 'Your account has been deactivated. Contact your administrator.',
    oidc_callback_failed: 'Microsoft sign-in failed. Please try again or use email and password.',
  };

  const form = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onChange' as const,
    reValidateMode: 'onChange' as const,
    defaultValues: {
      email: '',
      password: '',
      remember: false,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = form;

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (isAuthenticated && !isSubmitting) {
      console.log('User already authenticated, redirecting', { callbackUrl });
      router.push(callbackUrl);
    }
  }, [isAuthenticated, isSubmitting, callbackUrl, router]);

  // Handle successful login without MFA (e.g., OIDC users or when MFA gets disabled)
  useEffect(() => {
    // Only redirect if:
    // 1. User is authenticated
    // 2. Not showing MFA dialogs
    // 3. Form was submitting (prevents redirect on page load)
    // 4. Not currently in the middle of MFA flow (check if we ever were in MFA state)
    if (isAuthenticated && !mfaRequired && !mfaSetupRequired && isSubmitting) {
      console.log('Login completed without MFA, redirecting', { callbackUrl });

      onSuccess?.();

      setTimeout(() => {
        window.location.href = callbackUrl;
      }, 200);
    }
  }, [isAuthenticated, mfaRequired, mfaSetupRequired, isSubmitting, callbackUrl, onSuccess]);

  const handleMFASetupSuccess = (sessionData: {
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
  }) => {
    completeMFASetup(sessionData);
    onSuccess?.();

    // Small delay to ensure auth state is synchronized before redirect
    setTimeout(() => {
      window.location.href = callbackUrl;
    }, 200);
  };

  const handleMFASkipSuccess = (sessionData: {
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
  }) => {
    completeMFASetup(sessionData); // Reuse existing completion handler
    onSuccess?.();

    // Small delay to ensure auth state is synchronized before redirect
    setTimeout(() => {
      window.location.href = callbackUrl;
    }, 200);
  };

  const handleMFAVerificationSuccess = (sessionData: {
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
  }) => {
    completeMFAVerification(sessionData);
    onSuccess?.();

    // Small delay to ensure auth state is synchronized before redirect
    setTimeout(() => {
      window.location.href = callbackUrl;
    }, 200);
  };

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError(null);
      setIsSubmitting(true);
      console.log('Login form submitting', { email: data.email });

      await login(data.email, data.password, data.remember);

      // Note: If MFA is required, the auth provider will update state and the
      // dialogs will show automatically via the conditional rendering below.
      // We do NOT redirect here - the redirect happens in the MFA success handlers.
      // If login completes without MFA (OIDC users), the auth provider handles it
      // and we still need to wait for the state update.

      // Keep isSubmitting true - either MFA dialog will take over, or the
      // useEffect below will detect successful login and redirect
    } catch (error) {
      console.error('Login error', error, { email: data.email });
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* MFA Setup Dialog */}
      {mfaSetupRequired && mfaTempToken && mfaUser && csrfToken && (
        <MFASetupDialog
          isOpen={mfaSetupRequired}
          onClose={clearMFAState}
          onSuccess={handleMFASetupSuccess}
          onSkip={handleMFASkipSuccess}
          tempToken={mfaTempToken}
          csrfToken={csrfToken}
          user={mfaUser}
          skipsRemaining={mfaSkipsRemaining}
          isEnforced={mfaSetupEnforced}
        />
      )}

      {/* MFA Verification Dialog */}
      {mfaRequired && mfaTempToken && mfaChallenge && mfaChallengeId && csrfToken && (
        <MFAVerifyDialog
          isOpen={mfaRequired}
          onClose={clearMFAState}
          onSuccess={handleMFAVerificationSuccess}
          tempToken={mfaTempToken}
          csrfToken={csrfToken}
          challenge={mfaChallenge as PublicKeyCredentialRequestOptionsJSON}
          challengeId={mfaChallengeId}
        />
      )}

      <div className="space-y-4">
        {/* OIDC Error message (from callback) */}
        {oidcError && oidcErrorMessages[oidcError] && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm">{oidcErrorMessages[oidcError]}</span>
            </div>
          </div>
        )}

        {/* Microsoft SSO Button */}
        <a
          href={`/api/auth/oidc/login?returnUrl=${encodeURIComponent(callbackUrl)}`}
          onClick={(_e) => {
            setIsMicrosoftLoading(true);
            // Let the browser navigate naturally - don't preventDefault
          }}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-700 dark:text-gray-200 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-disabled={isMicrosoftLoading}
        >
          {isMicrosoftLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="font-medium">Authenticating with Microsoft...</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span className="font-medium">Sign in with Microsoft</span>
            </>
          )}
        </a>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
              Or continue with email
            </span>
          </div>
        </div>

        {/* Traditional Email/Password Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Password login error message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              <div className="flex items-center">
                <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={emailId}>
              Email Address
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              className="form-input w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:ring-violet-500"
              {...register('email')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit(onSubmit)();
                }
              }}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
            )}
          </div>

          {/* Password field */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={passwordId}>
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              className="form-input w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:ring-violet-500"
              {...register('password')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit(onSubmit)();
                }
              }}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember me checkbox */}
          <div className="flex items-center">
            <input
              id={rememberId}
              type="checkbox"
              className="form-checkbox text-violet-500 focus:ring-violet-500"
              {...register('remember')}
            />
            <label htmlFor={rememberId} className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Remember me</span>
              <span className="block text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                Stay signed in for 30 days (vs 7 days standard)
              </span>
            </label>
          </div>

          {/* Submit button and forgot password */}
          <div className="flex items-center justify-between mt-6">
            <Link
              className="text-sm text-violet-500 hover:text-violet-600 underline hover:no-underline"
              href="/reset-password"
            >
              Forgot Password?
            </Link>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed ml-3"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing In...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
