# Complete Authentication & Authorization Flow

## Overview

This document describes the complete authentication and authorization flow for the BCOS application, including CSRF protection, token management, and session handling from initial page load through logout.

## Architecture Components

### Core Technologies
- **JWT Tokens**: Access (15min) and Refresh (30 days) tokens stored in httpOnly cookies
- **CSRF Protection**: Anonymous tokens for login, authenticated tokens for API calls
- **RBAC System**: Role-Based Access Control with permissions and organization scoping
- **Edge Runtime**: Middleware-level security using Web Crypto API
- **Session Management**: Database-tracked sessions with device fingerprinting

### Security Layers
1. **Middleware Layer**: CSRF protection, request sanitization, security headers
2. **Route Layer**: RBAC permission checking, rate limiting
3. **Handler Layer**: Business logic, input validation, audit logging

---

## Phase 1: Initial Page Load (Unauthenticated User)

### 1.1 Page Access Attempt
```
User visits protected page → /dashboard
```

### 1.2 Middleware Authentication Check
```typescript
// middleware.ts
const accessToken = request.cookies.get('access-token')?.value
if (!accessToken) {
  // No authentication found
  const signInUrl = new URL('/signin', request.url)
  signInUrl.searchParams.set('callbackUrl', '/dashboard')
  return NextResponse.redirect(signInUrl)
}
```

### 1.3 Login Page Load
```
Browser redirects to: /signin?callbackUrl=%2Fdashboard
Login page component mounts
```

### 1.4 Auth Provider Initialization
```typescript
// rbac-auth-provider.tsx - useEffect runs
useEffect(() => {
  initializeAuth()
}, [])

const initializeAuth = async () => {
  try {
    await refreshToken() // Attempts to refresh existing session
  } catch (error) {
    // No active session found - normal for first visit
    setState({ isAuthenticated: false, isLoading: false })
  }
}
```

---

## Phase 2: CSRF Token Acquisition

### 2.1 Frontend CSRF Request
```typescript
// Called when login form needs CSRF token
const ensureCsrfToken = async () => {
  if (state.csrfToken) return state.csrfToken

  const resp = await fetch('/api/csrf', { 
    method: 'GET', 
    credentials: 'include' 
  })
  const json = await resp.json()
  const token = json?.data?.csrfToken || null
  setState(prev => ({ ...prev, csrfToken: token }))
  return token
}
```

### 2.2 CSRF Endpoint Processing
```typescript
// /api/csrf (public route)
const getCSRFTokenHandler = async (request: NextRequest) => {
  // Check authentication status
  let session = null
  let isAuthenticated = false
  try {
    session = await requireAuth(request)
    isAuthenticated = true
  } catch {
    isAuthenticated = false  // Normal for login page
  }

  if (isAuthenticated && session?.user?.id) {
    // Authenticated user gets authenticated token
    token = await CSRFProtection.setCSRFToken(session.user.id)
    tokenType = 'authenticated'
  } else {
    // Unauthenticated user gets anonymous token
    token = await EdgeCSRFProtection.generateAnonymousToken(request)
    tokenType = 'anonymous'
    
    // Token payload:
    // {
    //   type: 'anonymous',
    //   ip: 'localhost',  // Normalized from ::1
    //   userAgent: 'Mozilla/5.0...',
    //   timeWindow: 1953660,  // 15-min window in dev
    //   nonce: 'abc12345'
    // }
  }

  // Set cookie that JavaScript can read
  response.cookies.set('csrf-token', token, {
    httpOnly: false,  // Must be readable by JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: tokenType === 'anonymous' ? 3600 : 86400,
    path: '/'
  })

  return { csrfToken: token }
}
```

---

## Phase 3: Login Process

### 3.1 User Submits Credentials
```typescript
// login-form.tsx
const onSubmit = async (data) => {
  await login(data.email, data.password, data.remember)
}
```

### 3.2 Frontend Login Request
```typescript
// rbac-auth-provider.tsx
const login = async (email: string, password: string, remember = false) => {
  const csrfToken = (await ensureCsrfToken()) || ''
  
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken  // Anonymous CSRF token
    },
    body: JSON.stringify({ email, password, remember }),
    credentials: 'include'  // Sends csrf-token cookie
  })
}
```

### 3.3 Middleware CSRF Validation
```typescript
// middleware.ts
if (EdgeCSRFProtection.requiresCSRFProtection('POST') && !isCSRFExempt('/api/auth/login')) {
  const isValidCSRF = await EdgeCSRFProtection.verifyCSRFToken(request)
  
  // For /api/auth/login:
  // 1. Detects isAnonymousEndpoint = true
  // 2. Calls validateAnonymousToken(request, headerToken)
  // 3. Uses Web Crypto API to verify signature
  // 4. Validates IP, UserAgent, timeWindow match
  
  if (!isValidCSRF) {
    return new NextResponse(
      JSON.stringify({ error: 'CSRF token validation failed' }), 
      { status: 403 }
    )
  }
}
```

