/**
 * Authentication HTTP Service
 *
 * Centralized HTTP operations for authentication flows.
 * Abstracts all fetch calls to auth API endpoints.
 *
 * Benefits:
 * - Single source of truth for auth API calls
 * - Eliminates baseUrl duplication
 * - Testable via mocking
 * - Centralized error handling
 * - Type-safe request/response interfaces
 */

import { getBaseUrl } from '../utils/get-base-url';
import type { APIUserResponse } from '../types';

/**
 * Session check response from /api/auth/me
 */
export interface SessionResponse {
	success: boolean;
	data?: {
		user: APIUserResponse;
		sessionId: string;
	};
	error?: string;
}

/**
 * Login response from /api/auth/login
 */
export interface LoginResponse {
	success: boolean;
	data?: {
		status: 'success' | 'mfa_setup_optional' | 'mfa_setup_enforced' | 'mfa_required';
		user: unknown;
		sessionId?: string;
		csrfToken?: string;
		tempToken?: string;
		challenge?: unknown;
		challengeId?: string;
		skipsRemaining?: number;
	};
	error?: string;
}

/**
 * Token refresh response from /api/auth/refresh
 */
export interface RefreshResponse {
	success: boolean;
	data?: {
		user: unknown;
		sessionId: string;
		csrfToken?: string;
	};
	error?: string;
}

/**
 * CSRF error detection helper
 */
function isCSRFError(error: unknown): boolean {
	if (error instanceof Error) {
		return error.message.toLowerCase().includes('csrf');
	}
	if (typeof error === 'string') {
		return error.toLowerCase().includes('csrf');
	}
	return false;
}

/**
 * Authentication HTTP Service
 *
 * Handles all HTTP operations for authentication flows.
 * Uses centralized getBaseUrl() utility to avoid duplication.
 */
export class AuthHTTPService {
	/**
	 * Check existing session without forcing refresh
	 *
	 * @returns Session data if valid, or error response
	 * @throws Error if request fails or session is invalid
	 */
	async checkSession(): Promise<SessionResponse> {
		const response = await fetch(`${getBaseUrl()}/api/auth/me`, {
			method: 'GET',
			credentials: 'include', // Include httpOnly cookies
		});

		if (!response.ok) {
			const data = await response.json().catch(() => ({ error: 'Session check failed' }));
			throw new Error(data.error || `Session check failed: ${response.status}`);
		}

		return response.json();
	}

	/**
	 * Login with email and password credentials
	 *
	 * @param email - User email
	 * @param password - User password
	 * @param remember - Remember login for extended period
	 * @param csrfToken - CSRF token for request validation
	 * @returns Login response with user data or MFA challenge
	 * @throws Error if login fails
	 */
	async loginWithCredentials(
		email: string,
		password: string,
		remember: boolean,
		csrfToken: string,
	): Promise<LoginResponse> {
		const response = await fetch(`${getBaseUrl()}/api/auth/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-csrf-token': csrfToken,
			},
			body: JSON.stringify({ email, password, remember }),
			credentials: 'include',
		});

		const result = await response.json();

		if (!response.ok) {
			throw new Error(result.error || 'Login failed');
		}

		return result;
	}

	/**
	 * Login with credentials and automatic CSRF retry
	 *
	 * Implements retry logic for CSRF token errors.
	 * If CSRF validation fails, refreshes token and retries once.
	 *
	 * @param email - User email
	 * @param password - User password
	 * @param remember - Remember login for extended period
	 * @param getCSRFToken - Function to get/refresh CSRF token
	 * @param clearCSRFToken - Function to clear cached CSRF token
	 * @param maxRetries - Maximum retry attempts (default: 2)
	 * @returns Login response with user data or MFA challenge
	 * @throws Error if login fails after retries
	 */
	async loginWithRetry(
		email: string,
		password: string,
		remember: boolean,
		getCSRFToken: () => Promise<string | null>,
		clearCSRFToken: () => void,
		maxRetries = 2,
	): Promise<LoginResponse> {
		let attempt = 0;

		while (attempt < maxRetries) {
			try {
				const csrfToken = await getCSRFToken();
				if (!csrfToken) {
					throw new Error('Failed to obtain CSRF token');
				}

				return await this.loginWithCredentials(email, password, remember, csrfToken);
			} catch (error) {
				// Check if this is a CSRF error and we have retries left
				if (isCSRFError(error) && attempt < maxRetries - 1) {
					// Clear cached token and retry
					clearCSRFToken();
					attempt++;
					continue;
				}

				// Not a CSRF error or out of retries, throw the error
				throw error;
			}
		}

		throw new Error('Max retries exceeded');
	}

	/**
	 * Perform logout
	 *
	 * @param csrfToken - CSRF token for request validation
	 * @throws Error if logout fails
	 */
	async performLogout(csrfToken: string): Promise<void> {
		await fetch(`${getBaseUrl()}/api/auth/logout`, {
			method: 'POST',
			headers: {
				'x-csrf-token': csrfToken,
			},
			credentials: 'include',
		});
		// Note: Logout endpoint doesn't return meaningful data, just clear state
	}

	/**
	 * Refresh authentication token
	 *
	 * @param csrfToken - CSRF token for request validation
	 * @returns Refresh response with updated user data
	 * @throws Error if token refresh fails
	 */
	async refreshAuthToken(csrfToken: string): Promise<RefreshResponse> {
		const response = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
			method: 'POST',
			headers: {
				'x-csrf-token': csrfToken,
			},
			credentials: 'include',
		});

		if (!response.ok) {
			const data = await response.json().catch(() => ({ error: 'Token refresh failed' }));
			throw new Error(data.error || `Token refresh failed: ${response.status}`);
		}

		return response.json();
	}

	/**
	 * Fetch user context (RBAC permissions and roles)
	 *
	 * @returns Session response with full user context
	 * @throws Error if fetch fails
	 */
	async fetchUserContext(): Promise<SessionResponse> {
		const response = await fetch(`${getBaseUrl()}/api/auth/me`, {
			method: 'GET',
			credentials: 'include',
		});

		if (!response.ok) {
			const data = await response.json().catch(() => ({ error: 'Failed to fetch user context' }));
			throw new Error(data.error || `Failed to fetch user context: ${response.status}`);
		}

		return response.json();
	}
}

/**
 * Singleton instance of AuthHTTPService
 * Export for use across the application
 */
export const authHTTPService = new AuthHTTPService();
