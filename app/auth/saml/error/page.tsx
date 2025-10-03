'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function SamlErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const email = searchParams.get('email')

  const handleSwitchAccount = () => {
    window.location.href = '/api/auth/saml/login?force_account_selection=true'
  }

  const handleRetry = () => {
    window.location.href = '/api/auth/saml/login'
  }

  // Mask email to prevent enumeration attacks
  // Shows first 2 chars + *** + @domain (e.g., em***@company.com)
  const maskEmail = (email: string): string => {
    const [local, domain] = email.split('@')
    if (!local || !domain) return 'unknown'

    const visibleChars = Math.min(2, local.length)
    return `${local.substring(0, visibleChars)}***@${domain}`
  }

  const maskedEmail = email ? maskEmail(email) : 'unknown'

  if (error === 'user_not_provisioned') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/20 p-3">
              <svg
                className="w-12 h-12 text-amber-600 dark:text-amber-500"
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
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Account Not Registered
          </h1>

          {/* Message */}
          <div className="space-y-3 text-gray-600 dark:text-gray-400">
            <p>
              The Microsoft account{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {maskedEmail}
              </span>{' '}
              is not authorized to access this application.
            </p>
            <p>
              If you have multiple Microsoft accounts, you may have signed in with the wrong one.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4">
            <button
              onClick={handleSwitchAccount}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-white transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
              Sign in with Different Account
            </button>

            <div className="flex gap-3">
              <Link
                href="/signin"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Back to Login
              </Link>
              <Link
                href="/contact"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>

          {/* Help text */}
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Need help?{' '}
            <Link
              href="/contact"
              className="text-violet-500 hover:text-violet-600 underline"
            >
              Contact your administrator
            </Link>{' '}
            to request access.
          </p>
        </div>
      </div>
    )
  }

  if (error === 'saml_validation_failed') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
              <svg
                className="w-12 h-12 text-red-600 dark:text-red-500"
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
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Authentication Failed
          </h1>

          <p className="text-gray-600 dark:text-gray-400">
            We couldn't verify your identity. Please try again.
          </p>

          <div className="space-y-3 pt-4">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-white transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/signin"
              className="block px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Default error state
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-3">
            <svg
              className="w-12 h-12 text-gray-600 dark:text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Something Went Wrong
        </h1>

        <p className="text-gray-600 dark:text-gray-400">
          An unexpected error occurred during sign-in.
        </p>

        <div className="space-y-3 pt-4">
          <button
            onClick={handleRetry}
            className="w-full px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-white transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/signin"
            className="block px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SamlErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    }>
      <SamlErrorContent />
    </Suspense>
  )
}
