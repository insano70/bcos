/**
 * API Test Helper Utilities
 *
 * Provides utilities for testing RBAC-protected API endpoints
 * Follows the pattern established in docs/rbac-testing-strategy.md
 */

import { signJWT } from '@/lib/auth/jwt'
import type { User } from '@/tests/factories'
import { expect } from 'vitest'

/**
 * Base URL for API requests
 * Use localhost:4001 as configured in the project
 */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

/**
 * Internal helper to make HTTP requests
 * Shared by authenticated and unauthenticated request helpers
 */
async function makeRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  endpoint: string,
  body: unknown,
  headers: Record<string, string>
): Promise<Response> {
  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }

  // Add body for POST/PUT/PATCH requests
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestOptions.body = JSON.stringify(body)
  }

  const url = `${BASE_URL}${endpoint}`
  const response = await fetch(url, requestOptions)

  // Log error responses for debugging
  if (!response.ok && process.env.NODE_ENV === 'test') {
    const errorText = await response.clone().text()
    console.log(`[API Test] ${method} ${endpoint} → ${response.status}`, errorText.substring(0, 200))
  }

  return response
}

/**
 * Make an authenticated API request as a specific user
 *
 * @param user - The user to authenticate as
 * @param method - HTTP method
 * @param endpoint - API endpoint path (e.g., '/api/admin/analytics/charts')
 * @param body - Optional request body
 * @param headers - Optional additional headers
 * @returns Response object
 *
 * @example
 * const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')
 * expectSuccess(response)
 */
export async function makeAuthenticatedRequest(
  user: User,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  endpoint: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  // Generate JWT token for the user
  const token = await signJWT({
    sub: user.user_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
  })

  return makeRequest(method, endpoint, body, {
    'Authorization': `Bearer ${token}`,
    ...headers,
  })
}

/**
 * Make an unauthenticated API request
 * Used for testing endpoints that should reject unauthenticated access
 *
 * @param method - HTTP method
 * @param endpoint - API endpoint path
 * @param body - Optional request body
 * @returns Response object
 *
 * @example
 * const response = await makeUnauthenticatedRequest('GET', '/api/admin/analytics/charts')
 * expectUnauthorized(response)
 */
export async function makeUnauthenticatedRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  endpoint: string,
  body?: unknown
): Promise<Response> {
  return makeRequest(method, endpoint, body, {})
}

/**
 * Expect a successful response (2xx status code)
 *
 * @param response - Response object
 * @param expectedStatus - Optional expected status code (default: 200)
 *
 * @example
 * expectSuccess(response)
 * expectSuccess(response, 201) // For POST requests
 */
export function expectSuccess(response: Response, expectedStatus: number = 200): void {
  expect(response.status).toBe(expectedStatus)
  expect(response.ok).toBe(true)
}

/**
 * Expect a forbidden response (403)
 * Used when testing permission denial
 *
 * @param response - Response object
 *
 * @example
 * expectForbidden(response)
 */
export function expectForbidden(response: Response): void {
  expect(response.status).toBe(403)
  expect(response.ok).toBe(false)
}

/**
 * Expect an unauthorized response (401)
 * Used when testing authentication requirement
 *
 * @param response - Response object
 *
 * @example
 * expectUnauthorized(response)
 */
export function expectUnauthorized(response: Response): void {
  expect(response.status).toBe(401)
  expect(response.ok).toBe(false)
}

/**
 * Expect a not found response (404)
 * Used when testing resource not found or organization isolation
 *
 * @param response - Response object
 *
 * @example
 * expectNotFound(response)
 */
export function expectNotFound(response: Response): void {
  expect(response.status).toBe(404)
  expect(response.ok).toBe(false)
}

/**
 * Expect a bad request response (400)
 * Used when testing input validation
 *
 * @param response - Response object
 *
 * @example
 * expectBadRequest(response)
 */
export function expectBadRequest(response: Response): void {
  expect(response.status).toBe(400)
  expect(response.ok).toBe(false)
}

/**
 * Parse JSON response body
 * Helper to safely parse response JSON
 *
 * @param response - Response object
 * @returns Parsed JSON data
 *
 * @example
 * const data = await parseJsonResponse(response)
 * expect(data).toHaveProperty('chart_id')
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    throw new Error('Empty response body')
  }
  return JSON.parse(text) as T
}

/**
 * Expect response to contain specific data
 * Combines success check with data validation
 *
 * @param response - Response object
 * @param expectedData - Partial object with expected fields
 *
 * @example
 * await expectResponseData(response, { name: 'Test Chart', chart_type: 'bar' })
 */
export async function expectResponseData(
  response: Response,
  expectedData: Record<string, unknown>
): Promise<void> {
  expectSuccess(response)
  const data = await parseJsonResponse<Record<string, unknown>>(response)

  for (const [key, value] of Object.entries(expectedData)) {
    expect(data).toHaveProperty(key)
    expect(data[key]).toEqual(value)
  }
}

/**
 * Expect response to be an array
 * Used for testing list endpoints
 *
 * @param response - Response object
 * @param minLength - Optional minimum array length
 *
 * @example
 * await expectArrayResponse(response)
 * await expectArrayResponse(response, 1) // Expect at least 1 item
 */
export async function expectArrayResponse(
  response: Response,
  minLength?: number
): Promise<void> {
  expectSuccess(response)
  const data = await parseJsonResponse(response)

  expect(Array.isArray(data)).toBe(true)
  if (minLength !== undefined) {
    expect((data as unknown[]).length).toBeGreaterThanOrEqual(minLength)
  }
}

/**
 * Expect error response with specific message
 * Used for testing error handling
 *
 * @param response - Response object
 * @param expectedMessage - Expected error message (partial match)
 *
 * @example
 * await expectErrorMessage(response, 'Permission denied')
 */
export async function expectErrorMessage(
  response: Response,
  expectedMessage: string
): Promise<void> {
  expect(response.ok).toBe(false)
  const data = await parseJsonResponse<{ error?: string; message?: string }>(response)
  const errorMessage = data.error || data.message || ''
  expect(errorMessage).toContain(expectedMessage)
}

/**
 * Test RBAC matrix for an endpoint
 * Runs all standard RBAC test cases in a single function
 *
 * @param endpoint - API endpoint
 * @param method - HTTP method
 * @param userWithPermission - User with required permission
 * @param userWithoutPermission - User without required permission
 * @param body - Optional request body
 *
 * @example
 * await testRBACMatrix(
 *   '/api/admin/analytics/charts',
 *   'GET',
 *   userWithPermission,
 *   userWithoutPermission
 * )
 */
export async function testRBACMatrix(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  userWithPermission: User,
  userWithoutPermission: User,
  body?: unknown
): Promise<void> {
  // Test 1: User WITH permission CAN access
  const successResponse = await makeAuthenticatedRequest(userWithPermission, method, endpoint, body)
  expectSuccess(successResponse)

  // Test 2: User WITHOUT permission CANNOT access (403)
  const forbiddenResponse = await makeAuthenticatedRequest(userWithoutPermission, method, endpoint, body)
  expectForbidden(forbiddenResponse)

  // Test 3: Unauthenticated user CANNOT access (401)
  const unauthResponse = await makeUnauthenticatedRequest(method, endpoint, body)
  expectUnauthorized(unauthResponse)
}
