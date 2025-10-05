# Next.js Security Audit Guide - HIPAA/PHI/PII Compliance

## 1. Introduction & Scope

### Audit Objectives
This security audit focuses exclusively on codebase analysis for a Next.js application that must be HIPAA compliant and handle Protected Health Information (PHI) and Personally Identifiable Information (PII). Every security control must be verified through actual code inspection, not documentation or comments.

### HIPAA Security Rule Requirements
The application must demonstrate:
- Access controls preventing unauthorized PHI/PII access
- Audit controls tracking all PHI/PII access and modifications
- Integrity controls ensuring data is not improperly altered or destroyed
- Transmission security protecting PHI/PII during transmission
- Authentication mechanisms verifying user identity

### Audit Principles
- Verify actual implementation, never trust documentation
- Check code files directly, ignore comments
- Trace complete flows from entry to exit
- Cross-verify security controls in multiple locations
- Assume adversarial mindset throughout review
- Document every finding with file paths and line numbers

---

## 2. Authentication Systems Audit

### 2.1 OIDC Implementation Review

#### Files to Examine
- `/lib/auth/oidc-provider.ts` or `/lib/auth/oidc.ts`
- `/app/api/auth/[...nextauth]/route.ts` (if using NextAuth.js)
- `/middleware.ts` for auth interceptors
- `/lib/auth/callbacks.ts` for token and session handling
- Environment configuration files (`.env.local`, `.env.production`)

#### OIDC Configuration Verification

**Step 1: Provider Configuration**
```typescript
// Check OIDC provider initialization
// Verify in actual auth configuration file
```
Look for:
- `issuer` URL is HTTPS only
- `clientId` and `clientSecret` are loaded from environment variables, never hardcoded
- `redirectUri` uses HTTPS and matches registered URIs exactly
- `scope` includes minimum: `openid`, `profile`, `email`
- For PHI access, verify custom scopes like `patient.read`, `patient.write`
- `responseType` is `code` (authorization code flow, never implicit)
- `responseMode` is not `fragment` (avoid token exposure in URL)

**Step 2: PKCE Implementation**
```typescript
// Locate PKCE code challenge generation
```
Verify:
- `code_challenge_method` is set to `S256` (SHA-256), never `plain`
- Code verifier is cryptographically random (minimum 43 characters)
- Code verifier is stored securely (httpOnly cookie or server-side session)
- Code verifier is used exactly once and then invalidated
- Check actual implementation in authorization initiation code

**Step 3: Token Endpoint Security**
```typescript
// Find token exchange implementation
```
Verify:
- Token requests use POST method only
- Requests include `client_id` and `client_secret` in body or Authorization header
- Never send credentials in URL parameters
- `code_verifier` is sent with token exchange
- TLS/HTTPS is enforced (check if HTTP requests are blocked)
- Token endpoint URL validation (prevent SSRF attacks)

**Step 4: Token Validation**
```typescript
// Locate ID token and access token validation logic
```
For ID Token verification:
- Signature verification using provider's public keys (JWKS)
- `iss` claim matches expected issuer exactly
- `aud` claim matches client ID exactly
- `exp` claim is validated (token not expired)
- `iat` claim exists and is reasonable (not far in future/past)
- `nonce` claim matches the nonce sent in auth request
- `sub` claim exists (subject identifier)
- Check actual cryptographic signature verification code

For Access Token verification:
- If JWT format: same validation as ID token
- Signature verification with provider's public key
- Expiration check before each use
- Scope validation matches required permissions
- Audience validation if applicable

**Step 5: Session Creation Post-Authentication**
```typescript
// Find session creation after successful OIDC flow
```
Verify:
- User profile is fetched from UserInfo endpoint or ID token claims
- PHI/PII scope permissions are stored in session
- Session token is cryptographically random (minimum 32 bytes entropy)
- Session stored server-side (Redis, database, etc.) with reference token in cookie
- Cookie attributes: `httpOnly=true`, `secure=true`, `sameSite=strict|lax`
- Session expiration matches or is shorter than token expiration
- Old session is invalidated on new login

#### OIDC Logout Flow

**Step 6: Logout Implementation**
```typescript
// Locate logout handler
```
Verify:
- Server-side session destruction
- Cookie deletion with proper attributes
- RP-initiated logout with OIDC provider (if supported)
- `post_logout_redirect_uri` validation
- `id_token_hint` included in logout request
- Clear all authentication artifacts from client
- Revoke refresh tokens if applicable

### 2.2 Username/Password Authentication Review

#### Files to Examine
- `/app/api/auth/login/route.ts` or `/pages/api/auth/login.ts`
- `/app/api/auth/register/route.ts`
- `/lib/auth/password.ts` for hashing utilities
- `/lib/auth/users.ts` for user operations
- Database models for user table

#### Password Storage Verification

**Step 1: Password Hashing Algorithm**
```typescript
// Find password hashing implementation
```
Verify:
- Algorithm is `bcrypt`, `scrypt`, or `argon2` (Argon2id preferred)
- Never uses MD5, SHA-1, SHA-256 alone, or any reversible encryption
- Cost factor for bcrypt ≥ 12 (or equivalent work factor)
- For Argon2: memory ≥ 64MB, iterations ≥ 3, parallelism ≥ 4
- Check actual hashing function calls in registration code

**Step 2: Salt Generation**
```typescript
// Verify salt handling
```
Verify:
- Unique salt generated per password
- Salt is cryptographically random
- Salt length ≥ 16 bytes
- Salt is automatically handled by bcrypt/scrypt/argon2 (check library usage)

**Step 3: Password Comparison**
```typescript
// Locate password verification during login
```
Verify:
- Uses timing-safe comparison (`bcrypt.compare()` or equivalent)
- Never uses string equality operators
- No early returns that could leak timing information
- Failed login does not reveal whether username or password was incorrect

#### Login Endpoint Security

**Step 4: Input Validation**
```typescript
// Check login request handler
```
Verify:
- Username/email is validated and sanitized
- Maximum length enforced (e.g., 255 characters)
- Prevent SQL injection in username lookup
- Password length validated (minimum 8, maximum 72 for bcrypt)
- Request body size limits enforced
- Content-Type validation (application/json)

**Step 5: Rate Limiting**
```typescript
// Find rate limiting implementation
```
Verify:
- Rate limiting per IP address (e.g., 5 attempts per 15 minutes)
- Rate limiting per username (prevent distributed attacks)
- Lockout mechanism after repeated failures
- Account lockout duration (e.g., 30 minutes)
- Rate limit state stored server-side
- Check middleware or library implementation (e.g., `express-rate-limit`)

**Step 6: Account Lockout**
```typescript
// Locate account lockout logic
```
Verify:
- Failed login counter stored in database
- Counter incremented on each failed attempt
- Counter reset on successful login
- Lockout triggered after threshold (e.g., 5 failures)
- Lockout includes timestamp for automatic unlock
- Error message does not reveal account is locked (timing attack prevention)

