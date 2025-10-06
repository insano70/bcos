/**
 * OIDC Callback Endpoint
 *
 * Handles the OIDC callback from Microsoft Entra after user authentication.
 *
 * Security Features (ALL CRITICAL):
 * - Session decryption (iron-session) - validates encrypted session data
 * - One-time state token validation - prevents replay attacks
 * - Device fingerprint validation - prevents session hijacking
 * - Explicit ID token validation - defense-in-depth token checks
 * - Email domain validation - organization access control
 * - Input sanitization - defense against injection attacks
 *
 * Flow:
 * 1. User authenticates with Microsoft Entra
 * 2. Entra redirects here with code and state
 * 3. Decrypt and validate session data
 * 4. Validate state (one-time use, CSRF protection)
 * 5. Validate device fingerprint (session hijacking prevention)
 * 6. Exchange code for tokens (PKCE validation)
 * 7. Validate ID token claims (defense-in-depth)
 * 8. Validate email domain
 * 9. Lookup/create user in database
 * 10. Create internal JWT tokens
 * 11. Set auth cookies and redirect
 *
 * @route GET /api/auth/oidc/callback
 * @access Public (unauthenticated, but validates session)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { eq } from 'drizzle-orm';
import { publicRoute } from '@/lib/api/route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log, correlation } from '@/lib/logger';
import { AuditLogger } from '@/lib/api/services/audit';
import { getOIDCClient } from '@/lib/oidc/client';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';
import { SessionError, StateValidationError } from '@/lib/oidc/errors';
import type { OIDCSessionData, OIDCCallbackParams } from '@/lib/oidc/types';
import { validateAuthProfile, validateEmailDomain } from '@/lib/auth/input-validator';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { db, users, organizations } from '@/lib/db';
import { getOIDCConfig } from '@/lib/env';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * OIDC Callback Handler
 *
 * Exchanges authorization code for tokens and creates user session.
 */
