/**
 * Auth State Management Hook
 *
 * Wraps the auth reducer with a React hook, providing typed action creators
 * and the current state. This hook is the single source of truth for
 * authentication state in the application.
 *
 * @example
 * const { state, actions } = useAuthState();
 *
 * // Start login
 * actions.loginStart();
 *
 * // Login succeeded
 * actions.loginSuccess({ user, sessionId });
 *
 * // Load RBAC context
 * actions.rbacLoadSuccess({ userContext });
 */

import { useCallback, useReducer } from 'react';
import type { UserContext } from '@/lib/types/rbac';
import type { User } from '../types';
import type { AuthState } from './auth-reducer';
import { authReducer, initialAuthState } from './auth-reducer';

/**
 * Action creators interface
 * Provides type-safe action creators for all state mutations
 */
export interface AuthActions {
  // Session initialization
  initStart: () => void;
  initSuccess: (payload: { user: User; sessionId: string; userContext?: UserContext }) => void;
  initFailure: () => void;

  // Login flow
  loginStart: () => void;
  loginSuccess: (payload: { user: User; sessionId: string }) => void;
  loginFailure: () => void;

  // Logout
  logout: () => void;

  // Token refresh
  refreshStart: () => void;
  refreshSuccess: (payload: { user: User; sessionId: string }) => void;
  refreshFailure: () => void;

  // RBAC context
  rbacLoadStart: () => void;
  rbacLoadSuccess: (payload: { userContext: UserContext }) => void;
  rbacLoadFailure: (payload: { error: string }) => void;

  // Loading state
  setLoading: (isLoading: boolean) => void;

  // Session expired
  sessionExpired: () => void;
}

/**
 * Hook return interface
 */
export interface UseAuthStateReturn {
  state: AuthState;
  actions: AuthActions;
}

/**
 * Auth State Hook
 *
 * Provides authentication state and type-safe action creators.
 * Uses useReducer for atomic state updates and centralized state logic.
 *
 * @returns Current auth state and action creators
 */
export function useAuthState(): UseAuthStateReturn {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  // Create memoized action creators
  const actions: AuthActions = {
    // Session initialization
    initStart: useCallback(() => {
      dispatch({ type: 'INIT_START' });
    }, []),

    initSuccess: useCallback(
      (payload: { user: User; sessionId: string; userContext?: UserContext }) => {
        dispatch({ type: 'INIT_SUCCESS', payload });
      },
      []
    ),

    initFailure: useCallback(() => {
      dispatch({ type: 'INIT_FAILURE' });
    }, []),

    // Login flow
    loginStart: useCallback(() => {
      dispatch({ type: 'LOGIN_START' });
    }, []),

    loginSuccess: useCallback((payload: { user: User; sessionId: string }) => {
      dispatch({ type: 'LOGIN_SUCCESS', payload });
    }, []),

    loginFailure: useCallback(() => {
      dispatch({ type: 'LOGIN_FAILURE' });
    }, []),

    // Logout
    logout: useCallback(() => {
      dispatch({ type: 'LOGOUT' });
    }, []),

    // Token refresh
    refreshStart: useCallback(() => {
      dispatch({ type: 'REFRESH_START' });
    }, []),

    refreshSuccess: useCallback((payload: { user: User; sessionId: string }) => {
      dispatch({ type: 'REFRESH_SUCCESS', payload });
    }, []),

    refreshFailure: useCallback(() => {
      dispatch({ type: 'REFRESH_FAILURE' });
    }, []),

    // RBAC context
    rbacLoadStart: useCallback(() => {
      dispatch({ type: 'RBAC_LOAD_START' });
    }, []),

    rbacLoadSuccess: useCallback((payload: { userContext: UserContext }) => {
      dispatch({ type: 'RBAC_LOAD_SUCCESS', payload });
    }, []),

    rbacLoadFailure: useCallback((payload: { error: string }) => {
      dispatch({ type: 'RBAC_LOAD_FAILURE', payload });
    }, []),

    // Loading state
    setLoading: useCallback((isLoading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: { isLoading } });
    }, []),

    // Session expired
    sessionExpired: useCallback(() => {
      dispatch({ type: 'SESSION_EXPIRED' });
    }, []),
  };

  return {
    state,
    actions,
  };
}