**Step 7: Credential Verification Flow**
```typescript
// Trace complete login flow
```
Verify:
1. Rate limit check occurs before database query
2. User lookup by username/email
3. If user not found, perform dummy password hash operation (timing attack prevention)
4. Password comparison using timing-safe function
5. Failed attempt counter increment if invalid
6. Session creation only after successful verification
7. Session token generation (cryptographically random)
8. Secure cookie set with session token

#### Registration Endpoint Security

**Step 8: Registration Input Validation**
```typescript
// Check registration handler
```
Verify:
- Email validation (format and domain checks)
- Username uniqueness check
- Password complexity requirements enforced:
  - Minimum length ≥ 12 characters (HIPAA recommendation)
  - Requires uppercase, lowercase, number, special character
  - Check against common password list
  - Prevent use of username in password
- Prevent registration of reserved usernames
- CAPTCHA or similar bot prevention

**Step 9: Password Policy Enforcement**
```typescript
// Locate password validation function
```
Verify actual implementation code:
- Regex or validation library checking complexity
- Dictionary/common password check (e.g., against top 10,000 list)
- Sequence detection (e.g., "12345", "abcdef")
- Repetition detection (e.g., "aaaaaaa")
- Contextual checks (username, email, site name not in password)

**Step 10: User Creation Flow**
```typescript
// Trace registration from request to database
```
Verify:
1. Input validation and sanitization
2. Uniqueness checks (username, email)
3. Password hashing with proper algorithm
4. User record creation with hashed password
5. No plain text password logging or storage anywhere
6. Email verification token generation (if applicable)
7. Audit log entry for account creation

### 2.3 Multi-Factor Authentication (MFA)

#### Files to Examine
- `/app/api/auth/mfa/setup/route.ts`
- `/app/api/auth/mfa/verify/route.ts`
- `/lib/auth/totp.ts` for TOTP generation
- User model for MFA fields

#### MFA Setup Verification

**Step 11: TOTP Secret Generation**
```typescript
// Find MFA setup handler
```
Verify:
- Secret is cryptographically random (minimum 128 bits)
- Secret generated using secure library (e.g., `otplib`, `speakeasy`)
- Secret stored encrypted in database (never plain text)
- QR code generated server-side
- Backup codes generated (8-10 codes, cryptographically random)
- Backup codes hashed before storage
- Recovery email or phone number collected

**Step 12: MFA Verification During Login**
```typescript
// Locate MFA verification step
```
Verify:
- TOTP window is limited (e.g., ±1 time step, 30 seconds)
- Prevent code reuse (store last used code and timestamp)
- Rate limiting on MFA attempts (separate from login rate limit)
- Account lockout after failed MFA attempts
- Session not created until MFA verification succeeds
- Option to use backup codes
- Backup code single-use enforcement

---

## 3. Authorization & RBAC

### 3.1 Role-Based Access Control Implementation

#### Files to Examine
- `/lib/auth/permissions.ts` or `/lib/rbac.ts`
- `/middleware.ts` for route protection
- `/lib/auth/roles.ts` for role definitions
- Database schema for roles and permissions tables
- `/app/api/**/route.ts` (all API routes for permission checks)

#### Role Definition Verification

**Step 13: Role Schema**
```typescript
// Find role and permission data structures
```
Verify:
- Roles defined with clear hierarchy (e.g., admin, provider, nurse, patient)
- Permissions granular and specific (e.g., `patient:read`, `patient:write`, `phi:access`)
- Role-permission mapping stored in database, not code
- No hardcoded admin credentials or backdoors
- Principle of least privilege enforced (default deny)

**Step 14: Permission Assignment**
```typescript
// Check user-role association
```
Verify:
- User-to-role relationship in database (junction table if many-to-many)
- Role changes require privileged action (admin only)
- Audit trail for role assignments and changes
- No role escalation vulnerabilities
- Temporal permissions supported (if needed for limited access)

#### Route-Level Authorization

**Step 15: Middleware Authorization**
```typescript
// Examine middleware.ts
```
Verify:
- Every protected route checks authentication status
- Role/permission verified before handler execution
- Redirect to login if unauthenticated
- Return 403 Forbidden if authenticated but unauthorized
- No routes bypass authorization checks
- API routes and page routes both protected
- Check matcher configuration covers all sensitive paths

**Step 16: API Route Authorization**
```typescript
// Review each API route handler
```
For EVERY API route handling PHI/PII:
1. Extract session/token from request
2. Verify session validity and expiration
3. Load user roles/permissions from session or database
4. Check required permission for requested operation
5. Deny access if permission missing (return 403)
6. Proceed to business logic only after authorization passes

Example verification checklist per route:
```typescript
// In /app/api/patients/[id]/route.ts
```
- GET: requires `patient:read` or `patient:own:read` permission
- POST: requires `patient:create` permission
- PUT/PATCH: requires `patient:update` permission
- DELETE: requires `patient:delete` permission (highly restricted)
- Owner-based access: verify user can only access their own data unless elevated permission

**Step 17: Resource-Level Authorization**
```typescript
// Check fine-grained access control
```
Verify:
- User can only access resources they own or are authorized for
- Lookups filtered by user ID or organization ID
- Database queries include WHERE clauses for ownership/access
- No direct ID access without ownership verification
- Cross-reference user permissions with resource metadata

**Step 18: Data Filtering by Role**
```typescript
// Examine data retrieval logic
```
Verify:
- Queries automatically filter by user context
- Patients see only their own records
- Providers see only their assigned patients
- Admins see appropriate scope (organization, not global unless super-admin)
- No ability to iterate through all IDs
- List endpoints respect pagination and filtering

### 3.2 Attribute-Based Access Control (ABAC)

#### Step 19: Contextual Authorization**
```typescript
// Find dynamic permission checks
```
If ABAC implemented, verify:
- Time-based restrictions (e.g., access during business hours only)
- Location-based restrictions (IP allowlist, geofencing)
- Device-based restrictions (registered devices only)
- Relationship-based access (primary care provider, specialist, etc.)
- Consent-based access (patient consent required for record access)

---

## 4. Session & Token Management

### 4.1 Cookie Security

#### Files to Examine
- `/middleware.ts` for cookie handling
- `/lib/auth/session.ts` or `/lib/auth/cookies.ts`
- `/app/api/auth/*/route.ts` for cookie setting
- `next.config.js` for headers configuration

#### Cookie Attributes Verification

**Step 20: Session Cookie Configuration**
```typescript
// Find where session cookies are set
```
For EVERY cookie containing authentication data, verify:
- `HttpOnly=true` (prevents JavaScript access)
- `Secure=true` (HTTPS only, must be enforced in production)
- `SameSite=Lax` or `SameSite=Strict` (CSRF protection)
- `Path=/` or specific path (limit cookie scope)
- `Domain` not set or set to specific subdomain (prevent cross-domain attacks)
- `Max-Age` or `Expires` set appropriately (e.g., 24 hours for session)
- Cookie name does not leak information (e.g., avoid "admin_session")

