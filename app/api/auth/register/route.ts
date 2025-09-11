import { NextRequest } from 'next/server'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse, ConflictError } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { validateRequest } from '@/lib/api/middleware/validation'
import { registerSchema } from '@/lib/validations/auth'
import { hashPassword } from '@/lib/auth/security'

export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, 'auth')
    
    const validatedData = await validateRequest(request, registerSchema)
    const { email, password, firstName, lastName } = validatedData
    
    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    
    if (existingUser) {
      throw ConflictError('An account with this email already exists')
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password)
    
    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password_hash: hashedPassword,
        first_name: firstName,
        last_name: lastName,
        email_verified: false,
        is_active: true,
      })
      .returning()
    
    if (!newUser) {
      throw new Error('Failed to create user account')
    }

    return createSuccessResponse({
      id: newUser.user_id,
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      emailVerified: newUser.email_verified,
    }, 'Account created successfully')
    
  } catch (error) {
    console.error('Registration error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
