import { NextRequest } from 'next/server';
import { db, users } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql, like } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, ConflictError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user';
import { hashPassword } from '@/lib/auth/password';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at'])
    const query = validateQuery(searchParams, userQuerySchema)
    
    // Build where conditions
    const whereConditions = [isNull(users.deleted_at)]
    if (query.is_active !== undefined) {
      whereConditions.push(eq(users.is_active, query.is_active))
    }
    if (query.email_verified !== undefined) {
      whereConditions.push(eq(users.email_verified, query.email_verified))
    }
    if (query.search) {
      whereConditions.push(
        like(users.first_name, `%${query.search}%`),
        like(users.last_name, `%${query.search}%`),
        like(users.email, `%${query.search}%`)
      )
    }
    
    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...whereConditions))
    
    // Get paginated data
    const usersData = await db
      .select({
        id: users.user_id,
        first_name: users.first_name,
        last_name: users.last_name,
        email: users.email,
        email_verified: users.email_verified,
        is_active: users.is_active,
        created_at: users.created_at,
      })
      .from(users)
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(users[sort.sortBy as keyof typeof users]) : desc(users[sort.sortBy as keyof typeof users]))
      .limit(pagination.limit)
      .offset(pagination.offset)

    return createPaginatedResponse(usersData, {
      page: pagination.page,
      limit: pagination.limit,
      total: count
    })
    
  } catch (error) {
    console.error('Error fetching users:', error)
    return createErrorResponse(error, 500, request)
  }
}

export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    
    const validatedData = await validateRequest(request, userCreateSchema)
    const { email, password, first_name, last_name, email_verified, is_active } = validatedData

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existingUser) {
      throw ConflictError('A user with this email already exists')
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password_hash: hashedPassword,
        first_name,
        last_name,
        email_verified: email_verified || false,
        is_active: is_active || true,
      })
      .returning()

    return createSuccessResponse({
      id: newUser.user_id,
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      email_verified: newUser.email_verified,
      is_active: newUser.is_active,
      created_at: newUser.created_at,
    }, 'User created successfully')
    
  } catch (error) {
    console.error('Error creating user:', error)
    return createErrorResponse(error, 500, request)
  }
}
