/**
 * Authentication State Reducer
 *
 * Centralized state management for authentication using useReducer pattern.
 * Provides atomic state updates and clear action-based state transitions.
 *
 * Benefits:
 * - Atomic state updates (no race conditions)
 * - Centralized state mutations
 * - Redux DevTools compatible
 * - Type-safe actions
 * - Easy to test (pure functions)
 * - Clear state transition logic
 *
 * State Machine:
 * - INITIAL → LOADING (checking existing session)
 * - LOADING → AUTHENTICATED (login/refresh success)
 * - LOADING → UNAUTHENTICATED (no session/logout)
 * - AUTHENTICATED → LOADING (refreshing)
 * - AUTHENTICATED → UNAUTHENTICATED (logout/session expired)
 */

import type { UserContext } from '@/lib/types/rbac';
import type { User } from '../types';

/**
 * Authentication State
 * Represents the complete auth state (excluding MFA which is in separate hook)
 */
export interface AuthState {
  // User and session
  user: User | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Refresh retry state
  isRefreshRetrying: boolean;
  refreshRetryCount: number;

  // RBAC context
  userContext: UserContext | null;
  rbacLoading: boolean;
  rbacError: string | null;

  // Note: MFA state managed by useMFAFlow hook
  // Note: CSRF token managed by useCSRFManagement hook
}

/**
 * Initial authentication state
 */
export const initialAuthState: AuthState = {
  user: null,
  sessionId: null,
  isLoading: true,
  isAuthenticated: false,
  isRefreshRetrying: false,
  refreshRetryCount: 0,
  userContext: null,
  rbacLoading: false,
  rbacError: null,
};

/**
 * Authentication Actions
 * All possible state mutations in the authentication system
 */
export type AuthAction =
  // Session initialization
  | { type: 'INIT_START' }
  | { type: 'INIT_SUCCESS'; payload: { user: User; sessionId: string; userContext?: UserContext } }
  | { type: 'INIT_FAILURE' }

  // Login flow
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; sessionId: string } }
  | { type: 'LOGIN_FAILURE' }

  // Logout
  | { type: 'LOGOUT' }

  // Token refresh
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_SUCCESS'; payload: { user: User; sessionId: string } }
  | { type: 'REFRESH_FAILURE'; payload: { attempt: number } }
  | { type: 'REFRESH_RETRY_FAILED' }

  // RBAC context
  | { type: 'RBAC_LOAD_START' }
  | { type: 'RBAC_LOAD_SUCCESS'; payload: { userContext: UserContext } }
  | { type: 'RBAC_LOAD_FAILURE'; payload: { error: string } }

  // Loading state
  | { type: 'SET_LOADING'; payload: { isLoading: boolean } }

  // Session expired
  | { type: 'SESSION_EXPIRED' };

/**
 * Authentication State Reducer
 *
 * Pure function that handles all state transitions.
 * Each action represents a specific state mutation.
 *
 * @param state - Current authentication state
 * @param action - Action to perform
 * @returns New authentication state
 */
export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    // ===== Session Initialization =====
    case 'INIT_START':
      return {
        ...state,
        isLoading: true,
        isAuthenticated: false,
      };

    case 'INIT_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        sessionId: action.payload.sessionId,
        userContext: action.payload.userContext || null,
        isLoading: false,
        isAuthenticated: true,
        rbacLoading: !action.payload.userContext, // If no userContext provided, will need to load
        rbacError: null,
      };

    case 'INIT_FAILURE':
      return {
        ...state,
        user: null,
        sessionId: null,
        userContext: null,
        isLoading: false,
        isAuthenticated: false,
        rbacLoading: false,
        rbacError: null,
      };

    // ===== Login Flow =====
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
      };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        sessionId: action.payload.sessionId,
        isLoading: false,
        isAuthenticated: true,
        userContext: null, // Will be loaded by useEffect
        rbacLoading: false,
        rbacError: null,
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
      };

    // ===== Logout =====
    case 'LOGOUT':
      return {
        ...initialAuthState,
        isLoading: false, // Override initial loading state
      };

    // ===== Token Refresh =====
    case 'REFRESH_START':
      return {
        ...state,
        isRefreshRetrying: false,
        refreshRetryCount: 0,
        // Don't set isLoading for refresh (background operation)
      };

    case 'REFRESH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        sessionId: action.payload.sessionId,
        isAuthenticated: true,
        isRefreshRetrying: false,
        refreshRetryCount: 0,
        userContext: null, // Will be reloaded if needed
        rbacLoading: false,
        rbacError: null,
      };

    case 'REFRESH_FAILURE':
      // Don't immediately log out - preserve auth state during retry attempts
      return {
        ...state,
        isRefreshRetrying: true,
        refreshRetryCount: action.payload.attempt,
      };

    case 'REFRESH_RETRY_FAILED':
      // All retries exhausted - now log out
      return {
        ...initialAuthState,
        isLoading: false,
      };

    // ===== RBAC Context Loading =====
    case 'RBAC_LOAD_START':
      return {
        ...state,
        rbacLoading: true,
        rbacError: null,
      };

    case 'RBAC_LOAD_SUCCESS':
      return {
        ...state,
        userContext: action.payload.userContext,
        rbacLoading: false,
        rbacError: null,
      };

    case 'RBAC_LOAD_FAILURE':
      return {
        ...state,
        rbacLoading: false,
        rbacError: action.payload.error,
      };

    // ===== Generic Loading State =====
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload.isLoading,
      };

    // ===== Session Expired =====
    case 'SESSION_EXPIRED':
      return {
        ...initialAuthState,
        isLoading: false,
      };

    default:
      return state;
  }
}
