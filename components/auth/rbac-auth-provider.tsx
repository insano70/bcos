'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { clientDebugLog as debugLog, clientErrorLog as errorLog } from '@/lib/utils/debug-client';
import { transformApiUserToContext, validateApiUserResponse } from './utils/user-context-transformer';
import { useCSRFManagement } from './hooks/use-csrf-management';
import { useMFAFlow } from './hooks/use-mfa-flow';
import { useAuthState } from './hooks/use-auth-state';
import type {
  User,
  RBACAuthState,
  RBACAuthContextType,
  MFASessionData,
  APIUserResponse,
} from './types';

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

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, []);

  // Track if we've already initialized to prevent redundant calls
  const [hasInitialized, setHasInitialized] = useState(false);

  // RACE CONDITION PROTECTION: Mutex to prevent concurrent auth operations
  const authOperationInProgress = useRef(false);

  // Set up API client with auth context (accessToken removed - handled by middleware)
  useEffect(() => {
    apiClient.setAuthContext({
      csrfToken: csrfToken,
      refreshToken,
      logout,
      ensureCsrfToken
    });
  }, [csrfToken, ensureCsrfToken]);

  // Set up token refresh interval (based on authentication state, not client-side token)
  useEffect(() => {
    if (state.isAuthenticated) {
      // Refresh token every 10 minutes (access tokens last 15 minutes)
      // 5-minute safety margin (33%) prevents expiration during network delays or clock skew
      const refreshInterval = setInterval(() => {
        // Only refresh if we're still authenticated and not already refreshing
        if (state.isAuthenticated && !state.isLoading) {
          debugLog.auth('Periodic token refresh triggered');
          refreshToken();
        }
      }, 10 * 60 * 1000); // 10 minutes (33% safety margin)

      return () => clearInterval(refreshInterval);
    }
  }, [state.isAuthenticated]);

  // Load RBAC user context when user changes (with debouncing to prevent race conditions)
  useEffect(() => {
    if (state.user && state.isAuthenticated && !state.userContext && !state.rbacLoading) {
      // Minimal debounce to batch React updates while loading context quickly
      const timeoutId = setTimeout(() => {
        loadUserContext();
      }, 10); // 10ms debounce - just enough to batch updates, fast UX

      return () => clearTimeout(timeoutId);
    }
  }, [state.user, state.isAuthenticated]);

  const initializeAuth = async () => {
    // Prevent redundant initialization calls (React StrictMode calls useEffect twice)
    if (hasInitialized) {
      debugLog.auth('Auth already initialized, skipping...');
      return;
    }

    try {
      actions.initStart();
      debugLog.auth('Initializing authentication via server-side token refresh...');
      setHasInitialized(true);

      // First, check if we already have a valid authentication state from cookies
      // Try to validate existing session without forcing a refresh
      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
      const checkResponse = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include' // Include httpOnly cookies
      });

      if (checkResponse.ok) {
        // We have a valid session, no need to refresh
        const data = await checkResponse.json();
        if (data.success && data.data?.user) {
          debugLog.auth('Found existing valid session, skipping token refresh');

          // Extract user context from the response to avoid duplicate loading
          const apiUser = data.data.user as APIUserResponse;
          validateApiUserResponse(apiUser);
          const userContext = transformApiUserToContext(apiUser);

          // Update auth state with existing session and user context
          actions.initSuccess({
            user: data.data.user,
            sessionId: data.data.sessionId,
            userContext: userContext,
          });

          // Ensure we have a CSRF token for future requests
          await ensureCsrfToken();
          return;
        }
      }

      // No valid session found, try token refresh as fallback
      debugLog.auth('No valid session found, attempting token refresh...');
      await ensureCsrfToken();
      await refreshToken();

    } catch (error) {
      debugLog.auth('No active session found:', error);
      actions.initFailure();
      setHasInitialized(false); // Allow retry on error
    }
  };

  const loadUserContext = async () => {
    if (!state.user) return;

    // Prevent overlapping user context loading requests
    if (state.rbacLoading) {
      debugLog.auth('User context already loading, skipping duplicate request');
      return;
    }

    try {
      actions.rbacLoadStart();

      debugLog.auth('Loading user context for:', state.user.id);

      // Fetch user context via API (server-side database access)
      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include' // Include httpOnly cookies
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Session expired, clear auth state
          debugLog.auth('Session expired during user context loading');
          actions.sessionExpired();
          return;
        }
        throw new Error(`Failed to fetch user context: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.data?.user) {
        throw new Error('Invalid user context response');
      }

      // Transform API response to UserContext format
      const apiUser = data.data.user as APIUserResponse;
      validateApiUserResponse(apiUser);
      const userContext = transformApiUserToContext(apiUser);

      actions.rbacLoadSuccess({ userContext });
    } catch (error) {
      errorLog('Failed to load RBAC user context:', error);
      actions.rbacLoadFailure({
        error: error instanceof Error ? error.message : 'Unknown RBAC error'
      });
    }
  };

  const login = async (email: string, password: string, remember = false) => {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        actions.loginStart();

        const csrfToken = await ensureCsrfToken();
        if (!csrfToken) {
          throw new Error('Failed to obtain CSRF token');
        }

        debugLog.auth(`Login attempt ${attempt + 1}/${maxRetries} with CSRF token`);

        // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ email, password, remember }),
          credentials: 'include' // Include cookies
        });

        const result = await response.json();

        // Check for CSRF-related errors that warrant a retry
        const isCSRFError = response.status === 403 && 
                           result.error && 
                           result.error.toLowerCase().includes('csrf');

        if (isCSRFError && attempt < maxRetries - 1) {
          debugLog.auth(`CSRF validation failed on attempt ${attempt + 1}, clearing cached token and retrying`);

          // Clear cached CSRF token to force refresh
          setCsrfToken(null);

          attempt++;
          continue; // Retry with fresh token
        }

        if (!response.ok) {
          // If it's not a retryable CSRF error, throw immediately
          throw new Error(result.error || 'Login failed');
        }

        // Check response status for MFA flows
        const status = result.data?.status;

        if (status === 'mfa_setup_optional' || status === 'mfa_setup_enforced') {
          // MFA setup required (optional or enforced)
          debugLog.auth(`MFA setup ${status === 'mfa_setup_enforced' ? 'enforced' : 'optional'} for: ${result.data.user.email}`);
          debugLog.auth(`Skips remaining: ${result.data.skipsRemaining || 0}`);

          // Update CSRF token if provided
          if (result.data.csrfToken) {
            setCsrfToken(result.data.csrfToken);
          }

          // Use MFA hook to set setup required state
          setMFASetupRequired({
            user: result.data.user,
            skipsRemaining: result.data.skipsRemaining || 0,
            tempToken: result.data.tempToken,
            csrfToken: result.data.csrfToken,
          });

          // Update loading state - stop loading spinner
          actions.setLoading(false);
          return; // Exit - MFA setup dialog will be shown
        }

        if (status === 'mfa_required') {
          // MFA verification required - show verification dialog
          debugLog.auth('MFA verification required');

          // Update CSRF token if provided
          if (result.data.csrfToken) {
            setCsrfToken(result.data.csrfToken);
          }

          // Use MFA hook to set verification required state
          setMFAVerificationRequired({
            tempToken: result.data.tempToken,
            challenge: result.data.challenge,
            challengeId: result.data.challengeId,
            csrfToken: result.data.csrfToken,
          });

          // Update loading state - stop loading spinner
          actions.setLoading(false);
          return; // Exit - MFA verification dialog will be shown
        }

        // Standard login successful - update state
        // Update CSRF token if provided
        if (result.data.csrfToken) {
          setCsrfToken(result.data.csrfToken);
        }

        actions.loginSuccess({
          user: result.data.user,
          sessionId: result.data.sessionId,
        });

        debugLog.auth('Login successful for:', result.data.user.email);
        return; // Success - exit retry loop

      } catch (error) {
        // If this was our last attempt, re-throw the error
        if (attempt >= maxRetries - 1) {
          actions.loginFailure();
          throw error;
        }

        // For non-CSRF errors, don't retry
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.toLowerCase().includes('csrf')) {
          actions.loginFailure();
          throw error;
        }

        // CSRF-related error - clear token and retry
        debugLog.auth(`Login error on attempt ${attempt + 1}: ${errorMessage}, retrying...`);
        setCsrfToken(null); // Clear cached CSRF token
        attempt++;
      }
    }
  };

  const logout = async () => {
    try {
      actions.setLoading(true);

      // Call logout endpoint
      const csrfToken = (await ensureCsrfToken()) || '';
      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken
          // Authorization header automatically added by middleware from httpOnly cookie
        },
        credentials: 'include'
      });

      // Clear CSRF token so next login gets fresh anonymous token
      setCsrfToken(null);

      // Clear MFA state
      clearMFAState();

      // Clear auth state
      actions.logout();

      debugLog.auth('Logout successful');
    } catch (error) {
      errorLog('Logout error:', error);

      // Clear CSRF token even on logout failure
      setCsrfToken(null);

      // Clear MFA state
      clearMFAState();

      // Clear state even if logout fails (accessToken cleared server-side)
      actions.logout();
    }
  };

  const refreshToken = async () => {
    // RACE CONDITION PROTECTION: Prevent concurrent refresh operations
    if (authOperationInProgress.current) {
      debugLog.auth('Auth operation already in progress, skipping refresh');
      return;
    }

    authOperationInProgress.current = true;

    try {
      actions.refreshStart();

      const token = csrfToken || (await ensureCsrfToken()) || '';

      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'x-csrf-token': token
        },
        credentials: 'include'
      });

      if (!response.ok) {
        // Handle rate limiting gracefully
        if (response.status === 429) {
          debugLog.auth('Token refresh rate limited, will retry later');
          // Don't clear auth state on rate limit - tokens might still be valid
          return;
        }

        debugLog.auth('No active session to refresh');
        actions.refreshFailure();
        return;
      }

      const result = await response.json();

      // Update CSRF token if provided
      if (result.data.csrfToken) {
        setCsrfToken(result.data.csrfToken);
      }

      // Update state with refreshed user data (accessToken updated server-side in httpOnly cookie)
      actions.refreshSuccess({
        user: result.data.user,
        sessionId: result.data.sessionId,
      });

      debugLog.auth('Token refreshed successfully');
    } catch (error) {
      // This is normal if no session exists
      debugLog.auth('No session to refresh (normal on first visit)');
      actions.refreshFailure();
    } finally {
      // Always release mutex
      authOperationInProgress.current = false;
    }
  };

  const refreshUserContext = async () => {
    if (state.user) {
      await loadUserContext();
    }
  };

  // MFA completion handler - called after MFA setup succeeds
  const completeMFASetup = (sessionData: MFASessionData) => {
    completeMFASetupHook(
      sessionData,
      setCsrfToken,
      (user, sessionId) => {
        // Update auth state with authenticated user
        actions.loginSuccess({ user, sessionId });
      }
    );
  };

  // MFA completion handler - called after MFA verification succeeds
  const completeMFAVerification = (sessionData: MFASessionData) => {
    completeMFAVerificationHook(
      sessionData,
      setCsrfToken,
      (user, sessionId) => {
        // Update auth state with authenticated user
        actions.loginSuccess({ user, sessionId });
      }
    );
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

  return (
    <RBACAuthContext.Provider value={contextValue}>
      {children}
    </RBACAuthContext.Provider>
  );
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
