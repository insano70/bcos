'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { getUserContextSafe } from '@/lib/rbac/user-context';
import { type UserContext } from '@/lib/types/rbac';

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
  // Basic auth state
  user: User | null;
  accessToken: string | null;
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
    accessToken: null,
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

  // Set up API client with auth context
  useEffect(() => {
    apiClient.setAuthContext({
      accessToken: state.accessToken,
      csrfToken: state.csrfToken,
      refreshToken,
      logout
    });
  }, [state.accessToken, state.csrfToken]);

  // Set up token refresh interval
  useEffect(() => {
    if (state.accessToken) {
      // Refresh token every 10 minutes (access tokens last 15 minutes)
      const refreshInterval = setInterval(() => {
        refreshToken();
      }, 10 * 60 * 1000);

      return () => clearInterval(refreshInterval);
    }
  }, [state.accessToken]);

  // Load RBAC user context when user changes
  useEffect(() => {
    if (state.user && state.isAuthenticated && !state.userContext && !state.rbacLoading) {
      loadUserContext();
    }
  }, [state.user, state.isAuthenticated]);

  const initializeAuth = async () => {
    try {
      // Ensure CSRF token cookie exists before any state-changing requests
      await ensureCsrfToken();
      // Try to refresh token to get current session
      await refreshToken();
    } catch (error) {
      console.log('No active session found');
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
      
      const userContext = await getUserContextSafe(state.user.id);
      
      setState(prev => ({
        ...prev,
        userContext,
        rbacLoading: false,
        rbacError: userContext ? null : 'Failed to load user permissions'
      }));
    } catch (error) {
      console.error('Failed to load RBAC user context:', error);
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

      // Update state with login result
      setState(prev => ({
        ...prev,
        user: result.data.user,
        accessToken: result.data.accessToken,
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true,
        userContext: null, // Will be loaded by useEffect
        rbacLoading: false,
        rbacError: null
      }));

      console.log('Login successful for:', result.data.user.email);
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
          'x-csrf-token': csrfToken,
          ...(state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {})
        },
        credentials: 'include'
      });

      // Clear state
      setState({
        user: null,
        accessToken: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false,
        csrfToken: null,
        userContext: null,
        rbacLoading: false,
        rbacError: null
      });

      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);
      // Clear state even if logout fails
      setState({
        user: null,
        accessToken: null,
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
        console.log('No active session to refresh');
        setState({
          user: null,
          accessToken: null,
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

      // Update state with new tokens
      setState(prev => ({
        ...prev,
        accessToken: result.data.accessToken,
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true,
        // Keep existing user and userContext - they should still be valid
      }));

      console.log('Token refreshed successfully');
    } catch (error) {
      // This is normal if no session exists
      console.log('No session to refresh (normal on first visit)');
      setState({
        user: null,
        accessToken: null,
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
