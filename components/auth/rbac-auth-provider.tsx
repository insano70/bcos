'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { type UserContext } from '@/lib/types/rbac';
import { debugLog, errorLog } from '@/lib/utils/debug';
import { CSRFClientHelper } from '@/lib/security/csrf-client';

/**
 * Enhanced Authentication Provider with RBAC Integration
 * Extends existing auth system with full RBAC user context
 */

export interface User {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
}

export interface RBACAuthState {
  // Basic auth state (accessToken removed - now handled server-side only)
  user: User | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  csrfToken?: string | null | undefined;
  
  // RBAC state
  userContext: UserContext | null;
  rbacLoading: boolean;
  rbacError: string | null;
}

export interface RBACAuthContextType extends RBACAuthState {
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  refreshUserContext: () => Promise<void>;
}

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
    rbacError: null
  });

  // Track token fetch time to prevent unnecessary refreshes
  const [lastTokenFetchTime, setLastTokenFetchTime] = useState<number | null>(null);

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, []);

  // Track if we've already initialized to prevent redundant calls
  const [hasInitialized, setHasInitialized] = useState(false);

  // Set up API client with auth context (accessToken removed - handled by middleware)
  useEffect(() => {
    apiClient.setAuthContext({
      csrfToken: state.csrfToken,
      refreshToken,
      logout
    });
  }, [state.csrfToken]);

  // Set up token refresh interval (based on authentication state, not client-side token)
  useEffect(() => {
    if (state.isAuthenticated) {
      // Refresh token every 12 minutes (access tokens last 15 minutes)
      // Longer interval to reduce rate limiting pressure
      const refreshInterval = setInterval(() => {
        // Only refresh if we're still authenticated and not already refreshing
        if (state.isAuthenticated && !state.isLoading) {
          debugLog.auth('Periodic token refresh triggered');
          refreshToken();
        }
      }, 12 * 60 * 1000); // 12 minutes instead of 10

      return () => clearInterval(refreshInterval);
    }
  }, [state.isAuthenticated]);

  // Load RBAC user context when user changes (with debouncing to prevent race conditions)
  useEffect(() => {
    if (state.user && state.isAuthenticated && !state.userContext && !state.rbacLoading) {
      // Debounce user context loading to prevent rapid consecutive calls
      const timeoutId = setTimeout(() => {
        loadUserContext();
      }, 100); // 100ms debounce

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
      const checkResponse = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include' // Include httpOnly cookies
      });

      if (checkResponse.ok) {
        // We have a valid session, no need to refresh
        const data = await checkResponse.json();
        if (data.success && data.data?.user) {
          debugLog.auth('Found existing valid session, skipping token refresh');
          
          // Update auth state with existing session
          setState(prev => ({
            ...prev,
            user: data.data.user,
            sessionId: data.data.sessionId,
            isLoading: false,
            isAuthenticated: true,
            userContext: null, // Will be loaded by useEffect
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

  const ensureCsrfToken = async (): Promise<string | null> => {
    try {
      // Check if we have a cached token and validate it
      if (state.csrfToken) {
        const shouldRefresh = CSRFClientHelper.shouldRefreshToken(state.csrfToken, lastTokenFetchTime);
        
        if (!shouldRefresh) {
          // Token is still valid, return it
          return state.csrfToken;
        }
        
        // Token validation failed or needs refresh
        debugLog.auth('CSRF token validation failed or expired, fetching new token');
      }

      // Fetch new token from server
      debugLog.auth('Fetching new CSRF token...');
      const resp = await fetch('/api/csrf', { 
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
      const validation = CSRFClientHelper.validateTokenStructure(token);
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

    } catch (error) {
      errorLog('CSRF token fetch error:', error);
      // Clear invalid token from state
      setState(prev => ({ ...prev, csrfToken: null }));
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
      const response = await fetch('/api/auth/me', {
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
            rbacError: null
          });
          return;
        }
        throw new Error(`Failed to fetch user context: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.data?.user) {
        throw new Error('Invalid user context response');
      }

      const apiUser = data.data.user;

      // Transform API response to UserContext format
      const userContext: UserContext = {
        user_id: apiUser.id,
        email: apiUser.email,
        first_name: apiUser.firstName,
        last_name: apiUser.lastName,
        is_active: true,
        email_verified: apiUser.emailVerified,

        // RBAC data from API
        roles: apiUser.roles.map((role: any) => ({
          role_id: role.id,
          name: role.name,
          description: role.description || '',
          organization_id: undefined,
          is_system_role: role.isSystemRole,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined,
          permissions: [] // Will be populated from all_permissions
        })),

        organizations: apiUser.organizations.map((org: any) => ({
          organization_id: org.id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: undefined,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined
        })),

        accessible_organizations: apiUser.accessibleOrganizations.map((org: any) => ({
          organization_id: org.id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: undefined,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined
        })),

        user_roles: [], // Could be populated if needed
        user_organizations: [], // Could be populated if needed

        // Current context
        current_organization_id: apiUser.currentOrganizationId,

        // Computed properties from API
        all_permissions: apiUser.permissions.map((perm: any) => ({
          permission_id: perm.id,
          name: perm.name,
          description: undefined,
          resource: perm.resource,
          action: perm.action,
          scope: perm.scope,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        })),

        is_super_admin: apiUser.isSuperAdmin,
        organization_admin_for: apiUser.organizationAdminFor || []
      };
      
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

        const response = await fetch('/api/auth/login', {
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

        // Login successful - update state
        setState(prev => ({
          ...prev,
          user: result.data.user,
          sessionId: result.data.sessionId,
          isLoading: false,
          isAuthenticated: true,
          csrfToken: result.data.csrfToken || prev.csrfToken, // Use new authenticated token from login
          userContext: null, // Will be loaded by useEffect
          rbacLoading: false,
          rbacError: null
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
      await fetch('/api/auth/logout', {
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
        rbacError: null
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
        rbacError: null
      });
    }
  };

  const refreshToken = async () => {
    try {
      const csrfToken = state.csrfToken || (await ensureCsrfToken()) || '';
      
      const response = await fetch('/api/auth/refresh', {
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
          rbacError: null
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
        rbacError: null
      });
    }
  };

  const refreshUserContext = async () => {
    if (state.user) {
      await loadUserContext();
    }
  };

  const contextValue: RBACAuthContextType = {
    ...state,
    login,
    logout,
    refreshToken,
    refreshUserContext
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
