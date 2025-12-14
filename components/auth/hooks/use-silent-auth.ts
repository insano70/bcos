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
import { clearLoginHint, clearSessionExpiry, getLoginHint } from '@/lib/utils/login-hint-storage';
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

  // Initialize states based on whether we need to check at all
  const [isCheckingSession, setIsCheckingSession] = useState(!shouldSkipInitially);
  const [silentAuthFailed, setSilentAuthFailed] = useState(silentFailedParam || loggedOutParam);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Prevent multiple silent auth attempts
  const hasAttemptedRef = useRef(shouldSkipInitially);

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

  // Handle side effects for logout (clear stored hints)
  // Note: State initialization is handled synchronously above to avoid loading flash
  useEffect(() => {
    if (loggedOutParam) {
      // User explicitly logged out - clear stored login hint and session expiry
      authLogger.log('User explicitly logged out - clearing stored auth hints');
      clearLoginHint();
      clearSessionExpiry();
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
      authLogger.log('Waiting for auth provider to check session...');
      return;
    }

    // RBACAuthProvider has finished checking - use its result
    if (authProviderAuthenticated) {
      authLogger.log('Valid session found via auth provider - user is authenticated');
      setIsAuthenticated(true);
      setIsCheckingSession(false);

      // Redirect authenticated user using client-side navigation (no full page reload)
      if (skipIfAuthenticated) {
        authLogger.log('Redirecting authenticated user', { returnUrl });
        router.replace(returnUrl);
      }
      return;
    }

    // No valid session found by auth provider - attempt silent OIDC auth
    authLogger.log('No valid session - attempting silent Microsoft auth');
    hasAttemptedRef.current = true;

    // Redirect to silent auth endpoint (full navigation required for OAuth flow)
    const silentUrl = buildLoginUrl(true);
    authLogger.log('Redirecting to silent auth', { url: silentUrl });
    window.location.href = silentUrl;
  }, [
    enabled,
    skipIfAuthenticated,
    returnUrl,
    buildLoginUrl,
    authProviderLoading,
    authProviderAuthenticated,
    router,
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

