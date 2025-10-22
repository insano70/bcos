/**
 * Get the base URL for API requests
 *
 * Returns the current origin in browser environments, or the configured
 * NEXT_PUBLIC_APP_URL in server environments.
 *
 * @returns Base URL string (e.g., 'http://localhost:4001' or 'https://app.example.com')
 * @throws {Error} If NEXT_PUBLIC_APP_URL is not set in server environment
 */
export function getBaseUrl(): string {
  // Client-side: use browser's origin
  if (typeof window !== 'undefined') {
    if (!window.location || !window.location.origin) {
      throw new Error('Browser window.location.origin is not available');
    }
    return window.location.origin;
  }

  // Server-side: use environment variable
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!envUrl) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL environment variable is not set. ' +
      'This is required for server-side authentication operations.'
    );
  }

  return envUrl;
}
