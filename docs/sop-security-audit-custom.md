# BCOS Next.js Security Audit Guide - HIPAA/PHI/PII Compliance

## Executive Summary

This security audit guide is tailored specifically for the BCOS (Bend Care Operating System) Next.js application. The application implements dual authentication (OIDC + password), comprehensive RBAC, enterprise-grade token management, and multiple security layers to protect Protected Health Information (PHI) and Personally Identifiable Information (PII) in compliance with HIPAA requirements.

**Key Security Features Implemented:**
- Dual authentication: Microsoft Entra OIDC + password-based login
- JWT-based token management with refresh token rotation
- Role-Based Access Control (RBAC) with granular permissions
- Comprehensive CSRF protection (anonymous + authenticated tokens)
- Multi-layer rate limiting (global, auth, API-specific)
- Security headers with strict CSP and nonces
- Account lockout and brute force protection
- Audit logging for all authentication and PHI access
- Device fingerprinting for session hijacking prevention
- AWS WAF protection with OWASP rule sets

**Current Security Gaps (High Priority):**
1. Multi-Factor Authentication (MFA) - NOT IMPLEMENTED
2. PHI Data-at-Rest Encryption - NOT IMPLEMENTED
3. Emergency Access Procedure - NOT IMPLEMENTED

---

## Table of Contents

