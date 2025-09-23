# Next.js Application Architecture & Security Implementation Guide

## 1. File System Organization & Code Structure

### Recommended Directory Structure

```
src/
├── app/                          # Next.js 15 App Router
│   ├── (auth)/                   # Route groups for auth pages
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── (dashboard)/              # Protected dashboard routes
│   │   ├── analytics/page.tsx
│   │   ├── settings/page.tsx
│   │   └── profile/page.tsx
│   ├── api/                      # API Routes
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts
│   │   │   ├── register/route.ts
│   │   │   └── logout/route.ts
│   │   ├── users/
│   │   │   ├── [id]/route.ts
│   │   │   └── route.ts
│   │   └── admin/users/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/                   # Reusable UI components
│   ├── ui/
│   ├── forms/
│   └── layout/
├── lib/                          # Utility libraries and configurations
│   ├── auth/                     # Authentication utilities
│   │   ├── config.ts
│   │   ├── jwt.ts
│   │   └── session.ts
│   ├── validations/              # Validation schemas
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   └── common.ts
│   ├── security/                 # Security utilities
│   │   ├── middleware.ts
│   │   ├── csrf.ts
│   │   ├── rate-limiting.ts
│   │   └── password.ts
│   └── utils/
├── middleware.ts                 # Next.js middleware
├── providers/                    # React context providers
└── types/                        # TypeScript type definitions
```

## 2. Scalable API Architecture Breakdown

### Complete API File Organization

```
src/app/api/
├── _shared/                      # Shared API utilities
│   ├── middleware/               # Reusable middleware
│   │   ├── auth.ts              # Authentication middleware
│   │   ├── rateLimit.ts         # Rate limiting middleware
│   │   ├── validation.ts        # Validation middleware
│   │   └── cors.ts              # CORS middleware
│   ├── responses/               # Standardized response handlers
│   │   ├── success.ts           # Success response utilities
│   │   ├── error.ts             # Error response utilities
│   │   └── types.ts             # Response type definitions
│   ├── services/                # Shared business logic
│   │   ├── email.ts             # Email service
│   │   ├── storage.ts           # File storage service
│   │   └── notifications.ts     # Notification service
│   └── utils/                   # API utility functions
│       ├── request.ts           # Request parsing utilities
│       ├── headers.ts           # Header management
│       └── security.ts          # Security utilities
├── auth/                        # Authentication endpoints
│   ├── [...nextauth]/
│   │   └── route.ts
│   ├── register/
│   │   └── route.ts
│   ├── login/
│   │   └── route.ts
│   ├── logout/
│   │   └── route.ts
│   ├── refresh/
│   │   └── route.ts
│   └── verify-email/
│       └── route.ts
├── users/                       # User management
│   ├── route.ts                 # GET /api/users, POST /api/users
│   ├── [id]/
│   │   ├── route.ts             # GET/PUT/DELETE /api/users/[id]
│   │   ├── avatar/
│   │   │   └── route.ts         # POST /api/users/[id]/avatar
│   │   ├── password/
│   │   │   └── route.ts         # PUT /api/users/[id]/password
│   │   └── sessions/
│   │       └── route.ts         # GET /api/users/[id]/sessions
│   ├── me/
│   │   ├── route.ts             # GET/PUT /api/users/me
│   │   └── preferences/
│   │       └── route.ts         # GET/PUT /api/users/me/preferences
│   └── search/
│       └── route.ts             # GET /api/users/search
├── admin/                       # Admin-only endpoints
│   ├── users/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       ├── activate/route.ts
│   │       └── deactivate/route.ts
│   ├── analytics/
│   │   ├── users/route.ts
│   │   └── activity/route.ts
│   └── settings/
│       └── route.ts
├── uploads/                     # File upload endpoints
│   ├── images/
│   │   └── route.ts
│   └── documents/
│       └── route.ts
├── webhooks/                    # External webhook handlers
│   ├── stripe/
│   │   └── route.ts
│   └── resend/
│       └── route.ts
└── health/                      # Health check endpoints
    ├── route.ts                 # Basic health check
    ├── db/
    │   └── route.ts             # Database health
    └── services/
        └── route.ts             # External services health
```

### Shared API Utilities

#### Response Handlers (`app/api/_shared/responses/`)

