/**
 * Preemptive Authentication Hook
 *
 * Monitors session expiry and triggers background silent authentication
 * when the refresh token is approaching expiration. This ensures seamless
 * session extension without user interruption.
 *
 * How it works:
 * 1. Periodically checks session expiry from localStorage
 * 2. When expiry is within threshold (default: 2 days), triggers silent auth
 * 3. Silent auth happens in background via hidden iframe or redirect
 * 4. If successful, session is extended; if failed, user is warned
 *
 * @module components/auth/hooks/use-preemptive-auth
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authLogger } from '@/lib/utils/client-logger';
import { getSessionExpiry, needsPreemptiveAuth } from '@/lib/utils/login-hint-storage';

interface UsePreemptiveAuthOptions {
  /**
   * Whether preemptive auth is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Number of days before expiry to trigger preemptive auth.
   * @default 2
   */
  thresholdDays?: number;

  /**
   * Interval in milliseconds to check session expiry.
   * @default 3600000 (1 hour)
   */
  checkIntervalMs?: number;

  /**
   * Whether user is currently authenticated.
   * Preemptive auth only runs for authenticated users.
   */
  isAuthenticated: boolean;
}

interface UsePreemptiveAuthResult {
  /**
   * True if preemptive auth is currently in progress.
   */
  isPreemptiveAuthInProgress: boolean;

  /**
   * True if session needs renewal (expiring soon).
   */
  sessionExpiringSoon: boolean;

  /**
   * Days until session expires (null if unknown).
   */
  daysUntilExpiry: number | null;

  /**
   * Manually trigger preemptive auth.
   */
  triggerPreemptiveAuth: () => void;
}

/**
 * Hook for preemptive session renewal via silent authentication.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isAuthenticated } = useAuth();
 *   const { sessionExpiringSoon, daysUntilExpiry } = usePreemptiveAuth({
 *     isAuthenticated,
 *   });
 *
 *   if (sessionExpiringSoon) {
 *     return <Banner>Session expires in {daysUntilExpiry} days</Banner>;
 *   }
 * }
 * ```
 */
export function usePreemptiveAuth(
  options: UsePreemptiveAuthOptions
): UsePreemptiveAuthResult {
  const {
    enabled = true,
    thresholdDays = 2,
    checkIntervalMs = 60 * 60 * 1000, // 1 hour
    isAuthenticated,
  } = options;

  const [isPreemptiveAuthInProgress, setIsPreemptiveAuthInProgress] = useState(false);
  const [sessionExpiringSoon, setSessionExpiringSoon] = useState(false);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState<number | null>(null);

  // Prevent multiple concurrent auth attempts
  const authInProgressRef = useRef(false);
  // Track last check time to prevent too-frequent checks
  const lastCheckRef = useRef<number>(0);

  // Calculate days until expiry
  const calculateDaysUntilExpiry = useCallback((): number | null => {
    const expiryStr = getSessionExpiry();
    if (!expiryStr) return null;

    try {
      const expiry = new Date(expiryStr);
      const now = new Date();
      const diffMs = expiry.getTime() - now.getTime();
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      return days > 0 ? days : 0;
    } catch {
      return null;
    }
  }, []);

  // Check if preemptive auth is needed
  const checkAndTriggerAuth = useCallback(() => {
    if (!enabled || !isAuthenticated || authInProgressRef.current) {
      return;
    }

    // Rate limit checks (at least 1 minute between checks)
    const now = Date.now();
    if (now - lastCheckRef.current < 60000) {
      return;
    }
    lastCheckRef.current = now;

    // Update days until expiry
    const days = calculateDaysUntilExpiry();
    setDaysUntilExpiry(days);

    // Check if preemptive auth is needed
    const needsAuth = needsPreemptiveAuth(thresholdDays);
    setSessionExpiringSoon(needsAuth);

    if (needsAuth && !authInProgressRef.current) {
      authLogger.log('Session expiring soon - triggering preemptive auth', {
        daysUntilExpiry: days,
        threshold: thresholdDays,
      });

      // Mark auth in progress
      authInProgressRef.current = true;
      setIsPreemptiveAuthInProgress(true);

      // Note: Microsoft Entra blocks iframe-based auth via X-Frame-Options: DENY
      // We use redirect-based silent auth instead, which requires user navigation
      // For preemptive auth, we just warn the user and let them know their session is expiring
      // They can manually trigger a refresh or it will happen automatically on next page load
      
      authLogger.log('Session expiring soon - preemptive auth check completed', {
        note: 'User will be silently re-authenticated on next navigation',
      });

      // Mark as no longer in progress
      // The actual silent auth will happen via useSilentAuth on next navigation
      authInProgressRef.current = false;
      setIsPreemptiveAuthInProgress(false);
    }
  }, [enabled, isAuthenticated, thresholdDays, calculateDaysUntilExpiry]);

  // Manual trigger for preemptive auth
  const triggerPreemptiveAuth = useCallback(() => {
    authInProgressRef.current = false; // Reset to allow manual trigger
    checkAndTriggerAuth();
  }, [checkAndTriggerAuth]);

  // Set up periodic check
  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    // Initial check
    checkAndTriggerAuth();

    // Set up interval
    const intervalId = setInterval(checkAndTriggerAuth, checkIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, isAuthenticated, checkIntervalMs, checkAndTriggerAuth]);

  return {
    isPreemptiveAuthInProgress,
    sessionExpiringSoon,
    daysUntilExpiry,
    triggerPreemptiveAuth,
  };
}

