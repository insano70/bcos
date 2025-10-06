'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/auth/rbac-auth-provider'

export default function AuthenticatingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading } = useAuth()
  const [timeoutError, setTimeoutError] = useState(false)
  const returnUrl = searchParams.get('returnUrl') || '/dashboard'

  useEffect(() => {
    // Set timeout for authentication check (5 seconds)
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        setTimeoutError(true)
      }
    }, 5000)

    return () => clearTimeout(timeout)
  }, [isAuthenticated])

  useEffect(() => {
    // Once authenticated and not loading, redirect to destination
    if (isAuthenticated && !isLoading) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Authentication confirmed, redirecting to:', returnUrl)
      }

      // Use router.push for client-side navigation (middleware will have seen cookies by now)
      router.push(returnUrl)
    }
  }, [isAuthenticated, isLoading, returnUrl, router])

  if (timeoutError) {
    return (
      <main className="bg-white dark:bg-gray-900">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <svg
                className="w-16 h-16 text-red-500 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Authentication Timeout
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Authentication is taking longer than expected. Please try signing in again.
            </p>
            <a
              href="/signin"
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
            >
              Return to Sign In
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <svg
              className="animate-spin h-16 w-16 text-violet-600 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Authenticating...
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please wait while we complete your sign in.
          </p>
        </div>
      </div>
    </main>
  )
}
