'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

/**
 * Custom Authentication Provider
 * Replaces NextAuth SessionProvider with our enterprise token system
 */

export interface User {
  id: string
  email: string
  name: string
  firstName: string
  lastName: string
  role: string
  emailVerified: boolean
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  sessionId: string | null
  isLoading: boolean
  isAuthenticated: boolean
  csrfToken?: string | null
}

export interface AuthContextType extends AuthState {
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function CustomAuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    sessionId: null,
    isLoading: true,
    isAuthenticated: false,
    csrfToken: null
  })

  // Initialize authentication state
  useEffect(() => {
    initializeAuth()
  }, [])

  // Set up token refresh interval
  useEffect(() => {
    if (state.accessToken) {
      // Refresh token every 10 minutes (access tokens last 15 minutes)
      const refreshInterval = setInterval(() => {
        refreshToken()
      }, 10 * 60 * 1000)

      return () => clearInterval(refreshInterval)
    }
  }, [state.accessToken])

  const initializeAuth = async () => {
    try {
      // Ensure CSRF token cookie exists before any state-changing requests
      await ensureCsrfToken()
      // Try to refresh token to get current session
      await refreshToken()
    } catch (error) {
      console.log('No active session found')
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }

  const ensureCsrfToken = async (): Promise<string | null> => {
    try {
      if (state.csrfToken) return state.csrfToken
      const resp = await fetch('/api/csrf', { method: 'GET', credentials: 'include' })
      const json = await resp.json()
      const token = json?.data?.csrfToken || null
      setState(prev => ({ ...prev, csrfToken: token }))
      return token
    } catch {
      return null
    }
  }

  const login = async (email: string, password: string, remember = false) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }))

      const csrfToken = (await ensureCsrfToken()) || ''
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ email, password, remember }),
        credentials: 'include' // Include cookies
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Login failed')
      }

      // Update state with login result
      setState({
        user: result.data.user,
        accessToken: result.data.accessToken,
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true
      })

      console.log('Login successful for:', result.data.user.email)
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const logout = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }))

      // Call logout endpoint
      const csrfToken = (await ensureCsrfToken()) || ''
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include'
      })

      // Clear state
      setState({
        user: null,
        accessToken: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false
      })

      console.log('Logout successful')
    } catch (error) {
      console.error('Logout error:', error)
      // Clear state even if logout fails
      setState({
        user: null,
        accessToken: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false
      })
    }
  }

  const refreshToken = async () => {
    try {
      const csrfToken = (await ensureCsrfToken()) || ''
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include'
      })

      if (!response.ok) {
        // Refresh failed - this is normal if no session exists
        console.log('No active session to refresh')
        setState({
          user: null,
          accessToken: null,
          sessionId: null,
          isLoading: false,
          isAuthenticated: false
        })
        return
      }

      const result = await response.json()

      // Update state with new tokens
      setState(prev => ({
        ...prev,
        accessToken: result.data.accessToken,
        sessionId: result.data.sessionId,
        isLoading: false,
        isAuthenticated: true
      }))

      console.log('Token refreshed successfully')
    } catch (error) {
      // This is normal if no session exists
      console.log('No session to refresh (normal on first visit)')
      setState({
        user: null,
        accessToken: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false
      })
    }
  }

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    refreshToken
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within a CustomAuthProvider')
  }
  return context
}
