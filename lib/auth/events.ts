import { NextAuthTokenBridge } from './integration'
import { cookies } from 'next/headers'

/**
 * NextAuth Event Handlers
 * Handles post-authentication token management and cleanup
 */

export const authEvents = {
  /**
   * Handle successful signin - set refresh token cookie
   */
  async signIn({ user, account, profile, isNewUser }) {
    try {
      console.log('NextAuth signIn event triggered for:', user.email)

      // Only handle credentials provider
      if (account?.provider !== 'credentials') {
        return true
      }

      // If we have enterprise tokens from the authorize step, set the refresh token cookie
      if (user.enterpriseRefreshToken) {
        const cookieStore = cookies()
        
        // Set secure httpOnly cookie for refresh token
        const isProduction = process.env.NODE_ENV === 'production'
        const maxAge = user.rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60 // 30 days or 7 days
        
        cookieStore.set('refresh-token', user.enterpriseRefreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          path: '/api/auth',
          maxAge
        })

        console.log(`Set refresh token cookie for user ${user.email} (remember: ${user.rememberMe})`)
      }

      return true
    } catch (error) {
      console.error('SignIn event error:', error)
      // Don't fail the login if token creation fails
      return true
    }
  },

  /**
   * Handle signout - cleanup enterprise tokens
   */
  async signOut({ session, token }) {
    try {
      console.log('NextAuth signOut event triggered for user:', session?.user?.email || token?.sub)

      const userId = session?.user?.id || token?.sub
      if (!userId) {
        console.log('No user ID found for signout cleanup')
        return
      }

      // Extract context (limited in signout context)
      const context = {
        ipAddress: 'unknown', // Limited context in signout
        userAgent: 'unknown',
        email: session?.user?.email || 'unknown'
      }

      // Cleanup enterprise tokens
      await NextAuthTokenBridge.cleanupTokensOnLogout(userId, context)

      // Clear refresh token cookie
      const cookieStore = cookies()
      cookieStore.set('refresh-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 0 // Expire immediately
      })

      console.log(`Cleaned up enterprise tokens and cookies for user ${userId}`)
    } catch (error) {
      console.error('SignOut event error:', error)
    }
  }
}
