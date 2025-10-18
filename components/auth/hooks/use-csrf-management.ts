/**
 * CSRF Token Management Hook
 *
 * Manages CSRF token lifecycle including fetching, caching, validation, and refresh.
 * Implements optimizations to prevent duplicate requests and unnecessary token refreshes.
 *
 * Features:
 * - Cookie-first optimization (check existing token before fetching)
 * - In-flight request deduplication (prevent concurrent fetches)
 * - Smart refresh logic (only refresh when approaching expiration)
 * - Automatic retry on CSRF validation failures
 *
 * @example
 * const { csrfToken, ensureCsrfToken } = useCSRFManagement();
 * const token = await ensureCsrfToken(); // Get or refresh token
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCSRFTokenFromCookie,
  shouldRefreshToken,
  validateTokenStructure,
} from '@/lib/security/csrf-client';
import { clientDebugLog as debugLog, clientErrorLog as errorLog } from '@/lib/utils/debug-client';
import { getBaseUrl } from '../utils/get-base-url';

/**
 * CSRF token management state and operations
 */
export interface CSRFManagement {
  csrfToken: string | null;
  ensureCsrfToken: (forceRefresh?: boolean) => Promise<string | null>;
  setCsrfToken: (token: string | null) => void;
}

/**
 * Hook for managing CSRF tokens in client-side authentication
 *
 * Provides centralized CSRF token management with built-in optimizations:
 * 1. Checks cookie first (server may have already set it)
 * 2. Validates cached token before using
 * 3. Deduplicates concurrent fetch requests
 * 4. Implements smart refresh logic
 *
 * @returns CSRF management interface with token and operations
 */
export function useCSRFManagement(): CSRFManagement {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

  // Track in-flight token fetch to prevent duplicate requests (OPTIMIZATION)
  const fetchInProgress = useRef<Promise<string | null> | null>(null);

  // Refs to access current state values in callbacks without causing re-creation
  // This prevents infinite loops while avoiding stale closures
  const csrfTokenRef = useRef<string | null>(csrfToken);
  const lastFetchTimeRef = useRef<number | null>(lastFetchTime);

  // Sync refs with state on every render
  // This ensures callbacks always read the latest values without re-creating
  useEffect(() => {
    csrfTokenRef.current = csrfToken;
    lastFetchTimeRef.current = lastFetchTime;
  }, [csrfToken, lastFetchTime]);

  /**
   * Ensure a valid CSRF token is available
   *
   * Multi-stage approach to minimize server requests:
   * 1. Check if fetch already in progress (deduplicate)
   * 2. Check cookie for existing token (server-set)
   * 3. Check cached state token (previously fetched)
   * 4. Fetch new token from server (fallback)
   *
   * @param forceRefresh - Skip cache and fetch new token
   * @returns Valid CSRF token or null on failure
   */
  const ensureCsrfToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      try {
        // OPTIMIZATION: If fetch already in progress, return same promise (deduplication)
        if (fetchInProgress.current && !forceRefresh) {
          debugLog.auth('CSRF token fetch already in progress, waiting for completion');
          return fetchInProgress.current;
        }

        // Read current values from refs (always up-to-date, never stale)
        const currentToken = csrfTokenRef.current;
        const currentFetchTime = lastFetchTimeRef.current;

        // OPTIMIZATION: Step 1 - Check cookie first (already set by server)
        if (!forceRefresh && !currentToken) {
          const cookieToken = getCSRFTokenFromCookie();

          if (cookieToken) {
            // Validate token structure before using
            const validation = validateTokenStructure(cookieToken);

            if (validation.isValid) {
              debugLog.auth('Using existing CSRF token from cookie (no fetch needed)');
              setCsrfToken(cookieToken);
              setLastFetchTime(Date.now());
              return cookieToken;
            }

            debugLog.auth('Cookie token invalid, will fetch fresh token');
          }
        }

        // Step 2 - Check if cached token in state is still valid
        if (currentToken && !forceRefresh) {
          const shouldRefresh = shouldRefreshToken(currentToken, currentFetchTime);

          if (!shouldRefresh) {
            // Token is still valid, return it
            debugLog.auth('Using cached CSRF token from state');
            return currentToken;
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
        fetchInProgress.current = (async () => {
          try {
            const resp = await fetch(`${getBaseUrl()}/api/csrf`, {
              method: 'GET',
              credentials: 'include',
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
            setCsrfToken(token);
            setLastFetchTime(now);

            debugLog.auth('CSRF token successfully fetched and validated');
            return token;
          } finally {
            // Clear in-flight promise
            fetchInProgress.current = null;
          }
        })();

        return fetchInProgress.current;
      } catch (error) {
        errorLog('CSRF token fetch error:', error);
        // Clear invalid token from state
        setCsrfToken(null);
        fetchInProgress.current = null;
        return null;
      }
    },
    []
    // Empty deps: Reads current values from refs (csrfTokenRef, lastFetchTimeRef)
    // instead of closure. Refs are updated via useEffect, so callback always sees
    // current values without needing to re-create. This prevents infinite loops while
    // avoiding stale closures. State setters are stable and don't need to be listed.
  );

  return {
    csrfToken,
    ensureCsrfToken,
    setCsrfToken,
  };
}
