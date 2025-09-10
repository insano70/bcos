'use client'

import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { NextAuthTokenBridge } from '@/lib/auth/integration'

interface LogoutButtonProps {
  className?: string
  children?: React.ReactNode
}

export default function LogoutButton({ className, children }: LogoutButtonProps) {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      console.log('Initiating logout...')
      
      // Use NextAuth signOut which will trigger our cleanup events
      await signOut({
        redirect: false,
        callbackUrl: '/signin'
      })
      
      console.log('NextAuth signOut completed')
      
      // Also call our refresh token logout API to ensure cleanup
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include' // Include httpOnly cookies
        })
        console.log('Enterprise token cleanup completed')
      } catch (tokenError) {
        console.log('Enterprise token cleanup failed (may not exist):', tokenError)
      }
      
      // Redirect to signin
      router.push('/signin')
      router.refresh()
      
    } catch (error) {
      console.error('Logout error:', error)
      // Force redirect even if logout fails
      router.push('/signin')
    }
  }

  return (
    <button
      onClick={handleLogout}
      className={className || "btn bg-red-600 text-white hover:bg-red-700"}
    >
      {children || 'Sign Out'}
    </button>
  )
}