```typescript
// app/api/_shared/responses/success.ts
export interface SuccessResponse<T = any> {
  success: true
  data: T
  message?: string
  meta?: {
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    timestamp: string
  }
}

export function createSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: Partial<SuccessResponse<T>['meta']>
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  }
  
  return Response.json(response)
}

export function createPaginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): Response {
  return createSuccessResponse(data, undefined, {
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit)
    }
  })
}
```

```typescript
// app/api/_shared/responses/error.ts
export interface ErrorResponse {
  success: false
  error: string
  code?: string
  details?: any
  meta: {
    timestamp: string
    path?: string
  }
}

export class APIError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export function createErrorResponse(
  error: string | Error | APIError,
  statusCode: number = 500,
  request?: Request
): Response {
  let errorMessage: string
  let errorCode: string | undefined
  let errorDetails: any
  
  if (error instanceof APIError) {
    errorMessage = error.message
    statusCode = error.statusCode
    errorCode = error.code
    errorDetails = error.details
  } else if (error instanceof Error) {
    errorMessage = error.message
  } else {
    errorMessage = error
  }
  
  const response: ErrorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode,
    details: errorDetails,
    meta: {
      timestamp: new Date().toISOString(),
      path: request?.url
    }
  }
  
  return Response.json(response, { status: statusCode })
}

// Predefined error types
export const AuthenticationError = (message = 'Authentication required') => 
  new APIError(message, 401, 'AUTHENTICATION_REQUIRED')

export const AuthorizationError = (message = 'Insufficient permissions') => 
  new APIError(message, 403, 'INSUFFICIENT_PERMISSIONS')

export const ValidationError = (details: any, message = 'Validation failed') => 
  new APIError(message, 400, 'VALIDATION_ERROR', details)

export const NotFoundError = (resource = 'Resource') => 
  new APIError(`${resource} not found`, 404, 'RESOURCE_NOT_FOUND')

export const ConflictError = (message = 'Resource already exists') => 
  new APIError(message, 409, 'RESOURCE_CONFLICT')
```

#### Reusable Middleware (`app/api/_shared/middleware/`)

```typescript
// app/api/_shared/middleware/auth.ts
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { AuthenticationError, AuthorizationError } from '../responses/error'

export async function requireAuth(request: Request) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user) {
    throw AuthenticationError()
  }
  
  return session
}

export async function requireRole(request: Request, allowedRoles: string[]) {
  const session = await requireAuth(request)
  
  if (!allowedRoles.includes(session.user.role)) {
    throw AuthorizationError(`Role must be one of: ${allowedRoles.join(', ')}`)
  }
  
  return session
}

export async function requireOwnership(request: Request, resourceUserId: string) {
  const session = await requireAuth(request)
  
  if (session.user.id !== resourceUserId && session.user.role !== 'admin') {
    throw AuthorizationError('You can only access your own resources')
  }
  
  return session
}
```

```typescript
// app/api/_shared/middleware/validation.ts
import { z } from 'zod'
import { ValidationError } from '../responses/error'

export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    const validatedData = schema.parse(body)
    return validatedData
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid request body')
  }
}

export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T {
  try {
    const queryObject = Object.fromEntries(searchParams.entries())
    return schema.parse(queryObject)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid query parameters')
  }
}

export function validateParams<T>(
  params: Record<string, string>,
  schema: z.ZodSchema<T>
): T {
  try {
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid route parameters')
  }
}
```

```typescript
// app/api/_shared/middleware/rateLimit.ts
import { authRateLimiter, apiRateLimiter, getRateLimitKey } from '@/lib/security/rate-limiting'
import { APIError } from '../responses/error'

export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' = 'api'
) {
  const rateLimitKey = getRateLimitKey(request, type)
  let limiter = apiRateLimiter
  
  switch (type) {
    case 'auth':
      limiter = authRateLimiter
      break
    case 'upload':
      limiter = new InMemoryRateLimiter(60 * 1000, 10) // 10 uploads per minute
      break
  }
  
  const result = limiter.checkLimit(rateLimitKey)
  
  if (!result.success) {
    throw new APIError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', {
      resetTime: result.resetTime,
      remaining: result.remaining
    })
  }
  
  return result
}
```

#### Request Utilities (`app/api/_shared/utils/`)

