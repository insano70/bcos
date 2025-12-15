/**
 * Login Hint & Session Expiry Storage Utility
 *
 * Stores user's email in localStorage to pre-fill Microsoft login form
 * via the login_hint parameter. Also stores refresh token expiry for
 * preemptive silent authentication.
 *
 * Security considerations:
 * - Only stores email and expiry timestamp (not sensitive data)
 * - Cleared on explicit logout
 * - Uses localStorage (not accessible cross-origin)
 *
 * @module lib/utils/login-hint-storage
 */

const STORAGE_KEY = 'oidc_login_hint';
const EXPIRY_KEY = 'session_expiry';
const AUTH_METHOD_KEY = 'auth_method';

export type PreferredAuthMethod = 'oidc' | 'password';

/**
 * Store user email as login hint for future OIDC authentication.
 * Called after successful authentication.
 *
 * @param email - User's email address
 */
export function storeLoginHint(email: string): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    // Only store if email looks valid
    if (email?.includes('@')) {
      localStorage.setItem(STORAGE_KEY, email);
    }
  } catch {
    // localStorage might be disabled or full - fail silently
  }
}

/**
 * Retrieve stored login hint for OIDC authentication.
 *
 * @returns The stored email or undefined if not available
 */
export function getLoginHint(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined; // Server-side, no localStorage
  }

  try {
    const hint = localStorage.getItem(STORAGE_KEY);
    return hint ?? undefined;
  } catch {
    // localStorage might be disabled - fail silently
    return undefined;
  }
}

/**
 * Clear stored login hint.
 * Called when user explicitly logs out to allow switching accounts.
 */
export function clearLoginHint(): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage might be disabled - fail silently
  }
}

/**
 * Store refresh token expiry for preemptive silent auth.
 * Called after successful authentication or token refresh.
 *
 * @param expiresAt - ISO date string of when the refresh token expires
 */
export function storeSessionExpiry(expiresAt: string): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    localStorage.setItem(EXPIRY_KEY, expiresAt);
  } catch {
    // localStorage might be disabled - fail silently
  }
}

/**
 * Retrieve stored session expiry for preemptive silent auth.
 *
 * @returns The stored expiry ISO string or undefined if not available
 */
export function getSessionExpiry(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined; // Server-side, no localStorage
  }

  try {
    const expiry = localStorage.getItem(EXPIRY_KEY);
    return expiry ?? undefined;
  } catch {
    // localStorage might be disabled - fail silently
    return undefined;
  }
}

/**
 * Clear stored session expiry.
 * Called when user explicitly logs out.
 */
export function clearSessionExpiry(): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    localStorage.removeItem(EXPIRY_KEY);
  } catch {
    // localStorage might be disabled - fail silently
  }
}

/**
 * Store the user's preferred authentication method for future sessions.
 * Used to decide whether to attempt automatic silent OIDC on the signin page.
 */
export function storePreferredAuthMethod(method: PreferredAuthMethod): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    localStorage.setItem(AUTH_METHOD_KEY, method);
  } catch {
    // localStorage might be disabled or full - fail silently
  }
}

/**
 * Retrieve stored preferred authentication method.
 */
export function getPreferredAuthMethod(): PreferredAuthMethod | undefined {
  if (typeof window === 'undefined') {
    return undefined; // Server-side, no localStorage
  }

  try {
    const raw = localStorage.getItem(AUTH_METHOD_KEY);
    if (raw === 'oidc' || raw === 'password') {
      return raw;
    }
    return undefined;
  } catch {
    // localStorage might be disabled - fail silently
    return undefined;
  }
}

/**
 * Clear stored preferred authentication method.
 * Called when user explicitly logs out.
 */
export function clearPreferredAuthMethod(): void {
  if (typeof window === 'undefined') {
    return; // Server-side, no localStorage
  }

  try {
    localStorage.removeItem(AUTH_METHOD_KEY);
  } catch {
    // localStorage might be disabled - fail silently
  }
}

/**
 * Check if session needs preemptive refresh.
 * Returns true if session will expire within the specified threshold.
 *
 * @param thresholdDays - Number of days before expiry to trigger preemptive auth (default: 2)
 * @returns true if preemptive auth should be attempted
 */
export function needsPreemptiveAuth(thresholdDays: number = 2): boolean {
  const expiryStr = getSessionExpiry();
  if (!expiryStr) {
    return false; // No expiry stored
  }

  try {
    const expiry = new Date(expiryStr);
    const now = new Date();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

    // Return true if less than threshold days until expiry
    return expiry.getTime() - now.getTime() < thresholdMs;
  } catch {
    return false; // Invalid date
  }
}