1. [Introduction & Audit Principles](#1-introduction--audit-principles)
2. [Authentication Systems](#2-authentication-systems)
3. [Authorization & RBAC](#3-authorization--rbac)
4. [Session & Token Management](#4-session--token-management)
5. [Security Headers & Policies](#5-security-headers--policies)
6. [CSRF & Attack Prevention](#6-csrf--attack-prevention)
7. [Input Validation & Sanitization](#7-input-validation--sanitization)
8. [Database Security](#8-database-security)
9. [Infrastructure Security (AWS)](#9-infrastructure-security-aws)
10. [Environment & Configuration](#10-environment--configuration)
11. [Rate Limiting & DoS Protection](#11-rate-limiting--dos-protection)
12. [Logging & Monitoring](#12-logging--monitoring)
13. [OWASP Top 10 Coverage](#13-owasp-top-10-coverage)
14. [Critical Flow Verification](#14-critical-flow-verification)
15. [Compliance Checklist](#15-compliance-checklist)
16. [Identified Security Gaps](#16-identified-security-gaps)

---

## 1. Introduction & Audit Principles

### Audit Objectives
- Verify HIPAA compliance through code inspection
- Validate PHI/PII protection mechanisms
- Identify security vulnerabilities and gaps
- Document remediation recommendations

### Audit Principles
✅ **Verify actual implementation** - Never trust documentation
✅ **Trace complete flows** - From entry to database and back
✅ **Cross-verify controls** - Multiple security layers
✅ **Assume adversarial mindset** - Think like an attacker
✅ **Document with evidence** - File paths and line numbers

### HIPAA Security Rule Requirements
- **Access Controls**: Preventing unauthorized PHI/PII access
- **Audit Controls**: Tracking all PHI/PII access and modifications
- **Integrity Controls**: Data not improperly altered or destroyed
- **Transmission Security**: Protecting PHI/PII during transmission
- **Authentication**: Verifying user identity

---

## 2. Authentication Systems

### 2.1 OIDC (Microsoft Entra) Authentication

#### Files to Examine
```
/lib/oidc/client.ts                      - OIDC client configuration
/lib/oidc/database-state-manager.ts      - State token management
/app/api/auth/oidc/login/route.ts        - Login initiation
/app/api/auth/oidc/callback/route.ts     - Callback handler
/app/api/auth/oidc/logout/route.ts       - Logout handler
/lib/oidc/types.ts                       - Type definitions
```

#### Step 1: OIDC Configuration
**Location**: `/lib/oidc/client.ts`

**Verify**:
- ✅ HTTPS-only authority (Microsoft Entra ID)
- ✅ Client ID/secret from environment (`getOIDCConfig()`)
- ✅ Redirect URI validation
- ✅ Scopes: `openid`, `profile`, `email`
- ✅ Authorization code flow (not implicit)
- ✅ PKCE with S256 code challenge

**Evidence**:
```typescript
// /lib/oidc/client.ts - PKCE implementation
const codeVerifier = crypto.randomBytes(32).toString('base64url')
const codeChallenge = crypto.createHash('sha256')
  .update(codeVerifier)
  .digest('base64url')
```

#### Step 2: State Token Management (CRITICAL)
**Location**: `/lib/oidc/database-state-manager.ts`

**Verify**:
- ✅ State tokens: `crypto.randomBytes(32)` (cryptographically random)
- ✅ Database-backed validation (horizontal scaling support)
- ✅ 5-minute expiration
- ✅ One-time use enforced via `validateAndMarkUsed()`
- ✅ Replay attack prevention
- ✅ Audit logging for validation failures

**Evidence**:
```typescript
// State marked as used - prevents replay attacks
await db.update(oidc_states)
  .set({ used_at: new Date(), is_used: true })
  .where(eq(oidc_states.state_token, state))
```

#### Step 3: Session Encryption
**Location**: `/app/api/auth/oidc/login/route.ts` and callback

**Verify**:
- ✅ iron-session encryption (AES)
- ✅ Session secret: `OIDC_SESSION_SECRET` (32+ chars)
- ✅ Session data: state, nonce, codeVerifier, fingerprint
- ✅ httpOnly and secure cookies
- ✅ One-time use (deleted after callback)

#### Step 4: Device Fingerprinting
**Location**: `/app/api/auth/oidc/callback/route.ts`

**Verify**:
- ✅ Fingerprint: SHA-256(IP + User-Agent)
- ✅ Validated during callback
- ✅ Strict mode: `OIDC_STRICT_FINGERPRINT=true`
- ✅ Session hijack detection and auditing

**Evidence**:
```typescript
// Session hijack detection
if (sessionData.fingerprint !== currentFingerprint) {
  log.error('OIDC session hijack attempt detected')
  await AuditLogger.logAuth({
    action: 'login_failed',
    metadata: { alert: 'SESSION_HIJACK_ATTEMPT' }
  })
}
```

#### Step 5: ID Token Validation
**Location**: `/lib/oidc/client.ts` - `handleCallback()`

**Verify**:
- ✅ Signature verification (JWKS from Microsoft Entra)
- ✅ `iss` claim matches authority
- ✅ `aud` claim matches client ID
- ✅ `exp`, `iat`, `nonce` validated
- ✅ `email_verified` claim checked
- ✅ Handled by openid-client library

#### Step 6: Email Domain Validation
**Location**: `/app/api/auth/oidc/callback/route.ts`

**Verify**:
- ✅ Domain extracted from email
- ✅ Validated against `OIDC_ALLOWED_EMAIL_DOMAINS`
- ✅ Case-insensitive comparison
- ✅ Access denied if domain not allowed

### 2.2 Password Authentication

#### Files to Examine
```
/app/api/auth/login/route.ts             - Login endpoint
/lib/auth/password.ts                    - Password hashing
/lib/auth/security.ts                    - Account lockout
/lib/validations/auth.ts                 - Input validation
```

#### Step 7: Password Hashing
**Location**: `/lib/auth/password.ts`

**Verify**:
- ✅ bcrypt with cost factor 12
- ✅ No deprecated algorithms (MD5, SHA-1)
- ✅ Timing-safe comparison via `bcrypt.compare()`

**Evidence**:
```typescript
// /lib/auth/password.ts
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return await bcrypt.hash(password, saltRounds)
}
```

#### Step 8: Account Lockout
**Location**: `/lib/auth/security.ts` and `/app/api/auth/login/route.ts`

**Verify**:
- ✅ Failed attempts tracked in database
- ✅ Lockout after threshold (check implementation)
- ✅ Time-based unlock
- ✅ Generic error messages (no user enumeration)
- ✅ Audit logging for lockout events

**Evidence**:
```typescript
// /app/api/auth/login/route.ts
const lockoutStatus = await isAccountLocked(email)
if (lockoutStatus.locked) {
  log.security('account_lockout_triggered', 'medium', {
    blocked: true,
    reason: 'multiple_failed_attempts'
  })
  throw AuthenticationError('Account temporarily locked')
}
```

#### Step 9: SSO-Only User Protection
**Location**: `/app/api/auth/login/route.ts` (lines 162-189)

**Verify**:
- ✅ Check for missing `password_hash`
- ✅ Password login blocked for SSO users
- ✅ Clear error message
- ✅ Security event logged
- ✅ Audit trail for bypass attempts

**Evidence**:
```typescript
if (!user.password_hash) {
  log.security('sso_only_user_password_attempt', 'medium', {
    threat: 'authentication_bypass_attempt'
  })
  throw AuthenticationError('This account uses Single Sign-On')
}
```

### 2.3 Multi-Factor Authentication (MFA)

**STATUS**: ❌ **NOT IMPLEMENTED** - HIGH PRIORITY GAP

**Recommendation**:
- Implement TOTP-based MFA (RFC 6238)
- Secret generation: `crypto.randomBytes(20)`
- QR code generation for authenticator apps
- Backup codes (8-10 codes, hashed storage)
- Rate limiting on MFA verification
- Session elevation for sensitive operations

---

## 3. Authorization & RBAC

### 3.1 Role-Based Access Control

#### Files to Examine
```
/lib/rbac/middleware.ts                  - RBAC middleware
/lib/rbac/permission-checker.ts          - Permission logic
/lib/rbac/user-context.ts                - User context
/lib/rbac/cached-user-context.ts         - Performance optimization
/lib/types/rbac.ts                       - Type definitions
/lib/db/schema.ts                        - RBAC schema
```

#### Step 10: Permission System
**Location**: `/lib/types/rbac.ts` and `/lib/rbac/permission-checker.ts`

**Verify**:
- ✅ Hierarchical permissions: `resource:action:scope`
- ✅ Scopes: `own`, `organization`, `all`
- ✅ Super admin bypass (special case)
- ✅ Database-driven roles and permissions
- ✅ No hardcoded credentials

**Evidence**:
```typescript
// Permission examples
'users:read:own'              // Read own user data
'users:read:organization'     // Read organization users
'users:read:all'              // Read all users (super_admin)
'analytics:export:organization' // Export org analytics
```

#### Step 11: Resource-Level Authorization
**Location**: `/lib/rbac/middleware.ts` - `createRBACMiddleware()`

**Verify**:
- ✅ Resource ID extraction from requests
- ✅ Organization scoping
- ✅ Ownership verification
- ✅ Permission-based access (not just roles)
- ✅ AND/OR logic for multiple permissions
- ✅ 403 Forbidden for insufficient permissions

**Evidence**:
```typescript
// RBAC middleware checks permissions, not just roles
const hasAccess = checker.hasPermission(permission, resourceId, organizationId)
if (!hasAccess) {
  return NextResponse.json({
    error: 'Forbidden',
    message: `Missing required permissions: ${permissions.join(' or ')}`,
    code: 'INSUFFICIENT_PERMISSIONS'
  }, { status: 403 })
}
```

#### Step 12: Middleware Authorization
**Location**: `/middleware.ts` - `validateAuthentication()`

**Verify**:
- ✅ Access token validation (JWT signature)
- ✅ Refresh token fallback with DB validation
- ✅ Token blacklist checking
- ✅ Public routes explicitly allowed
- ✅ Redirect to login if unauthenticated
- ✅ Cache-Control headers for protected pages

**Evidence**:
```typescript
// /middleware.ts - Extract and refactored for clarity
async function validateAuthentication(request: NextRequest): Promise<boolean> {
  const accessToken = request.cookies.get('access-token')?.value
  const refreshToken = request.cookies.get('refresh-token')?.value

  if (accessToken) {
    // Verify JWT signature
    try {
      await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
      return true
    } catch {
      // Fall back to refresh token with DB validation
      if (refreshToken) {
        return await validateRefreshTokenWithDB(refreshToken)
      }
    }
  }
  return false
}
```

---

## 4. Session & Token Management

### 4.1 JWT Token Security

#### Files to Examine
```
/lib/auth/token-manager.ts               - Token lifecycle
/lib/auth/jwt.ts                         - JWT utilities
/middleware.ts                           - Token validation
/lib/db/schema.ts                        - Token storage
```

#### Step 13: Token Generation
**Location**: `/lib/auth/token-manager.ts` - `createTokenPair()`

**Verify**:
- ✅ HMAC SHA-256 (HS256)
- ✅ Separate secrets for access and refresh tokens
- ✅ Secret keys from environment (256+ bits)
- ✅ `alg` header explicitly set
- ✅ Never uses `none` algorithm

**Evidence**:
```typescript
// Access token claims
const accessTokenPayload = {
  sub: userId,
  jti: nanoid(),              // Unique JWT ID
  session_id: sessionId,      // DB session reference
  iat: Math.floor(now.getTime() / 1000),
  exp: Math.floor((now.getTime() + 900000) / 1000) // 15 min
}

// Refresh token claims
const refreshTokenPayload = {
  sub: userId,
  jti: refreshTokenId,
  session_id: sessionId,
  remember_me: rememberMe,
  iat: Math.floor(now.getTime() / 1000),
  exp: Math.floor(refreshExpiresAt.getTime() / 1000) // 7 or 30 days
}
```

#### Step 14: Token Storage
**Location**: Login and OIDC callback routes

**Verify**:
- ✅ httpOnly cookies (NOT localStorage)
- ✅ Cookie attributes: `httpOnly=true`, `secure=true` (prod), `sameSite=strict`
- ✅ Access token max age: 15 minutes
- ✅ Refresh token max age: 7 or 30 days
- ✅ No tokens in URL parameters

**Evidence**:
```typescript
// /app/api/auth/login/route.ts
cookieStore.set('access-token', tokenPair.accessToken, {
  httpOnly: true,     // ✅ JavaScript cannot access
  secure: isSecureEnvironment,
  sameSite: 'strict', // ✅ CSRF protection
  maxAge: 15 * 60     // 15 minutes
})
```

### 4.2 Refresh Token Rotation

#### Step 15: Token Rotation
**Location**: `/lib/auth/token-manager.ts` - `refreshTokenPair()`

**Verify**:
- ✅ Transaction-based rotation (atomic)
- ✅ Old token invalidated immediately
- ✅ New token pair issued
- ✅ Sliding window expiration
- ✅ Rotation count incremented
- ✅ Row-level locking prevents concurrent refresh

**Evidence**:
```typescript
// Transaction ensures atomicity
const tokenPair = await db.transaction(async (tx) => {
  // Mark old token as used (within transaction)
  await tx.update(refresh_tokens)
    .set({ is_active: false, revoked_reason: 'rotation' })
    .where(eq(refresh_tokens.token_id, refreshTokenId))

  // Store new token (within transaction)
  await tx.insert(refresh_tokens).values({
    token_id: newRefreshTokenId,
    rotation_count: tokenRecord.rotation_count + 1
  })

  return newTokenPair
})
```

#### Step 16: Token Reuse Detection
**Location**: `/lib/auth/token-manager.ts` (lines 186-222)

**Verify**:
- ✅ Detection of revoked token reuse
- ✅ All user tokens revoked on detection
- ✅ Audit logging with high severity
- ✅ Alert: `POSSIBLE_TOKEN_THEFT`

**Evidence**:
```typescript
if (revokedToken && !revokedToken.is_active) {
  log.error('Token reuse detected - revoking all user tokens', {
    alert: 'POSSIBLE_TOKEN_THEFT'
  })
  await revokeAllUserTokens(userId, 'security')
  throw new Error('Token reuse detected - all tokens revoked')
}
```

#### Step 17: Token Validation Cache
**Location**: `/middleware.ts` - `validateRefreshTokenWithDB()`

**Verify**:
- ✅ 60-second validation cache
- ✅ Cache checks `is_active` status
- ✅ Cache checks `token_blacklist`
- ✅ Automatic cleanup every 5 minutes
- ✅ 95% reduction in DB queries

**Trade-off**: Up to 60-second delay for revocation to take effect (acceptable for performance)

---

## 5. Security Headers & Policies

### 5.1 Content Security Policy (CSP)

#### Files to Examine
```
/lib/security/headers.ts                 - Security headers
/middleware.ts                           - CSP application
/next.config.js                          - Static headers
```

#### Step 18: CSP Configuration
**Location**: `/lib/security/headers.ts` - `getEnhancedContentSecurityPolicy()`

**Verify**:
- ✅ `default-src 'self'`
- ✅ `script-src 'self' 'nonce-{scriptNonce}'` + Next.js SHA-256 hashes
- ✅ `style-src 'self' 'nonce-{styleNonce}'` + Next.js SHA-256 hashes
- ✅ `frame-ancestors 'none'`
- ✅ `object-src 'none'`
- ✅ `upgrade-insecure-requests` (production)
- ✅ `report-uri '/api/security/csp-report'` (production)
- ❌ NO `'unsafe-inline'` in production
- ❌ NO `'unsafe-eval'` in production
- ❌ NO wildcard `*`

**Evidence**:
```typescript
// Nonce-based CSP in production
'script-src': [
  "'self'",
  `'nonce-${nonces.scriptNonce}'`,
  "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='", // Next.js
  // Development only
  ...(isDevelopment ? ["'unsafe-eval'", "'unsafe-inline'"] : [])
]
```

#### Step 19: Nonce Implementation
**Location**: `/middleware.ts` - `generateCSPNonces()`

**Verify**:
- ✅ Cryptographically random via `nanoid(16)`
- ✅ Separate nonces for scripts and styles
- ✅ Unique per request
- ✅ Passed via headers: `x-script-nonce`, `x-style-nonce`
- ✅ Not predictable or reusable

### 5.2 Additional Security Headers

#### Step 20: Security Headers
**Location**: `/lib/security/headers.ts` - `addSecurityHeaders()`

**Verify**:
- ✅ `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (prod only)
- ✅ `X-Frame-Options: DENY`
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `Permissions-Policy: camera=(), microphone=(), geolocation=()...`
- ✅ `X-DNS-Prefetch-Control: off`
- ✅ `X-Download-Options: noopen`
- ✅ `X-XSS-Protection: 1; mode=block`

#### Step 21: Cache Control
**Location**: `/middleware.ts` - `addNoStoreHeaders()`

**Verify**:
- ✅ `Cache-Control: no-store, no-cache, must-revalidate`
- ✅ `Pragma: no-cache`
- ✅ `Expires: 0`
- ✅ Applied to all protected routes

---

## 6. CSRF & Attack Prevention

### 6.1 CSRF Protection

#### Files to Examine
```
/lib/security/csrf-unified.ts            - Unified CSRF
/middleware.ts                           - CSRF validation
/app/api/csrf/route.ts                   - Token generation
```

#### Step 22: CSRF Token Types
**Location**: `/lib/security/csrf-unified.ts`

**Verify**:
- ✅ Anonymous tokens: IP + User-Agent + time window + nonce (HMAC-SHA256)
- ✅ Authenticated tokens: user ID + timestamp + nonce (HMAC-SHA256)
- ✅ Web Crypto API (Edge Runtime compatible)
- ✅ CSRF_SECRET from environment (32+ chars)
- ✅ Time windows: 15 min (dev), 5 min (prod)

**Evidence**:
```typescript
// Anonymous token for public endpoints (login, register)
const payload = {
  type: 'anonymous',
  ip: getRequestIP(request),
  userAgent: request.headers.get('user-agent'),
  timeWindow: getTimeWindow(),
  nonce: nanoid(8)
}

// HMAC signature
const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenData))
```

#### Step 23: CSRF Validation
**Location**: `/middleware.ts` and `/lib/security/csrf-unified.ts`

**Verify**:
- ✅ Applied to POST, PUT, PATCH, DELETE
- ✅ Double-submit cookie pattern
- ✅ Token in both header and cookie
- ✅ Constant-time comparison
- ✅ Type-specific validation (anonymous vs authenticated)
- ✅ 403 Forbidden on failure

**Exempt Paths**:
- `/api/health` - Health checks
- `/api/csrf` - Token generation
- `/api/webhooks/` - External webhooks
- `/api/security/csp-report` - CSP violations
- `/api/auth/oidc/callback` - OIDC callback (state token + PKCE)
- `/api/auth/refresh` - Token refresh (httpOnly cookie + JWT)

#### Step 24: Endpoint-Specific Tokens
**Location**: `/lib/security/csrf-unified.ts`

**Verify**:
- ✅ Anonymous allowed: register, forgot-password, reset-password, contact
- ✅ Dual allowed: login (anonymous or authenticated)
- ✅ Authenticated required: all other protected endpoints
- ✅ Type enforcement prevents privilege escalation

---

## 7. Input Validation & Sanitization

### 7.1 Request Validation

#### Files to Examine
```
/lib/api/middleware/validation.ts        - Validation middleware
/lib/api/middleware/request-sanitization.ts - Sanitization
/lib/validations/auth.ts                 - Zod schemas
/lib/auth/input-validator.ts             - Input validation
```

#### Step 25: Schema Validation
**Location**: Various validation files

**Verify**:
- ✅ Zod schemas for all API inputs
- ✅ Email: format, max length (255)
- ✅ Password: min length (8), max length (72)
- ✅ Required fields enforced
- ✅ Unknown fields stripped
- ✅ Type safety via TypeScript + Zod
- ✅ Validation before business logic
- ✅ 400 Bad Request on validation errors

#### Step 26: Request Sanitization
**Location**: `/lib/api/middleware/request-sanitization.ts` and `/middleware.ts`

**Verify**:
- ✅ Automatic sanitization for POST, PUT, PATCH
- ✅ HTML entities encoded (XSS prevention)
- ✅ Path traversal sequences removed
- ✅ Null byte filtering
- ✅ Unicode normalization
- ✅ Applied globally via middleware
- ✅ 400 Bad Request on invalid input

**Evidence**:
```typescript
// /middleware.ts - Applied to all state-changing requests
if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
  const sanitizationResult = await sanitizeRequestBody(body, null)
  if (!sanitizationResult.isValid) {
    return new NextResponse(
      JSON.stringify({
        error: 'Invalid request data',
        details: sanitizationResult.errors.slice(0, 3)
      }),
      { status: 400 }
    )
  }
}
```

#### Step 27: Profile Data Validation
**Location**: `/lib/auth/input-validator.ts` - `validateAuthProfile()`

**Verify**:
- ✅ Email format validation
- ✅ Display name sanitization (max 200 chars)
- ✅ Given name / surname sanitization (max 100 chars)
- ✅ HTML/script tag stripping
- ✅ XSS prevention

---

## 8. Database Security

### 8.1 PostgreSQL & Drizzle ORM

#### Files to Examine
```
/lib/db/index.ts                         - DB connection
/lib/db/schema.ts                        - DB schema
All database query code
```

#### Step 28: SQL Injection Prevention
**Location**: All database query code

**Verify**:
- ✅ Parameterized queries via Drizzle ORM exclusively
- ✅ No string concatenation with user input
- ✅ No raw SQL without parameterization
- ✅ Input validation before queries
- ✅ Type safety via TypeScript

**Safe Pattern**:
```typescript
// ✅ SAFE: Parameterized query
await db.select().from(users).where(eq(users.email, email))
```

**Unsafe Pattern** (verify NONE exist):
```typescript
// ❌ UNSAFE: String concatenation
await db.execute(`SELECT * FROM users WHERE email = '${email}'`)
```

#### Step 29: Connection Security
**Location**: `/lib/db/index.ts` and environment

**Verify**:
- ✅ Connection string in `DATABASE_URL` env var
- ✅ No credentials in version control
- ✅ SSL/TLS enforced (`sslmode=require`)
- ✅ Connection pooling via Drizzle
- ✅ Connection timeout configured

### 8.2 Audit Trail

#### Step 30: Audit Logging
**Location**: `/lib/db/schema.ts` and `/lib/api/services/audit.ts`

**Verify Audit Tables**:
- ✅ `audit_logs` - General audit trail
- ✅ `login_attempts` - Authentication tracking
- ✅ `user_sessions` - Session lifecycle
- ✅ `failed_login_attempts` - Account lockout
- ✅ `refresh_tokens` - Token lifecycle
- ✅ `token_blacklist` - Revoked tokens
- ✅ `oidc_states` - OIDC state validation

**Verify Audit Fields**:
- ✅ `user_id` - User performing action
- ✅ `action` - Action type
- ✅ `resource_type` / `resource_id` - What was accessed
- ✅ `metadata` - JSONB for context
- ✅ `ip_address` - Client IP
- ✅ `user_agent` - Client UA
- ✅ `timestamp` - With timezone
- ✅ Retention: Indefinite (HIPAA 6+ years)

**Evidence**:
```typescript
// /lib/api/services/audit.ts - AuditLogger class
await AuditLogger.logAuth({
  action: 'login',
  userId: user.user_id,
  ipAddress,
  userAgent,
  metadata: {
    sessionId: tokens.sessionId,
    rememberMe,
    deviceFingerprint
  }
})
```

---

## 9. Infrastructure Security (AWS)

### 9.1 WAF Protection

#### Files to Examine
```
/infrastructure/lib/constructs/waf-protection.ts - WAF config
```

#### Step 31: AWS Managed Rule Sets
**Location**: `/infrastructure/lib/constructs/waf-protection.ts`

**Verify**:
- ✅ AWS Managed Common Rule Set (OWASP Top 10)
- ✅ AWS Managed Known Bad Inputs Rule Set
- ✅ AWS Managed OWASP Top 10 Rule Set (production)
- ✅ CloudWatch metrics enabled
- ✅ Sampled requests enabled

#### Step 32: Rate Limiting (WAF Level)
**Location**: WAF rate limit rules

**Verify**:
- ✅ Production: 1000 requests per 5 minutes per IP
- ✅ Staging: 2000 requests per 5 minutes per IP
- ✅ Health checks excluded
- ✅ API abuse protection: 500 requests per 5 minutes for `/api/` (production)

#### Step 33: WAF Logging
**Location**: WAF logging configuration

**Verify**:
- ✅ CloudWatch log group created
- ✅ All WAF events logged
- ✅ Sensitive fields redacted (query params, auth headers, cookies)
- ✅ Retention: 3 months (prod), 1 month (staging)
- ✅ Removal policy: RETAIN

### 9.2 TLS/HTTPS

#### Step 34: HTTPS Enforcement
**Location**: Infrastructure and security headers

**Verify**:
- ✅ HTTP → HTTPS redirect (infrastructure level)
- ✅ HSTS header enforces HTTPS
- ✅ TLS 1.2 minimum (ALB/CloudFront)
- ✅ TLS 1.3 preferred
- ✅ Strong cipher suites
- ✅ Certificate auto-renewal (AWS Certificate Manager)

---

## 10. Environment & Configuration

### 10.1 Environment Variables

#### Files to Examine
```
/lib/env.ts                              - Environment validation
.env.local                               - Local (not in git)
.env                                     - Defaults
.env.test                                - Test
```

#### Step 35: Secret Management
**Location**: `/lib/env.ts`

**Verify**:
- ✅ All secrets in environment variables
- ✅ `.env` files in `.gitignore`
- ✅ Environment validation via Zod
- ✅ Application fails fast if secrets missing
- ✅ No secrets in code or `next.config.js`

**Required Secrets**:
```bash
DATABASE_URL                # PostgreSQL connection
JWT_ACCESS_SECRET           # Min 32 chars
JWT_REFRESH_SECRET          # Min 32 chars
CSRF_SECRET                 # Min 32 chars
OIDC_SESSION_SECRET         # Min 32 chars
OIDC_CLIENT_ID              # Microsoft Entra
OIDC_CLIENT_SECRET          # Microsoft Entra
OIDC_TENANT_ID              # Microsoft Entra
RESEND_API_KEY              # Email service
```

#### Step 36: Secret Rotation
**Note**: Manual process, not automated

**Recommendations**:
- JWT secrets: Rotate quarterly
- Database credentials: Rotate per schedule
- API keys: Rotate per vendor recommendations
- OIDC client secret: Rotate per Microsoft policy
- Document rotation procedures

---

## 11. Rate Limiting & DoS Protection

### 11.1 Application-Level Rate Limiting

#### Files to Examine
```
/lib/api/middleware/rate-limit.ts        - Rate limiter
/middleware.ts                           - Global rate limiting
```

#### Step 37: Global Rate Limiting
**Location**: `/middleware.ts`

**Verify**:
- ✅ Applied before any processing (fail fast)
- ✅ Sliding window algorithm
- ✅ 100 requests per 15 minutes per IP
- ✅ Static files excluded
- ✅ 429 Too Many Requests on limit exceeded
- ✅ `Retry-After` header
- ✅ Rate limit headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### Step 38: Auth Rate Limiting
**Location**: `/lib/api/middleware/rate-limit.ts`

**Verify**:
- ✅ 20 requests per 15 minutes per IP
- ✅ Applied to login, register, password reset
- ✅ More restrictive than general limit
- ✅ Prevents brute force attacks

#### Step 39: API Rate Limiting
**Verify**:
- ✅ 200 requests per minute per IP (general API)
- ✅ 500 requests per 5 minutes per IP (WAF level)
- ✅ 10 uploads per minute per IP

**Evidence**:
```typescript
// /lib/api/middleware/rate-limit.ts
export const authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 20)
export const apiRateLimiter = new InMemoryRateLimiter(60 * 1000, 200)
```

---

## 12. Logging & Monitoring

### 12.1 Security Event Logging

#### Files to Examine
```
/lib/logger.ts                           - Winston logger
/lib/api/services/audit.ts               - Audit logger
```

#### Step 40: Log Categories
**Location**: `/lib/logger.ts`

**Verify**:
- ✅ `log.auth()` - Authentication events
- ✅ `log.security()` - Security events with severity
- ✅ `log.api()` - API request/response
- ✅ `log.db()` - Database queries
- ✅ `log.error()` - Errors with stack traces
- ✅ Structured logging with metadata
- ✅ Correlation IDs for tracing

#### Step 41: Security Events Logged
**Verify**:
- ✅ Authentication attempts (success/failure)
- ✅ Authorization failures (permission denied)
- ✅ Account lockout events
- ✅ Token reuse detection
- ✅ Session hijack attempts
- ✅ CSRF validation failures
- ✅ Rate limit violations
- ✅ Password reset requests
- ✅ User role changes

**Evidence**:
```typescript
// Authentication event
log.auth('login_success', true, {
  userId,
  sessionDuration: 86400,
  permissions: userContext.all_permissions.map(p => p.name)
})

// Security event
log.security('successful_authentication', 'low', {
  action: 'authentication_granted',
  userId,
  reason: 'valid_credentials'
})
```

#### Step 42: Log Security
**Verify**:
- ✅ No passwords, tokens, or full SSNs in logs
- ✅ Email addresses masked
- ✅ IP addresses logged for audit
- ✅ Structured performance metrics
- ✅ Log retention policy enforced

---

## 13. OWASP Top 10 Coverage

### A01:2021 - Broken Access Control ✅

**Covered in**: Sections 3 (RBAC), 6 (Middleware), 12 (Middleware Authorization)

**Controls**:
- ✅ Permission-based access control
- ✅ Resource ownership verification
- ✅ No IDOR without ownership checks
- ✅ Database queries filtered by user context
- ✅ 403 Forbidden for insufficient permissions

### A02:2021 - Cryptographic Failures ⚠️

**Covered in**: Sections 2.2 (Password Hashing), 4 (JWT), 6 (CSRF)

**Controls**:
- ✅ bcrypt cost factor 12
- ✅ HMAC-SHA256 for JWTs and CSRF
- ✅ iron-session encryption (AES)
- ✅ TLS 1.2+ for all connections
- ❌ **GAP**: No PHI data-at-rest encryption

**Recommendation**: Implement column-level encryption for PHI fields

### A03:2021 - Injection ✅

**Covered in**: Sections 7 (Validation), 8 (Database)

**Controls**:
- ✅ Parameterized queries (Drizzle ORM)
- ✅ Input validation (Zod schemas)
- ✅ Request sanitization middleware
- ✅ CSP with nonces (XSS prevention)
- ✅ No string concatenation in queries

### A04:2021 - Insecure Design ✅

**Architecture Review**:
- ✅ Defense in depth (multiple security layers)
- ✅ Fail securely (default deny)
- ✅ Principle of least privilege
- ✅ Server-side validation
- ✅ Separation of concerns

### A05:2021 - Security Misconfiguration ✅

**Covered in**: Sections 5 (Headers), 10 (Environment)

**Controls**:
- ✅ Security headers configured
- ✅ CSP properly configured
- ✅ TLS properly configured
- ✅ Environment validation on startup
- ✅ No default passwords
- ✅ Error messages sanitized

### A06:2021 - Vulnerable Components ⚠️

**Manual Verification Required**:
- ⚠️ Run `pnpm audit` regularly
- ⚠️ Lock files committed (`pnpm-lock.yaml`)
- ⚠️ Automated scanning recommended

### A07:2021 - Authentication Failures ✅

**Covered in**: Sections 2 (Authentication), 4 (Session Management)

**Controls**:
- ✅ Account lockout after failed attempts
- ✅ Token rotation on refresh
- ✅ Multi-device session management
- ✅ Session timeout (15 minutes access token)
- ✅ Logout invalidates sessions
- ❌ **GAP**: MFA not implemented

### A08:2021 - Data Integrity Failures ✅

**Controls**:
- ✅ Package lock files committed
- ✅ JWT signatures prevent tampering
- ✅ Audit trail for changes

### A09:2021 - Logging Failures ✅

**Covered in**: Sections 8.2 (Audit Trail), 12 (Logging)

**Controls**:
- ✅ Comprehensive audit logging
- ✅ Authentication events logged
- ✅ Authorization failures logged
- ✅ Data modifications logged
- ✅ 6+ year retention for HIPAA
- ✅ No sensitive data in logs

### A10:2021 - SSRF ✅

**Status**: Not applicable - no user-controlled URLs in HTTP requests

**If needed in future**:
- URL allowlist enforcement
- Internal IP range blocking
- Metadata endpoint blocking

---

## 14. Critical Flow Verification

### Flow 1: Password Login
```
1. POST /api/auth/login
2. Middleware: Rate limiting (20 req/15 min)
3. Middleware: CSRF validation (dual token allowed)
4. Middleware: Request sanitization
5. Handler: Input validation (Zod)
6. Handler: Account lockout check
7. Handler: User lookup by email
8. Handler: User active check
9. Handler: SSO-only user check
10. Handler: Password verification (bcrypt)
11. Handler: Failed attempts cleared
12. Handler: Device fingerprint generation
13. Handler: RBAC context loading
14. Handler: Token pair generation (15 min access, 7-30 day refresh)
15. Handler: Cookies set (httpOnly, secure, sameSite=strict)
16. Handler: CSRF token generated (authenticated)
17. Handler: Audit logging
18. Response: User data + access token + CSRF token
```

### Flow 2: OIDC Login
```
1. GET /api/auth/oidc/login
2. Rate limiting
3. Generate state (32 bytes crypto.randomBytes)
4. Generate nonce, codeVerifier (PKCE)
5. Store state in database (5 min expiration)
6. Generate device fingerprint
7. Encrypt session data (iron-session)
8. Set session cookie (httpOnly, secure)
9. Redirect to Microsoft Entra
10. [User authenticates with Microsoft]
11. Microsoft redirects to /api/auth/oidc/callback
12. Decrypt session cookie
13. Validate state (double-submit + database + mark used)
14. Validate device fingerprint
15. Exchange code for tokens (PKCE validation)
16. Validate ID token (signature, claims, email_verified)
17. Validate email domain
18. Validate and sanitize profile
19. User lookup (or provision if allowed)
20. Generate internal tokens
21. Set cookies (access-token, refresh-token)
22. Audit logging
23. Redirect to application
```

### Flow 3: Token Refresh
```
1. POST /api/auth/refresh
2. Extract refresh token from cookie
3. Verify JWT signature
4. Transaction start (row-level lock)
5. Check token active in DB
6. Check token not blacklisted
7. Validate token hash
8. Detect token reuse (revoke all if reused)
9. Generate new access token
10. Generate new refresh token (rotation)
11. Revoke old refresh token
12. Store new refresh token
13. Update session
14. Transaction commit
15. Set new cookies
16. Audit logging
17. Response: New access token
```

### Flow 4: Protected API Request
```
1. GET /api/practices/[id]
2. Middleware: Rate limiting (200 req/min)
3. Handler: Extract access token from cookie/header
4. Handler: Verify JWT signature
5. Handler: Check token not blacklisted
6. Handler: Load user from DB
7. Handler: Check user active
8. Handler: Load RBAC context
9. Handler: Check required permission
10. Handler: Verify resource ownership/access
11. Handler: Database query (filtered by user)
12. Handler: Audit log PHI access
13. Response: Filtered data
```

---

## 15. Compliance Checklist

### HIPAA Technical Safeguards

| Requirement | Status | Evidence | Notes |
|------------|--------|----------|-------|
| **Unique User Identification** | ✅ | JWT `sub` claim, `user_id` in DB | UUID-based user IDs |
| **Emergency Access Procedure** | ❌ | Not implemented | HIGH PRIORITY GAP |
| **Automatic Logoff** | ✅ | 15-min access token, session timeout | Configurable expiration |
| **Encryption and Decryption** | ⚠️ | Passwords (bcrypt), tokens (HMAC-SHA256), sessions (iron-session) | Need PHI column encryption |
| **Audit Controls** | ✅ | `audit_logs`, `login_attempts`, `AuditLogger` class | Comprehensive logging |
| **Integrity Controls** | ✅ | JWT signatures, token blacklist, audit trail | Tamper detection |
| **Person or Entity Authentication** | ⚠️ | OIDC + Password, account lockout | MFA recommended |
| **Transmission Security** | ✅ | TLS 1.2+, HSTS, secure cookies, WAF | End-to-end encryption |

### OWASP Top 10

| Risk | Status | Evidence |
|------|--------|----------|
| A01 - Broken Access Control | ✅ | RBAC, permission checks, resource ownership |
| A02 - Cryptographic Failures | ⚠️ | bcrypt, HMAC-SHA256, TLS (need data-at-rest encryption) |
| A03 - Injection | ✅ | Drizzle ORM, Zod validation, CSP |
| A04 - Insecure Design | ✅ | Defense in depth, fail secure |
| A05 - Security Misconfiguration | ✅ | Security headers, env validation |
| A06 - Vulnerable Components | ⚠️ | Needs regular `pnpm audit` |
| A07 - Auth Failures | ⚠️ | Strong auth, lockout (MFA gap) |
| A08 - Data Integrity Failures | ✅ | Lock files, JWT signatures, audit logs |
| A09 - Logging Failures | ✅ | Comprehensive audit logging |
| A10 - SSRF | ✅ | Not applicable |

**Legend**: ✅ Fully Addressed | ⚠️ Partially Addressed | ❌ Not Addressed

---

## 16. Identified Security Gaps

### HIGH PRIORITY

#### 1. Multi-Factor Authentication (MFA)
- **Status**: ❌ NOT IMPLEMENTED
- **HIPAA Impact**: Recommended for PHI access
- **Recommendation**:
  - Implement TOTP-based MFA (RFC 6238)
  - Secret: `crypto.randomBytes(20)`
  - QR code for authenticator apps
  - Backup codes (8-10, hashed)
  - Rate limiting on MFA verification
- **Priority**: HIGH

#### 2. PHI Data-at-Rest Encryption
- **Status**: ❌ NOT IMPLEMENTED
- **HIPAA Impact**: Required for PHI fields
- **Recommendation**:
  - Column-level encryption for PHI
  - AES-256-GCM
  - Key management via AWS KMS
  - Searchable encryption for needed fields
- **Priority**: HIGH

#### 3. Emergency Access Procedure
- **Status**: ❌ NOT IMPLEMENTED
- **HIPAA Impact**: Required for emergency situations
- **Recommendation**:
  - Break-glass admin access
  - Comprehensive audit trail
  - Approval workflow
  - Time-limited access
- **Priority**: MEDIUM

### MEDIUM PRIORITY

#### 4. Centralized Secret Management
- **Current**: Environment variables only
- **Recommendation**: AWS Secrets Manager or HashiCorp Vault
- **Priority**: MEDIUM

#### 5. Rate Limiting State
- **Current**: In-memory (single server)
- **Recommendation**: Redis for multi-instance support
- **Priority**: MEDIUM

#### 6. Security Monitoring & Alerting
- **Current**: Logging only
- **Recommendation**: Real-time alerting (CloudWatch, PagerDuty)
- **Priority**: MEDIUM

#### 7. Dependency Scanning
- **Current**: Manual
- **Recommendation**: Automated CI/CD scanning
- **Priority**: MEDIUM

### LOW PRIORITY

#### 8. Session Revocation UI
- **Current**: Logout only
- **Recommendation**: User-facing session management dashboard
- **Priority**: LOW

#### 9. Certificate Pinning
- **Current**: Not implemented
- **Recommendation**: Consider for critical external APIs
- **Priority**: LOW

---

## Appendix A: Critical Files Reference

### Authentication
```
/lib/auth/token-manager.ts               - JWT lifecycle management
/lib/auth/password.ts                    - bcrypt password hashing
/lib/auth/security.ts                    - Account lockout logic
/lib/oidc/client.ts                      - OIDC implementation
/lib/oidc/database-state-manager.ts      - State validation
/app/api/auth/login/route.ts             - Password login endpoint
/app/api/auth/oidc/login/route.ts        - OIDC login initiation
/app/api/auth/oidc/callback/route.ts     - OIDC callback handler
/app/api/auth/logout/route.ts            - Logout endpoint
/app/api/auth/refresh/route.ts           - Token refresh endpoint
```

### Authorization
```
/lib/rbac/middleware.ts                  - RBAC middleware
/lib/rbac/permission-checker.ts          - Permission logic
/lib/rbac/user-context.ts                - User context retrieval
/lib/types/rbac.ts                       - RBAC type definitions
```

### Security
```
/lib/security/headers.ts                 - Security headers & CSP
/lib/security/csrf-unified.ts            - CSRF protection
/lib/api/middleware/rate-limit.ts        - Rate limiting
/lib/api/middleware/request-sanitization.ts - Input sanitization
/lib/api/middleware/validation.ts        - Schema validation
```

### Infrastructure
```
/middleware.ts                           - Global middleware
/next.config.js                          - Next.js configuration
/infrastructure/lib/constructs/waf-protection.ts - WAF rules
```

### Database
```
/lib/db/schema.ts                        - Database schema
/lib/db/index.ts                         - Database connection
```

### Audit & Logging
```
/lib/api/services/audit.ts               - Audit logger
/lib/logger.ts                           - Winston logger
```

---

## Appendix B: Audit Execution Checklist

### Pre-Audit
- [ ] Environment access verified
- [ ] Database schema reviewed
- [ ] Git history examined
- [ ] Infrastructure documentation reviewed

### Authentication (Steps 1-9)
- [ ] OIDC configuration verified
- [ ] State token management audited
- [ ] Session encryption validated
- [ ] Device fingerprinting checked
- [ ] ID token validation confirmed
- [ ] Password hashing verified (bcrypt, cost 12)
- [ ] Account lockout implemented
- [ ] SSO-only user protection verified
- [ ] MFA status documented (not implemented)

### Authorization (Steps 10-12)
- [ ] Permission system validated
- [ ] Resource-level authorization checked
- [ ] Middleware authorization verified
- [ ] RBAC implementation audited

### Session Management (Steps 13-17)
- [ ] Token generation validated
- [ ] Token storage verified (httpOnly cookies)
- [ ] Token rotation audited
- [ ] Token reuse detection verified
- [ ] Token validation cache checked

### Security Headers (Steps 18-21)
- [ ] CSP configuration verified
- [ ] Nonce implementation checked
- [ ] Additional security headers validated
- [ ] Cache control verified

### CSRF (Steps 22-24)
- [ ] CSRF token types verified
- [ ] CSRF validation checked
- [ ] Endpoint-specific tokens validated

### Input Validation (Steps 25-27)
- [ ] Schema validation verified
- [ ] Request sanitization checked
- [ ] Profile data validation audited

### Database (Steps 28-30)
- [ ] SQL injection prevention verified
- [ ] Connection security checked
- [ ] Audit trail validated

### Infrastructure (Steps 31-34)
- [ ] WAF rule sets verified
- [ ] Rate limiting (WAF level) checked
- [ ] WAF logging validated
- [ ] HTTPS enforcement verified

### Environment (Steps 35-36)
- [ ] Secret management verified
- [ ] Secret rotation documented

### Rate Limiting (Steps 37-39)
- [ ] Global rate limiting verified
- [ ] Auth rate limiting checked
- [ ] API rate limiting validated

### Logging (Steps 40-42)
- [ ] Log categories verified
- [ ] Security events logged
- [ ] Log security checked

### Post-Audit
- [ ] All findings documented with evidence
- [ ] OWASP Top 10 coverage verified
- [ ] HIPAA compliance assessed
- [ ] Remediation roadmap created
- [ ] Report finalized and reviewed

---

## Audit Sign-off

**Auditor Name**: ___________________

**Audit Date**: ___________________

**Application Version/Commit**: ___________________

**Overall Security Rating**: Critical Risk / High Risk / Moderate Risk / Low Risk

**HIPAA Compliance Status**: Compliant / Non-Compliant / Partially Compliant

**Critical Findings**: ___ findings

**High Findings**: ___ findings

**Medium Findings**: ___ findings

**Low Findings**: ___ findings

**Recommended Next Audit Date**: ___________________

**Signature**: ___________________

---

*This audit guide is specific to the BCOS application and should be updated as the application evolves.*
