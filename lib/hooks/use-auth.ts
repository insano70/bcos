'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const login = async (email: string, password: string, remember = false) => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    
    if (result?.error) {
      throw new Error(result.error)
    }
    
    return result
  }

  const logout = async () => {
    await signOut({ redirect: false })
    router.push('/signin')
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'
  const user = session?.user

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    session
  }
}
