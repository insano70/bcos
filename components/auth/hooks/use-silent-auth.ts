/**
 * Silent Authentication Hook
 *
 * Attempts to authenticate user silently via Microsoft Entra without UI interaction.
 * This provides seamless SSO for users who already have an active Microsoft session,
 * eliminating unnecessary MFA prompts.
 *
 * Flow:
 * 1. Wait for RBACAuthProvider to check existing session (avoids duplicate /api/auth/me call)
 * 2. If already authenticated, redirect to returnUrl
 * 3. If no local session, check if silent auth was already attempted (via URL param)
 * 4. If not attempted, redirect to silent auth endpoint (prompt=none)
 * 5. If silent auth fails (no Microsoft session), show interactive login
 *
 * @module components/auth/hooks/use-silent-auth
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authLogger } from '@/lib/utils/client-logger';
import {
  clearLoginHint,
  clearPreferredAuthMethod,
  clearSessionExpiry,
  getLoginHint,
  getPreferredAuthMethod,
} from '@/lib/utils/login-hint-storage';
import { useAuth } from '../rbac-auth-provider';

interface UseSilentAuthOptions {
  /**
   * Whether silent auth is enabled. Set to false to skip silent auth entirely.
   * @default true
   */
  enabled?: boolean;

  /**
   * URL to redirect to after successful authentication.
   * @default '/dashboard'
   */
  returnUrl?: string;

  /**
   * Optional email to pre-fill in Microsoft login form (login_hint).
   */
  loginHint?: string;

  /**
   * Whether to skip silent auth if user is already authenticated.
   * @default true
   */
  skipIfAuthenticated?: boolean;
}

interface UseSilentAuthResult {
  /**
   * True while checking local session or performing silent auth redirect.
   */
  isCheckingSession: boolean;

  /**
   * True if silent auth was attempted but failed (user needs interactive login).
   */
  silentAuthFailed: boolean;

  /**
   * True if user is already authenticated locally.
   */
  isAuthenticated: boolean;

  /**
   * Initiates interactive OIDC login (after silent auth fails or when user clicks login).
   */
  initiateInteractiveLogin: () => void;

  /**
   * Retries silent authentication.
   */
  retrySilentAuth: () => void;

  /**
   * Mark that the user interacted with the signin form (focus/typing).
   * Cancels any pending automatic silent-auth attempt so we don't redirect
   * while the user is actively trying to log in.
   */
  markUserInteracted: () => void;
}

/**
 * Hook for silent OIDC authentication
 *
 * @example
 * ```tsx
 * function LoginPage() {
 *   const { isCheckingSession, silentAuthFailed, initiateInteractiveLogin } = useSilentAuth({
 *     returnUrl: '/dashboard',
 *   });
 *
 *   if (isCheckingSession) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   return (
 *     <button onClick={initiateInteractiveLogin}>
 *       Sign in with Microsoft
 *     </button>
 *   );
 * }
 * ```
 */
