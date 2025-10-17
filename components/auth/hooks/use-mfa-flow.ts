/**
 * MFA Flow Management Hook
 *
 * Manages Multi-Factor Authentication state machine including:
 * - MFA setup flow (optional or enforced)
 * - MFA verification flow
 * - MFA session completion
 * - State cleanup
 *
 * This hook centralizes all MFA-related state and operations, making it easier
 * to test, maintain, and reuse across components (e.g., MFA dialogs).
 *
 * @example
 * const { mfaState, setMFASetupRequired, completeMFASetup, clearMFAState } = useMFAFlow();
 *
 * // During login, if MFA setup required:
 * setMFASetupRequired({
 *   user: loginResponse.user,
 *   skipsRemaining: loginResponse.skipsRemaining,
 *   tempToken: loginResponse.tempToken,
 *   csrfToken: loginResponse.csrfToken
 * });
 *
 * // After MFA setup completes:
 * completeMFASetup(sessionData, setCsrfToken, onAuthenticated);
 */

import { useCallback, useState } from 'react';
import { clientDebugLog as debugLog } from '@/lib/utils/debug-client';
import type { MFASessionData, MFAUser } from '../types';

/**
 * MFA State Interface
 * Represents the complete MFA flow state
 */
export interface MFAState {
  // Verification flow state
  required: boolean; // MFA verification required (existing MFA)
  tempToken: string | null; // Temporary token during verification
  challenge: unknown | null; // MFA challenge data
  challengeId: string | null; // Challenge ID for verification

  // Setup flow state
  setupRequired: boolean; // MFA setup required (no existing MFA)
  setupEnforced: boolean; // MFA setup mandatory (no skip option)
  skipsRemaining: number; // Number of times user can skip setup

  // User data during MFA flow
  user: MFAUser | null; // Partial user data before full authentication
}

/**
 * Initial MFA state (all flows inactive)
 */
const initialMFAState: MFAState = {
  required: false,
  tempToken: null,
  challenge: null,
  challengeId: null,
  setupRequired: false,
  setupEnforced: false,
  skipsRemaining: 0,
  user: null,
};

/**
 * MFA Setup Required Data
 * Data received from server when MFA setup is required
 */
export interface MFASetupRequiredData {
  user: MFAUser;
  skipsRemaining: number;
  tempToken: string;
  csrfToken?: string;
}

/**
 * MFA Verification Required Data
 * Data received from server when MFA verification is required
 */
export interface MFAVerificationRequiredData {
  tempToken: string;
  challenge: unknown;
  challengeId: string;
  csrfToken?: string;
}

/**
 * Hook return interface
 */
export interface MFAFlowHook {
  mfaState: MFAState;
  setMFASetupRequired: (data: MFASetupRequiredData) => void;
  setMFAVerificationRequired: (data: MFAVerificationRequiredData) => void;
  completeMFASetup: (
    sessionData: MFASessionData,
    setCsrfToken: (token: string | null) => void,
    onAuthenticated: (user: MFASessionData['user'], sessionId: string) => void
  ) => void;
  completeMFAVerification: (
    sessionData: MFASessionData,
    setCsrfToken: (token: string | null) => void,
    onAuthenticated: (user: MFASessionData['user'], sessionId: string) => void
  ) => void;
  clearMFAState: () => void;
}

/**
 * MFA Flow Management Hook
 *
 * Provides centralized MFA state management with clear state transitions:
 *
 * State Machine:
 * 1. Initial → MFA Setup Required (optional or enforced)
 * 2. Initial → MFA Verification Required (existing MFA)
 * 3. MFA Setup → Authenticated (after successful setup)
 * 4. MFA Verification → Authenticated (after successful verification)
 * 5. Any State → Initial (via clearMFAState)
 *
 * @returns MFA state and operations
 */
