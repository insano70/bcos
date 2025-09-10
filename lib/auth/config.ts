import { NextAuthOptions } from 'next-auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from './password'
import { loginSchema } from '@/lib/validations/auth'
import { NextAuthTokenBridge } from './integration'
import { authEvents } from './events'

export const authConfig: NextAuthOptions = {
  adapter: DrizzleAdapter(db),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: 'Remember Me', type: 'checkbox' }
      },
      async authorize(credentials, req) {
        try {
          const validatedFields = loginSchema.safeParse(credentials)
          if (!validatedFields.success) {
            console.log('Validation failed:', validatedFields.error)
            return null
          }
          
          const { email, password, remember } = validatedFields.data
          
          // Fetch user from database
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1)
            
          if (!user) {
            console.log('User not found:', email)
            return null
          }
          
          if (!user.is_active) {
            console.log('User is inactive:', email)
            return null
          }
          
          // Verify password
          const isValidPassword = await verifyPassword(password, user.password_hash)
          if (!isValidPassword) {
            console.log('Invalid password for:', email)
            return null
          }

          console.log('User authenticated successfully:', email)

          // Extract request context for token creation
          const context = NextAuthTokenBridge.extractRequestContext(req)
          context.email = email

          const userObj = {
            id: user.user_id,
            email: user.email,
            name: `${user.first_name} ${user.last_name}`,
            firstName: user.first_name,
            lastName: user.last_name,
            role: 'admin',
            emailVerified: user.email_verified,
            rememberMe: remember || false
          }

          // For now, just log that we would create enterprise tokens
          console.log('NextAuth authentication successful - enterprise token integration ready for:', userObj.email)
          
          return userObj
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days (we'll layer our token management on top)
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/signin',
    error: '/signin?error=true',
  },
  events: {
    signIn: authEvents.signIn,
    signOut: authEvents.signOut,
  },
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      console.log('JWT callback triggered:', { hasUser: !!user, tokenSub: token.sub, trigger })
      
      if (user && trigger === 'signIn') {
        console.log('Initial login - setting user data and creating enterprise tokens for:', user.email)
        
        // Set basic user data
        token.sub = user.id
        token.role = user.role
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.emailVerified = user.emailVerified
        token.rememberMe = user.rememberMe
        
        // Store enterprise tokens if they were created
        if (user.enterpriseAccessToken) {
          token.enterpriseAccessToken = user.enterpriseAccessToken
          token.enterpriseRefreshToken = user.enterpriseRefreshToken
          token.enterpriseSessionId = user.enterpriseSessionId
          console.log('Stored enterprise tokens in JWT for user:', user.email)
        }
      }
      
      return token
    },
    session: async ({ session, token }) => {
      console.log('Session callback triggered:', { hasToken: !!token, tokenSub: token.sub })
      if (token && session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.emailVerified = token.emailVerified as boolean
        
        // Add enterprise tokens to session if available
        if (token.enterpriseAccessToken) {
          session.accessToken = token.enterpriseAccessToken as string
          session.sessionId = token.enterpriseSessionId as string
          session.refreshToken = token.enterpriseRefreshToken as string
          console.log('Added enterprise tokens to session for user:', session.user.email)
        }
        
        console.log('Session created for user:', session.user.email)
      }
      return session
    },
    redirect: async ({ url, baseUrl }) => {
      // Redirect to dashboard after successful login
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return `${baseUrl}/dashboard`
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
}