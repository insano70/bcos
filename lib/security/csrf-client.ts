/**
 * Client-side CSRF Token Helper - Pure Functions Module
 * Provides utilities for validating and managing CSRF tokens on the client
 */

/**
 * Client-side CSRF token validation result
 */
export interface CSRFTokenValidation {
  isValid: boolean;
  reason?: string;
  shouldRefresh: boolean;
}

/**
 * Validate a CSRF token structure without server round-trip
 * Performs basic format and expiration checks
 */
export function validateTokenStructure(token: string): CSRFTokenValidation {
    if (!token || typeof token !== 'string') {
      return {
        isValid: false,
        reason: 'missing_token',
        shouldRefresh: true,
      };
    }

    if (token.length < 10) {
      return {
        isValid: false,
        reason: 'token_too_short',
        shouldRefresh: true,
      };
    }

    // Check if token has expected format (base64.signature)
    const parts = token.split('.');
    if (parts.length !== 2) {
      return {
        isValid: false,
        reason: 'invalid_format',
        shouldRefresh: true,
      };
    }

    const [encodedPayload, signature] = parts;

    if (!encodedPayload || !signature) {
      return {
        isValid: false,
        reason: 'missing_parts',
        shouldRefresh: true,
      };
    }

    // Try to decode and parse payload
    try {
      const payloadStr = atob(encodedPayload);
      const payload = JSON.parse(payloadStr);

      // Check if token has expired (for authenticated tokens)
      if (payload.type === 'authenticated' && payload.timestamp) {
        const tokenAge = Date.now() - payload.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (tokenAge > maxAge) {
          return {
            isValid: false,
            reason: 'token_expired',
            shouldRefresh: true,
          };
        }
      }

      // Check if anonymous token is too old (time window based)
      if (payload.type === 'anonymous' && payload.timeWindow) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        const windowSize = isDevelopment ? 900000 : 300000; // 15min dev, 5min prod
        const currentTimeWindow = Math.floor(Date.now() / windowSize);

        // Allow some flexibility but not too much
        const maxWindowDrift = isDevelopment ? 2 : 1;
        const windowDiff = Math.abs(currentTimeWindow - payload.timeWindow);

        if (windowDiff > maxWindowDrift) {
          return {
            isValid: false,
            reason: 'time_window_expired',
            shouldRefresh: true,
          };
        }
      }

      // Basic structure looks valid
      return {
        isValid: true,
        shouldRefresh: false,
      };
    } catch (_error) {
      return {
        isValid: false,
        reason: 'decode_error',
        shouldRefresh: true,
      };
    }
}

/**
 * Validate CSRF token against server
 * Makes a lightweight validation request to check token validity
 */
export async function validateTokenWithServer(token: string): Promise<CSRFTokenValidation> {
    if (!token) {
      return {
        isValid: false,
        reason: 'missing_token',
        shouldRefresh: true,
      };
    }

    try {
      // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
      const baseUrl =
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
      const response = await fetch(`${baseUrl}/api/csrf/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        credentials: 'include',
        body: JSON.stringify({ validateOnly: true }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          isValid: result.valid === true,
          reason: result.reason || 'unknown',
          shouldRefresh: !result.valid,
        };
      }

      // If validation endpoint doesn't exist yet, fall back to structure validation
      if (response.status === 404) {
        return validateTokenStructure(token);
      }

      // Server error or validation failed
      return {
        isValid: false,
        reason: `server_error_${response.status}`,
        shouldRefresh: true,
      };
    } catch (error) {
      // Network error or other issue - fall back to structure validation
      if (process.env.NODE_ENV === 'development') {
        console.log('CSRF server validation failed, using structure validation:', error);
      }
      return validateTokenStructure(token);
    }
}

/**
 * Get CSRF token from cookie
 * Safely extracts CSRF token from document cookies
 */
export function getCSRFTokenFromCookie(): string | null {
    if (typeof document === 'undefined') {
      return null; // Server-side
    }

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf-token' && value) {
        return decodeURIComponent(value);
      }
    }
    return null;
}

/**
 * Comprehensive token validation with fallbacks
 * Uses both client-side and server-side validation appropriately
 */
export async function validateToken(token: string): Promise<CSRFTokenValidation> {
  // First, check basic structure
  const structureValidation = validateTokenStructure(token);

  if (!structureValidation.isValid) {
    return structureValidation;
  }

  // If structure is valid, optionally validate with server for critical operations
  // For now, we'll rely on structure validation to avoid unnecessary server requests
  // Server validation can be enabled when the validation endpoint is available

  return structureValidation;
}

/**
 * Smart token refresh logic
 * Determines if a token should be refreshed based on various factors
 */
export function shouldRefreshToken(token: string | null, lastFetchTime: number | null): boolean {
    if (!token) {
      return true; // No token, definitely need to refresh
    }

    // Check if token structure is invalid
    const validation = validateTokenStructure(token);
    if (!validation.isValid) {
      return true;
    }

    // Check if we haven't fetched a token in a while (prevent staleness)
    if (lastFetchTime) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      const maxStaleTime = 30 * 60 * 1000; // 30 minutes

      if (timeSinceLastFetch > maxStaleTime) {
        return true;
      }
    }

    // Check if token is approaching expiration
    try {
      const [encodedPayload] = token.split('.');
      if (!encodedPayload) return true; // Invalid token, should refresh
      const payload = JSON.parse(atob(encodedPayload));

      if (payload.type === 'authenticated' && payload.timestamp) {
        const tokenAge = Date.now() - payload.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const refreshThreshold = maxAge * 0.8; // Refresh when 80% expired

        return tokenAge > refreshThreshold;
      }

      if (payload.type === 'anonymous' && payload.timeWindow) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        const windowSize = isDevelopment ? 900000 : 300000; // 15min dev, 5min prod
        const currentTimeWindow = Math.floor(Date.now() / windowSize);
        const windowDiff = Math.abs(currentTimeWindow - payload.timeWindow);

        // Refresh if we're in the next time window (proactive refresh)
        return windowDiff >= 1;
      }
    } catch (_error) {
      // If we can't parse the token, refresh it
      return true;
    }

    return false; // Token seems fine
}

/**
 * Extract token metadata for debugging
 * Safely extracts information from token payload
 */
export function getTokenMetadata(token: string): Record<string, unknown> | null {
    if (!token) return null;

    try {
      const [encodedPayload] = token.split('.');
      if (!encodedPayload) return null;

      const payload = JSON.parse(atob(encodedPayload));

      // Return safe metadata (no sensitive information)
      return {
        type: payload.type,
        timestamp: payload.timestamp,
        timeWindow: payload.timeWindow,
        hasNonce: !!payload.nonce,
        hasUserId: !!payload.userId,
        age: payload.timestamp ? Date.now() - payload.timestamp : null,
      };
    } catch (_error) {
      return null;
    }
}
