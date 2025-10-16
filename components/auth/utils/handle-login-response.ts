/**
 * Login Response Handler
 *
 * Handles different login response flows (MFA setup, MFA verification, standard success).
 * Extracts branching logic from the login function for better maintainability.
 *
 * Note: This is a client-side utility, so it doesn't use server-side logging.
 * Logging is handled by the caller (rbac-auth-provider.tsx) instead.
 */

import type { LoginResponse } from '../services/auth-http-service';
import type { User } from '../types';

/**
 * Handlers for different login response scenarios
 */
export interface LoginResponseHandlers {
	/** Called when CSRF token needs to be updated */
	setCsrfToken: (token: string) => void;
	/** Called when MFA setup is required */
	setMFASetupRequired: (data: {
		user: { id: string; email: string; name: string };
		skipsRemaining: number;
		tempToken: string;
		csrfToken: string;
	}) => void;
	/** Called when MFA verification is required */
	setMFAVerificationRequired: (data: {
		tempToken: string;
		challenge: unknown;
		challengeId: string;
		csrfToken: string;
	}) => void;
	/** Called on standard login success */
	loginSuccess: (data: { user: User; sessionId: string }) => void;
	/** Called to stop loading spinner */
	setLoading: (loading: boolean) => void;
}

/**
 * Result of handling a login response
 */
export type LoginFlowResult =
	| { type: 'mfa_setup'; enforced: boolean }
	| { type: 'mfa_verification' }
	| { type: 'success'; email: string };

/**
 * Handle login response and route to appropriate flow
 *
 * @param result - Login response from server
 * @param handlers - Callback functions for different flows
 * @returns Login flow result indicating which flow was triggered
 * @throws Error if response is invalid or missing required data
 */
export function handleLoginResponse(
	result: LoginResponse,
	handlers: LoginResponseHandlers,
): LoginFlowResult {
	// Validate response has data
	if (!result.data) {
		throw new Error('Invalid login response: missing data');
	}

	const { data } = result;
	const status = data.status;

	// Update CSRF token if provided (common to all flows)
	if (data.csrfToken) {
		handlers.setCsrfToken(data.csrfToken);
	}

	// Route 1: MFA Setup Required (optional or enforced)
	if (status === 'mfa_setup_optional' || status === 'mfa_setup_enforced') {
		const isEnforced = status === 'mfa_setup_enforced';

		handlers.setMFASetupRequired({
			user: data.user as { id: string; email: string; name: string },
			skipsRemaining: data.skipsRemaining || 0,
			tempToken: data.tempToken || '',
			csrfToken: data.csrfToken || '',
		});

		handlers.setLoading(false);
		return { type: 'mfa_setup', enforced: isEnforced };
	}

	// Route 2: MFA Verification Required
	if (status === 'mfa_required') {
		handlers.setMFAVerificationRequired({
			tempToken: data.tempToken || '',
			challenge: data.challenge,
			challengeId: data.challengeId || '',
			csrfToken: data.csrfToken || '',
		});

		handlers.setLoading(false);
		return { type: 'mfa_verification' };
	}

	// Route 3: Standard Login Success
	if (!data.user || !data.sessionId) {
		throw new Error('Invalid login response: missing user or sessionId');
	}

	handlers.loginSuccess({
		user: data.user as User,
		sessionId: data.sessionId,
	});

	const user = data.user as { email: string };
	return { type: 'success', email: user.email };
}
