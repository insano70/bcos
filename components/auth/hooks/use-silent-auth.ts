/**
 * Silent Authentication Hook
 *
 * Attempts to authenticate user silently via Microsoft Entra without UI interaction.
 * This provides seamless SSO for users who already have an active Microsoft session,
 * eliminating unnecessary MFA prompts.
 *
 * Flow:
 * 1. Check if user already has a valid local session
 * 2. If no local session, check if silent auth was already attempted (via URL param)
 * 3. If not attempted, redirect to silent auth endpoint (prompt=none)
 * 4. If silent auth fails (no Microsoft session), show interactive login
 *
 * @module components/auth/hooks/use-silent-auth
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authLogger } from '@/lib/utils/client-logger';
import { clearLoginHint, clearSessionExpiry, getLoginHint } from '@/lib/utils/login-hint-storage';

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

  const searchParams = useSearchParams();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [silentAuthFailed, setSilentAuthFailed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Prevent multiple silent auth attempts
  const hasAttemptedRef = useRef(false);

  // Get login hint: prefer explicit option, fall back to stored email from previous login
  // This pre-fills the Microsoft login form for returning users, saving one click
  const storedHint = getLoginHint();
  const loginHint = explicitLoginHint ?? storedHint;

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

  // Check if silent auth was already attempted and failed, or if user explicitly logged out
  useEffect(() => {
    const silentFailed = searchParams.get('silent_auth_failed') === 'true';
    const loggedOut = searchParams.get('logged_out') === 'true';

    if (loggedOut) {
      // User explicitly logged out - do NOT attempt silent auth
      // This prevents auto-signin when switching users
      authLogger.log('User explicitly logged out - skipping silent auth');

      // Clear stored login hint and session expiry to allow fresh login
      clearLoginHint();
      clearSessionExpiry();

      setSilentAuthFailed(true); // Treat as "failed" so login form shows
      setIsCheckingSession(false);
      hasAttemptedRef.current = true;
      return;
    }

    if (silentFailed) {
      authLogger.log('Silent auth previously failed - showing login form');
      setSilentAuthFailed(true);
      setIsCheckingSession(false);
      hasAttemptedRef.current = true;
    }
  }, [searchParams]);

  // Main effect: check session and attempt silent auth
  useEffect(() => {
    // Skip if disabled or already attempted
    if (!enabled || hasAttemptedRef.current) {
      if (!enabled) {
        setIsCheckingSession(false);
      }
      return;
    }

    // AbortController to cancel fetch on unmount
    const abortController = new AbortController();
    let isMounted = true;

    const checkSessionAndAttemptSilentAuth = async () => {
      try {
        authLogger.log('Checking for existing session...');

        // Check if user already has a valid local session
        const sessionResponse = await fetch('/api/auth/me', {
          credentials: 'include',
          signal: abortController.signal,
        });

        // Don't update state if unmounted
        if (!isMounted) return;

        if (sessionResponse.ok) {
          authLogger.log('Valid session found - user is authenticated');
          setIsAuthenticated(true);
          setIsCheckingSession(false);

          // Optionally redirect if already authenticated
          if (skipIfAuthenticated) {
            authLogger.log('Redirecting authenticated user', { returnUrl });
            window.location.href = returnUrl;
          }
          return;
        }

        // No valid session - attempt silent auth
        authLogger.log('No valid session - attempting silent Microsoft auth');
        hasAttemptedRef.current = true;

        // Redirect to silent auth endpoint
        const silentUrl = buildLoginUrl(true);
        authLogger.log('Redirecting to silent auth', { url: silentUrl });
        window.location.href = silentUrl;
      } catch (err) {
        // Ignore abort errors (expected on unmount)
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        authLogger.error('Session check failed', err);
        // On error, show login form (only if still mounted)
        if (isMounted) {
          setSilentAuthFailed(true);
          setIsCheckingSession(false);
          hasAttemptedRef.current = true;
        }
      }
    };

    checkSessionAndAttemptSilentAuth();

    // Cleanup: abort fetch and mark as unmounted
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [enabled, skipIfAuthenticated, returnUrl, buildLoginUrl]);

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

    // Clear the silent_auth_failed param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('silent_auth_failed');
    window.history.replaceState({}, '', url.toString());

    // Redirect to silent auth
    const silentUrl = buildLoginUrl(true);
    window.location.href = silentUrl;
  }, [buildLoginUrl]);

  return {
    isCheckingSession,
    silentAuthFailed,
    isAuthenticated,
    initiateInteractiveLogin,
    retrySilentAuth,
  };
}

