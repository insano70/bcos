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

  const refreshToken = useCallback(async () => {
    // RACE CONDITION PROTECTION: Prevent concurrent refresh operations
    if (authOperationInProgress.current) {
      console.log('Auth operation already in progress, skipping refresh');
      return;
    }

    authOperationInProgress.current = true;

    try {
      actions.refreshStart();

      const token = csrfToken || (await ensureCsrfToken()) || '';

      // Use HTTP service to refresh token
      const result = await authHTTPService.refreshAuthToken(token);

      if (!result.data) {
        throw new Error('Invalid refresh response: missing data');
      }

      // Update CSRF token if provided
      if (result.data.csrfToken) {
        setCsrfToken(result.data.csrfToken);
      }

      // Update state with refreshed user data (accessToken updated server-side in httpOnly cookie)
      actions.refreshSuccess({
        user: result.data.user as User,
        sessionId: result.data.sessionId,
      });

      console.log('Token refreshed successfully');
    } catch (error) {
      // Check if this is a rate limit error
      if (error instanceof Error && error.message.includes('429')) {
        console.log('Token refresh rate limited, will retry later');
        // Don't clear auth state on rate limit - tokens might still be valid
        return;
      }

      // This is normal if no session exists
      console.log('No session to refresh (normal on first visit)');
      actions.refreshFailure();
    } finally {
      // Always release mutex
      authOperationInProgress.current = false;
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ensureCsrfToken, setCsrfToken, actions]
  // CRITICAL: csrfToken removed from dependencies to prevent infinite loop.
  // The callback reads csrfToken from closure but doesn't need to re-create when it changes.
  // Including csrfToken causes: csrfToken changes → refreshToken changes →
  // initializeAuth changes → useEffect runs → infinite loop.
  // This is safe because the function logic doesn't change based on token value.
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
      // Refresh token every 10 minutes (access tokens last 15 minutes)
      // 5-minute safety margin (33%) prevents expiration during network delays or clock skew
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
        10 * 60 * 1000
      ); // 10 minutes (33% safety margin)

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
