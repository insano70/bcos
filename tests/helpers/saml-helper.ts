/**
 * SAML Test Helpers
 * Utilities for creating SAML test data and making assertions
 *
 * Follows the pattern established in db-helper.ts and rbac-helper.ts
 */

import { db } from '@/lib/db'
import { samlReplayPrevention } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createValidSAMLResponse, createExpiredSAMLResponse, createWrongTenantSAMLResponse } from '@/tests/mocks/saml-mocks'

/**
 * Extract token from Set-Cookie header
 * Used to verify cookie-based authentication after SAML callback
 */
export function extractTokenFromCookie(
  cookieHeader: string | string[] | null,
  tokenName: string
): string | null {
  if (!cookieHeader) {
    return null
  }

  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]

  for (const cookie of cookies) {
    // Cookie format: "token-name=token-value; HttpOnly; Secure; SameSite=Strict"
    const match = cookie.match(new RegExp(`${tokenName}=([^;]+)`))
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

/**
 * Extract all cookies from Set-Cookie header as object
 */
export function extractAllCookies(
  cookieHeader: string | string[] | null
): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]
  const cookieMap: Record<string, string> = {}

  for (const cookie of cookies) {
    const [nameValue] = cookie.split(';')
    if (!nameValue) continue

    const [name, value] = nameValue.split('=')
    if (name && value) {
      cookieMap[name.trim()] = value.trim()
    }
  }

  return cookieMap
}

/**
 * Verify SAML assertion ID has been tracked in database
 * Used to validate replay prevention is working
 */
export async function verifySAMLAssertionTracked(
  assertionId: string
): Promise<boolean> {
  const [entry] = await db
    .select()
    .from(samlReplayPrevention)
    .where(eq(samlReplayPrevention.replayId, assertionId))
    .limit(1)

  return !!entry
}

/**
 * Get SAML assertion details from database
 * Used for security validation testing
 */
export async function getSAMLAssertionDetails(assertionId: string) {
  const [entry] = await db
    .select()
    .from(samlReplayPrevention)
    .where(eq(samlReplayPrevention.replayId, assertionId))
    .limit(1)

  return entry || null
}

/**
 * Clean up SAML replay prevention entries for a specific email
 * Used in test cleanup
 */
export async function cleanupSAMLAssertions(userEmail: string): Promise<void> {
  await db
    .delete(samlReplayPrevention)
    .where(eq(samlReplayPrevention.userEmail, userEmail))
}

/**
 * Create a form-encoded SAML callback request body
 * Microsoft sends SAML responses as application/x-www-form-urlencoded
 */
export function createSAMLCallbackBody(samlResponse: string): string {
  return `SAMLResponse=${encodeURIComponent(samlResponse)}`
}

/**
 * Create SAML response with specific assertion ID
 * Useful for testing replay attack prevention
 */
export function createSAMLResponseWithAssertionId(
  email: string,
  assertionId: string
): string {
  return createValidSAMLResponse(email, { assertionId })
}

/**
 * Create SAML response with custom attributes
 * Useful for testing attribute extraction and sanitization
 */
export function createSAMLResponseWithAttributes(
  email: string,
  attributes: {
    displayName?: string;
    givenName?: string;
    surname?: string;
  }
): string {
  return createValidSAMLResponse(email, attributes)
}

/**
 * Mock fetch for SAML callback endpoint
 * Simulates browser POST request with SAML response
 */
export async function postSAMLCallback(
  samlResponse: string,
  options: {
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

  return fetch(`${baseUrl}/api/auth/saml/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...options.headers
    },
    body: createSAMLCallbackBody(samlResponse)
  })
}

/**
 * Mock fetch for SAML login endpoint
 * Simulates user clicking "Sign in with Microsoft"
 */
export async function getSAMLLoginRedirect(
  relayState?: string
): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
  const url = relayState
    ? `${baseUrl}/api/auth/saml/login?relay_state=${encodeURIComponent(relayState)}`
    : `${baseUrl}/api/auth/saml/login`

  return fetch(url, {
    method: 'GET',
    redirect: 'manual' // Don't follow redirects automatically
  })
}

/**
 * Mock fetch for SAML metadata endpoint
 */
export async function getSAMLMetadata(): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

  return fetch(`${baseUrl}/api/auth/saml/metadata`, {
    method: 'GET'
  })
}

/**
 * Verify SAML response sets authentication cookies
 */
export function verifySAMLAuthenticationCookies(response: Response): {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accessToken: string | null;
  refreshToken: string | null;
} {
  const setCookieHeaders = response.headers.get('set-cookie')
  const cookies = extractAllCookies(setCookieHeaders)

  return {
    hasAccessToken: 'access-token' in cookies,
    hasRefreshToken: 'refresh-token' in cookies,
    accessToken: cookies['access-token'] || null,
    refreshToken: cookies['refresh-token'] || null
  }
}

/**
 * Create authenticated request with SAML-issued tokens
 * Useful for testing protected endpoints after SAML login
 */
export async function makeAuthenticatedSAMLRequest(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: `access-token=${accessToken}`
    }
  })
}

/**
 * Test data factory for SAML responses
 */
export const SAMLResponseFactory = {
  valid: (email: string) => createValidSAMLResponse(email),
  expired: (email: string) => createExpiredSAMLResponse(email),
  wrongTenant: (email: string) => createWrongTenantSAMLResponse(email),
  withAssertionId: (email: string, assertionId: string) =>
    createSAMLResponseWithAssertionId(email, assertionId),
  withAttributes: (email: string, attributes: {
    displayName?: string;
    givenName?: string;
    surname?: string;
  }) => createSAMLResponseWithAttributes(email, attributes)
} as const

/**
 * Common SAML test scenarios
 */
export const SAMLTestScenarios = {
  /**
   * Valid SSO login scenario
   */
  validLogin: {
    email: 'sso.user@bendcare.com',
    displayName: 'SSO Test User',
    givenName: 'SSO',
    surname: 'User'
  },

  /**
   * Replay attack scenario
   */
  replayAttack: {
    assertionId: '_replay_test_assertion_123',
    email: 'replay.test@bendcare.com'
  },

  /**
   * Unauthorized domain scenario
   */
  unauthorizedDomain: {
    email: 'attacker@malicious.com',
    displayName: 'Attacker'
  },

  /**
   * SQL injection attempt
   */
  sqlInjection: {
    email: 'normal@bendcare.com',
    displayName: "'; DROP TABLE users; --",
    givenName: 'Robert",); DROP TABLE students;--'
  },

  /**
   * XSS attempt
   */
  xssAttack: {
    email: 'normal@bendcare.com',
    displayName: '<script>alert("xss")</script>',
    givenName: '<img src=x onerror=alert(1)>'
  }
} as const