### 3.4 Login Endpoint Processing
```typescript
// /api/auth/login (publicRoute)
const loginHandler = async (request: NextRequest) => {
  // Rate limiting
  await applyRateLimit(request, 'auth')
  
  // Input validation
  const { email, password, remember } = await validateRequest(request, loginSchema)
  
  // Account security checks
  if (await AccountSecurity.isAccountLocked(email)) {
    return createErrorResponse('Account temporarily locked', 429, request)
  }
  
  // Find user
  const [user] = await db.select().from(users).where(eq(users.email, email))
  if (!user) {
    await AccountSecurity.recordFailedAttempt(email)
    return createErrorResponse('Invalid credentials', 401, request)
  }
  
  // Verify password
  const isValidPassword = await verifyPassword(password, user.password_hash)
  if (!isValidPassword) {
    await AccountSecurity.recordFailedAttempt(email)
    return createErrorResponse('Invalid credentials', 401, request)
  }
  
  // Clear failed attempts
  AccountSecurity.clearFailedAttempts(email)
  
  // Generate device fingerprint
  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const deviceFingerprint = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)
  const deviceName = TokenManager.generateDeviceName(userAgent)
  
  const deviceInfo = { ipAddress, userAgent, fingerprint: deviceFingerprint, deviceName }
  
  // Load user RBAC context
  const userContext = await getUserContextSafe(user.user_id)
  
  // Create JWT token pair
  const tokenPair = await TokenManager.createTokenPair(
    user.user_id,
    deviceInfo,
    remember || false,
    email
  )
  
  // Set secure httpOnly cookies
  const cookieStore = await cookies()
  const maxAge = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60
  
  // Refresh token (long-lived)
  cookieStore.set('refresh-token', tokenPair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge
  })
  
  // Access token (short-lived)
  cookieStore.set('access-token', tokenPair.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60  // 15 minutes
  })
  
  // Generate new authenticated CSRF token
  const csrfToken = await CSRFProtection.setCSRFToken(user.user_id)
  
  // Audit logging
  await AuditLogger.logAuth({
    action: 'login',
    userId: user.user_id,
    ipAddress,
    userAgent,
    metadata: { sessionId: tokenPair.sessionId, rememberMe: remember }
  })
  
  return createSuccessResponse({
    user: {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: primaryRole,
      emailVerified: user.email_verified,
      roles: userRoles,
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    },
    accessToken: tokenPair.accessToken,
    sessionId: tokenPair.sessionId,
    expiresAt: tokenPair.expiresAt.toISOString(),
    csrfToken  // New authenticated CSRF token
  }, 'Login successful')
}
```

---

## Phase 4: Post-Login State Management

### 4.1 Frontend State Update
```typescript
// rbac-auth-provider.tsx
const result = await response.json()

setState(prev => ({
  ...prev,
  user: result.data.user,
  sessionId: result.data.sessionId,
  isLoading: false,
  isAuthenticated: true,
  csrfToken: result.data.csrfToken,  // Store new authenticated token
  userContext: null  // Will be loaded by useEffect
}))
```

### 4.2 User Context Loading
```typescript
// Triggered by useEffect when user is set
const loadUserContext = async () => {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include'  // Uses access-token cookie
  })
  
  const data = await response.json()
  
  // Transform to UserContext format
  const userContext: UserContext = {
    user_id: apiUser.id,
    email: apiUser.email,
    first_name: apiUser.firstName,
    last_name: apiUser.lastName,
    current_organization_id: apiUser.currentOrganizationId,
    is_super_admin: apiUser.isSuperAdmin,
    roles: apiUser.roles,
    all_permissions: apiUser.permissions,
    organizations: apiUser.organizations
  }
  
  setState(prev => ({ ...prev, userContext }))
}
```

### 4.3 Redirect to Intended Page
```typescript
// login-form.tsx
window.location.href = callbackUrl  // Hard redirect to /dashboard
```

---

## Phase 5: Authenticated API Operations

### 5.1 Making Authenticated Requests
```typescript
// Frontend API calls
fetch('/api/practices', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': state.csrfToken  // Authenticated CSRF token
  },
  body: JSON.stringify(practiceData),
  credentials: 'include'  // Includes access-token cookie
})
```