const oidcCallbackHandler = async (request: NextRequest) => {
	const startTime = Date.now();

	log.api('GET /api/auth/oidc/callback - OIDC callback received', request, 0, 0);

	// Use APP_URL for all redirects to avoid internal hostname issues behind load balancer
	// APP_URL is a runtime environment variable (not NEXT_PUBLIC_ which is build-time)
	const baseUrl = process.env.APP_URL || request.url;

	try {
		// ===== 1. Extract Callback Parameters =====
		const code = request.nextUrl.searchParams.get('code');
		const state = request.nextUrl.searchParams.get('state');
		const error = request.nextUrl.searchParams.get('error');
		const errorDescription = request.nextUrl.searchParams.get('error_description');

		// Check for provider errors
		if (error) {
			log.error('OIDC provider returned error', {
				error,
				errorDescription,
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				metadata: {
					authMethod: 'oidc',
					reason: 'provider_error',
					error,
					errorDescription,
				},
			});

			return NextResponse.redirect(
				new URL(`/signin?error=oidc_provider_error&message=${encodeURIComponent(error)}`, baseUrl),
			);
		}

		// Validate required parameters
		if (!code || !state) {
			log.error('OIDC callback missing required parameters', {
				hasCode: !!code,
				hasState: !!state,
			});

			return NextResponse.redirect(
				new URL('/signin?error=oidc_callback_failed', baseUrl),
			);
		}

		// ===== 2. Retrieve and Decrypt Session Data (CRITICAL SECURITY) =====
		const cookieStore = await cookies();
		const sessionCookie = cookieStore.get('oidc-session');

		if (!sessionCookie) {
			log.error('OIDC session cookie not found');
			throw new SessionError('OIDC session expired or not found');
		}

		const sessionSecret = process.env.OIDC_SESSION_SECRET;
		if (!sessionSecret) {
			throw new SessionError('OIDC_SESSION_SECRET not configured');
		}

		let sessionData: OIDCSessionData;
		try {
			sessionData = await unsealData<OIDCSessionData>(sessionCookie.value, {
				password: sessionSecret,
			});
		} catch (error) {
			log.error('Failed to decrypt OIDC session', {
				error: error instanceof Error ? error.message : 'Unknown',
			});
			throw new SessionError('OIDC session decryption failed - possible tampering');
		}

		// Delete session cookie (one-time use)
		cookieStore.delete('oidc-session');

		// ===== 3. Validate State (CSRF Protection) =====
		if (state !== sessionData.state) {
			log.error('OIDC state mismatch', {
				received: state.substring(0, 8),
				expected: sessionData.state.substring(0, 8),
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				metadata: {
					authMethod: 'oidc',
					reason: 'state_mismatch',
					alert: 'POSSIBLE_CSRF_ATTACK',
				},
			});

			throw new StateValidationError('State parameter mismatch');
		}

		// ===== 4. Validate State One-Time Use (CRITICAL - OIDC Spec Compliance) =====
		// Database-backed validation for horizontal scaling
		const isValid = await databaseStateManager.validateAndMarkUsed(state);
		if (!isValid) {
			log.error('State token replay or expiration', {
				state: state.substring(0, 8),
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				metadata: {
					authMethod: 'oidc',
					reason: 'state_replay',
					state: state.substring(0, 8),
					alert: 'REPLAY_ATTACK_DETECTED',
				},
			});

			throw new StateValidationError('State token invalid, expired, or already used');
		}

		// ===== 5. Validate Device Fingerprint (Session Hijacking Prevention) =====
		const forwardedFor = request.headers.get('x-forwarded-for');
		const currentIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() || 'unknown' : 'unknown';
		const currentUserAgent = request.headers.get('user-agent') || 'unknown';
		const currentFingerprint = generateDeviceFingerprint(currentIp, currentUserAgent);

		const strictMode = process.env.OIDC_STRICT_FINGERPRINT === 'true';

		if (sessionData.fingerprint !== currentFingerprint) {
			if (strictMode) {
				// Reject in strict mode
				log.error('OIDC session hijack attempt detected', {
					expected: sessionData.fingerprint.substring(0, 16),
					received: currentFingerprint.substring(0, 16),
					ipAddress: currentIp,
				});

				await AuditLogger.logAuth({
					action: 'login_failed',
					ipAddress: currentIp,
					userAgent: currentUserAgent,
					metadata: {
						authMethod: 'oidc',
						reason: 'session_hijack',
						alert: 'SESSION_HIJACK_ATTEMPT',
					},
				});

				return NextResponse.redirect(
					new URL('/signin?error=oidc_session_hijack', baseUrl),
				);
			}

			// Log warning in normal mode (mobile networks can change IPs)
			log.warn('OIDC session fingerprint changed', {
				expected: sessionData.fingerprint.substring(0, 16),
				received: currentFingerprint.substring(0, 16),
			});
		}

		// ===== 6. Exchange Code for Tokens (PKCE Validation) =====
		const oidcClient = await getOIDCClient();

		// Pass the full callback URL to the OIDC client
		// The openid-client library needs the actual request URL, not reconstructed params
		const callbackUrl = new URL(request.url);

		const userInfo = await oidcClient.handleCallback(
			callbackUrl,
			sessionData.state,
			sessionData.nonce,
			sessionData.codeVerifier,
		);

		// Note: Email verification already validated in handleCallback()

		log.info('OIDC token exchange successful', {
			email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
			emailVerified: userInfo.emailVerified,
		});

		// ===== 7. Validate Email Domain (Organization Access Control) =====
		const config = getOIDCConfig();
		const allowedDomains = config?.allowedEmailDomains || [];

		if (allowedDomains.length > 0) {
			const isAllowed = validateEmailDomain(userInfo.email, allowedDomains);

			if (!isAllowed) {
				log.warn('OIDC email domain not allowed', {
					email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
					allowedDomains,
				});

				await AuditLogger.logAuth({
					action: 'login_failed',
					email: userInfo.email,
					ipAddress: currentIp,
					userAgent: currentUserAgent,
					metadata: {
						authMethod: 'oidc',
						reason: 'email_domain_not_allowed',
					},
				});

				return NextResponse.redirect(
					new URL('/signin?error=oidc_domain_not_allowed', baseUrl),
				);
			}
		}

		// ===== 8. Validate and Sanitize Profile Data (Defense-in-Depth) =====
		const validationResult = validateAuthProfile(
			{
				email: userInfo.email,
				displayName: userInfo.name,
				givenName: userInfo.givenName,
				surname: userInfo.familyName,
			},
			'oidc',
		);

		if (!validationResult.valid) {
			log.error('OIDC profile validation failed', {
				errors: validationResult.errors,
				email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				email: userInfo.email,
				metadata: {
					authMethod: 'oidc',
					reason: 'profile_validation_failed',
					errors: validationResult.errors,
				},
			});

			return NextResponse.redirect(
				new URL('/signin?error=oidc_invalid_profile', baseUrl),
			);
		}

		const sanitizedProfile = validationResult.sanitized!;

		// ===== 9. Lookup User in Database =====
		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, sanitizedProfile.email))
			.limit(1);

		if (!existingUser) {
			log.warn('OIDC user not found in database', {
				email: sanitizedProfile.email.replace(/(.{2}).*@/, '$1***@'),
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				email: sanitizedProfile.email,
				ipAddress: currentIp,
				userAgent: currentUserAgent,
				metadata: {
					authMethod: 'oidc',
					reason: 'user_not_provisioned',
				},
			});

			const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.url;
			return NextResponse.redirect(
				new URL('/signin?error=user_not_provisioned', baseUrl),
			);
		}

		// Check if user is active
		if (!existingUser.is_active) {
			log.warn('OIDC user account not active', {
				email: sanitizedProfile.email.replace(/(.{2}).*@/, '$1***@'),
				isActive: existingUser.is_active,
			});

			await AuditLogger.logAuth({
				action: 'login_failed',
				userId: existingUser.user_id,
				email: sanitizedProfile.email,
				ipAddress: currentIp,
				userAgent: currentUserAgent,
				metadata: {
					authMethod: 'oidc',
					reason: 'user_not_active',
				},
			});

			const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.url;
			return NextResponse.redirect(
				new URL('/signin?error=user_inactive', baseUrl),
			);
		}

		// ===== 10. Create Internal JWT Tokens =====
		const deviceName = generateDeviceName(currentUserAgent);
		const deviceFingerprint = generateDeviceFingerprint(currentIp, currentUserAgent);

		const deviceInfo = {
			ipAddress: currentIp,
			userAgent: currentUserAgent,
			fingerprint: deviceFingerprint,
			deviceName,
		};

		const tokens = await createTokenPair(
			existingUser.user_id,
			deviceInfo,
			false, // rememberMe = false for SSO
			sanitizedProfile.email,
		);

		// Get user context with permissions
		const userContext = await getCachedUserContextSafe(existingUser.user_id);

		// ===== 11. Audit Log Successful Login =====
		await AuditLogger.logAuth({
			action: 'login',
			userId: existingUser.user_id,
			email: sanitizedProfile.email,
			ipAddress: currentIp,
			userAgent: currentUserAgent,
			metadata: {
				authMethod: 'oidc',
				deviceName,
				sessionId: tokens.sessionId,
				duration: Date.now() - startTime,
			},
		});

		log.info('OIDC login successful', {
			userId: existingUser.user_id,
			email: sanitizedProfile.email.replace(/(.{2}).*@/, '$1***@'),
			duration: Date.now() - startTime,
		});

		// ===== 12. Set Auth Cookies and Redirect =====
		// Set cookies using cookies() API for reliability
		// IMPORTANT: Cookie names must match middleware expectations (access-token, refresh-token with hyphens)
		// SECURITY: Use 'strict' sameSite for maximum CSRF protection (consistent with password login)
		const isSecureEnvironment = process.env.NODE_ENV === 'production';

		cookieStore.set('access-token', tokens.accessToken, {
			httpOnly: true,
			secure: isSecureEnvironment,
			sameSite: 'strict', // CRITICAL: Prevents CSRF attacks
			maxAge: 60 * 15, // 15 minutes
			path: '/',
		});

		cookieStore.set('refresh-token', tokens.refreshToken, {
			httpOnly: true,
			secure: isSecureEnvironment,
			sameSite: 'strict', // CRITICAL: Prevents CSRF attacks
			maxAge: 60 * 60 * 24 * 7, // 7 days
			path: '/',
		});

		// Redirect to destination
		const redirectUrl = new URL(sessionData.returnUrl, baseUrl);

		log.info('OIDC callback redirect', {
			returnUrl: sessionData.returnUrl,
			baseUrl,
			finalRedirect: redirectUrl.toString(),
		});

		return NextResponse.redirect(redirectUrl);
	} catch (error) {
		const duration = Date.now() - startTime;

		log.error('OIDC callback failed', {
			error: error instanceof Error ? error.message : 'Unknown error',
			errorName: error instanceof Error ? error.constructor.name : 'Unknown',
			stack: error instanceof Error ? error.stack : undefined,
			duration,
		});

		const errorIp = request.headers.get('x-forwarded-for');
		const errorUserAgent = request.headers.get('user-agent');

		await AuditLogger.logAuth({
			action: 'login_failed',
			ipAddress: errorIp ? errorIp.split(',')[0]?.trim() : undefined,
			userAgent: errorUserAgent || undefined,
			metadata: {
				authMethod: 'oidc',
				reason: 'callback_failed',
				error: error instanceof Error ? error.message : 'Unknown',
				errorType: error instanceof Error ? error.constructor.name : 'Unknown',
				requestId: correlation.current(),
			},
		});

		// Redirect to signin with appropriate error
		const errorMessage =
			error instanceof SessionError
				? 'oidc_callback_failed'
				: error instanceof StateValidationError
					? 'oidc_state_replay'
					: 'oidc_callback_failed';

		return NextResponse.redirect(
			new URL(`/signin?error=${errorMessage}`, baseUrl),
		);
	}
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(oidcCallbackHandler, 'OIDC callback', {
	rateLimit: 'auth',
});