**Step 21: Cookie Encryption/Signing**
```typescript
// Check cookie integrity protection
```
Verify:
- Session cookies are signed (HMAC) or encrypted
- Signing/encryption key stored in environment variable
- Key is cryptographically random (minimum 256 bits)
- Key rotation mechanism exists
- Tampered cookies are rejected and session invalidated

**Step 22: Session Token Content**
```typescript
// Examine session token structure
```
If using JWT for session:
- Never store sensitive PHI/PII in token payload
- Token contains only user ID, roles, and expiration
- Verify signature on every request
- Short expiration time (≤ 15 minutes for access token)
- Refresh token implemented separately

If using opaque session tokens:
- Token is random, unpredictable (UUID v4 or crypto.randomBytes)
- Token references server-side session storage
- Session data contains user ID, roles, permissions
- Session includes creation time, last activity, expiration

### 4.2 JWT Token Security

#### Files to Examine
- `/lib/auth/jwt.ts`
- `/lib/auth/tokens.ts`
- All API routes that verify JWT tokens

#### JWT Implementation Verification

**Step 23: JWT Generation**
```typescript
// Find JWT creation logic
```
Verify:
- Algorithm is asymmetric (RS256, ES256) or HMAC (HS256) with strong secret
- Never use `none` algorithm
- Secret key length ≥ 256 bits for HS256
- RSA key size ≥ 2048 bits for RS256
- `alg` header is explicitly validated during verification (prevent algorithm confusion)
- Private key never exposed to client

**Step 24: JWT Claims**
```typescript
// Check JWT payload structure
```
Required claims:
- `iss` (issuer): application identifier
- `sub` (subject): user ID
- `aud` (audience): intended recipient
- `exp` (expiration): short-lived (15 minutes for access, 7 days max for refresh)
- `iat` (issued at): timestamp
- `jti` (JWT ID): unique identifier (for revocation)

Custom claims:
- User roles/permissions (if stateless auth)
- Organization ID (if multi-tenant)
- Session ID (for server-side session reference)
- Never include passwords, API keys, or sensitive PHI

**Step 25: JWT Verification**
```typescript
// Locate JWT verification function
```
For every JWT verification, check:
- Signature verification using correct algorithm and key
- `exp` claim validated (reject expired tokens)
- `nbf` claim validated if present (not before)
- `iss` claim matches expected issuer
- `aud` claim matches application identifier
- Clock skew tolerance is minimal (≤ 60 seconds)
- Revoked tokens checked against revocation list (if applicable)

**Step 26: Token Storage on Client**
```typescript
// Check where tokens are stored client-side
```
Verify:
- Access tokens in memory only (React state, not localStorage)
- Refresh tokens in httpOnly cookies (never localStorage or sessionStorage)
- No tokens in URL parameters or fragments
- Tokens cleared on logout
- Tokens not logged to console or analytics

### 4.3 Refresh Token Flow

#### Files to Examine
- `/app/api/auth/refresh/route.ts`
- `/lib/auth/refresh-token.ts`

#### Refresh Token Implementation

**Step 27: Refresh Token Generation**
```typescript
// Find refresh token creation
```
Verify:
- Refresh token is cryptographically random (minimum 32 bytes)
- Refresh token stored in database with user association
- One-time use (rotation): old token invalidated when new token issued
- Long expiration (days to weeks, not months)
- Family tracking to detect token theft (invalidate entire family on suspicious use)

**Step 28: Refresh Token Endpoint**
```typescript
// Review refresh endpoint handler
```
Verify:
- Accepts only POST requests
- Refresh token extracted from httpOnly cookie or request body
- Token lookup in database
- User association verified
- Token expiration checked
- Old token invalidated immediately
- New access token and refresh token issued
- Rate limiting applied (prevent brute force)
- Failed refresh logged (potential security event)

**Step 29: Token Revocation**
```typescript
// Check token revocation implementation
```
Verify:
- Logout invalidates all user tokens (access and refresh)
- Database/cache stores revoked token IDs until expiration
- Token verification checks revocation list
- Admin capability to revoke specific user tokens
- Password change revokes all existing tokens

---

## 5. Security Headers & Policies

### 5.1 Content Security Policy (CSP)

#### Files to Examine
- `/middleware.ts` for CSP headers
- `/next.config.js` for header configuration
- `/app/layout.tsx` for meta tags

#### CSP Header Verification

**Step 30: CSP Directives**
```typescript
// Locate CSP header definition
```
Verify presence and strictness of:
- `default-src 'self'` (deny all by default)
- `script-src 'self'` (no inline scripts without nonce/hash)
- `style-src 'self'` (no inline styles without nonce/hash)
- `img-src 'self' data: https:` (restrict image sources)
- `font-src 'self'` (restrict font sources)
- `connect-src 'self'` (API endpoints only)
- `frame-ancestors 'none'` (prevent clickjacking)
- `base-uri 'self'` (prevent base tag injection)
- `form-action 'self'` (restrict form submissions)
- `upgrade-insecure-requests` (force HTTPS)
- `block-all-mixed-content` (no HTTP resources on HTTPS page)

Prohibited directives:
- `'unsafe-inline'` for script-src or style-src (unless using nonces)
- `'unsafe-eval'` for script-src
- Wildcard `*` in any directive

**Step 31: Nonce Implementation**
```typescript
// Find nonce generation for CSP
```
If using nonces for inline scripts/styles:
- Nonce is cryptographically random (minimum 128 bits)
- Unique nonce per request (generated in middleware)
- Nonce included in CSP header
- Same nonce applied to all inline scripts/styles in response
- Nonce not predictable or reused across requests

Verify in actual rendered HTML:
```html
<script nonce="RANDOM_VALUE">...</script>
```
And CSP header:
```
Content-Security-Policy: script-src 'self' 'nonce-RANDOM_VALUE'
```

**Step 32: CSP Reporting**
```typescript
// Check CSP violation reporting
```
Verify:
- `report-uri` or `report-to` directive present
- Reporting endpoint implemented (`/api/csp-report`)
- Violations logged for security monitoring
- Reports include sufficient detail (blocked-uri, violated-directive)

### 5.2 Additional Security Headers

#### Files to Examine
- `/middleware.ts`
- `/next.config.js` headers section

#### Required Security Headers

**Step 33: Strict-Transport-Security (HSTS)**
```typescript
// Verify HSTS header
```
Required configuration:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `max-age` at least 1 year (31536000 seconds)
- `includeSubDomains` to protect all subdomains
- `preload` for browser preload list inclusion
- Applied to all responses, including errors

**Step 34: X-Frame-Options**
```typescript
// Check X-Frame-Options header
```
Verify:
- `X-Frame-Options: DENY` or `SAMEORIGIN`
- Consistent with CSP `frame-ancestors` directive
- Applied globally to prevent clickjacking