```typescript
// app/api/_shared/utils/request.ts
import { z } from 'zod'

export interface PaginationParams {
  page: number
  limit: number
  offset: number
}

export const paginationSchema = z.object({
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 10)))
})

export function getPagination(searchParams: URLSearchParams): PaginationParams {
  const validated = paginationSchema.parse({
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '10'
  })
  
  return {
    ...validated,
    offset: (validated.page - 1) * validated.limit
  }
}

export function getSearchFilters(searchParams: URLSearchParams) {
  const filters: Record<string, string> = {}
  
  for (const [key, value] of searchParams.entries()) {
    if (!['page', 'limit', 'sort', 'order'].includes(key) && value) {
      filters[key] = value
    }
  }
  
  return filters
}

export interface SortParams {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export function getSortParams(
  searchParams: URLSearchParams,
  allowedFields: string[]
): SortParams {
  const sortBy = searchParams.get('sort') || 'createdAt'
  const sortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
  
  if (!allowedFields.includes(sortBy)) {
    throw ValidationError(null, `Invalid sort field. Allowed: ${allowedFields.join(', ')}`)
  }
  
  return { sortBy, sortOrder }
}
```

### API Route Handler Pattern

```typescript
// Example: app/api/users/route.ts
import type { NextRequest } from 'next/server'
import { rbacRoute, publicRoute } from '@/lib/api/rbac-route-handler'
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors'
import { createSuccessResponse, createErrorResponse, createPaginatedResponse } from '@/lib/api/responses/success'
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation'
import { getPagination, getSortParams } from '@/lib/api/utils/request'
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user'
import type { UserContext } from '@/lib/types/rbac'

// Handler function with full logging and error handling
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  try {
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at'])
    const query = validateQuery(searchParams, userQuerySchema)
    
    // Business logic here...
    const { users, total } = await getUsersWithPagination({
      ...pagination,
      ...sort,
      ...query,
      organizationId: userContext.current_organization_id
    })
    
    return createPaginatedResponse(users, { ...pagination, total })
    
  } catch (error) {
    logger.error('Get users failed', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// STANDARDIZED RBAC ROUTE EXPORTS

// GET /api/users - List users with proper permission checking
export const GET = rbacRoute(
  getUsersHandler,
  {
    permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
    extractResourceId: extractors.userId, // For checking specific user access
    extractOrganizationId: extractors.organizationId, // For org-scoped permissions
    rateLimit: 'api'
  }
)

// POST /api/users - Create user (requires organization admin)
export const POST = rbacRoute(
  createUserHandler,
  {
    permission: 'users:create:organization',
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
)

// Super admin only endpoints use rbacConfigs
export const DELETE = rbacRoute(
  deleteAllUsersHandler,
  {
    ...rbacConfigs.superAdmin, // Requires users:read:all + practices:read:all
    rateLimit: 'api'
  }
)

// Public endpoints (rare, but available)
export const OPTIONS = publicRoute(
  corsHandler,
  'CORS preflight requests must be public',
  { rateLimit: 'api' }
)
```

### RBAC Route Configuration Guide

#### Available Route Wrappers
Use only these two standardized wrappers:

```typescript
// For authenticated endpoints (most common)
export const GET = rbacRoute(handler, options)

// For public endpoints (rare - must justify)
export const GET = publicRoute(handler, reason, options)
```

#### Resource ID Extractors
Import and use standardized extractors from `@/lib/api/utils/rbac-extractors`:

```typescript
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors'

// Available extractors:
extractors.userId         // /api/users/123 → "123"
extractors.practiceId     // /api/practices/abc → "abc"
extractors.staffId        // /api/practices/123/staff/456 → "456"
extractors.chartId        // /api/charts/789 → "789"
extractors.dashboardId    // /api/dashboards/def → "def"
extractors.organizationId // Header or query param → org ID
```

#### Common Permission Patterns