### 5.2 Middleware Processing
```typescript
// middleware.ts - CSRF validation
if (EdgeCSRFProtection.requiresCSRFProtection('POST') && !isCSRFExempt('/api/practices')) {
  const isValidCSRF = await EdgeCSRFProtection.verifyCSRFToken(request)
  
  // For authenticated endpoints (/api/practices):
  // 1. Checks token is NOT anonymous type (security boundary)
  // 2. Uses double-submit cookie pattern (header === cookie)
  // 3. Simple string comparison for authenticated tokens
  
  if (!isValidCSRF) {
    return NextResponse.json({ error: 'CSRF token validation failed' }, { status: 403 })
  }
}

// Request sanitization
if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
  const body = await request.clone().json()
  const sanitizationResult = await sanitizeRequestBody(body, logger)
  if (!sanitizationResult.isValid) {
    return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
  }
}
```

### 5.3 API Route Processing
```typescript
// /api/practices/route.ts
export const POST = rbacRoute(
  createPracticeHandler,
  {
    permission: 'practices:create:organization',
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
)

// rbacRoute processing:
// 1. Apply rate limiting
// 2. Apply global authentication (validates access-token cookie)
// 3. Get user context (roles, permissions, organizations)
// 4. Apply RBAC middleware (check permissions)
// 5. Call handler if all checks pass
```

---

## Phase 6: Token Refresh Cycle

### 6.1 Access Token Expiration Detection
```typescript
// API request returns 401 Unauthorized
// Auth provider automatically triggers refresh
useEffect(() => {
  if (user && !isLoading) {
    // Periodically check token validity
    const checkTokenValidity = async () => {
      try {
        await fetch('/api/auth/me', { credentials: 'include' })
      } catch (error) {
        // Token expired, trigger refresh
        await refreshToken()
      }
    }
  }
}, [user, isLoading])
```

### 6.2 Frontend Refresh Request
```typescript
// rbac-auth-provider.tsx
const refreshToken = async () => {
  const csrfToken = state.csrfToken || (await ensureCsrfToken()) || ''
  
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken  // Current authenticated CSRF token
    },
    credentials: 'include'  // Includes refresh-token cookie
  })
  
  if (!response.ok) {
    // Refresh failed - user needs to login again
    setState({ user: null, isAuthenticated: false, csrfToken: null })
    return
  }

  const result = await response.json()
  setState(prev => ({
    ...prev,
    user: result.data.user,
    sessionId: result.data.sessionId,
    csrfToken: result.data.csrfToken,  // New authenticated token
    isAuthenticated: true
  }))
}
```

### 6.3 Refresh Endpoint Processing
```typescript
// /api/auth/refresh (requires CSRF protection)
const refreshHandler = async (request: NextRequest) => {
  // Middleware has already validated CSRF token (authenticated type)
  
  // Extract refresh token from httpOnly cookie
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh-token')?.value
  
  if (!refreshToken) {
    return createErrorResponse('No refresh token provided', 401, request)
  }
  
  // Validate refresh token JWT
  const { jwtVerify } = await import('jose')
  const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
  const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
  const userId = payload.sub as string
  
  // Get user from database
  const [user] = await db.select().from(users).where(eq(users.user_id, userId))
  if (!user || !user.is_active) {
    return createErrorResponse('Invalid user', 401, request)
  }
  
  // Generate device info
  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const deviceInfo = {
    ipAddress,
    userAgent,
    fingerprint: TokenManager.generateDeviceFingerprint(ipAddress, userAgent),
    deviceName: TokenManager.generateDeviceName(userAgent)
  }
  
  // Rotate tokens (invalidates old refresh token, creates new pair)
  const tokenPair = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)
  
  // Load user RBAC context
  const userContext = await getUserContextSafe(user.user_id)
  
  // Set new cookies
  cookieStore.set('refresh-token', tokenPair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60  // 30 days
  })
  
  cookieStore.set('access-token', tokenPair.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60  // 15 minutes
  })
  
  // Generate new authenticated CSRF token
  const csrfToken = await CSRFProtection.setCSRFToken(user.user_id)
  
  // Audit logging
  await AuditLogger.logAuth({
    action: 'token_refresh',
    userId: user.user_id,
    ipAddress,
    userAgent,
    metadata: { sessionId: tokenPair.sessionId }
  })
  
  return createSuccessResponse({
    user: {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: primaryRole,
      emailVerified: user.email_verified,
      roles: userRoles,
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    },
    accessToken: tokenPair.accessToken,
    expiresAt: tokenPair.expiresAt.toISOString(),
    sessionId: tokenPair.sessionId,
    csrfToken  // New authenticated CSRF token
  }, 'Tokens refreshed successfully')
}
```

---

## Phase 7: Logout Process

### 7.1 User Initiates Logout
```typescript
// User clicks logout button
logout()
```

### 7.2 Frontend Logout Request
```typescript
// rbac-auth-provider.tsx
const logout = async () => {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'x-csrf-token': state.csrfToken  // Current authenticated token
      },
      credentials: 'include'
    })

    // Clear state regardless of response
    setState({
      user: null,
      sessionId: null,
      isAuthenticated: false,
      csrfToken: null,  // Clear for next login
      userContext: null,
      rbacLoading: false,
      rbacError: null
    })
  } catch (error) {
    // Clear state even if logout fails
    setState({ /* same as above */ })
  }
}
```