**Step 35: X-Content-Type-Options**
```typescript
// Verify MIME type sniffing prevention
```
Required:
- `X-Content-Type-Options: nosniff`
- Prevents browsers from MIME-sniffing responses

**Step 36: Referrer-Policy**
```typescript
// Check referrer policy
```
Recommended:
- `Referrer-Policy: strict-origin-when-cross-origin` or `no-referrer`
- Prevents leaking sensitive URLs to external sites
- More restrictive for PHI/PII pages

**Step 37: Permissions-Policy**
```typescript
// Verify permissions policy
```
Disable unnecessary features:
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()`
- Only enable required features
- Restrict to same-origin where needed

**Step 38: X-XSS-Protection**
```typescript
// Check legacy XSS protection header
```
While deprecated, verify:
- `X-XSS-Protection: 0` (disable legacy filter, rely on CSP)
- Or omit header entirely for modern browsers

**Step 39: Cache-Control for Sensitive Pages**
```typescript
// Check cache headers on authenticated pages
```
For pages with PHI/PII:
- `Cache-Control: no-store, no-cache, must-revalidate, private`
- `Pragma: no-cache`
- `Expires: 0`
- Prevents caching of sensitive data

### 5.3 CORS Configuration

#### Files to Examine
- `/middleware.ts` for CORS headers
- `/next.config.js` for global CORS config
- Individual API routes for route-specific CORS

#### CORS Verification

**Step 40: CORS Headers**
```typescript
// Find CORS configuration
```
Verify:
- `Access-Control-Allow-Origin` is specific, not `*` (except public APIs)
- Allowed origins from environment variable or allowlist
- `Access-Control-Allow-Credentials: true` if cookies used
- `Access-Control-Allow-Methods` limited to required methods only
- `Access-Control-Allow-Headers` limited to required headers
- `Access-Control-Max-Age` set appropriately (e.g., 86400 seconds)

**Step 41: Preflight Handling**
```typescript
// Check OPTIONS request handling
```
Verify:
- OPTIONS requests handled correctly
- Preflight responses include all CORS headers
- No authentication required for OPTIONS (preflight)
- Allowed methods and headers accurately reflect endpoint capabilities

---

## 6. Middleware Security

### 6.1 Request Processing Pipeline

#### Files to Examine
- `/middleware.ts` (primary middleware file)
- `/lib/middleware/*.ts` (middleware utilities)

#### Middleware Execution Order

**Step 42: Middleware Chain**
```typescript
// Trace middleware execution flow
```
Verify order of operations:
1. Rate limiting (before expensive operations)
2. CORS preflight handling
3. Security headers application
4. Authentication verification
5. Authorization checks
6. CSRF token validation (for state-changing operations)
7. Request logging/audit trail
8. Business logic execution

**Step 43: Matcher Configuration**
```typescript
// Check middleware matcher in middleware.ts
```
Verify:
- Matcher covers all API routes requiring protection
- Static assets excluded from auth checks (/_next/*, /public/*)
- Public routes explicitly excluded
- No sensitive routes accidentally excluded

### 6.2 Input Validation in Middleware

#### Files to Examine
- `/lib/validation/*.ts`
- Middleware files performing validation

#### Request Validation

**Step 44: Request Size Limits**
```typescript
// Find request body size limits
```
Verify:
- Maximum request body size enforced (e.g., 1MB for JSON)
- Larger limits for file uploads (if applicable)
- Limit enforced before parsing body
- Prevents denial of service via large payloads

**Step 45: Content-Type Validation**
```typescript
// Check Content-Type header validation
```
Verify:
- Content-Type validated against expected types
- Reject requests with missing or incorrect Content-Type
- Parse body only if Content-Type matches expectation
- Prevents content-type confusion attacks

**Step 46: Input Sanitization**
```typescript
// Review input sanitization middleware
```
For all user inputs:
- HTML entities encoded (prevent XSS)
- SQL special characters escaped (prevent SQL injection)
- Path traversal sequences removed (../, ..\)
- Null byte filtering
- Unicode normalization (prevent homograph attacks)

---

## 7. CSRF & Attack Prevention

### 7.1 Cross-Site Request Forgery Protection

#### Files to Examine
- `/lib/csrf.ts` or `/lib/auth/csrf.ts`
- `/middleware.ts` for CSRF token verification
- Forms and API calls for token inclusion

#### CSRF Token Implementation

**Step 47: Token Generation**
```typescript
// Find CSRF token generation
```
Verify:
- Token is cryptographically random (minimum 128 bits)
- Unique token per session or per request
- Token stored server-side (session, database)
- Token tied to user session
- Token has expiration (e.g., session lifetime or shorter)

**Step 48: Token Delivery to Client**
```typescript
// Check how token is provided to frontend
```
Verify:
- Token included in initial page render (meta tag or cookie)
- Double-submit cookie pattern or synchronizer token pattern
- Token not exposed in URL or logs
- Token rotated on authentication state change

**Step 49: Token Validation**
```typescript
// Locate CSRF validation middleware
```
For all state-changing operations (POST, PUT, PATCH, DELETE):
- Token extracted from header (X-CSRF-Token) or request body
- Token compared against server-side stored token
- Comparison is timing-safe
- Missing or invalid token results in 403 Forbidden
- Token invalidated after use (if single-use pattern)

**Step 50: SameSite Cookie Attribute**
```typescript
// Verify cookie attributes as CSRF defense
```
Check session cookies:
- `SameSite=Strict` or `SameSite=Lax`
- Strict prevents cookie in all cross-site requests
- Lax allows cookies for safe top-level navigation
- Provides defense-in-depth with CSRF tokens

### 7.2 OWASP Top 10 Coverage

#### Files to Examine
- All application code

#### A01:2021 - Broken Access Control

**Step 51: Access Control Verification**
Already covered in sections 3 and 6. Additional checks:
- No forced browsing vulnerabilities (URL tampering)
- No IDOR (Insecure Direct Object Reference) by testing with different IDs
- API endpoints enforce authorization
- File access controls prevent unauthorized downloads

#### A02:2021 - Cryptographic Failures

**Step 52: Encryption Verification**
```typescript
// Find encryption usage
```
Verify:
- PHI/PII encrypted at rest in database (application-level or column encryption)
- Encryption uses AES-256-GCM or ChaCha20-Poly1305
- No deprecated algorithms (DES, 3DES, RC4, MD5, SHA-1)
- Encryption keys stored in environment variables or key management system
- Keys rotated periodically
- No hardcoded keys or IVs

**Step 53: TLS/SSL Configuration**
```typescript
// Check HTTPS enforcement
```
Verify:
- All HTTP requests redirect to HTTPS
- TLS 1.2 minimum, TLS 1.3 preferred
- Strong cipher suites only (no weak ciphers)
- Certificate validation enforced
- Certificate pinning considered for mobile/API clients

#### A03:2021 - Injection

**Step 54: SQL Injection Prevention**
```typescript
// Review all database queries
```
For EVERY database query:
- Parameterized queries or prepared statements used exclusively
- Never string concatenation with user input
- ORM usage (Prisma, TypeORM) configured safely
- Raw queries escaped properly (though should be avoided)
- Input validation before query execution

Example safe query:
```typescript
// Verify this pattern in all database interactions
const user = await prisma.user.findUnique({
  where: { id: userId } // parameterized
});
```

**Step 55: Command Injection Prevention**
```typescript
// Find any system command execution
```
If executing system commands:
- Avoid `exec`, `spawn`, `system` calls if possible
- If necessary, use allowlist of safe commands
- Never interpolate user input into commands
- Use libraries with built-in escaping

**Step 56: XSS Prevention**
```typescript
// Check output encoding
```
Verify:
- React's automatic escaping not bypassed with `dangerouslySetInnerHTML`
- If HTML rendering needed, use DOMPurify or similar sanitization
- User input never directly inserted into script tags
- JSON data properly encoded when embedded in HTML
- Content-Security-Policy blocks inline scripts (covered in section 5)

#### A04:2021 - Insecure Design

**Step 57: Security Design Patterns**
Verify design-level security:
- Defense in depth (multiple layers of security)
- Fail securely (errors default to deny access)
- Principle of least privilege throughout
- Input validation on both client and server
- Security controls not bypassable by modifying client code

#### A05:2021 - Security Misconfiguration

**Step 58: Configuration Review**
```typescript
// Check configuration files
```
Verify:
- No default passwords or accounts
- Unnecessary features disabled
- Error messages don't leak sensitive info (stack traces hidden in production)
- Directory listing disabled
- Admin interfaces not publicly accessible
- Development tools not present in production build

**Step 59: Environment Variables**
```env
# Review .env files
```
Verify:
- Secrets in environment variables, not code
- No .env files committed to version control
- Different configs for dev/staging/production
- Production environment variables secured
- No sensitive data in `next.config.js` or public code

#### A06:2021 - Vulnerable and Outdated Components

**Step 60: Dependency Audit**
```bash
# Run and review output
npm audit
```
Verify:
- No high or critical vulnerabilities
- Dependencies regularly updated
- Automated dependency scanning in CI/CD
- Unused dependencies removed
- Pinned dependency versions (not `^` or `~` in production)

#### A07:2021 - Identification and Authentication Failures

**Step 61: Session Management Review**
Already covered extensively in sections 2 and 4. Verify:
- Session IDs not in URLs
- Logout invalidates sessions
- Session timeout after inactivity
- No concurrent sessions (or limited)
- Authentication bypasses tested manually

#### A08:2021 - Software and Data Integrity Failures

**Step 62: Integrity Verification**
```typescript
// Check subresource integrity and package integrity
```
Verify:
- Package lock files committed (package-lock.json)
- CI/CD pipeline integrity (signed commits, protected branches)
- No unsigned or unverified third-party scripts
- Subresource Integrity (SRI) for CDN resources

#### A09:2021 - Security Logging and Monitoring Failures

**Step 63: Audit Logging**
```typescript
// Find audit logging implementation
```
For PHI/PII access (HIPAA requirement):
- Log user ID, timestamp, action, resource accessed
- Log authentication events (login, logout, failures)
- Log authorization failures
- Log data modifications (create, update, delete)
- Logs stored securely and tamper-evident
- Log retention policy (minimum 6 years for HIPAA)
- No sensitive data in logs (passwords, full SSNs, etc.)

**Step 64: Monitoring and Alerting**
Verify:
- Failed login attempts monitored
- Unusual access patterns detected
- Rate limit violations logged
- Security events trigger alerts
- Automated response to critical events

#### A10:2021 - Server-Side Request Forgery (SSRF)

**Step 65: SSRF Prevention**
```typescript
// Review any code making external HTTP requests
```
If application makes HTTP requests based on user input:
- URL allowlist enforced (no arbitrary URLs)
- Internal/private IP ranges blocked (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
- Cloud metadata endpoints blocked (169.254.169.254)
- URL parsing and validation before request
- Disable redirects or validate redirect targets

---

## 8. Backend API Security

### 8.1 API Route Protection

#### Files to Examine
- `/app/api/**/route.ts` (App Router)
- `/pages/api/**/*.ts` (Pages Router)
- All route handlers

#### Route Handler Verification

**Step 66: Authentication Check in Every Route**
```typescript
// For EACH API route handling PHI/PII
```
Verify template pattern:
1. Extract session/token from request
2. Validate session/token
3. Load user from session
4. If invalid/missing, return 401 Unauthorized
5. Proceed to authorization check

Check this pattern exists in every protected route handler.

**Step 67: Authorization Check in Every Route**
```typescript
// After authentication, verify authorization
```
For each route:
1. Determine required permission for operation
2. Check user has required permission
3. If missing permission, return 403 Forbidden
4. Verify resource ownership (if applicable)
5. Proceed to business logic

**Step 68: HTTP Method Handling**
```typescript
// Verify method-specific logic
```
For each route file:
- Separate handlers for GET, POST, PUT, PATCH, DELETE
- Only allowed methods implemented
- Unsupported methods return 405 Method Not Allowed
- Method-specific permissions enforced

### 8.2 Input Validation and Sanitization

#### Files to Examine
- `/lib/validation/*.ts`
- Each API route handler

#### Request Validation

**Step 69: Schema Validation**
```typescript
// Find validation library usage (Zod, Yup, Joi)
```
For every API endpoint:
- Input schema defined for request body
- Schema includes type, format, length constraints
- Required fields enforced
- Unknown fields rejected or stripped
- Validation occurs before business logic
- Validation errors return 400 Bad Request with safe error message

**Step 70: Type Safety**
```typescript
// Verify TypeScript types for inputs
```
Check:
- Request bodies have TypeScript interfaces/types
- Types match validation schemas
- No `any` types for user input
- Type assertions verified at runtime (not just compile time)

**Step 71: Specific Input Validations**
```typescript
// Check common input types
```
For common fields:
- Email: format validation, max length
- Phone: format validation, country code
- SSN: format validation, encryption before storage
- Dates: format validation, range checks
- IDs: UUID/ULID format, existence verification
- Enums: value in allowed set
- Numeric: min/max ranges, no Infinity or NaN

### 8.3 Output Encoding and Data Leakage

#### Files to Examine
- API route response construction
- Error handling middleware

#### Response Security

**Step 72: Sensitive Data in Responses**
```typescript
// Review API responses
```
Verify responses NEVER include:
- Password hashes
- Internal IDs not meant for client
- System paths or internal architecture details
- Database error messages
- Stack traces (in production)
- Other users' data (ensure filtering)
- Unencrypted SSNs, full credit card numbers

**Step 73: Error Message Sanitization**
```typescript
// Check error handling
```
Verify:
- Generic error messages for authentication failures ("Invalid credentials", not "Username not found")
- No stack traces in production responses
- Error logging separate from error responses
- Different error handling for development vs production
- Database errors caught and sanitized

**Step 74: Response Filtering**
```typescript
// Ensure proper data serialization
```
For user objects in responses:
- Password fields excluded
- Sensitive fields excluded (e.g., `passwordHash`, `mfaSecret`)
- Use explicit field selection (not `SELECT *`)
- DTO (Data Transfer Object) pattern for responses

---

## 9. Database Security

### 9.1 PostgreSQL Configuration

#### Files to Examine
- Database connection configuration files
- `/lib/db.ts` or `/lib/database.ts`
- Migration files
- Environment configuration

#### Connection Security

**Step 75: Connection String Security**
```typescript
// Find database connection setup
```
Verify:
- Connection string in environment variable, not code
- No credentials in version control
- SSL/TLS enforced for database connections (`sslmode=require` or `ssl=true`)
- Connection pooling configured properly
- Maximum connections limited
- Connection timeout configured

**Step 76: Database User Privileges**
```sql
-- Check actual database user permissions
```
Verify principle of least privilege:
- Application uses non-superuser database account
- User has only necessary permissions (SELECT, INSERT, UPDATE, DELETE on specific tables)
- No DROP, ALTER permissions unless explicitly needed
- DDL changes use separate migration user
- Read-only endpoints use read-only database user (if feasible)

### 9.2 SQL Injection Prevention

#### Files to Examine
- All database query code
- ORM configuration files

#### Query Security Verification

**Step 77: Parameterized Queries**
```typescript
// Review EVERY database query in the application
```
Safe patterns (verify these are used):
```typescript
// Prisma (preferred)
await prisma.user.findUnique({ where: { id: userId } });

// Raw query with parameters (if absolutely necessary)
await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;
```

Unsafe patterns (flag and fix if found):
```typescript
// NEVER do this
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${userId}`);
await db.query("SELECT * FROM users WHERE email = '" + email + "'");
```

**Step 78: ORM Usage Audit**
```typescript
// Check ORM configuration and usage
```
If using Prisma:
- `@prisma/client` version up to date
- Schema validation enabled
- Type safety leveraged
- Raw queries avoided when possible
- Raw queries use tagged templates when necessary

**Step 79: Dynamic Query Building**
```typescript
// Find any dynamic WHERE clause construction
```
If queries built dynamically:
- Allowlist approach for column names and table names
- Never user input directly in column/table names
- Parameters used for values
- Query builder library used safely (e.g., Knex with parameters)

### 9.3 Data Encryption at Rest

#### Files to Examine
- Database schema/migrations
- Encryption utility files
- Model definitions

#### Encryption Verification

**Step 80: Column-Level Encryption**
```typescript
// Find PHI/PII encryption implementation
```
For columns containing PHI/PII:
- Encryption performed before INSERT/UPDATE
- Decryption performed after SELECT
- Encryption uses AES-256-GCM or equivalent
- Encryption key from environment variable or key management system
- IV/nonce unique per encrypted value
- Authentication tag verified on decryption

**Step 81: Searchable Encryption**
```typescript
// If encrypted data needs to be searchable
```
Verify:
- Deterministic encryption for exact match searches, or
- Hashed search tokens, or
- Blind indexing implemented
- Trade-offs documented (deterministic encryption weaknesses understood)

**Step 82: Audit Trail Table**
```sql
-- Check audit table structure
```
Verify audit/log table includes:
- User ID performing action
- Timestamp with timezone
- Action type (INSERT, UPDATE, DELETE, SELECT)
- Table and record ID
- Old and new values (for UPDATE)
- IP address and user agent
- Encrypted if contains PHI/PII
- Retention policy enforced (6+ years for HIPAA)

### 9.4 Database Access Logging

#### Files to Examine
- Database configuration
- Logging configuration

#### Logging Configuration

**Step 83: Query Logging**
Verify (in database config or environment):
- All queries logged in production
- Slow query logging enabled
- Log includes timestamp, user, query text
- Sensitive data redacted from logs
- Logs secured and tamper-evident
- Log rotation and retention configured

---

## 10. HTTPS & Transport Security

### 10.1 TLS Configuration

#### Files to Examine
- Next.js server configuration
- Reverse proxy configuration (Nginx, Cloudflare)
- Certificate files (location, not content)

#### HTTPS Enforcement

**Step 84: HTTP to HTTPS Redirect**
```typescript
// Verify redirect implementation
```
Check:
- All HTTP requests (port 80) redirect to HTTPS (port 443)
- 301 or 308 permanent redirect
- HSTS header applied after redirect (as verified in Step 33)
- No mixed content (HTTP resources on HTTPS pages)

**Step 85: TLS Version and Ciphers**
```nginx
# Review reverse proxy or server configuration
```
Verify:
- TLS 1.2 minimum (disable TLS 1.0, 1.1)
- TLS 1.3 enabled and preferred
- Strong cipher suites only:
  - TLS 1.3: TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
  - TLS 1.2: ECDHE-RSA-AES128-GCM-SHA256, ECDHE-RSA-AES256-GCM-SHA384
- Weak ciphers disabled (RC4, DES, 3DES, MD5, export ciphers)
- Forward secrecy enabled (ECDHE, DHE)

**Step 86: Certificate Validation**
Verify:
- Valid SSL/TLS certificate from trusted CA
- Certificate not expired
- Certificate matches domain name
- Certificate chain complete
- OCSP stapling enabled (if supported)
- Certificate renewal automated

### 10.2 API Client Security

#### Files to Examine
- API client configuration (fetch, axios)
- External API integration code

#### Outbound Request Security

**Step 87: TLS for External APIs**
```typescript
// Review external API calls
```
For all external HTTPS requests:
- TLS verification not disabled
- Certificate validation enabled
- Hostname verification enabled
- Trusted CA bundle used
- Certificate pinning for critical APIs (optional but recommended)

**Step 88: API Key Security**
```typescript
// Find API key usage
```
Verify:
- API keys in environment variables
- Keys not logged or exposed in responses
- Keys rotated periodically
- Minimum necessary permissions for each key
- Separate keys for dev/staging/production

---

## 11. Code Flow Verification

### 11.1 Critical Path Tracing

#### End-to-End Flow Verification

**Step 89: User Registration Flow**
Trace complete flow from form submission to database:
1. Client-side form validation (informational only, not security)
2. Request sent to `/api/auth/register`
3. Rate limiting check
4. Input validation and sanitization
5. Password complexity check
6. Email uniqueness check
7. Password hashing with bcrypt/argon2
8. User record insertion
9. Audit log entry
10. Email verification token generation (if applicable)
11. Success response (no sensitive data)
12. Session creation (or require login)

Verify each step in actual code files, note file paths and line numbers.

**Step 90: Login Flow**
Trace from login form to authenticated session:
1. Client-side form submission
2. Request to `/api/auth/login`
3. Rate limiting check (IP and username)
4. User lookup by username/email
5. Account lockout check
6. Password verification (timing-safe)
7. MFA challenge (if enabled)
8. MFA verification
9. Session token generation
10. Session storage (server-side)
11. Secure cookie set
12. Audit log entry (successful login)
13. Response with user data (no password, no sensitive tokens)

**Step 91: PHI Access Flow**
Trace from API request to database retrieval:
1. Client request to `/api/patients/[id]`
2. Middleware extracts session cookie
3. Session validation (expiration, signature)
4. User loaded from session
5. Authorization check (user has `patient:read` permission)
6. Resource ownership verification (user can access this patient ID)
7. Database query with parameterized input
8. Data retrieved
9. Sensitive fields encrypted at rest are decrypted
10. Response filtering (exclude unnecessary fields)
11. Audit log entry (PHI accessed, user ID, patient ID, timestamp)
12. Response sent with appropriate headers (Cache-Control: no-store)

**Step 92: Data Modification Flow**
Trace update operation:
1. Client request to `/api/patients/[id]` (PUT/PATCH)
2. Authentication verification
3. Authorization check (user has `patient:update` permission)
4. Ownership verification
5. CSRF token validation
6. Input validation against schema
7. Data sanitization
8. Previous data retrieved for audit trail
9. Database update with parameterized query
10. PHI fields encrypted before storage
11. Audit log entry (old values, new values, user, timestamp)
12. Success response

**Step 93: Logout Flow**
Trace from logout action to session destruction:
1. Client request to `/api/auth/logout`
2. Session token extracted from cookie
3. Session lookup and validation
4. Session invalidated in database/cache
5. Refresh token revoked (if applicable)
6. Cookie deleted (set Max-Age=0, empty value)
7. Audit log entry (user logged out)
8. Redirect to login page

### 11.2 Error Path Verification

**Step 94: Authentication Failure Paths**
Verify error handling:
- Invalid credentials: generic message, no user enumeration
- Expired session: redirect to login, no data exposed
- Missing session: 401 status, no stack trace
- Account locked: generic message, locked status not revealed
- Each error logged appropriately

**Step 95: Authorization Failure Paths**
Verify:
- Insufficient permissions: 403 Forbidden, no resource data
- Resource not found vs. unauthorized: both return 403 or 404 consistently (don't leak existence)
- Errors logged for security monitoring

**Step 96: Validation Failure Paths**
Verify:
- Schema validation errors: 400 Bad Request with safe messages
- No internal errors exposed to client
- Validation errors do not reveal system architecture
- Rate limit exceeded: 429 Too Many Requests

---

## 12. Automated Security Scanning

### 12.1 Static Analysis

#### Tools to Run

**Step 97: npm audit**
```bash
npm audit --production
```
Review output:
- High/critical vulnerabilities: must be resolved
- Moderate: assess and resolve or document exception
- Update dependencies or find alternatives
- Document any accepted risks

**Step 98: Semgrep or ESLint Security Plugin**
```bash
npx semgrep --config=auto .
```
Review findings:
- SQL injection patterns
- XSS vulnerabilities
- Hardcoded secrets
- Insecure crypto usage
- Path traversal vulnerabilities

**Step 99: TypeScript Strict Mode**
Verify `tsconfig.json`:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `strictFunctionTypes: true`
- No suppressions of type errors related to security

### 12.2 Dynamic Analysis

#### Manual Testing

**Step 100: Authentication Testing**
Manual tests to perform:
- Login with invalid credentials
- Login with locked account
- Session fixation attempt
- Session replay with old token
- Concurrent session handling
- Password reset flow security
- Token expiration handling

**Step 101: Authorization Testing**
Manual tests:
- Access resource without authentication
- Access resource with insufficient permissions
- IDOR testing (change IDs in requests)
- Privilege escalation attempts
- Cross-tenant access attempts (if multi-tenant)

**Step 102: Input Validation Testing**
Test common injection patterns:
- SQL injection payloads in all inputs
- XSS payloads in text fields
- Command injection in file upload names
- Path traversal in file paths
- XXE in XML inputs (if applicable)
- SSRF with internal URLs

**Step 103: CSRF Testing**
Manual tests:
- State-changing request without CSRF token
- CSRF token from different session
- CSRF token replay
- CSRF token missing from request

---

## 13. Audit Report Template

### 13.1 Executive Summary

**Report Metadata**
- Application Name:
- Audit Date:
- Auditor Name:
- Version/Commit Hash Audited:
- Audit Scope: Full security audit for HIPAA compliance

**Overall Security Posture**
- Overall Rating: [Critical Risk / High Risk / Moderate Risk / Low Risk]
- Critical Findings: [Number]
- High Findings: [Number]
- Medium Findings: [Number]
- Low Findings: [Number]
- Informational: [Number]

**Compliance Status**
- HIPAA Compliance: [Compliant / Non-Compliant / Partially Compliant]
- Key Gaps: [List critical compliance gaps]

### 13.2 Detailed Findings

**Finding Template (Repeat for Each Issue)**

**Finding #1: [Title]**
- **Severity**: [Critical / High / Medium / Low / Informational]
- **Category**: [Authentication / Authorization / Cryptography / Input Validation / etc.]
- **OWASP Mapping**: [e.g., A01:2021 - Broken Access Control]
- **HIPAA Relevance**: [Access Controls / Audit Controls / Integrity / Transmission Security / Authentication]

**Description**:
[Detailed description of the vulnerability or security issue]

**Location**:
- File: [File path]
- Line: [Line number(s)]
- Function/Component: [Name]

**Evidence**:
```typescript
// Code snippet demonstrating the issue
```

**Risk**:
[Explanation of potential impact if exploited, specific to PHI/PII exposure]

**Recommendation**:
[Specific remediation steps with code examples if applicable]

**Remediation Priority**: [Immediate / Short-term (1-2 weeks) / Medium-term (1-2 months) / Long-term]

**Verification**:
[How to verify the fix is properly implemented]

---

### 13.3 Findings by Category

**Authentication Findings**
- List all findings related to authentication

**Authorization Findings**
- List all findings related to authorization and access control

**Cryptography Findings**
- List all findings related to encryption, hashing, and cryptographic operations

**Session Management Findings**
- List all findings related to session and token handling

**Input Validation Findings**
- List all findings related to input validation and injection vulnerabilities

**Security Configuration Findings**
- List all findings related to headers, CSP, CORS, etc.

**Database Security Findings**
- List all findings related to database queries, encryption, and access

**API Security Findings**
- List all findings related to API endpoints and handlers

**CSRF and Attack Prevention Findings**
- List all findings related to CSRF, XSS, and other attacks

**Logging and Monitoring Findings**
- List all findings related to audit trails and security logging

### 13.4 Compliance Checklist

**HIPAA Technical Safeguards**

| Requirement | Status | Evidence | Notes |
|------------|--------|----------|-------|
| Unique User Identification | ✅ / ❌ | [File reference] | [Notes] |
| Emergency Access Procedure | ✅ / ❌ | [File reference] | [Notes] |
| Automatic Logoff | ✅ / ❌ | [File reference] | [Notes] |
| Encryption and Decryption | ✅ / ❌ | [File reference] | [Notes] |
| Audit Controls | ✅ / ❌ | [File reference] | [Notes] |
| Integrity Controls | ✅ / ❌ | [File reference] | [Notes] |
| Person or Entity Authentication | ✅ / ❌ | [File reference] | [Notes] |
| Transmission Security | ✅ / ❌ | [File reference] | [Notes] |

**OWASP Top 10 Coverage**

| Risk | Addressed | Evidence | Notes |
|------|-----------|----------|-------|
| A01 - Broken Access Control | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A02 - Cryptographic Failures | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A03 - Injection | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A04 - Insecure Design | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A05 - Security Misconfiguration | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A06 - Vulnerable Components | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A07 - Auth Failures | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A08 - Data Integrity Failures | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A09 - Logging Failures | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |
| A10 - SSRF | ✅ / ⚠️ / ❌ | [File reference] | [Notes] |

### 13.5 Verification Evidence

**Authentication System**
- OIDC Provider Configuration: [File path, verification notes]
- Password Hashing: [Algorithm, cost factor, file path]
- MFA Implementation: [TOTP library, backup codes, file path]
- Session Management: [Storage mechanism, expiration, file path]

**Authorization System**
- RBAC Implementation: [File path, role definitions]
- Permission Checks: [Middleware verification, API route samples]
- Resource Ownership: [Database query verification]

**Cryptography**
- Encryption Algorithm: [AES-256-GCM, file path]
- Key Management: [Environment variable verification]
- TLS Configuration: [Version, ciphers, certificate validation]

**Security Headers**
- CSP: [Full policy, nonce implementation]
- HSTS: [Configuration verification]
- Additional Headers: [Complete list verified]

**Database Security**
- SQL Injection Prevention: [ORM usage, parameterized queries]
- Encryption at Rest: [Column-level encryption verification]
- Audit Logging: [Table structure, retention policy]

**Audit Trail**
- PHI Access Logging: [Implementation verification, sample logs]
- Authentication Events: [Login/logout logging verification]
- Data Modifications: [Change tracking verification]

### 13.6 Remediation Roadmap

**Immediate (Within 1 Week)**
1. [Critical Finding #1] - [Brief description]
2. [Critical Finding #2] - [Brief description]

**Short-term (1-2 Weeks)**
1. [High Finding #1] - [Brief description]
2. [High Finding #2] - [Brief description]

**Medium-term (1-2 Months)**
1. [Medium Finding #1] - [Brief description]
2. [Medium Finding #2] - [Brief description]

**Long-term (2+ Months)**
1. [Low Finding #1] - [Brief description]
2. [Enhancement Recommendations]

### 13.7 Conclusion

**Summary**
[Overall assessment of security posture, readiness for production, HIPAA compliance status]

**Key Strengths**
- [List positive security implementations found]

**Critical Gaps**
- [List critical issues that must be addressed]

**Recommendations**
- [High-level strategic recommendations]

**Re-audit Recommendation**
[Recommend re-audit after remediation, specify timeline]

---

## Appendix A: File Checklist

### Files Requiring Review
Use this checklist to ensure all critical files have been examined:

**Authentication & Authorization**
- [ ] `/lib/auth/oidc.ts` or OIDC configuration
- [ ] `/lib/auth/password.ts` or password utilities
- [ ] `/lib/auth/jwt.ts` or JWT utilities
- [ ] `/lib/auth/session.ts` or session management
- [ ] `/lib/auth/permissions.ts` or RBAC implementation
- [ ] `/lib/auth/mfa.ts` or MFA implementation
- [ ] `/middleware.ts` for auth checks

**API Routes** (Check ALL routes)
- [ ] `/app/api/auth/login/route.ts`
- [ ] `/app/api/auth/register/route.ts`
- [ ] `/app/api/auth/logout/route.ts`
- [ ] `/app/api/auth/refresh/route.ts`
- [ ] `/app/api/auth/mfa/setup/route.ts`
- [ ] `/app/api/auth/mfa/verify/route.ts`
- [ ] `/app/api/patients/*` (all patient routes)
- [ ] `/app/api/users/*` (all user routes)
- [ ] [All other PHI/PII handling routes]

**Database**
- [ ] `/lib/db.ts` or database connection
- [ ] `/prisma/schema.prisma` or database schema
- [ ] `/lib/queries/*` or database query utilities
- [ ] Migration files

**Security Configuration**
- [ ] `/middleware.ts` for security headers
- [ ] `/next.config.js` for headers and security config
- [ ] `.env.local` and `.env.production` (verify secrets)

**Utilities**
- [ ] `/lib/validation/*` for input validation
- [ ] `/lib/encryption/*` for encryption utilities
- [ ] `/lib/csrf.ts` for CSRF protection
- [ ] `/lib/rate-limit.ts` for rate limiting

**Logging and Monitoring**
- [ ] `/lib/audit-log.ts` or audit logging
- [ ] `/lib/logger.ts` or logging utilities

---

## Appendix B: Testing Payloads

### SQL Injection Test Payloads
```
' OR '1'='1
'; DROP TABLE users;--
' UNION SELECT NULL,NULL,NULL--
admin'--
' OR 1=1--
```

### XSS Test Payloads
```html
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
<svg onload=alert('XSS')>
javascript:alert('XSS')
<iframe src="javascript:alert('XSS')">
```

### Path Traversal Payloads
```
../../../etc/passwd
..\..\..\..\windows\system32\config\sam
....//....//....//etc/passwd
```

### Command Injection Payloads
```
; ls -la
| cat /etc/passwd
`whoami`
$(whoami)
```

### SSRF Test URLs
```
http://169.254.169.254/latest/meta-data/
http://localhost/admin
http://127.0.0.1:6379/
http://[::1]/
http://internal-service/
```

---

## Appendix C: Security Review Checklist

Use this final checklist to ensure audit completeness:

- [ ] All 103 steps completed
- [ ] Every authentication flow traced end-to-end
- [ ] Every API route verified for auth and authz
- [ ] All database queries checked for parameterization
- [ ] All user inputs validated and sanitized
- [ ] All security headers verified in middleware
- [ ] CSRF protection verified on state-changing operations
- [ ] All cryptographic operations use strong algorithms
- [ ] All secrets in environment variables
- [ ] All PHI/PII access logged to audit trail
- [ ] TLS/HTTPS enforced throughout
- [ ] Password storage uses bcrypt/argon2
- [ ] Session management secure (httpOnly, secure, sameSite)
- [ ] Rate limiting implemented
- [ ] OWASP Top 10 risks addressed
- [ ] HIPAA technical safeguards verified
- [ ] Automated security scans run and reviewed
- [ ] Manual penetration testing performed
- [ ] All findings documented with evidence
- [ ] Remediation roadmap created
- [ ] Report reviewed and finalized

**Audit Sign-off**
- Auditor Signature: ___________________
- Date: ___________________
- Next Review Date: ___________________