```typescript
// Single user access (owns the resource)
export const GET = rbacRoute(handler, {
  permission: 'users:read:own',
  extractResourceId: extractors.userId,
  rateLimit: 'api'
})

// Multi-level permissions (own OR organization OR all)
export const GET = rbacRoute(handler, {
  permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api'
})

// Practice management with scoping
export const PUT = rbacRoute(handler, {
  permission: ['practices:update:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api'
})

// Super admin endpoints (use pre-configured)
export const DELETE = rbacRoute(handler, {
  ...rbacConfigs.superAdmin, // includes required permissions + requireAllPermissions
  rateLimit: 'api'
})

// Analytics with organization scoping
export const GET = rbacRoute(handler, {
  permission: 'analytics:read:all',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api'
})
```

#### Rate Limiting Tiers

```typescript
rateLimit: 'auth'    // Strictest (login, register, password reset)
rateLimit: 'api'     // Standard (most endpoints)
rateLimit: 'upload'  // Generous (file uploads)
```

#### RBAC Configuration Objects
Pre-configured for common scenarios:

```typescript
// Use these instead of duplicating permission sets
rbacConfigs.superAdmin        // Requires users:read:all + practices:read:all (AND logic)
rbacConfigs.organizationAdmin // Users OR practices admin (OR logic) 
rbacConfigs.practiceManagement // Practice resource + org scoping
rbacConfigs.userManagement     // User resource + org scoping
rbacConfigs.analytics          // Analytics with org scoping
```

### Service Layer Organization

```typescript
// app/api/_shared/services/email.ts
interface EmailTemplate {
  subject: string
  html: string
  text?: string
}

export class EmailService {
  static async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const template = await this.getTemplate('welcome', { name })
    await this.send(email, template)
  }
  
  static async sendPasswordReset(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset?token=${resetToken}`
    const template = await this.getTemplate('password-reset', { resetUrl })
    await this.send(email, template)
  }
  
  private static async send(to: string, template: EmailTemplate): Promise<void> {
    // Implementation with your email provider (Resend, etc.)
  }
  
  private static async getTemplate(name: string, vars: Record<string, string>): Promise<EmailTemplate> {
    // Template loading and variable substitution
  }
}
```

This scalable API architecture provides:

- **Separation of concerns** - Shared utilities, middleware, and services
- **Consistent error handling** - Standardized response formats
- **Reusable middleware** - Authentication, validation, rate limiting
- **Type safety** - Full TypeScript integration
- **Easy testing** - Modular, testable components
- **Maintainability** - Clear file organization and naming conventions

## 3. NextAuth Implementation Strategy

### NextAuth Configuration (`lib/auth/config.ts`)
```typescript
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db/connection"
import CredentialsProvider from "next-auth/providers/credentials"
import { verifyPassword } from "@/lib/security/password"
import { loginSchema } from "@/lib/validations/auth"
import { createId } from "@paralleldrive/cuid2"

export const authConfig = {
  adapter: DrizzleAdapter(db),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const validatedFields = loginSchema.safeParse(credentials)
        if (!validatedFields.success) return null
        
        const { email, password } = validatedFields.data
        
        // Fetch user from database
        const user = await getUserByEmail(email)
        if (!user) return null
        
        // Verify password with bcrypt
        const isValidPassword = await verifyPassword(password, user.password)
        if (!isValidPassword) return null
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    })
  ],
  session: { 
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,    // 24 hours
  },
  pages: {
    signIn: '/auth/login',
    signUp: '/auth/register',
    error: '/auth/error',
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id
        token.role = user.role
        token.jti = createId() // CUID2 for JWT ID
      }
      return token
    },
    session: async ({ session, token }) => {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
      }
      return session
    }
  }
}
```

### Modern JWT Implementation (`lib/auth/jwt.ts`)
```typescript
import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { createId } from '@paralleldrive/cuid2'

const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function signJWT(payload: JWTPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(createId())
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret)
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch {
    return null
  }
}

export async function refreshJWT(token: string): Promise<string | null> {
  const payload = await verifyJWT(token)
  if (!payload) return null
  
  return await signJWT({
    sub: payload.sub,
    email: payload.email,
    role: payload.role
  })
}
```

## 4. World-Class Security Implementation

### Input Validation with Zod (`lib/validations/auth.ts`)
```typescript
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required')
})

export const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain special character'),
  confirmPassword: z.string(),
  name: z.string().min(2).max(100).trim()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain special character'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})
```

### Password Security (`lib/security/password.ts`)
```typescript
import bcrypt from 'bcrypt'
import { createId } from '@paralleldrive/cuid2'