export function useSilentAuth(options: UseSilentAuthOptions = {}): UseSilentAuthResult {
  const {
    enabled = true,
    returnUrl = '/dashboard',
    loginHint: explicitLoginHint,
    skipIfAuthenticated = true,
  } = options;

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get auth state from RBACAuthProvider (single source of truth)
  const { isAuthenticated: authProviderAuthenticated, isLoading: authProviderLoading } = useAuth();

  // Check URL params synchronously to avoid loading flash when silent auth is disabled
  const silentFailedParam = searchParams.get('silent_auth_failed') === 'true';
  const loggedOutParam = searchParams.get('logged_out') === 'true';
  const shouldSkipInitially = !enabled || silentFailedParam || loggedOutParam;

  // Get login hint: prefer explicit option, fall back to stored email from previous login
  // This pre-fills the Microsoft login form for returning users, saving one click
  const storedHint = getLoginHint();
  const loginHint = explicitLoginHint ?? storedHint;

  // Only attempt automatic silent auth when the user previously preferred Microsoft SSO
  // (prevents brand-new / password-first users from being redirected away from the form).
  const preferredAuthMethod = getPreferredAuthMethod();
  const autoSilentEligible = enabled && preferredAuthMethod === 'oidc' && !!loginHint;

  // Initialize states based on whether we need to check at all
  const [isCheckingSession, setIsCheckingSession] = useState(
    !shouldSkipInitially && autoSilentEligible
  );
  const [silentAuthFailed, setSilentAuthFailed] = useState(silentFailedParam || loggedOutParam);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Prevent multiple silent auth attempts
  const hasAttemptedRef = useRef(shouldSkipInitially);

  // Small delay before auto-silent redirect so the form can render and the user can interact.
  const AUTO_SILENT_REDIRECT_DELAY_MS = 400;

  // Build OIDC login URL with parameters
  const buildLoginUrl = useCallback(
    (silent: boolean) => {
      const endpoint = silent ? '/api/auth/oidc/silent' : '/api/auth/oidc/login';
      const url = new URL(endpoint, window.location.origin);

      if (returnUrl) {
        url.searchParams.set('returnUrl', returnUrl);
      }
      if (loginHint) {
        url.searchParams.set('login_hint', loginHint);
      }

      return url.toString();
    },
    [returnUrl, loginHint]
  );

  // Track user interaction to cancel auto silent auth
  const userInteractedRef = useRef(false);
  const autoSilentTimerRef = useRef<number | null>(null);

  const clearAutoSilentTimer = useCallback(() => {
    if (autoSilentTimerRef.current !== null) {
      window.clearTimeout(autoSilentTimerRef.current);
      autoSilentTimerRef.current = null;
    }
  }, []);

  const markUserInteracted = useCallback(() => {
    userInteractedRef.current = true;
    clearAutoSilentTimer();
    setIsCheckingSession(false);
  }, [clearAutoSilentTimer]);

  // Handle side effects for logout (clear stored hints)
  // Note: State initialization is handled synchronously above to avoid loading flash
  useEffect(() => {
    if (loggedOutParam) {
      // User explicitly logged out - clear stored login hint and session expiry
      authLogger.log('User explicitly logged out - clearing stored auth hints');
      clearLoginHint();
      clearSessionExpiry();
      clearPreferredAuthMethod();
    }
  }, [loggedOutParam]);

  // Main effect: wait for RBACAuthProvider to check session, then attempt silent auth if needed
  useEffect(() => {
    // Skip if disabled or already attempted
    if (!enabled || hasAttemptedRef.current) {
      if (!enabled) {
        setIsCheckingSession(false);
      }
      return;
    }

    // Wait for RBACAuthProvider to finish its initial session check
    // This avoids a duplicate /api/auth/me call
    if (authProviderLoading) {
      // Only show a "checking session" indicator if we're eligible to auto-silent-auth.
      // Otherwise, let the login form render immediately without a spinner.
      if (autoSilentEligible && !userInteractedRef.current) {
        setIsCheckingSession(true);
      } else {
        setIsCheckingSession(false);
      }
      return;
    }

    // RBACAuthProvider has finished checking - use its result
    if (authProviderAuthenticated) {
      authLogger.log('Valid session found via auth provider - user is authenticated');
      setIsAuthenticated(true);
      setIsCheckingSession(false);
      clearAutoSilentTimer();

      // Redirect authenticated user using client-side navigation (no full page reload)
      if (skipIfAuthenticated) {
        authLogger.log('Redirecting authenticated user', { returnUrl });
        router.replace(returnUrl);
      }
      return;
    }

    // No local session found by auth provider.
    // Only attempt silent OIDC automatically for users who have previously preferred it,
    // and only if they haven't started interacting with the form.
    if (!autoSilentEligible || userInteractedRef.current) {
      hasAttemptedRef.current = true; // Nothing else to do for this page load
      setIsCheckingSession(false);
      return;
    }

    authLogger.log('No valid session - scheduling silent Microsoft auth');
    hasAttemptedRef.current = true;
    setIsCheckingSession(true);

    // Redirect to silent auth endpoint (full navigation required for OAuth flow)
    // Delay slightly to let UI render and give user a chance to interact (cancel).
    clearAutoSilentTimer();
    autoSilentTimerRef.current = window.setTimeout(() => {
      if (userInteractedRef.current) {
        setIsCheckingSession(false);
        return;
      }
      const silentUrl = buildLoginUrl(true);
      authLogger.log('Redirecting to silent auth', { url: silentUrl });
      window.location.href = silentUrl;
    }, AUTO_SILENT_REDIRECT_DELAY_MS);

    return () => {
      clearAutoSilentTimer();
    };
  }, [
    enabled,
    skipIfAuthenticated,
    returnUrl,
    buildLoginUrl,
    authProviderLoading,
    authProviderAuthenticated,
    router,
    autoSilentEligible,
    clearAutoSilentTimer,
  ]);

  // Initiate interactive login (user clicks "Sign in with Microsoft")
  const initiateInteractiveLogin = useCallback(() => {
    authLogger.log('Initiating interactive OIDC login');
    const loginUrl = buildLoginUrl(false);
    window.location.href = loginUrl;
  }, [buildLoginUrl]);

  // Retry silent auth (useful if user's Microsoft session was just established)
  const retrySilentAuth = useCallback(() => {
    authLogger.log('Retrying silent auth');
    hasAttemptedRef.current = false;
    setSilentAuthFailed(false);
    setIsCheckingSession(true);
    userInteractedRef.current = false;
    clearAutoSilentTimer();

    // Clear the silent_auth_failed param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('silent_auth_failed');
    window.history.replaceState({}, '', url.toString());

    // Redirect to silent auth
    const silentUrl = buildLoginUrl(true);
    window.location.href = silentUrl;
  }, [buildLoginUrl, clearAutoSilentTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAutoSilentTimer();
    };
  }, [clearAutoSilentTimer]);

  return {
    isCheckingSession,
    silentAuthFailed,
    isAuthenticated,
    initiateInteractiveLogin,
    retrySilentAuth,
    markUserInteracted,
  };
}