export function useMFAFlow(): MFAFlowHook {
  const [mfaState, setMFAState] = useState<MFAState>(initialMFAState);

  /**
   * Set MFA Setup Required State
   *
   * Called when login response indicates MFA setup is needed.
   * Can be optional (user can skip) or enforced (must complete).
   *
   * @param data - MFA setup data from login response
   */
  const setMFASetupRequired = useCallback((data: MFASetupRequiredData) => {
    debugLog.auth('MFA setup required', {
      userId: data.user.id,
      skipsRemaining: data.skipsRemaining,
      enforced: data.skipsRemaining === 0,
    });

    setMFAState({
      required: false, // Verification not needed
      tempToken: data.tempToken,
      challenge: null,
      challengeId: null,
      setupRequired: true,
      setupEnforced: data.skipsRemaining === 0,
      skipsRemaining: data.skipsRemaining,
      user: data.user,
    });
  }, []);

  /**
   * Set MFA Verification Required State
   *
   * Called when login response indicates MFA verification is needed
   * (user has existing MFA configured).
   *
   * @param data - MFA verification data from login response
   */
  const setMFAVerificationRequired = useCallback((data: MFAVerificationRequiredData) => {
    debugLog.auth('MFA verification required', {
      challengeId: data.challengeId,
    });

    setMFAState({
      required: true,
      tempToken: data.tempToken,
      challenge: data.challenge,
      challengeId: data.challengeId,
      setupRequired: false, // Setup not needed
      setupEnforced: false,
      skipsRemaining: 0,
      user: null, // No user data during verification
    });
  }, []);

  /**
   * Complete MFA Setup
   *
   * Called after user successfully completes MFA setup.
   * Transitions to authenticated state and clears MFA state.
   *
   * @param sessionData - Session data from MFA setup completion
   * @param setCsrfToken - Function to update CSRF token
   * @param onAuthenticated - Callback to update auth state
   */
  const completeMFASetup = useCallback(
    (
      sessionData: MFASessionData,
      setCsrfToken: (token: string | null) => void,
      onAuthenticated: (user: MFASessionData['user'], sessionId: string) => void
    ) => {
      debugLog.auth('MFA setup completed', {
        userId: sessionData.user.id,
        email: sessionData.user.email,
      });

      // Update CSRF token if provided
      if (sessionData.csrfToken) {
        setCsrfToken(sessionData.csrfToken);
      }

      // Notify auth provider of successful authentication
      onAuthenticated(sessionData.user, sessionData.sessionId);

      // Clear MFA state - user is now fully authenticated
      setMFAState(initialMFAState);
    },
    []
  );

  /**
   * Complete MFA Verification
   *
   * Called after user successfully verifies with existing MFA.
   * Transitions to authenticated state and clears MFA state.
   *
   * @param sessionData - Session data from MFA verification completion
   * @param setCsrfToken - Function to update CSRF token
   * @param onAuthenticated - Callback to update auth state
   */
  const completeMFAVerification = useCallback(
    (
      sessionData: MFASessionData,
      setCsrfToken: (token: string | null) => void,
      onAuthenticated: (user: MFASessionData['user'], sessionId: string) => void
    ) => {
      debugLog.auth('MFA verification completed', {
        userId: sessionData.user.id,
        email: sessionData.user.email,
      });

      // Update CSRF token if provided
      if (sessionData.csrfToken) {
        setCsrfToken(sessionData.csrfToken);
      }

      // Notify auth provider of successful authentication
      onAuthenticated(sessionData.user, sessionData.sessionId);

      // Clear MFA state - user is now fully authenticated
      setMFAState(initialMFAState);
    },
    []
  );

  /**
   * Clear MFA State
   *
   * Resets all MFA state to initial values.
   * Called when user cancels MFA flow, logs out, or completes authentication.
   */
  const clearMFAState = useCallback(() => {
    debugLog.auth('MFA state cleared');
    setMFAState(initialMFAState);
  }, []);

  return {
    mfaState,
    setMFASetupRequired,
    setMFAVerificationRequired,
    completeMFASetup,
    completeMFAVerification,
    clearMFAState,
  };
}
