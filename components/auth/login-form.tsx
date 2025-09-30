'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from './rbac-auth-provider'
import Link from 'next/link'
import { loginSchema } from '@/lib/validations/auth'
import SplitText from '@/components/SplitText'
import type { z } from 'zod'

type LoginFormData = {
  email: string;
  password: string;
  remember: boolean;
}

interface LoginFormProps {
  onSuccess?: () => void
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const samlError = searchParams.get('error') // SAML error from callback
  const { login } = useAuth()

  // Map SAML error codes to user-friendly messages
  const samlErrorMessages: Record<string, string> = {
    saml_init_failed: 'Unable to start Microsoft sign-in. Please try again or use email and password.',
    saml_validation_failed: 'Microsoft authentication failed. Please try again or use email and password.',
    user_not_provisioned: 'Your account is not authorized for this application. Contact your administrator.',
    user_inactive: 'Your account has been deactivated. Contact your administrator.'
  }

  const form = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onChange' as const,
    reValidateMode: 'onChange' as const,
    defaultValues: {
      email: '',
      password: '',
      remember: false
    }
  })

  const { register, handleSubmit, formState: { errors, isValid } } = form

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError(null)
      setIsSubmitting(true)
      // Login form submitting (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('Login form submitting...')
      }

      await login(data.email, data.password, data.remember)
      
      // Login successful, redirecting (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('Login completed, redirecting to:', callbackUrl)
      }
      
      onSuccess?.()
      
      // Small delay to ensure auth state is synchronized before redirect
      setTimeout(() => {
        // Use window.location for hard redirect to ensure middleware sees the cookie
        window.location.href = callbackUrl
      }, 200) // 200ms delay for state synchronization
      
    } catch (error) {
      // Log client-side login errors for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Login error:', error)
      }
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'
      setError(errorMessage)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* SAML Error message (from callback) */}
      {samlError && samlErrorMessages[samlError] && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">{samlErrorMessages[samlError]}</span>
          </div>
        </div>
      )}

      {/* Microsoft SSO Button */}
      <a
        href={`/api/auth/saml/login?relay_state=${encodeURIComponent(callbackUrl)}`}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-700 dark:text-gray-200 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      >
        <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        <span className="font-medium">Sign in with Microsoft</span>
      </a>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Traditional Email/Password Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Password login error message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

      {/* Email field */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          className="form-input w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:ring-violet-500"
          {...register('email')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleSubmit(onSubmit)()
            }
          }}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>

      {/* Password field */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="form-input w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:ring-violet-500"
          {...register('password')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleSubmit(onSubmit)()
            }
          }}
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
        )}
      </div>

      {/* Remember me checkbox */}
      <div className="flex items-center">
        <input
          id="remember"
          type="checkbox"
          className="form-checkbox text-violet-500 focus:ring-violet-500"
          {...register('remember')}
        />
        <label htmlFor="remember" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Remember me</span>
          <span className="block text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            Stay signed in for 30 days (vs 7 days standard)
          </span>
        </label>
      </div>

      {/* Submit button and forgot password */}
      <div className="flex items-center justify-between mt-6">
        <Link 
          className="text-sm text-violet-500 hover:text-violet-600 underline hover:no-underline" 
          href="/reset-password"
        >
          Forgot Password?
        </Link>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed ml-3"
        >
          {isSubmitting ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing In...
            </div>
          ) : (
            'Sign In'
          )}
        </button>
      </div>
      </form>
    </div>
  )
}
