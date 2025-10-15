'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { clientDebugLog as debugLog, clientErrorLog as errorLog } from '@/lib/utils/debug-client';
import { shouldRefreshToken, validateTokenStructure, getCSRFTokenFromCookie } from '@/lib/security/csrf-client';
import { transformApiUserToContext, validateApiUserResponse } from './utils/user-context-transformer';
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
  const [state, setState] = useState<RBACAuthState>({
    user: null,
    sessionId: null,
    isLoading: true,
    isAuthenticated: false,
    csrfToken: null,
    userContext: null,
    rbacLoading: false,
    rbacError: null,
    mfaRequired: false,
    mfaSetupRequired: false,
    mfaSetupEnforced: false,
    mfaSkipsRemaining: 0,
    mfaTempToken: null,
    mfaChallenge: null,
    mfaChallengeId: null,
    mfaUser: null,
  });

  // Track token fetch time to prevent unnecessary refreshes
  const [lastTokenFetchTime, setLastTokenFetchTime] = useState<number | null>(null);

  // Track in-flight token fetch to prevent duplicate requests (OPTIMIZATION)
  const tokenFetchInProgress = useRef<Promise<string | null> | null>(null);

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
      csrfToken: state.csrfToken,
      refreshToken,
      logout,
      ensureCsrfToken
    });
  }, [state.csrfToken]);

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
          setState(prev => ({
            ...prev,
            user: data.data.user,
            sessionId: data.data.sessionId,
            isLoading: false,
            isAuthenticated: true,
            userContext: userContext, // Set user context directly to avoid duplicate loading
            rbacLoading: false,
            rbacError: null
          }));

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
      setState(prev => ({ ...prev, isLoading: false }));
      setHasInitialized(false); // Allow retry on error
    }
  };

  const ensureCsrfToken = async (forceRefresh = false): Promise<string | null> => {
    try {
      // OPTIMIZATION: If fetch already in progress, return same promise (deduplication)
      if (tokenFetchInProgress.current && !forceRefresh) {
        debugLog.auth('CSRF token fetch already in progress, waiting for completion');
        return tokenFetchInProgress.current;
      }

      // OPTIMIZATION: Step 1 - Check cookie first (already set by server)
      if (!forceRefresh && !state.csrfToken) {
        const cookieToken = getCSRFTokenFromCookie();

        if (cookieToken) {
          // Validate token structure before using
          const validation = validateTokenStructure(cookieToken);

          if (validation.isValid) {
            debugLog.auth('Using existing CSRF token from cookie (no fetch needed)');
            setState(prev => ({ ...prev, csrfToken: cookieToken }));
            setLastTokenFetchTime(Date.now());
            return cookieToken;
          }

          debugLog.auth('Cookie token invalid, will fetch fresh token');
        }
      }

      // Step 2 - Check if cached token in state is still valid
      if (state.csrfToken && !forceRefresh) {
        const shouldRefresh = shouldRefreshToken(state.csrfToken, lastTokenFetchTime);

        if (!shouldRefresh) {
          // Token is still valid, return it
          debugLog.auth('Using cached CSRF token from state');
          return state.csrfToken;
        }

        // Token needs refresh
        debugLog.auth('Cached token needs refresh (approaching expiration)');
      }

      if (forceRefresh) {
        debugLog.auth('Force refreshing CSRF token...');
      }

      // Step 3 - Fetch new token from server (deduplicated)
      debugLog.auth('Fetching new CSRF token from server...');

      // Store promise to deduplicate concurrent calls
      tokenFetchInProgress.current = (async () => {
        try {
          // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
          const baseUrl = typeof window !== 'undefined'
            ? window.location.origin
            : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');

          const resp = await fetch(`${baseUrl}/api/csrf`, {
            method: 'GET',
            credentials: 'include'
          });

          if (!resp.ok) {
            errorLog(`CSRF token fetch failed: ${resp.status} ${resp.statusText}`);
            return null;
          }

          const json = await resp.json();
          const token = json?.data?.csrfToken || null;

          if (!token) {
            errorLog('CSRF token not found in response');
            return null;
          }

          // Validate the new token structure
          const validation = validateTokenStructure(token);
          if (!validation.isValid) {
            errorLog(`New CSRF token validation failed: ${validation.reason}`);
            return null;
          }

          // Update state with new token and record fetch time
          const now = Date.now();
          setState(prev => ({ ...prev, csrfToken: token }));
          setLastTokenFetchTime(now);

          debugLog.auth('CSRF token successfully fetched and validated');
          return token;
        } finally {
          // Clear in-flight promise
          tokenFetchInProgress.current = null;
        }
      })();

      return tokenFetchInProgress.current;

    } catch (error) {
      errorLog('CSRF token fetch error:', error);
      // Clear invalid token from state
      setState(prev => ({ ...prev, csrfToken: null }));
      tokenFetchInProgress.current = null;
      return null;
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
      setState(prev => ({ ...prev, rbacLoading: true, rbacError: null }));
      
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
          setState({
            user: null,
            sessionId: null,
            isLoading: false,
            isAuthenticated: false,
            csrfToken: state.csrfToken,
            userContext: null,
            rbacLoading: false,
            rbacError: null,
            mfaRequired: false,
            mfaSetupRequired: false,
            mfaSetupEnforced: false,
            mfaSkipsRemaining: 0,
            mfaTempToken: null,
            mfaChallenge: null,
            mfaChallengeId: null,
            mfaUser: null,
          });
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

      setState(prev => ({
        ...prev,
        userContext,
        rbacLoading: false,
        rbacError: null
      }));
    } catch (error) {
      errorLog('Failed to load RBAC user context:', error);
      setState(prev => ({
        ...prev,
        userContext: null,
        rbacLoading: false,
        rbacError: error instanceof Error ? error.message : 'Unknown RBAC error'
      }));
    }
  };

  const login = async (email: string, password: string, remember = false) => {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        setState(prev => ({ ...prev, isLoading: true }));

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
          setState(prev => ({ ...prev, csrfToken: null }));
          setLastTokenFetchTime(null);
          
          attempt++;
          continue; // Retry with fresh token
        }

        if (!response.ok) {
          // If it's not a retryable CSRF error, throw immediately
          throw new Error(result.error || 'Login failed');
        }

        // Check response status for MFA flows
        const status = result.data?.status;

        if (status === 'mfa_setup_optional') {
          // MFA setup optional (skips available) - show setup dialog with skip option
          debugLog.auth(`MFA setup optional for: ${result.data.user.email}, Skips remaining: ${result.data.skipsRemaining}`);
          debugLog.auth(`CSRF token received: ${!!result.data.csrfToken}, length: ${result.data.csrfToken?.length || 0}`);
          setState(prev => ({
            ...prev,
            isLoading: false,
            mfaSetupRequired: true,
            mfaSetupEnforced: false,
            mfaSkipsRemaining: result.data.skipsRemaining || 0,
            mfaTempToken: result.data.tempToken,
            csrfToken: result.data.csrfToken || prev.csrfToken, // Use new authenticated CSRF token
            mfaUser: result.data.user,
            // Clear MFA verification state
            mfaRequired: false,
            mfaChallenge: null,
            mfaChallengeId: null,
          }));
          return; // Exit - MFA setup dialog will be shown
        }

        if (status === 'mfa_setup_enforced') {
          // MFA setup enforced (no skips remaining) - show setup dialog without skip option
          debugLog.auth('MFA setup enforced for:', result.data.user.email);
          debugLog.auth(`CSRF token received: ${!!result.data.csrfToken}, length: ${result.data.csrfToken?.length || 0}`);
          setState(prev => ({
            ...prev,
            isLoading: false,
            mfaSetupRequired: true,
            mfaSetupEnforced: true,
            mfaSkipsRemaining: 0,
            mfaTempToken: result.data.tempToken,
            csrfToken: result.data.csrfToken || prev.csrfToken, // Use new authenticated CSRF token
            mfaUser: result.data.user,
            // Clear MFA verification state
            mfaRequired: false,
            mfaChallenge: null,
            mfaChallengeId: null,
          }));
          return; // Exit - MFA setup dialog will be shown
        }

        if (status === 'mfa_required') {
          // MFA verification required - show verification dialog
          debugLog.auth('MFA verification required');
          debugLog.auth(`CSRF token received: ${!!result.data.csrfToken}, length: ${result.data.csrfToken?.length || 0}`);
          setState(prev => ({
            ...prev,
            isLoading: false,
            mfaRequired: true,
            mfaTempToken: result.data.tempToken,
            csrfToken: result.data.csrfToken || prev.csrfToken, // Use new authenticated CSRF token
            mfaChallenge: result.data.challenge,
            mfaChallengeId: result.data.challengeId,
            // Clear MFA setup state
            mfaSetupRequired: false,
            mfaUser: null,
          }));
          return; // Exit - MFA verification dialog will be shown
        }

        // Standard login successful - update state
        setState(prev => ({
          ...prev,
          user: result.data.user,
          sessionId: result.data.sessionId,
          isLoading: false,
          isAuthenticated: true,
          csrfToken: result.data.csrfToken || prev.csrfToken, // Use new authenticated token from login
          userContext: null, // Will be loaded by useEffect
          rbacLoading: false,
          rbacError: null,
          // Clear MFA state
          mfaRequired: false,
          mfaSetupRequired: false,
          mfaSetupEnforced: false,
          mfaSkipsRemaining: 0,
          mfaTempToken: null,
          mfaChallenge: null,
          mfaChallengeId: null,
          mfaUser: null,
        }));

        debugLog.auth('Login successful for:', result.data.user.email);
        return; // Success - exit retry loop

      } catch (error) {
        // If this was our last attempt, re-throw the error
        if (attempt >= maxRetries - 1) {
          setState(prev => ({ 
            ...prev, 
            isLoading: false,
            userContext: null,
            rbacLoading: false,
            rbacError: null
          }));
          throw error;
        }

        // For non-CSRF errors, don't retry
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.toLowerCase().includes('csrf')) {
          setState(prev => ({ 
            ...prev, 
            isLoading: false,
            userContext: null,
            rbacLoading: false,
            rbacError: null
          }));
          throw error;
        }

        // CSRF-related error - clear token and retry
        debugLog.auth(`Login error on attempt ${attempt + 1}: ${errorMessage}, retrying...`);
        setState(prev => ({ ...prev, csrfToken: null }));
        setLastTokenFetchTime(null);
        attempt++;
      }
    }
  };

  const logout = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

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

      // Clear state (accessToken cleared server-side via cookie removal)
      setState({
        user: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false,
        csrfToken: null, // Clear CSRF token so next login gets fresh anonymous token
        userContext: null,
        rbacLoading: false,
        rbacError: null,
        mfaRequired: false,
        mfaSetupRequired: false,
        mfaSetupEnforced: false,
        mfaSkipsRemaining: 0,
        mfaTempToken: null,
        mfaChallenge: null,
        mfaChallengeId: null,
        mfaUser: null,
      });

      debugLog.auth('Logout successful');
    } catch (error) {
      errorLog('Logout error:', error);
      // Clear state even if logout fails (accessToken cleared server-side)
      setState({
        user: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false,
        csrfToken: null, // Clear CSRF token even on logout failure
        userContext: null,
        rbacLoading: false,
        rbacError: null,
        mfaRequired: false,
        mfaSetupRequired: false,
        mfaSetupEnforced: false,
        mfaSkipsRemaining: 0,
        mfaTempToken: null,
        mfaChallenge: null,
        mfaChallengeId: null,
        mfaUser: null,
      });
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
      const csrfToken = state.csrfToken || (await ensureCsrfToken()) || '';

      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001');
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken
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
        setState({
          user: null,
          sessionId: null,
          isLoading: false,
          isAuthenticated: false,
          csrfToken: state.csrfToken,
          userContext: null,
          rbacLoading: false,
          rbacError: null,
          mfaRequired: false,
          mfaSetupRequired: false,
          mfaSetupEnforced: false,
          mfaSkipsRemaining: 0,
          mfaTempToken: null,
          mfaChallenge: null,
          mfaChallengeId: null,
          mfaUser: null,
        });
        return;
      }

      const result = await response.json();

      // Update state with refreshed user data (accessToken updated server-side in httpOnly cookie)
      setState(prev => ({
        ...prev,
        user: result.data.user, // ✅ FIX: Set user data from refresh response
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true,
        csrfToken: result.data.csrfToken || prev.csrfToken, // Store new authenticated CSRF token from refresh
        userContext: null, // Will be loaded by useEffect when user is set
        rbacLoading: false,
        rbacError: null
      }));

      debugLog.auth('Token refreshed successfully');
    } catch (error) {
      // This is normal if no session exists
      debugLog.auth('No session to refresh (normal on first visit)');
      setState({
        user: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false,
        csrfToken: state.csrfToken,
        userContext: null,
        rbacLoading: false,
        rbacError: null,
        mfaRequired: false,
        mfaSetupRequired: false,
        mfaSetupEnforced: false,
        mfaSkipsRemaining: 0,
        mfaTempToken: null,
        mfaChallenge: null,
        mfaChallengeId: null,
        mfaUser: null,
      });
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

  const completeMFASetup = (sessionData: {
    user: {
      id: string;
      email: string;
      name: string;
      firstName: string;
      lastName: string;
      role: string;
      emailVerified: boolean;
      roles?: string[];
      permissions?: string[];
    };
    sessionId: string;
    csrfToken?: string;
    accessToken?: string;
  }) => {
    debugLog.auth('MFA setup completed for:', sessionData.user.email);
    setState(prev => ({
      ...prev,
      user: sessionData.user,
      sessionId: sessionData.sessionId,
      csrfToken: sessionData.csrfToken || prev.csrfToken,
      isLoading: false,
      isAuthenticated: true,
      userContext: null, // Will be loaded by useEffect
      rbacLoading: false,
      rbacError: null,
      // Clear MFA state
      mfaRequired: false,
      mfaSetupRequired: false,
      mfaSetupEnforced: false,
      mfaSkipsRemaining: 0,
      mfaTempToken: null,
      mfaChallenge: null,
      mfaChallengeId: null,
      mfaUser: null,
    }));
  };

  const completeMFAVerification = (sessionData: {
    user: {
      id: string;
      email: string;
      name: string;
      firstName: string;
      lastName: string;
      role: string;
      emailVerified: boolean;
      roles?: string[];
      permissions?: string[];
    };
    sessionId: string;
    csrfToken?: string;
    accessToken?: string;
  }) => {
    debugLog.auth('MFA verification completed for:', sessionData.user.email);
    setState(prev => ({
      ...prev,
      user: sessionData.user,
      sessionId: sessionData.sessionId,
      csrfToken: sessionData.csrfToken || prev.csrfToken,
      isLoading: false,
      isAuthenticated: true,
      userContext: null, // Will be loaded by useEffect
      rbacLoading: false,
      rbacError: null,
      // Clear MFA state
      mfaRequired: false,
      mfaSetupRequired: false,
      mfaSetupEnforced: false,
      mfaSkipsRemaining: 0,
      mfaTempToken: null,
      mfaChallenge: null,
      mfaChallengeId: null,
      mfaUser: null,
    }));
  };

  const clearMFAState = () => {
    setState(prev => ({
      ...prev,
      mfaRequired: false,
      mfaSetupRequired: false,
      mfaSetupEnforced: false,
      mfaSkipsRemaining: 0,
      mfaTempToken: null,
      mfaChallenge: null,
      mfaChallengeId: null,
      mfaUser: null,
      isLoading: false,
    }));
  };

  const contextValue: RBACAuthContextType = {
    ...state,
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
