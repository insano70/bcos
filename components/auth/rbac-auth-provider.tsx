'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { type UserContext } from '@/lib/types/rbac';
import { debugLog, errorLog } from '@/lib/utils/debug';

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

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, []);

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
      // Refresh token every 10 minutes (access tokens last 15 minutes)
      const refreshInterval = setInterval(() => {
        refreshToken();
      }, 10 * 60 * 1000);

      return () => clearInterval(refreshInterval);
    }
  }, [state.isAuthenticated]);

  // Load RBAC user context when user changes
  useEffect(() => {
    if (state.user && state.isAuthenticated && !state.userContext && !state.rbacLoading) {
      loadUserContext();
    }
  }, [state.user, state.isAuthenticated]);

  const initializeAuth = async () => {
    try {
      debugLog.auth('Initializing authentication via server-side token refresh...');
      // Ensure CSRF token cookie exists before any state-changing requests
      await ensureCsrfToken();
      // Try to refresh token to get current session (server will read httpOnly cookies)
      await refreshToken();
    } catch (error) {
      debugLog.auth('No active session found');
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const ensureCsrfToken = async (): Promise<string | null> => {
    try {
      if (state.csrfToken) return state.csrfToken;
      const resp = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
      const json = await resp.json();
      const token = json?.data?.csrfToken || null;
      setState(prev => ({ ...prev, csrfToken: token }));
      return token;
    } catch {
      return null;
    }
  };

  const loadUserContext = async () => {
    if (!state.user) return;
    
    try {
      setState(prev => ({ ...prev, rbacLoading: true, rbacError: null }));
      
      // Fetch user context via API (server-side database access)
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include' // Include httpOnly cookies
      });

      if (!response.ok) {
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
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const csrfToken = (await ensureCsrfToken()) || '';
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

      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      // Update state with login result (accessToken handled server-side via cookies)
      setState(prev => ({
        ...prev,
        user: result.data.user,
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true,
        userContext: null, // Will be loaded by useEffect
        rbacLoading: false,
        rbacError: null
      }));

      debugLog.auth('Login successful for:', result.data.user.email);
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        userContext: null,
        rbacLoading: false,
        rbacError: null
      }));
      throw error;
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
        csrfToken: null,
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
        csrfToken: null,
        userContext: null,
        rbacLoading: false,
        rbacError: null
      });
    }
  };

  const refreshToken = async () => {
    try {
      const csrfToken = (await ensureCsrfToken()) || '';
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include'
      });

      if (!response.ok) {
        // Refresh failed - this is normal if no session exists
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
