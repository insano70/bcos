/**
 * Centralized API Client with Authentication Error Handling
 * Automatically handles 401 errors by redirecting to login page
 */

interface AuthContext {
  accessToken?: string | null
  csrfToken?: string | null | undefined
  refreshToken?: () => Promise<void>
  logout?: () => Promise<void>
}

interface ApiClientOptions {
  headers?: HeadersInit
  includeAuth?: boolean
}

class ApiClient {
  private baseUrl: string
  private authContext: AuthContext | null = null

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
  }

  /**
   * Set auth context for handling authentication errors
   */
  setAuthContext(authContext: AuthContext) {
    this.authContext = authContext
  }

  /**
   * Make an authenticated API request
   */
  async request<T>(
    endpoint: string, 
    options: RequestInit & ApiClientOptions = {}
  ): Promise<T> {
    const { headers = {}, includeAuth = true, ...requestOptions } = options
    
    // Build request headers
    const requestHeaders = new Headers({
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>)
    })

    // Add authentication header if available and requested
    if (includeAuth && this.authContext?.accessToken) {
      requestHeaders.set('Authorization', `Bearer ${this.authContext.accessToken}`)
    }

    // Add CSRF token for state-changing operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestOptions.method || 'GET')) {
      if (this.authContext?.csrfToken) {
        requestHeaders.set('x-csrf-token', this.authContext.csrfToken)
      }
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers: requestHeaders,
        credentials: 'include' // Include cookies for refresh tokens
      })

      // Handle 401 Unauthorized - Session expired
      if (response.status === 401) {
        console.log('API request returned 401 - session expired, attempting token refresh...')
        
        // Try to refresh token first
        if (this.authContext?.refreshToken && includeAuth) {
          try {
            await this.authContext.refreshToken()
            
            // Retry the original request with new token
            if (this.authContext.accessToken) {
              requestHeaders.set('Authorization', `Bearer ${this.authContext.accessToken}`)
              
              const retryResponse = await fetch(url, {
                ...requestOptions,
                headers: requestHeaders,
                credentials: 'include'
              })
              
              if (retryResponse.ok) {
                const data = await retryResponse.json()
                return data.data || data // Handle standardized API response format
              }
              
              // If retry still fails with 401, session is truly expired
              if (retryResponse.status === 401) {
                this.handleSessionExpired()
                throw new Error('Session expired - redirecting to login')
              }
            }
          } catch (refreshError) {
            console.log('Token refresh failed:', refreshError)
            this.handleSessionExpired()
            throw new Error('Session expired - redirecting to login')
          }
        } else {
          // No refresh capability, redirect to login
          this.handleSessionExpired()
          throw new Error('Session expired - redirecting to login')
        }
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Parse successful response
      const data = await response.json()
      
      // Handle standardized API response format
      if (data.success !== undefined) {
        return data.data || data
      }
      
      return data

    } catch (error) {
      // Network or parsing errors
      if (error instanceof Error && error.message.includes('Session expired')) {
        throw error // Re-throw session expired errors
      }
      
      console.error(`API request failed [${requestOptions.method || 'GET'} ${endpoint}]:`, error)
      throw new Error(error instanceof Error ? error.message : 'Network error occurred')
    }
  }

  /**
   * Handle session expiry by redirecting to login
   */
  private handleSessionExpired() {
    console.log('Session expired - redirecting to login page')
    
    // Clear auth context if available
    if (this.authContext?.logout) {
      // Don't await this as it might fail, just clear local state
      this.authContext.logout().catch(() => {})
    }

    // Get current path for redirect after login
    const currentPath = window.location.pathname + window.location.search
    const loginUrl = `/signin?callbackUrl=${encodeURIComponent(currentPath)}`
    
    // Force redirect to login page
    window.location.href = loginUrl
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T>(endpoint: string, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : null
    })
  }

  async put<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : null
    })
  }

  async patch<T>(endpoint: string, data?: unknown, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : null
    })
  }

  async delete<T>(endpoint: string, options?: ApiClientOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
export default apiClient