export class PasswordService {
  private static readonly saltRounds = 12
  
  static async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, this.saltRounds)
  }
  
  static async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash)
    } catch {
      return false
    }
  }
}

// Account lockout system
export class AccountSecurity {
  private static failedAttempts = new Map<string, { count: number; lastAttempt: number }>()
  private static readonly maxFailedAttempts = 5
  private static readonly lockoutDuration = 15 * 60 * 1000 // 15 minutes
  
  static isAccountLocked(identifier: string): boolean {
    const attempts = this.failedAttempts.get(identifier)
    if (!attempts) return false
    
    const now = Date.now()
    if (now - attempts.lastAttempt > this.lockoutDuration) {
      this.failedAttempts.delete(identifier)
      return false
    }
    
    return attempts.count >= this.maxFailedAttempts
  }
  
  static recordFailedAttempt(identifier: string): void {
    const now = Date.now()
    const existing = this.failedAttempts.get(identifier)
    
    if (existing && now - existing.lastAttempt < this.lockoutDuration) {
      existing.count++
      existing.lastAttempt = now
    } else {
      this.failedAttempts.set(identifier, { count: 1, lastAttempt: now })
    }
  }
  
  static clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier)
  }
}

export const verifyPassword = PasswordService.verify
export const hashPassword = PasswordService.hash
```

### Rate Limiting (`lib/security/rate-limiting.ts`)
```typescript
interface RateLimitEntry {
  count: number
  resetTime: number
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private windowMs: number
  private maxRequests: number
  
  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }
  
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }
  
  checkLimit(identifier: string): { success: boolean; remaining: number; resetTime: number } {
    const now = Date.now()
    const resetTime = now + this.windowMs
    const existing = this.store.get(identifier)
    
    if (!existing || now > existing.resetTime) {
      this.store.set(identifier, { count: 1, resetTime })
      return { success: true, remaining: this.maxRequests - 1, resetTime }
    }
    
    existing.count++
    const remaining = Math.max(0, this.maxRequests - existing.count)
    
    return {
      success: existing.count <= this.maxRequests,
      remaining,
      resetTime: existing.resetTime
    }
  }
}

// Rate limiter instances
export const globalRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 100) // 100 req/15min
export const authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 5)     // 5 req/15min
export const apiRateLimiter = new InMemoryRateLimiter(60 * 1000, 30)          // 30 req/min

export function getRateLimitKey(request: Request, prefix = ''): string {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'anonymous'
  return prefix ? `${prefix}:${ip}` : ip
}

export function addRateLimitHeaders(response: Response, result: { remaining: number; resetTime: number }): void {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
}
```

### CSRF Protection (`lib/security/csrf.ts`)
```typescript
import { nanoid } from 'nanoid'
import { cookies } from 'next/headers'

export class CSRFProtection {
  private static readonly tokenLength = 64
  private static readonly cookieName = 'csrf-token'
  
  static generateToken(): string {
    return nanoid(this.tokenLength)
  }
  
  static async setCSRFToken(): Promise<string> {
    const token = this.generateToken()
    const cookieStore = cookies()
    
    cookieStore.set(this.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
    })
    
    return token
  }
  
  static async verifyCSRFToken(token: string): Promise<boolean> {
    const cookieStore = cookies()
    const storedToken = cookieStore.get(this.cookieName)?.value
    
    return storedToken === token && token.length === this.tokenLength
  }
}
```

### Security Middleware (`middleware.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth/jwt'
import { globalRateLimiter, getRateLimitKey } from '@/lib/security/rate-limiting'

