/**
 * Centralized API Client with Authentication Error Handling
 * Automatically handles 401 errors by redirecting to login page
 */

interface AuthContext {
  // accessToken removed - now handled server-side via httpOnly cookies + middleware
  csrfToken?: string | null | undefined;
  refreshToken?: () => Promise<void>;
  logout?: () => Promise<void>;
  ensureCsrfToken?: (forceRefresh?: boolean) => Promise<string | null>;
}

interface ApiClientOptions {
  headers?: HeadersInit;
  includeAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;
  private authContext: AuthContext | null = null;

  constructor() {
    // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
    this.baseUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  }

  /**
   * Set auth context for handling authentication errors
   */
  setAuthContext(authContext: AuthContext) {
    this.authContext = authContext;
  }

  /**
   * Make an authenticated API request
   */
  async request<T>(endpoint: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
    const { headers = {}, includeAuth = true, ...requestOptions } = options;

    // API request logging (client-side debug)
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 API Client Request:', endpoint, { hasAuthContext: !!this.authContext });
    }

    // Build request headers
    const requestHeaders = new Headers({
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    });

    // Authentication header automatically added by middleware from httpOnly cookies
    // No client-side token management needed for security

    // Add CSRF token for state-changing operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestOptions.method || 'GET')) {
      if (this.authContext?.csrfToken) {
        requestHeaders.set('x-csrf-token', this.authContext.csrfToken);
      }
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers: requestHeaders,
        credentials: 'include', // Include cookies for refresh tokens
      });

      // Handle 401 Unauthorized - Session expired
      if (response.status === 401) {
        // Session expiry logging (client-side debug)
        if (process.env.NODE_ENV === 'development') {
          console.log('[API Client] 401 received - attempting token refresh...');
        }

        // Try to refresh token first
        if (this.authContext?.refreshToken && includeAuth) {
          try {
            // Refresh token (with built-in retry logic)
            await this.authContext.refreshToken();

            if (process.env.NODE_ENV === 'development') {
              console.log('[API Client] Token refresh completed, retrying original request...');
            }

            // Retry the original request up to 2 times
            let retryAttempt = 0;
            const maxRetries = 2;

            while (retryAttempt < maxRetries) {
              retryAttempt++;

              const retryResponse = await fetch(url, {
                ...requestOptions,
                headers: requestHeaders,
                credentials: 'include',
              });

              if (retryResponse.ok) {
                const data = await retryResponse.json();
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[API Client] Request succeeded on retry ${retryAttempt}`);
                }
                return data.data || data;
              }

              // If still getting 401, wait briefly and try once more
              if (retryResponse.status === 401 && retryAttempt < maxRetries) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[API Client] Retry ${retryAttempt} still 401, waiting 500ms...`);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
              }

              // If retry still fails with 401 after all attempts, session is truly expired
              if (retryResponse.status === 401) {
                if (process.env.NODE_ENV === 'development') {
                  console.error('[API Client] All retries exhausted with 401 - session expired');
                }
                this.handleSessionExpired();
                throw new Error('Session expired - redirecting to login');
              }

              // Other error - return it
              if (!retryResponse.ok) {
                const errorData = await retryResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${retryResponse.status}`);
              }
            }
          } catch (refreshError) {
            // Token refresh failure logging (client-side debug)
            if (process.env.NODE_ENV === 'development') {
              console.error('[API Client] Token refresh or retry failed:', refreshError);
            }
            this.handleSessionExpired();
            throw new Error('Session expired - redirecting to login');
          }
        } else {
          // No refresh capability, redirect to login
          this.handleSessionExpired();
          throw new Error('Session expired - redirecting to login');
        }
      }

      // Handle 403 Forbidden - Possibly stale CSRF token
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || '';

        // Check if this is a CSRF token error
        if (errorMessage.toLowerCase().includes('csrf')) {
          // CSRF error logging (client-side debug)
          if (process.env.NODE_ENV === 'development') {
            console.log(
              'API request returned 403 - CSRF token validation failed, fetching fresh token...'
            );
          }

          // Try to get a fresh CSRF token
          if (this.authContext?.ensureCsrfToken && includeAuth) {
            try {
              // Fetch a fresh CSRF token via the auth context
              // Force refresh to ensure we get a new token, not a cached one
              const freshToken = await this.authContext.ensureCsrfToken(true);

              if (!freshToken) {
                throw new Error('Failed to obtain fresh CSRF token');
              }

              // Update the request header with the new CSRF token
              requestHeaders.set('x-csrf-token', freshToken);

              // Retry the original request with fresh CSRF token
              const retryResponse = await fetch(url, {
                ...requestOptions,
                headers: requestHeaders,
                credentials: 'include',
              });

              if (retryResponse.ok) {
                const data = await retryResponse.json();
                return data.data || data; // Handle standardized API response format
              }

              // If retry still fails, throw the error
              if (!retryResponse.ok) {
                const retryErrorData = await retryResponse.json().catch(() => ({}));
                throw new Error(retryErrorData.error || 'CSRF token validation failed');
              }
            } catch (csrfRefreshError) {
              // CSRF refresh failure logging (client-side debug)
              if (process.env.NODE_ENV === 'development') {
                console.log('CSRF token refresh failed:', csrfRefreshError);
              }
              throw new Error('CSRF token validation failed');
            }
          } else {
            throw new Error('CSRF token validation failed');
          }
        }
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse successful response
      const data = await response.json();

      // Handle standardized API response format
      if (data.success !== undefined) {
        return data.data || data;
      }

      return data;
    } catch (error) {
      // Network or parsing errors
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        String(error.message).includes('Session expired')
      ) {
        throw error; // Re-throw session expired errors
      }

      // API request failure logging (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.error(`API request failed [${requestOptions.method || 'GET'} ${endpoint}]:`, error);
      }

      // Safe error message extraction
      let errorMessage = 'Network error occurred';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Handle session expiry by redirecting to login
   */
  private handleSessionExpired() {
    // Session expiry redirect logging (client-side debug)
    if (process.env.NODE_ENV === 'development') {
      console.log('Session expired - redirecting to login page');
    }

    // Clear auth context if available
    if (this.authContext?.logout) {
      // Don't await this as it might fail, just clear local state
      this.authContext.logout().catch(() => {});
    }

    // Get current path for redirect after login
    const currentPath = window.location.pathname + window.location.search;
    const loginUrl = `/signin?callbackUrl=${encodeURIComponent(currentPath)}`;

    // Force redirect to login page
    window.location.href = loginUrl;
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T>(endpoint: string, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : null,
    });
  }

  async put<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : null,
    });
  }

  async patch<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : null,
    });
  }

  async delete<T>(endpoint: string, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