### 7.3 Logout Endpoint Processing
```typescript
// /api/auth/logout (requires CSRF protection)
const logoutHandler = async (request: NextRequest) => {
  // Middleware validates authenticated CSRF token
  
  // Get refresh token to invalidate
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh-token')?.value
  
  if (refreshToken) {
    // Revoke refresh token in database
    await TokenManager.revokeRefreshToken(refreshTokenId, 'user_logout')
  }
  
  // Clear all authentication cookies
  cookieStore.delete('refresh-token')
  cookieStore.delete('access-token')
  cookieStore.delete('csrf-token')
  
  // Audit logging
  await AuditLogger.logAuth({
    action: 'logout',
    userId: session?.user?.id,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown'
  })
  
  return createSuccessResponse({}, 'Logout successful')
}
```

---

## Token Expiration Scenarios

### Access Token Expiration (15 minutes)
1. **API request fails** with 401 Unauthorized
2. **Auth provider detects failure** → Automatically calls `refreshToken()`
3. **If refresh succeeds** → Original request retried with new token
4. **If refresh fails** → User redirected to login

### Refresh Token Expiration (30 days)
1. **Refresh request fails** with 401 Unauthorized
2. **Auth provider clears state** → `isAuthenticated = false`
3. **Middleware detects no access token** → Redirects to `/signin`
4. **User must login again** → Fresh token pair generated

### CSRF Token Expiration
- **Anonymous tokens** (1 hour): Frontend automatically fetches new token from `/api/csrf`
- **Authenticated tokens** (24 hours): Provided automatically during token refresh

---

## Security Boundaries

### CSRF Token Scope Validation
```typescript
// Anonymous tokens (from EdgeCSRFProtection.generateAnonymousToken)
// ✅ ONLY work on: /api/auth/login, /api/auth/register, /api/auth/forgot-password
// ❌ REJECTED on: All other endpoints

// Authenticated tokens (from CSRFProtection.setCSRFToken)  
// ✅ Work on: All endpoints (when user has valid session)
// ❌ REJECTED on: Anonymous-only endpoints if used improperly
```

### Cookie Security
```typescript
// refresh-token: httpOnly, secure, sameSite=strict, 30 days
// access-token:  httpOnly, secure, sameSite=strict, 15 minutes  
// csrf-token:    readable by JS, secure, sameSite=strict, varies by type
```

### Permission Enforcement
```typescript
// Every API endpoint uses rbacRoute with specific permissions
export const GET = rbacRoute(handler, {
  permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api'
})
```

---

## Error Handling & Edge Cases

### Invalid CSRF Token
- **Anonymous endpoint + invalid anonymous token** → 403 Forbidden, user must refresh page
- **Authenticated endpoint + invalid token** → 403 Forbidden, user must refresh token

### Session Hijacking Protection
- **Device fingerprinting** ties tokens to specific browser/IP combinations
- **Token rotation** on every refresh invalidates old tokens
- **Audit logging** tracks all authentication events

### Rate Limiting
- **Login attempts**: `auth` tier (strictest)
- **API requests**: `api` tier (standard)  
- **File uploads**: `upload` tier (generous)

### Account Security
- **Failed login attempts** → Progressive delays and account locking
- **Suspicious activity** → Security event logging and monitoring
- **Password requirements** → Enforced via validation schemas

---

## Development vs Production

### Development Environment
- **Longer time windows** for CSRF tokens (15 minutes vs 5 minutes)
- **Enhanced debugging** with detailed console logs
- **Relaxed security** for localhost variations (::1 → localhost)

### Production Environment
- **Strict time windows** for all tokens
- **HTTPS-only cookies** with secure flag
- **Minimal error exposure** (no stack traces)
- **Enhanced monitoring** and alerting

---

## Monitoring & Observability

### Audit Events Logged
- `login` - Successful authentication
- `logout` - User-initiated logout  
- `token_refresh` - Automatic token rotation
- `token_refresh_failed` - Failed refresh attempts
- `csrf_validation_failed` - CSRF protection triggered

### Performance Metrics
- `total_login_duration` - End-to-end login time
- `csrf_validation` - CSRF token validation time
- `rbac_permission_check` - Permission verification time
- `token_generation` - JWT creation time

### Security Events
- `csrf_validation_failed` - CSRF attacks detected
- `anonymous_token_on_protected_endpoint` - Token scope violations
- `account_locked` - Brute force protection triggered
- `suspicious_login` - Unusual authentication patterns

This comprehensive flow ensures secure, auditable, and maintainable authentication throughout the entire user journey.
