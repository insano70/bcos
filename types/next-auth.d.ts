import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      firstName: string
      lastName: string
      role: string
      emailVerified: boolean
      practiceId?: string
    }
    accessToken: string
    sessionId: string
    refreshToken?: string
  }

  interface User {
    id: string
    email: string
    name: string
    firstName: string
    lastName: string
    role: string
    emailVerified: boolean
    practiceId?: string
    rememberMe?: boolean
    enterpriseAccessToken?: string
    enterpriseRefreshToken?: string
    enterpriseSessionId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string
    firstName: string
    lastName: string
    emailVerified: boolean
    practiceId?: string
    rememberMe?: boolean
    enterpriseAccessToken?: string
    enterpriseRefreshToken?: string
    enterpriseSessionId?: string
  }
}