// In-memory rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // 1. Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // 2. Rate limiting
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'anonymous'
  const rateLimitResult = globalRateLimiter.checkLimit(ip)
  
  if (!rateLimitResult.success) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }
  
  // 3. Authentication check for protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('next-auth.session-token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    
    const payload = await verifyJWT(token)
    if (!payload) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }
  
  // 4. CSRF protection for state-changing operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const csrfToken = request.headers.get('x-csrf-token')
    const sessionCsrf = request.cookies.get('csrf-token')?.value
    
    if (!csrfToken || csrfToken !== sessionCsrf) {
      return new NextResponse('CSRF Token Mismatch', { status: 403 })
    }
  }
  
  // 5. Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
  )
  
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/api/:path*',
    '/dashboard/:path*'
  ]
}
```

### Secure API Route Example (`app/api/auth/register/route.ts`)
```typescript
import { NextRequest } from 'next/server'
import { registerSchema } from '@/lib/validations/auth'
import { hashPassword } from '@/lib/security/password'
import { authRateLimiter, getRateLimitKey, addRateLimitHeaders } from '@/lib/security/rate-limiting'
import { createId } from '@paralleldrive/cuid2'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitKey = getRateLimitKey(request, 'auth')
    const rateLimitResult = authRateLimiter.checkLimit(rateLimitKey)
    
    if (!rateLimitResult.success) {
      const response = Response.json({ error: 'Too many requests' }, { status: 429 })
      addRateLimitHeaders(response, rateLimitResult)
      return response
    }
    
    // Input validation
    const body = await request.json()
    const validatedData = registerSchema.safeParse(body)
    
    if (!validatedData.success) {
      return Response.json({ 
        error: 'Validation failed', 
        details: validatedData.error.errors 
      }, { status: 400 })
    }
    
    const { email, password, name } = validatedData.data
    
    // Check if user exists (implement your database logic)
    const existingUser = await checkUserExists(email)
    if (existingUser) {
      return Response.json({ error: 'User already exists' }, { status: 409 })
    }
    
    // Hash password and create user
    const hashedPassword = await hashPassword(password)
    const userId = createId()
    
    const user = await createUser({
      id: userId,
      email,
      password: hashedPassword,
      name
    })
    
    const response = Response.json({ 
      success: true,
      data: { user: { id: user.id, email: user.email, name: user.name } }
    }, { status: 201 })
    
    addRateLimitHeaders(response, rateLimitResult)
    return response
    
  } catch (error) {
    console.error('Registration error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Implement these functions with your database
async function checkUserExists(email: string): Promise<boolean> {
  // Your database logic here
  return false
}

async function createUser(userData: any): Promise<any> {
  // Your database logic here
  return userData
}
```

## 5. Required Dependencies

### Additional Dependencies to Install

```json
{
  "dependencies": {
    "@auth/drizzle-adapter": "^1.7.4",
    "@hookform/resolvers": "^3.10.0",
    "@paralleldrive/cuid2": "^2.2.2",
    "iron-session": "^8.0.6",
    "jose": "^5.9.6",
    "nanoid": "^5.0.9",
    "resend": "^4.0.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "msw": "^2.8.3",
    "playwright": "^1.49.0"
  }
}
```

## 6. Environment Variables

```env
# Authentication
NEXTAUTH_SECRET=your-super-secret-32-char-string-here
NEXTAUTH_URL=http://localhost:3000
JWT_SECRET=another-super-secret-32-char-string

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database

# Security
CSRF_SECRET=32-character-csrf-secret-string
BCRYPT_ROUNDS=12

# Email (optional - gracefully degrades without API key)
EMAIL_FROM=noreply@yourdomain.com

# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Install new dependencies
2. File restructuring according to architecture
3. NextAuth with Drizzle setup
4. Basic Zod validation schemas
5. In-memory rate limiting

### Phase 2: Security Core (Week 2-3)
1. Enhanced bcrypt password security
2. Security middleware implementation
3. JOSE JWT implementation
4. CSRF protection
5. Input sanitization

### Phase 3: Enhanced Security (Week 3-4)
1. Account lockout system
2. Advanced rate limiting
3. Security headers and CSP
4. Error handling and logging
5. Session management

### Phase 4: Testing & Production (Week 4+)
1. Security testing with Playwright
2. Performance optimization
3. Production configuration
4. Documentation
5. Security audit

## 8. Security Checklist

### Pre-Production Security Audit
- [ ] Password hashing with bcrypt (12+ rounds)
- [ ] JWT tokens properly signed and verified
- [ ] Account lockout after failed attempts
- [ ] All API endpoints use Zod validation
- [ ] Rate limiting on all endpoints
- [ ] CSRF protection on state-changing operations
- [ ] Security headers implemented
- [ ] HTTPS enforced in production
- [ ] Environment variables secured
- [ ] Error messages sanitized

This architecture provides a secure, scalable foundation for your Next.js application with modern security practices and proven technologies.