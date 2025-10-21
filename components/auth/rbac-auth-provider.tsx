'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiClient } from '@/lib/api/client';
import { useAuthState } from './hooks/use-auth-state';
import { useCSRFManagement } from './hooks/use-csrf-management';
import { useMFAFlow } from './hooks/use-mfa-flow';
import { authHTTPService } from './services/auth-http-service';
import type { MFASessionData, RBACAuthContextType, User } from './types';
import { handleLoginResponse } from './utils/handle-login-response';
import {
  transformApiUserToContext,
  validateApiUserResponse,
} from './utils/user-context-transformer';

/**
 * Enhanced Authentication Provider with RBAC Integration
 * Extends existing auth system with full RBAC user context
 */

const RBACAuthContext = createContext<RBACAuthContextType | undefined>(undefined);

interface RBACAuthProviderProps {
  children: ReactNode;
}

export function RBACAuthProvider({ children }: RBACAuthProviderProps) {
  // Use reducer-based state management
  const { state, actions } = useAuthState();

  // Use CSRF management hook
  const { csrfToken, ensureCsrfToken, setCsrfToken } = useCSRFManagement();

  // Use MFA flow management hook
  const {
    mfaState,
    setMFASetupRequired,
    setMFAVerificationRequired,
    completeMFASetup: completeMFASetupHook,
    completeMFAVerification: completeMFAVerificationHook,
    clearMFAState,
  } = useMFAFlow();

  // Track if we've already initialized to prevent redundant calls
  const [hasInitialized, setHasInitialized] = useState(false);

  // RACE CONDITION PROTECTION: Mutex to prevent concurrent auth operations
  const authOperationInProgress = useRef(false);

  // Ref to access current csrfToken value in callbacks without causing re-creation
  // This prevents infinite loops while avoiding stale closures
  const csrfTokenRef = useRef<string | null>(csrfToken);

  // Sync ref with state on every render
  // This ensures callbacks always read the latest value without re-creating
  useEffect(() => {
    csrfTokenRef.current = csrfToken;
  }, [csrfToken]);

  const refreshToken = useCallback(async () => {
    // RACE CONDITION PROTECTION: Prevent concurrent refresh operations
    // If a refresh is already in progress, wait for it to complete instead of skipping
    if (authOperationInProgress.current) {
      console.log('[Auth] Operation already in progress, waiting for completion...');

      // Wait for the current operation to complete (max 5 seconds)
      const maxWaitTime = 5000;
      const checkInterval = 100;
      let waited = 0;

      while (authOperationInProgress.current && waited < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }

      if (authOperationInProgress.current) {
        console.warn('[Auth] Operation timeout - proceeding anyway');
      } else {
        console.log('[Auth] Operation completed, refresh not needed');
        return;
      }
    }

    authOperationInProgress.current = true;

    try {
      actions.refreshStart();

      // Import retry utilities
      const { retryWithBackoff } = await import('@/lib/utils/retry');
      const { classifyAuthError, shouldRetryAuthError } = await import('@/lib/utils/auth-errors');

      let attempt = 0;

      // Retry refresh with exponential backoff
      const result = await retryWithBackoff(
        async () => {
          attempt++;

          // Read current value from ref (always up-to-date, never stale)
          const currentToken = csrfTokenRef.current;
          const token = currentToken || (await ensureCsrfToken()) || '';

          console.log(`[Auth] Token refresh attempt ${attempt}`);

          // Use HTTP service to refresh token
          const refreshResult = await authHTTPService.refreshAuthToken(token);

          if (!refreshResult.data) {
            throw new Error('Invalid refresh response: missing data');
          }

          return refreshResult;
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 4000,
          shouldRetry: (error, attemptNum) => {
            const classified = classifyAuthError(error);
            const shouldRetry = shouldRetryAuthError(error, attemptNum);

            console.log(`[Auth] Refresh attempt ${attemptNum} failed:`, {
              errorType: classified.type,
              shouldRetry,
              message: classified.message,
            });

            // Update state with retry attempt number
            if (shouldRetry) {
              actions.refreshFailure(attemptNum);
            }

            return shouldRetry;
          },
          onRetry: (error, attemptNum, delayMs) => {
            const classified = classifyAuthError(error);
            console.log(`[Auth] Retrying refresh in ${delayMs}ms (attempt ${attemptNum + 1})`, {
              errorType: classified.type,
              message: classified.message,
            });
          },
        }
      );

      // Update CSRF token if provided
      if (result.data?.csrfToken) {
        setCsrfToken(result.data.csrfToken);
      }

      // Update state with refreshed user data (accessToken updated server-side in httpOnly cookie)
      if (result.data) {
        actions.refreshSuccess({
          user: result.data.user as User,
          sessionId: result.data.sessionId,
        });
      }

      console.log('[Auth] Token refreshed successfully after', attempt, 'attempt(s)');
    } catch (error) {
      // All retries exhausted - classify the error and determine final action
      const { classifyAuthError } = await import('@/lib/utils/auth-errors');
      const classified = classifyAuthError(error);

      console.error('[Auth] Token refresh failed after all retries:', {
        errorType: classified.type,
        message: classified.message,
        shouldRetry: classified.shouldRetry,
      });

      // Check if this was a rate limit - don't log out, just wait for next periodic refresh
      if (classified.type === 'rate_limit') {
        console.log('[Auth] Rate limited - will retry on next periodic refresh');
        // Don't trigger refreshRetryFailed - keep user authenticated
        return;
      }

      // All other errors: log out after retries exhausted
      console.log('[Auth] Session expired after retry attempts');
      actions.refreshRetryFailed();
    } finally {
      // Always release mutex
      authOperationInProgress.current = false;
    }
  },
  [ensureCsrfToken, setCsrfToken, actions]
  // Empty deps: Reads current csrfToken from ref (csrfTokenRef) instead of closure.
  // Refs are updated via useEffect, so callback always sees current value without re-creating.
  // This prevents infinite loops while avoiding stale closures.
  // State setters (setCsrfToken) are stable and don't need to be listed.
  );

  const logout = useCallback(async () => {
    try {
      actions.setLoading(true);

      // Call logout endpoint via HTTP service
      const token = (await ensureCsrfToken()) || '';
      await authHTTPService.performLogout(token);

      // Clear CSRF token so next login gets fresh anonymous token
      setCsrfToken(null);

      // Clear MFA state
      clearMFAState();

      // Clear auth state
      actions.logout();

      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);

      // Clear CSRF token even on logout failure
      setCsrfToken(null);

      // Clear MFA state
      clearMFAState();

      // Clear state even if logout fails (accessToken cleared server-side)
      actions.logout();
    }
  }, [actions, ensureCsrfToken, setCsrfToken, clearMFAState]);

  const loadUserContext = useCallback(async () => {
    if (!state.user) return;

    // Prevent overlapping user context loading requests
    if (state.rbacLoading) {
      console.log('User context already loading, skipping duplicate request');
      return;
    }

    try {
      actions.rbacLoadStart();

      console.log('Loading user context for:', state.user.id);

      // Fetch user context via HTTP service
      const data = await authHTTPService.fetchUserContext();

      if (!data.success || !data.data?.user) {
        throw new Error('Invalid user context response');
      }

      // Transform API response to UserContext format
      const apiUser = data.data.user;
      validateApiUserResponse(apiUser);
      const userContext = transformApiUserToContext(apiUser);

      actions.rbacLoadSuccess({ userContext });
    } catch (error) {
      // Check if this is a session expired error (401)
      if (error instanceof Error && error.message.includes('401')) {
        console.log('Session expired during user context loading');
        actions.sessionExpired();
        return;
      }

      console.error('Failed to load RBAC user context:', error);
      actions.rbacLoadFailure({
        error: error instanceof Error ? error.message : 'Unknown RBAC error',
      });
    }
  }, [state.user, state.rbacLoading, actions]);

  const initializeAuth = useCallback(async () => {
    // Prevent redundant initialization calls (React StrictMode calls useEffect twice)
    if (hasInitialized) {
      console.log('Auth already initialized, skipping...');
      return;
    }

    try {
      actions.initStart();
      console.log('Initializing authentication via server-side token refresh...');
      setHasInitialized(true);

      // First, check if we already have a valid authentication state from cookies
      // Try to validate existing session without forcing a refresh
      const data = await authHTTPService.checkSession();

      if (data.success && data.data?.user) {
        console.log('Found existing valid session, skipping token refresh');

        // Extract user context from the response to avoid duplicate loading
        const apiUser = data.data.user;
        validateApiUserResponse(apiUser);
        const userContext = transformApiUserToContext(apiUser);

        // Convert API user to User format
        const user: User = {
          id: apiUser.id,
          email: apiUser.email,
          name: `${apiUser.firstName} ${apiUser.lastName}`,
          firstName: apiUser.firstName,
          lastName: apiUser.lastName,
          role: apiUser.roles[0]?.name || 'user',
          emailVerified: apiUser.emailVerified,
        };

        // Update auth state with existing session and user context
        actions.initSuccess({
          user,
          sessionId: data.data.sessionId,
          userContext: userContext,
        });

        // Ensure we have a CSRF token for future requests
        await ensureCsrfToken();
        return;
      }

      // No valid session found, try token refresh as fallback
      console.log('No valid session found, attempting token refresh...');
      await ensureCsrfToken();
      await refreshToken();
    } catch (error) {
      // CRITICAL FIX: Do NOT retry on initialization failure
      // If there's no session, that's a normal state - user needs to login
      console.log('No active session found:', error);
      actions.initFailure();
      // DO NOT reset hasInitialized - prevents infinite loop
      // User must explicitly login to create a new session
    }
  }, [hasInitialized, actions, ensureCsrfToken, refreshToken]);

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Set up API client with auth context
  useEffect(() => {
    apiClient.setAuthContext({
      csrfToken: csrfToken,
      refreshToken,
      logout,
      ensureCsrfToken,
    });
  }, [csrfToken, ensureCsrfToken, logout, refreshToken]);

  // Set up token refresh interval (based on authentication state, not client-side token)
  useEffect(() => {
    if (state.isAuthenticated) {
      // Refresh token every 8 minutes (access tokens last 15 minutes)
      // 7-minute safety margin (47%) prevents expiration during network delays or clock skew
      // This aggressive refresh ensures tokens are always fresh for active users
      const refreshInterval = setInterval(
        () => {
          // Only refresh if we're still authenticated and not already refreshing
          if (state.isAuthenticated && !state.isLoading) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Periodic token refresh triggered');
            }
            refreshToken();
          }
        },
        8 * 60 * 1000
      ); // 8 minutes (47% safety margin)

      return () => clearInterval(refreshInterval);
    }
  }, [state.isAuthenticated, refreshToken, state.isLoading]);

  // Load RBAC user context when user changes (with debouncing to prevent race conditions)
  useEffect(() => {
    if (state.user && state.isAuthenticated && !state.userContext && !state.rbacLoading) {
      // Minimal debounce to batch React updates while loading context quickly
      const timeoutId = setTimeout(() => {
        loadUserContext();
      }, 10); // 10ms debounce - just enough to batch updates, fast UX

      return () => clearTimeout(timeoutId);
    }
  }, [state.user, state.isAuthenticated, loadUserContext, state.rbacLoading, state.userContext]);

  const login = async (email: string, password: string, remember = false) => {
    try {
      actions.loginStart();

      // Use HTTP service with automatic CSRF retry logic
      const result = await authHTTPService.loginWithRetry(
        email,
        password,
        remember,
        ensureCsrfToken,
        () => setCsrfToken(null) // Clear CSRF token on retry
      );

      // Route login response to appropriate flow (MFA setup, MFA verification, or success)
      handleLoginResponse(result, {
        setCsrfToken,
        setMFASetupRequired,
        setMFAVerificationRequired,
        loginSuccess: actions.loginSuccess,
        setLoading: actions.setLoading,
      });
    } catch (error) {
      actions.loginFailure();
      throw error;
    }
  };

  const refreshUserContext = async () => {
    if (state.user) {
      await loadUserContext();
    }
  };

  // MFA completion handler - called after MFA setup succeeds
  const completeMFASetup = (sessionData: MFASessionData) => {
    completeMFASetupHook(sessionData, setCsrfToken, (user, sessionId) => {
      // Update auth state with authenticated user
      actions.loginSuccess({ user, sessionId });
    });
  };

  // MFA completion handler - called after MFA verification succeeds
  const completeMFAVerification = (sessionData: MFASessionData) => {
    completeMFAVerificationHook(sessionData, setCsrfToken, (user, sessionId) => {
      // Update auth state with authenticated user
      actions.loginSuccess({ user, sessionId });
    });
  };

  const contextValue: RBACAuthContextType = {
    ...state,
    csrfToken, // Use CSRF token from hook instead of state
    // Merge MFA state from hook
    mfaRequired: mfaState.required,
    mfaSetupRequired: mfaState.setupRequired,
    mfaSetupEnforced: mfaState.setupEnforced,
    mfaSkipsRemaining: mfaState.skipsRemaining,
    mfaTempToken: mfaState.tempToken,
    mfaChallenge: mfaState.challenge,
    mfaChallengeId: mfaState.challengeId,
    mfaUser: mfaState.user,
    login,
    logout,
    refreshToken,
    refreshUserContext,
    ensureCsrfToken,
    completeMFASetup,
    completeMFAVerification,
    clearMFAState,
  };

  return <RBACAuthContext.Provider value={contextValue}>{children}</RBACAuthContext.Provider>;
}

export function useRBACAuth(): RBACAuthContextType {
  const context = useContext(RBACAuthContext);
  if (context === undefined) {
    throw new Error('useRBACAuth must be used within a RBACAuthProvider');
  }
  return context;
}

// Backward compatibility hook
export function useAuth(): RBACAuthContextType {
  return useRBACAuth();
}
