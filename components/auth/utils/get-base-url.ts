/**
 * Get the base URL for API requests
 *
 * Returns the current origin in browser environments, or the configured
 * NEXT_PUBLIC_APP_URL in server environments (with localhost fallback)
 *
 * @returns Base URL string (e.g., 'http://localhost:4001' or 'https://app.example.com')
 */
export function getBaseUrl(): string {
	return typeof window !== 'undefined'
		? window.location.origin
		: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
}
