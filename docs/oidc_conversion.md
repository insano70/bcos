# OIDC Conversion Design Document

**Version**: 1.1 (Security Review Integrated)
**Date**: 2025-10-03
**Status**: Ready for Implementation
**Author**: System Architecture Team

## Executive Summary

This document outlines the design for converting from SAML-based Single Sign-On (SSO) to OpenID Connect (OIDC) with Microsoft Entra ID. The goal is to simplify authentication infrastructure while **enhancing security** and supporting multiple domain organizations with minimal configuration.

**Version 1.1 Update**: Integrated security review findings with 4 critical security enhancements and 4 important architecture improvements. These additions increase implementation effort by +24 hours but are **mandatory** for production deployment.

**Key Benefits of OIDC Conversion**:
- **50-60% reduction in custom code** (from ~2,840 lines to ~1,400 lines including security enhancements)
- **Elimination of database infrastructure** for replay prevention
- **Automatic certificate/key management** via JWKs (no manual cert lifecycle)
- **Enhanced security features**:
  - Encrypted session cookies (PKCE protection)
  - One-time state tokens (OIDC spec compliance)
  - Device fingerprint binding (hijacking prevention)
  - Explicit ID token validation (defense-in-depth)
- **Performance improvements** via discovery caching (~200ms faster logins)
- **Simpler configuration** (only 2 additional environment variables)
- **Industry standard** with better library support and OAuth 2.0 compatibility

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [OIDC Architecture Design](#2-oidc-architecture-design)
3. [Configuration Strategy](#3-configuration-strategy)
4. [Migration Plan](#4-migration-plan)
5. [Security Considerations](#5-security-considerations)
6. [Implementation Details](#6-implementation-details)
7. [Testing Strategy](#7-testing-strategy)
8. [Rollback Plan](#8-rollback-plan)

---

## 1. Current State Analysis

### 1.1 Current Authentication & Authorization System

#### **Authentication Methods**
1. **Password-based authentication** (`/api/auth/login`)
   - Uses `bcrypt` for password hashing
   - JWT-based access tokens (15 minutes)
   - Refresh tokens with rotation (7 days standard, 30 days remember-me)
   - Module: [`lib/auth/token-manager.ts`](../lib/auth/token-manager.ts) (550 lines)

2. **SAML SSO authentication** (`/api/auth/saml/callback`)
   - Microsoft Entra ID integration via `@node-saml/node-saml`
   - Complex validation pipeline (signature, issuer, timestamps, replay prevention)
   - Modules: 6 files, ~2,500 lines of SAML-specific code

#### **Session Management**
- **Access tokens**: 15 minutes, signed with HS256 JWT
- **Refresh tokens**: Database-backed with rotation (prevents token theft)
- **Device fingerprinting**: SHA-256 hash of IP + User-Agent
- **Session tracking**: `user_sessions` table with device info
- **Token blacklist**: For immediate logout/revocation
- Module: [`lib/auth/token-manager.ts`](../lib/auth/token-manager.ts)
- Library: `jose` v6.1.0 for JWT operations

#### **CSRF Protection**
- **Unified CSRF module**: [`lib/security/csrf-unified.ts`](../lib/security/csrf-unified.ts) (514 lines)
- **Anonymous tokens**: For public endpoints (login, register) - validated against IP + User-Agent + time window
- **Authenticated tokens**: For protected endpoints - double-submit cookie pattern with 24-hour expiry
- **HMAC-based signing**: Web Crypto API for Edge Runtime compatibility
- **CSRF exempt paths**: SAML callback uses signature validation instead of CSRF

#### **Security Headers**
- **CSP (Content Security Policy)**: Dual nonces for scripts/styles
- **HSTS**: Enabled in production
- **Frame protection**: X-Frame-Options DENY
- **MIME sniffing prevention**: X-Content-Type-Options nosniff
- Module: [`lib/security/headers.ts`](../lib/security/headers.ts) (222 lines)

#### **RBAC System**
- **Permission-based access control**: Not role-based (roles are permission containers)
- **Three scopes**: `own`, `organization`, `all`
- **Permission caching**: 24-hour cache for role-permission mappings
- **User context**: Loaded once per request with request-scoped cache
- **super_admin bypass**: Special case for full access
- Modules:
  - [`lib/rbac/cached-user-context.ts`](../lib/rbac/cached-user-context.ts) - User context with caching
  - [`lib/rbac/permission-checker.ts`](../lib/rbac/permission-checker.ts) - Permission validation
  - [`lib/rbac/middleware.ts`](../lib/rbac/middleware.ts) - Route protection

#### **Global Middleware**
- **Correlation IDs**: Request tracing across all routes
- **CSP nonces**: Generated per-request for inline scripts/styles
- **Rate limiting**: Global API rate limiting with per-IP tracking
- **Request sanitization**: XSS/injection prevention on JSON bodies
- **Authentication check**: JWT validation from `access-token` cookie
- **Multi-domain routing**: Practice websites vs admin dashboard
- Module: [`middleware.ts`](../middleware.ts) (379 lines)

---

### 1.2 Current SAML Implementation

#### **SAML Components** (to be replaced)

| Module | Lines | Purpose | OIDC Equivalent |
|--------|-------|---------|-----------------|
| [`lib/saml/client.ts`](../lib/saml/client.ts) | 854 | SAML client wrapper, validation | OIDC client with `openid-client` library |
| [`lib/saml/replay-prevention.ts`](../lib/saml/replay-prevention.ts) | 233 | Database-backed replay attack prevention | **Not needed** - OIDC uses nonce/state |
| [`lib/saml/config.ts`](../lib/saml/config.ts) | 811 | Certificate management, caching, validation | **Simplified** - JWKs auto-fetched |
| [`lib/saml/metadata-fetcher.ts`](../lib/saml/metadata-fetcher.ts) | 322 | XML metadata parsing from Entra | **Replaced** - JSON discovery endpoint |
| [`lib/saml/input-validator.ts`](../lib/saml/input-validator.ts) | 251 | Profile data sanitization | **Reusable** - same validation logic |
| [`lib/types/saml.ts`](../lib/types/saml.ts) | 369 | SAML type definitions | **New** OIDC types |
| **Database** | - | `saml_replay_prevention` table | **Removed** |
| **Total** | **~2,840 lines** | | **~800-1,200 lines** (OIDC) |

#### **SAML Security Features**
1. ✅ **Signature verification** - XML digital signatures via X509 certificates
2. ✅ **Issuer validation** - Tenant isolation (prevents cross-tenant attacks)
3. ✅ **Audience validation** - Ensures response is for our SP
4. ✅ **Timestamp validation** - NotBefore/NotOnOrAfter with 5s clock skew
5. ✅ **Replay prevention** - Database tracking of assertion IDs
6. ✅ **Email domain validation** - Allowlist for user domains
7. ✅ **Certificate lifecycle** - Expiry monitoring, rotation detection
8. ✅ **Dual certificate support** - During certificate rotation
9. ✅ **Input sanitization** - XSS/injection prevention
10. ✅ **Audit logging** - All auth events logged

#### **SAML Flows**
```
Login Initiation:
User → /api/auth/saml/login → Redirect to Entra → User authenticates

Callback:
Entra → POST /api/auth/saml/callback (SAMLResponse)
  ↓
1. Parse SAML XML response
2. Verify XML signature (X509 cert)
3. Validate issuer (tenant isolation)
4. Validate audience
5. Validate timestamps (NotBefore/NotOnOrAfter)
6. Check replay attack (DB lookup)
7. Sanitize profile data
8. Check user pre-provisioning
9. Create JWT access + refresh tokens
10. Set httpOnly cookies
11. Redirect to dashboard
```

---

### 1.3 Dependencies to Change

#### **Current Dependencies**
```json
"@node-saml/node-saml": "^5.1.0",  // SAML protocol library
"jose": "^6.1.0",                   // JWT operations (keep)
"bcrypt": "^6.0.0",                 // Password hashing (keep)
```

#### **New Dependencies**
```json
"openid-client": "^6.8.1",         // OIDC protocol library (official certified, latest stable)
"iron-session": "^8.0.4",          // Session data encryption (PKCE security)
// "jose" stays for our internal JWT operations
// "bcrypt" stays for password authentication
```

---

### 1.4 Multi-Domain Organization Requirements

#### **Current Domains**
- `aara.care` - Organization A
- `sparc.care` - Organization B
- `illumination.health` - Organization C
- `bendcare.com` - Organization D
- `oasis.care` - Organization E

#### **Requirements**
- Single Microsoft Entra tenant ID for all organizations
- Users from any domain can authenticate
- Email domain determines organization assignment
- Pre-provisioning required (users must exist in database)
- No automatic user creation

---

## 2. OIDC Architecture Design

### 2.1 OIDC vs SAML Comparison

| Feature | SAML (Current) | OIDC (Proposed) |
|---------|----------------|-----------------|
| **Protocol** | XML-based | JSON-based (OAuth 2.0) |
| **Token Format** | XML assertions | JWT (JSON Web Tokens) |
| **Replay Prevention** | Custom DB table | Built-in nonce + state |
| **Certificate Management** | Manual X509 certs, expiry tracking | Auto-fetched JWKs |
| **Metadata** | XML federation metadata | JSON discovery document |
| **Signature Verification** | XML digital signatures | JWT signature (JWS) |
| **Token Validation** | 10 custom validation steps | Library handles validation |
| **Code Complexity** | ~2,840 lines | ~800-1,200 lines |
| **Database Tables** | `saml_replay_prevention` | None needed |
| **Clock Skew** | Manual handling | Built into library |
| **Libraries** | `@node-saml/node-saml` | `openid-client` (certified) |

### 2.2 OIDC Flow Design

#### **Authorization Code Flow with PKCE**
```
Login Initiation:
User → /api/auth/oidc/login
  ↓
1. Generate PKCE challenge (SHA-256)
2. Generate state token (CSRF protection)
3. Store state in httpOnly cookie (encrypted)
4. Build authorization URL:
   - client_id
   - redirect_uri
   - scope: openid profile email
   - state (CSRF token)
   - code_challenge (PKCE)
   - code_challenge_method: S256
5. Redirect to Entra authorization endpoint

User Authentication (at Entra):
User → Authenticates at Microsoft Entra → Redirects back

Callback:
Entra → GET /api/auth/oidc/callback?code=...&state=...
  ↓
1. Validate state token (prevent CSRF)
2. Exchange authorization code for tokens:
   - POST to token endpoint
   - Include code_verifier (PKCE)
   - Receive: id_token, access_token, refresh_token
3. Validate ID token (library does this automatically):
   - Verify JWT signature via JWKs
   - Verify issuer
   - Verify audience
   - Verify expiration
   - Verify nonce (replay prevention)
4. Extract user claims from ID token
5. Sanitize profile data
6. Check user pre-provisioning
7. Create our JWT access + refresh tokens
8. Set httpOnly cookies
9. Redirect to dashboard
```

#### **Token Types**
1. **Entra ID Token** (from Microsoft)
   - Contains user claims (email, name, etc.)
   - Short-lived (1 hour typical)
   - Validated once during callback
   - **Discarded after validation** (not stored)

2. **Entra Access Token** (from Microsoft)
   - For calling Microsoft Graph API (if needed)
   - **Optional** - only if we need Graph API access
   - Not used for our application authentication

3. **Entra Refresh Token** (from Microsoft)
   - For renewing Entra tokens (if needed)
   - **Optional** - only if we maintain Entra session
   - **Not recommended** - adds complexity

4. **Our JWT Access Token** (internal)
   - 15 minutes lifespan
   - Same as current system
   - Used for API authentication

5. **Our JWT Refresh Token** (internal)
   - 7/30 days lifespan (standard/remember-me)
   - Same as current system
   - Used for session renewal

**Decision: Stateless OIDC Authentication**
- Use OIDC **only** for initial authentication
- Once validated, issue our own JWT tokens (current system)
- No storage of Entra tokens
- No token refresh with Entra (users re-authenticate via OIDC when session expires)
- Simpler, more secure, no token sync issues

### 2.3 Security Model

#### **OIDC Built-In Security**
1. ✅ **State parameter** - CSRF protection for authorization flow
2. ✅ **PKCE** - Prevents authorization code interception
3. ✅ **Nonce** - Replay attack prevention (ID token binding)
4. ✅ **JWT signature** - Automatic validation via JWKs
5. ✅ **Token expiration** - Built into JWT claims
6. ✅ **Issuer validation** - Library validates iss claim
7. ✅ **Audience validation** - Library validates aud claim

#### **Additional Security (Our Implementation)**
1. ✅ **Email domain validation** (reuse existing logic)
2. ✅ **User pre-provisioning check** (same as current)
3. ✅ **Input sanitization** (reuse existing validator)
4. ✅ **Audit logging** (same as current)
5. ✅ **Device fingerprinting** (same as current)
6. ✅ **Session management** (our JWT system unchanged)

#### **Removed Security (No Longer Needed)**
- ❌ **Database replay prevention** - OIDC nonce handles this
- ❌ **Certificate lifecycle management** - JWKs are auto-rotated
- ❌ **Metadata caching** - Discovery document is lightweight

---

## 3. Configuration Strategy

### 3.1 Design Principle: Minimal Configuration

**Goal**: Configure once via environment variables, zero application configuration needed.

### 3.2 Required Environment Variables

```bash
# OIDC Configuration (Microsoft Entra)
ENTRA_TENANT_ID=12345678-1234-1234-1234-123456789012
ENTRA_CLIENT_ID=abcd1234-5678-90ab-cdef-1234567890ab
ENTRA_CLIENT_SECRET=your_client_secret_here

# Application URLs
NEXT_PUBLIC_APP_URL=https://app.bendcare.com
OIDC_REDIRECT_URI=https://app.bendcare.com/api/auth/oidc/callback

# OIDC Security Configuration (CRITICAL)
# Session encryption secret (32+ characters) - Generate with: openssl rand -base64 32
OIDC_SESSION_SECRET=<your-session-secret-here>

# Optional: Custom configurations
OIDC_SUCCESS_REDIRECT=/dashboard           # Default: /dashboard
OIDC_SCOPES=openid profile email          # Default: openid profile email
OIDC_ALLOWED_DOMAINS=aara.care,sparc.care,illumination.health,bendcare.com,oasis.care

# Optional: Strict fingerprint validation (default: false)
# Set to 'true' for high-security environments (may cause issues with mobile networks/VPNs)
OIDC_STRICT_FINGERPRINT=false
```

### 3.3 Configuration Module

```typescript
// lib/oidc/config.ts
interface OIDCConfig {
  // Microsoft Entra endpoints (auto-discovered)
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;

  // Client configuration
  clientId: string;
  clientSecret: string;
  redirectUri: string;

  // Application settings
  scopes: string[];
  allowedEmailDomains: string[];
  successRedirect: string;
}

export async function buildOIDCConfig(): Promise<OIDCConfig> {
  const tenantId = getRequiredEnv('ENTRA_TENANT_ID');
  const clientId = getRequiredEnv('ENTRA_CLIENT_ID');
  const clientSecret = getRequiredEnv('ENTRA_CLIENT_SECRET');

  // Auto-discover endpoints from well-known configuration
  const discoveryUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
  const discovery = await fetch(discoveryUrl).then(r => r.json());

  return {
    issuer: discovery.issuer,
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    jwksUri: discovery.jwks_uri,
    userinfoEndpoint: discovery.userinfo_endpoint,
    clientId,
    clientSecret,
    redirectUri: getRequiredEnv('OIDC_REDIRECT_URI'),
    scopes: getEnv('OIDC_SCOPES', 'openid profile email').split(' '),
    allowedEmailDomains: getEnv('OIDC_ALLOWED_DOMAINS', '').split(',').filter(Boolean),
    successRedirect: getEnv('OIDC_SUCCESS_REDIRECT', '/dashboard'),
  };
}
```

### 3.4 Multi-Domain Handling

**Approach**: Email domain-based organization mapping (same as SAML)

```typescript
// Email domain → Organization mapping (in database)
// organizations table already has domain associations

async function getOrganizationByEmail(email: string): Promise<Organization | null> {
  const domain = email.split('@')[1];

  // Look up organization by domain
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.domain, domain))
    .limit(1);

  return org || null;
}
```

**User Pre-Provisioning**:
- Same as SAML: Users must be created in database before first login
- Email domain determines organization assignment
- No automatic user creation

---

## 4. Migration Plan

### 4.1 Phase 1: Parallel Development with Security Enhancements (Week 1-2.5)

**Goal**: Build secure OIDC alongside SAML without disruption

#### **Dependencies**
1. Add `openid-client` v6.8.1 (OIDC protocol library - latest stable)
2. Add `iron-session` v8.0.4 (session encryption)

#### **Core OIDC Modules**
1. Create `lib/oidc/config.ts` - Configuration management with discovery caching
2. Create `lib/oidc/client.ts` - OIDC client wrapper with:
   - Singleton pattern for client instance
   - 24-hour issuer cache (reduces latency by ~200ms)
   - Explicit ID token validation (defense-in-depth)
3. Create `lib/oidc/state-manager.ts` - **CRITICAL** One-time state token tracking
4. Create `lib/oidc/errors.ts` - Custom error types for specific handling
5. Create `lib/oidc/validator.ts` - Token validation helpers
6. Create `lib/types/oidc.ts` - Type definitions

#### **API Routes with Security**
1. Create `app/api/auth/oidc/login/route.ts` - Initiate OIDC flow with:
   - Encrypted session cookies (iron-session)
   - Device fingerprint binding
   - State registration for one-time use
2. Create `app/api/auth/oidc/callback/route.ts` - Handle callback with:
   - Session decryption
   - One-time state validation
   - Fingerprint verification (with strict mode option)
   - Explicit ID token validation
3. Create `app/api/auth/oidc/logout/route.ts` - RP-initiated logout

#### **Reuse Existing Modules**
1. Move `lib/saml/input-validator.ts` → `lib/auth/input-validator.ts` (no changes)
2. `lib/auth/token-manager.ts` - No changes needed
3. `lib/rbac/*` - No changes needed

#### **Environment Variables**
1. Add `OIDC_SESSION_SECRET` - Session encryption (32+ characters, REQUIRED)
2. Add `OIDC_STRICT_FINGERPRINT` - Strict fingerprint validation (optional, default: false)

#### **Testing (Enhanced)**
- Unit tests for OIDC client (with singleton/caching)
- Unit tests for state manager (one-time use validation)
- Security tests for session encryption
- Security tests for state replay prevention
- Security tests for fingerprint validation
- Integration tests for OIDC flow
- Test with development Entra tenant

### 4.2 Phase 2: Feature Parity (Week 2-3)

**Goal**: Ensure OIDC has all SAML features

#### **Feature Checklist**
- [x] User authentication with Entra
- [x] Email extraction from ID token
- [x] Profile data extraction (name, etc.)
- [x] Email domain validation
- [x] User pre-provisioning check
- [x] Input sanitization
- [x] JWT token creation (our tokens)
- [x] Session management
- [x] Audit logging
- [x] Device fingerprinting
- [x] CSRF protection for callback (via state + PKCE)
- [x] Error handling (specific error types)
- [x] Security logging
- [x] **Encrypted session cookies** (PKCE protection)
- [x] **One-time state tokens** (replay prevention)
- [x] **Session fingerprint binding** (hijacking prevention)
- [x] **Explicit ID token validation** (defense-in-depth)
- [x] **Discovery document caching** (performance)
- [x] **Client singleton pattern** (resource efficiency)
- [x] **RP-initiated logout** (complete session termination)

### 4.3 Phase 3: Staged Rollout (Week 3-4)

**Goal**: Gradual migration to minimize risk

#### **Rollout Strategy**
1. **Week 3**:
   - Deploy to development environment
   - Internal testing with all 5 domains
   - Fix any domain-specific issues

2. **Week 4 Day 1-2**:
   - Deploy to staging environment
   - Select pilot users (5-10 per domain)
   - Monitor authentication success rate
   - Collect user feedback

3. **Week 4 Day 3-4**:
   - Expand to 25% of users
   - Monitor error rates
   - Performance testing

4. **Week 4 Day 5**:
   - Full rollout to 100% if metrics are green
   - Keep SAML routes active for 1 week (safety)

#### **Rollout Metrics**
- Authentication success rate (target: >99%)
- Login latency (target: <2s end-to-end)
- Error rate (target: <0.1%)
- User feedback (target: no major issues)

### 4.4 Phase 4: SAML Deprecation (Week 5)

**Goal**: Remove SAML code and infrastructure

#### **Deprecation Steps**
1. **Day 1-3**: Monitoring period
   - Verify zero SAML logins
   - Check logs for any SAML attempts

2. **Day 4**: Remove SAML routes
   - Delete `/api/auth/saml/login`
   - Delete `/api/auth/saml/callback`
   - Delete `/api/auth/saml/metadata`

3. **Day 5**: Clean up code
   - Remove `lib/saml/*` modules
   - Remove `@node-saml/node-saml` dependency
   - Remove SAML types

4. **Day 6**: Database cleanup
   - Drop `saml_replay_prevention` table
   - Archive SAML-related migrations

5. **Day 7**: Documentation update
   - Update authentication docs
   - Update deployment guides
   - Create OIDC troubleshooting guide

---

## 5. Security Considerations

### 5.1 Security Comparison Matrix

| Security Feature | SAML | OIDC | Assessment |
|------------------|------|------|------------|
| **CSRF Protection** | State param + signature validation | State param + PKCE | ✅ OIDC stronger (PKCE) |
| **Replay Prevention** | Custom DB tracking | Nonce in ID token | ✅ OIDC simpler, equally secure |
| **Token Validation** | 10 manual steps | Library-validated JWT | ✅ OIDC less error-prone |
| **Certificate Management** | Manual lifecycle | Auto-fetched JWKs | ✅ OIDC reduces attack surface |
| **Clock Skew** | Manual 5s tolerance | Built into JWT validation | ✅ OIDC standard |
| **Issuer Validation** | Manual string match | JWT iss claim validation | ✅ Equal |
| **Audience Validation** | Manual string match | JWT aud claim validation | ✅ Equal |
| **Email Domain Validation** | Custom logic | Custom logic (same) | ✅ Equal |
| **Input Sanitization** | Custom validator | Custom validator (reuse) | ✅ Equal |
| **Audit Logging** | Full audit trail | Full audit trail (same) | ✅ Equal |

**Conclusion**: OIDC maintains or improves security while reducing complexity.

### 5.2 PKCE (Proof Key for Code Exchange)

**Why PKCE?**
- Prevents authorization code interception attacks
- Required for public clients (SPAs, mobile apps)
- Recommended for all OAuth 2.0 flows (RFC 7636)
- Microsoft Entra requires PKCE for security best practices

**Implementation**:
```typescript
// Generate PKCE challenge
import { createHash, randomBytes } from 'crypto';

function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return {
    code_verifier: verifier,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  };
}
```

### 5.3 State Token Security

**Purpose**: Prevent CSRF attacks during authorization flow

**Implementation**:
```typescript
// Generate state token (signed)
async function generateStateToken(request: NextRequest): Promise<string> {
  const state = {
    nonce: nanoid(32),
    timestamp: Date.now(),
    ip: getRequestIP(request),
    originalUrl: request.url
  };

  // Sign with CSRF secret
  const token = await signStateToken(state);
  return token;
}

// Validate state token
async function validateStateToken(request: NextRequest, stateToken: string): Promise<boolean> {
  const state = await verifyStateToken(stateToken);
  if (!state) return false;

  // Check age (5 minutes max)
  if (Date.now() - state.timestamp > 5 * 60 * 1000) return false;

  // Verify IP matches (optional, may break with mobile networks)
  // if (state.ip !== getRequestIP(request)) return false;

  return true;
}
```

### 5.4 Token Storage Security

**Decision: No Entra Token Storage**
- ID tokens validated once, then discarded
- No refresh token storage from Entra
- Our JWT tokens stored as httpOnly cookies (unchanged)

**Rationale**:
- Reduces attack surface (no sensitive Entra tokens in database)
- Simpler token lifecycle management
- Users re-authenticate via OIDC when session expires (acceptable for 7-30 day sessions)
- No token sync issues between Entra and our system

### 5.5 Email Verification Requirement

**Current SAML**: Assumes Entra-verified emails are valid

**OIDC Decision**: Same assumption
- Microsoft Entra verifies emails during account creation
- `email_verified` claim in ID token confirms verification
- We validate this claim during callback
- No additional email verification needed

```typescript
// Validate email_verified claim
if (!idToken.email_verified) {
  throw new Error('Email not verified by identity provider');
}
```

### 5.6 Critical Security Enhancements

Based on security review, the following enhancements are **MANDATORY** for production deployment:

#### **1. OIDC Session Cookie Encryption**
**Severity**: HIGH - PKCE Security

**Problem**: Storing PKCE `codeVerifier` in plaintext cookie exposes it to potential theft, defeating PKCE protection.

**Solution**: Encrypt session data using `iron-session`:

```typescript
import { sealData, unsealData } from 'iron-session';

// In login route - encrypt before storing
const sealed = await sealData(
  { state, codeVerifier, nonce, returnUrl, fingerprint },
  {
    password: process.env.OIDC_SESSION_SECRET!, // 32+ character secret
    ttl: 60 * 10, // 10 minutes
  }
);

cookieStore.set('oidc-session', sealed, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 10,
  path: '/',
});

// In callback route - decrypt
const sessionData = await unsealData<{
  state: string;
  codeVerifier: string;
  nonce: string;
  returnUrl: string;
  fingerprint: string;
}>(sessionCookie.value, {
  password: process.env.OIDC_SESSION_SECRET!,
});
```

**Required**: `OIDC_SESSION_SECRET` environment variable (32+ characters)

#### **2. One-Time State Token Usage**
**Severity**: HIGH - OIDC Spec Compliance

**Problem**: Current design allows state token reuse within 5-minute window, violating OIDC specification.

**Solution**: Implement state manager with one-time use enforcement:

```typescript
// lib/oidc/state-manager.ts
interface StateData {
  timestamp: number;
  used: boolean;
}

class StateManager {
  private states = new Map<string, StateData>();

  registerState(state: string): void {
    this.states.set(state, {
      timestamp: Date.now(),
      used: false,
    });
  }

  validateAndMarkUsed(state: string): boolean {
    const data = this.states.get(state);

    if (!data) return false;
    if (data.used) {
      log.error('State token replay attempt detected');
      return false;
    }

    // Check age (5 minutes + 30s clock skew)
    const age = Date.now() - data.timestamp;
    if (age > 5 * 60 * 1000 + 30 * 1000) {
      this.states.delete(state);
      return false;
    }

    // Mark as used (single-use enforcement)
    data.used = true;

    // Schedule cleanup after 10 minutes
    setTimeout(() => this.states.delete(state), 10 * 60 * 1000);

    return true;
  }
}

export const stateManager = new StateManager();
```

**Alternative for distributed systems**: Use Redis with atomic operations.

#### **3. Session Fingerprint Binding**
**Severity**: MEDIUM-HIGH - Session Hijacking Prevention

**Problem**: Stolen OIDC session cookie can be used from any device.

**Solution**: Bind session to device fingerprint:

```typescript
// In login route - include fingerprint
const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
const userAgent = request.headers.get('user-agent') || 'unknown';
const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);

const sealed = await sealData(
  { state, codeVerifier, nonce, returnUrl, fingerprint }, // Add fingerprint
  { password: process.env.OIDC_SESSION_SECRET!, ttl: 60 * 10 }
);

// In callback route - validate fingerprint
const currentIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
const currentUserAgent = request.headers.get('user-agent') || 'unknown';
const currentFingerprint = generateDeviceFingerprint(currentIp, currentUserAgent);

const STRICT_MODE = process.env.OIDC_STRICT_FINGERPRINT === 'true';

if (sessionData.fingerprint !== currentFingerprint) {
  if (STRICT_MODE) {
    // Reject in strict mode
    log.error('OIDC session hijack attempt', { fingerprint: sessionData.fingerprint.substring(0, 16) });
    return NextResponse.redirect(new URL('/signin?error=session_hijack', request.url));
  } else {
    // Log warning in normal mode (mobile networks can change IPs)
    log.warn('OIDC session fingerprint changed', { fingerprint: sessionData.fingerprint.substring(0, 16) });
  }
}
```

**Configuration**: `OIDC_STRICT_FINGERPRINT` (default: false)

#### **4. Explicit ID Token Validation**
**Severity**: MEDIUM - Defense in Depth

**Problem**: Complete reliance on library validation without explicit verification.

**Solution**: Add defense-in-depth validation layer:

```typescript
// In OIDCClient.handleCallback() - after library validation
const claims = tokenSet.claims();

// 1. Email claim required
if (!claims.email || typeof claims.email !== 'string') {
  throw new Error('ID token missing required email claim');
}

// 2. Email verification required
if (!claims.email_verified) {
  throw new Error('Email not verified by identity provider');
}

// 3. Nonce validation (verify library check)
if (claims.nonce !== expectedNonce) {
  log.error('Nonce mismatch in ID token');
  throw new Error('ID token nonce validation failed');
}

// 4. Issuer validation (verify library check)
const expectedIssuer = `https://login.microsoftonline.com/${this.config!.tenantId}/v2.0`;
if (claims.iss !== expectedIssuer) {
  log.error('Issuer mismatch', { expected: expectedIssuer, received: claims.iss });
  throw new Error('ID token issuer validation failed');
}

// 5. Audience validation (verify library check)
const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
if (!aud.includes(this.config!.clientId)) {
  log.error('Audience mismatch', { expected: this.config!.clientId, received: aud });
  throw new Error('ID token audience validation failed');
}

// 6. Token age check
const now = Math.floor(Date.now() / 1000);
const iat = claims.iat || 0;
const tokenAge = now - iat;

if (tokenAge < 0) {
  log.error('ID token issued in the future', { iat, now });
  throw new Error('ID token timestamp invalid');
}

if (tokenAge > 300) { // 5 minutes
  log.warn('ID token is stale', { tokenAge, iat: new Date(iat * 1000).toISOString() });
}

// 7. Expiration check (verify library check)
const exp = claims.exp || 0;
if (now >= exp) {
  log.error('ID token expired', { exp: new Date(exp * 1000).toISOString() });
  throw new Error('ID token has expired');
}

log.info('ID token validation successful', {
  email: claims.email.replace(/(.{2}).*@/, '$1***@'),
  tokenAge,
});
```

---

## 6. Implementation Details

### 6.1 Module Structure

```
lib/oidc/
├── config.ts           # Configuration management (discovery, env vars)
├── client.ts           # OIDC client wrapper (openid-client) with singleton
├── state-manager.ts    # One-time state token tracking (CRITICAL)
├── validator.ts        # Token validation helpers
├── errors.ts           # Custom error types for specific handling
└── types.ts            # TypeScript type definitions

lib/auth/
├── token-manager.ts    # JWT management (unchanged)
├── input-validator.ts  # Profile sanitization (moved from lib/saml/)
└── password.ts         # Password auth (unchanged)

app/api/auth/oidc/
├── login/route.ts      # Initiate OIDC flow
├── callback/route.ts   # Handle OIDC callback
└── logout/route.ts     # RP-initiated logout

lib/types/
└── oidc.ts            # OIDC type definitions
```

### 6.2 OIDC Client Implementation

```typescript
// lib/oidc/client.ts
import * as oauth from 'openid-client';
import { buildOIDCConfig, type OIDCConfig } from './config';
import { log } from '@/lib/logger';

// Module-level configuration cache (performance optimization)
let cachedConfig: oauth.Configuration | null = null;
let configCachedAt = 0;
const CONFIG_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class OIDCClient {
  private config: OIDCConfig | null = null;
  private oauthConfig: oauth.Configuration | null = null;

  async initialize(): Promise<void> {
    this.config = await buildOIDCConfig();

    const now = Date.now();
    const cacheAge = now - configCachedAt;

    // Use cached configuration if valid (reduces login latency by ~200ms)
    if (cachedConfig && cacheAge < CONFIG_CACHE_TTL) {
      log.debug('Using cached OIDC configuration', { cacheAge: Math.floor(cacheAge / 1000) });
      this.oauthConfig = cachedConfig;
      return;
    }

    // Fetch and cache new configuration
    log.info('Fetching OIDC discovery document', { tenantId: this.config.tenantId });

    try {
      const issuerUrl = new URL(`https://login.microsoftonline.com/${this.config.tenantId}/v2.0`);

      // Discover OIDC configuration from well-known endpoint
      const discoveredConfig = await oauth.discovery(
        issuerUrl,
        this.config.clientId,
        this.config.clientSecret
      );

      cachedConfig = discoveredConfig;
      configCachedAt = now;
      this.oauthConfig = discoveredConfig;

      log.info('OIDC configuration cached successfully', {
        issuer: issuerUrl.href,
        cacheAge: 0,
      });
    } catch (error) {
      log.error('Failed to discover OIDC configuration', {
        error: error instanceof Error ? error.message : 'Unknown',
        tenantId: this.config.tenantId,
      });
      throw new Error('OIDC discovery failed');
    }
  }

  /**
   * Force refresh of cached configuration (for maintenance)
   */
  static clearCache(): void {
    cachedConfig = null;
    configCachedAt = 0;
    log.info('OIDC configuration cache cleared');
  }

  /**
   * Create authorization URL with PKCE
   */
  async createAuthUrl(returnUrl?: string): Promise<{
    url: string;
    state: string;
    codeVerifier: string;
    nonce: string;
  }> {
    if (!this.oauthConfig) await this.initialize();

    // Generate PKCE parameters
    const codeVerifier = oauth.randomPKCECodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
    const state = oauth.randomState();
    const nonce = oauth.randomNonce();

    // Build authorization URL
    const authUrl = new URL(this.oauthConfig!.serverMetadata().authorizationEndpoint!);
    authUrl.searchParams.set('client_id', this.config!.clientId);
    authUrl.searchParams.set('redirect_uri', this.config!.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config!.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    // Optional: Add domain_hint to pre-select organization
    // authUrl.searchParams.set('domain_hint', 'aara.care');

    return { url: authUrl.href, state, codeVerifier, nonce };
  }

  /**
   * Handle callback and validate tokens with explicit defense-in-depth validation
   */
  async handleCallback(
    params: { code: string; state: string },
    expectedState: string,
    expectedNonce: string,
    codeVerifier: string
  ): Promise<{
    email: string;
    emailVerified: boolean;
    name?: string;
    givenName?: string;
    familyName?: string;
    claims: oauth.IDToken;
  }> {
    if (!this.oauthConfig) await this.initialize();

    // Exchange code for tokens (library validates JWT signature, exp, etc.)
    let tokenSet: oauth.TokenEndpointResponse & oauth.TokenEndpointResponseHelpers;
    try {
      // Perform authorization code grant with PKCE
      tokenSet = await oauth.authorizationCodeGrant(
        this.oauthConfig!,
        new URLSearchParams({
          code: params.code,
          state: params.state,
        }),
        {
          pkceCodeVerifier: codeVerifier,
          expectedState,
          expectedNonce,
        }
      );
    } catch (error) {
      log.error('Token exchange failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new Error('OIDC token exchange failed');
    }

    // Get ID token claims
    const claims = oauth.getValidatedIdTokenClaims(tokenSet)!;

    // ===== Explicit Validation (Defense in Depth) =====

    // 1. Email claim required
    if (!claims.email || typeof claims.email !== 'string') {
      log.error('ID token missing email claim', { claims: Object.keys(claims) });
      throw new Error('ID token missing required email claim');
    }

    // 2. Email verification required
    if (!claims.email_verified) {
      log.warn('Email not verified by IDP', {
        email: claims.email.replace(/(.{2}).*@/, '$1***@')
      });
      throw new Error('Email not verified by identity provider');
    }

    // 3. Nonce validation (should be done by library, but verify)
    if (claims.nonce !== expectedNonce) {
      log.error('Nonce mismatch in ID token', {
        expected: expectedNonce.substring(0, 8),
        received: claims.nonce ? String(claims.nonce).substring(0, 8) : 'none',
      });
      throw new Error('ID token nonce validation failed');
    }

    // 4. Issuer validation (should be done by library, but verify)
    const expectedIssuer = `https://login.microsoftonline.com/${this.config!.tenantId}/v2.0`;
    if (claims.iss !== expectedIssuer) {
      log.error('Issuer mismatch in ID token', {
        expected: expectedIssuer,
        received: claims.iss,
      });
      throw new Error('ID token issuer validation failed');
    }

    // 5. Audience validation (should be done by library, but verify)
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.config!.clientId)) {
      log.error('Audience mismatch in ID token', {
        expected: this.config!.clientId,
        received: aud,
      });
      throw new Error('ID token audience validation failed');
    }

    // 6. Check token age (issued_at time)
    const now = Math.floor(Date.now() / 1000);
    const iat = claims.iat || 0;
    const tokenAge = now - iat;

    if (tokenAge < 0) {
      log.error('ID token issued in the future', { iat, now });
      throw new Error('ID token timestamp invalid');
    }

    if (tokenAge > 300) { // 5 minutes
      log.warn('ID token is stale', {
        tokenAge,
        iat: new Date(iat * 1000).toISOString(),
      });
      // Warning only - might be legitimate if clock skew or slow network
    }

    // 7. Check expiration (should be done by library, but verify)
    const exp = claims.exp || 0;
    if (now >= exp) {
      log.error('ID token expired', {
        exp: new Date(exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString(),
      });
      throw new Error('ID token has expired');
    }

    log.info('ID token validation successful', {
      email: claims.email.replace(/(.{2}).*@/, '$1***@'),
      iat: new Date(iat * 1000).toISOString(),
      exp: new Date(exp * 1000).toISOString(),
      tokenAge,
    });

    // Extract user info
    return {
      email: claims.email as string,
      emailVerified: claims.email_verified as boolean,
      name: claims.name as string | undefined,
      givenName: claims.given_name as string | undefined,
      familyName: claims.family_name as string | undefined,
      claims,
    };
  }
}

// ===== Singleton Pattern for Client Instance =====

let clientInstance: OIDCClient | null = null;
let clientInitializing: Promise<OIDCClient> | null = null;

/**
 * Get singleton OIDC client instance
 * Thread-safe initialization with promise caching
 */
export async function getOIDCClient(): Promise<OIDCClient> {
  // Return existing instance
  if (clientInstance) {
    return clientInstance;
  }

  // Wait for ongoing initialization
  if (clientInitializing) {
    return clientInitializing;
  }

  // Initialize new instance
  clientInitializing = (async () => {
    const client = new OIDCClient();
    await client.initialize();
    clientInstance = client;
    clientInitializing = null;
    return client;
  })();

  return clientInitializing;
}

/**
 * Reset client instance (for testing or configuration changes)
 */
export function resetOIDCClient(): void {
  clientInstance = null;
  clientInitializing = null;
  OIDCClient.clearCache();
}
```

### 6.3 Login Route (with Security Enhancements)

```typescript
// app/api/auth/oidc/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sealData } from 'iron-session';
import { publicRoute } from '@/lib/api/route-handler';
import { getOIDCClient } from '@/lib/oidc/client';
import { stateManager } from '@/lib/oidc/state-manager';
import { generateDeviceFingerprint } from '@/lib/auth/token-manager';
import { log } from '@/lib/logger';

const oidcLoginHandler = async (request: NextRequest) => {
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard';

  // Get singleton OIDC client
  const oidcClient = await getOIDCClient();
  const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);

  // Register state for one-time use validation
  stateManager.registerState(state);

  // Generate device fingerprint for session binding
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);

  // Encrypt session data before storing (CRITICAL SECURITY)
  const sealed = await sealData(
    {
      state,
      codeVerifier,
      nonce,
      returnUrl,
      fingerprint,
    },
    {
      password: process.env.OIDC_SESSION_SECRET!,
      ttl: 60 * 10, // 10 minutes
    }
  );

  const cookieStore = await cookies();
  cookieStore.set('oidc-session', sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Must be 'lax' for OAuth redirects
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  log.info('OIDC login initiated', {
    returnUrl,
    fingerprint: fingerprint.substring(0, 16),
  });

  // Redirect to Entra authorization endpoint
  return NextResponse.redirect(url);
};

export const GET = publicRoute(
  oidcLoginHandler,
  'OIDC login initiation',
  { rateLimit: 'auth' }
);
```

### 6.4 Callback Route (with Security Enhancements)

```typescript
// app/api/auth/oidc/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { publicRoute } from '@/lib/api/route-handler';
import { getOIDCClient } from '@/lib/oidc/client';
import { stateManager } from '@/lib/oidc/state-manager';
import { validateEmailDomain } from '@/lib/auth/input-validator';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import { buildOIDCConfig } from '@/lib/oidc/config';
import { log } from '@/lib/logger';

const oidcCallbackHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get callback parameters
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');

    // Check for Entra errors
    if (error) {
      const errorDescription = request.nextUrl.searchParams.get('error_description');
      log.error('OIDC callback error from provider', {
        error,
        errorDescription,
      });

      return NextResponse.redirect(
        new URL(`/signin?error=oidc_provider_error`, request.url)
      );
    }

    if (!code || !state) {
      log.error('OIDC callback missing code or state');
      return NextResponse.redirect(
        new URL('/signin?error=invalid_callback', request.url)
      );
    }

    // Retrieve and decrypt session data from cookie (CRITICAL SECURITY)
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('oidc-session');
    if (!sessionCookie) {
      log.error('OIDC session cookie not found');
      return NextResponse.redirect(
        new URL('/signin?error=session_expired', request.url)
      );
    }

    const sessionData = await unsealData<{
      state: string;
      codeVerifier: string;
      nonce: string;
      returnUrl: string;
      fingerprint: string;
    }>(sessionCookie.value, {
      password: process.env.OIDC_SESSION_SECRET!,
    });

    const { state: expectedState, codeVerifier, nonce, returnUrl, fingerprint } = sessionData;

    // Validate state matches (basic CSRF check)
    if (state !== expectedState) {
      log.error('OIDC state mismatch', { received: state.substring(0, 8), expected: expectedState.substring(0, 8) });
      return NextResponse.redirect(
        new URL('/signin?error=invalid_state', request.url)
      );
    }

    // Validate state is one-time use (CRITICAL - prevents replay attacks)
    if (!stateManager.validateAndMarkUsed(state)) {
      log.error('State token replay or expiration', { state: state.substring(0, 8) });
      await AuditLogger.logAuth({
        action: 'oidc_state_replay_attempt',
        metadata: {
          state: state.substring(0, 8),
        },
      });
      return NextResponse.redirect(
        new URL('/signin?error=invalid_state', request.url)
      );
    }

    // Validate session fingerprint (CRITICAL - prevents session hijacking)
    const currentIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const currentUserAgent = request.headers.get('user-agent') || 'unknown';
    const currentFingerprint = generateDeviceFingerprint(currentIp, currentUserAgent);

    const STRICT_MODE = process.env.OIDC_STRICT_FINGERPRINT === 'true';

    if (fingerprint !== currentFingerprint) {
      if (STRICT_MODE) {
        // Reject in strict mode
        log.error('OIDC session hijack attempt', {
          expected: fingerprint.substring(0, 16),
          received: currentFingerprint.substring(0, 16),
          ipAddress: currentIp,
        });

        await AuditLogger.logAuth({
          action: 'oidc_session_hijack_attempt',
          ipAddress: currentIp,
          userAgent: currentUserAgent,
          metadata: {
            reason: 'fingerprint_mismatch',
          },
        });

        return NextResponse.redirect(
          new URL('/signin?error=session_hijack', request.url)
        );
      } else {
        // Log warning in normal mode (mobile networks can change IPs)
        log.warn('OIDC session fingerprint changed', {
          expected: fingerprint.substring(0, 16),
          received: currentFingerprint.substring(0, 16),
        });
      }
    }

    // Get singleton OIDC client and validate tokens
    const oidcClient = await getOIDCClient();
    const userInfo = await oidcClient.handleCallback(
      { code, state },
      expectedState,
      nonce,
      codeVerifier
    );

    // Note: Email verification already checked in handleCallback() with explicit validation

    // Validate email domain (if configured)
    const config = await buildOIDCConfig();
    if (config.allowedEmailDomains.length > 0) {
      const isAllowed = validateEmailDomain(userInfo.email, config.allowedEmailDomains);
      if (!isAllowed) {
        log.warn('OIDC email domain not allowed', {
          email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
        });

        await AuditLogger.logAuth({
          action: 'login_failed',
          email: userInfo.email,
          metadata: {
            authMethod: 'oidc',
            reason: 'domain_not_allowed',
          },
        });

        return NextResponse.redirect(
          new URL('/signin?error=domain_not_allowed', request.url)
        );
      }
    }

    // Check user pre-provisioning (same as SAML)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, userInfo.email))
      .limit(1);

    if (!user) {
      log.warn('OIDC user not provisioned', {
        email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        email: userInfo.email,
        metadata: {
          authMethod: 'oidc',
          reason: 'user_not_provisioned',
        },
      });

      return NextResponse.redirect(
        new URL(`/signin?error=user_not_provisioned&email=${encodeURIComponent(userInfo.email)}`, request.url)
      );
    }

    // Check user active
    if (!user.is_active) {
      log.warn('OIDC inactive user attempted login', {
        userId: user.user_id,
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        email: userInfo.email,
        metadata: {
          authMethod: 'oidc',
          reason: 'user_inactive',
        },
      });

      return NextResponse.redirect(
        new URL('/signin?error=user_inactive', request.url)
      );
    }

    // Generate device info (same as current system)
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent);
    const deviceName = generateDeviceName(userAgent);

    const deviceInfo = { ipAddress, userAgent, fingerprint: deviceFingerprint, deviceName };

    // Get user context
    const userContext = await getCachedUserContextSafe(user.user_id);

    // Create JWT tokens (our tokens, not Entra tokens)
    const tokenPair = await createTokenPair(
      user.user_id,
      deviceInfo,
      false, // rememberMe = false for OIDC
      userInfo.email
    );

    // Set cookies
    const isSecureEnvironment = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60; // 7 days

    cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });

    cookieStore.set('access-token', tokenPair.accessToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    // Delete OIDC session cookie
    cookieStore.delete('oidc-session');

    // Audit log
    await AuditLogger.logAuth({
      action: 'login',
      userId: user.user_id,
      email: userInfo.email,
      ipAddress,
      userAgent,
      metadata: {
        authMethod: 'oidc',
        sessionId: tokenPair.sessionId,
        deviceFingerprint,
      },
    });

    log.info('OIDC authentication successful', {
      userId: user.user_id,
      duration: Date.now() - startTime,
    });

    // Redirect to return URL
    return NextResponse.redirect(new URL(returnUrl || '/dashboard', request.url));

  } catch (error) {
    log.error('OIDC callback error', {
      error: error instanceof Error ? error.message : 'Unknown',
      duration: Date.now() - startTime,
    });

    await AuditLogger.logAuth({
      action: 'login_failed',
      metadata: {
        authMethod: 'oidc',
        error: error instanceof Error ? error.message : 'Unknown',
      },
    });

    return NextResponse.redirect(
      new URL('/signin?error=oidc_callback_failed', request.url)
    );
  }
};

export const GET = publicRoute(
  oidcCallbackHandler,
  'OIDC callback handler',
  { rateLimit: 'auth' }
);
```

### 6.5 Middleware Changes

**Required**: Update CSRF exempt paths

```typescript
// middleware.ts
const CSRF_EXEMPT_PATHS = [
  '/api/health',
  '/api/csrf',
  '/api/webhooks/',
  '/api/security/csp-report',
  '/api/auth/saml/callback',   // Keep during migration
  '/api/auth/oidc/callback',   // Add OIDC callback (state validation instead of CSRF)
];
```

**No other middleware changes needed** - OIDC reuses existing JWT authentication after initial login.

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
// tests/unit/oidc/client.test.ts
describe('OIDCClient', () => {
  it('should generate valid authorization URL with PKCE', async () => {
    const client = new OIDCClient();
    const { url, state, codeVerifier, nonce } = await client.createAuthUrl();

    expect(url).toContain('code_challenge');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=');
    expect(url).toContain('nonce=');
    expect(codeVerifier).toHaveLength(43); // Base64URL(32 bytes)
  });

  it('should validate ID token correctly', async () => {
    const client = new OIDCClient();
    const mockTokenSet = createMockTokenSet({
      email: 'test@aara.care',
      email_verified: true,
    });

    const userInfo = await client.handleCallback(
      { code: 'mock-code', state: 'mock-state' },
      'mock-state',
      'mock-nonce',
      'mock-verifier'
    );

    expect(userInfo.email).toBe('test@aara.care');
    expect(userInfo.emailVerified).toBe(true);
  });

  it('should reject unverified email', async () => {
    const client = new OIDCClient();
    const mockTokenSet = createMockTokenSet({
      email: 'test@aara.care',
      email_verified: false,
    });

    await expect(
      client.handleCallback(
        { code: 'mock-code', state: 'mock-state' },
        'mock-state',
        'mock-nonce',
        'mock-verifier'
      )
    ).rejects.toThrow('Email not verified');
  });
});
```

### 7.2 Integration Tests

```typescript
// tests/integration/oidc-auth-flow.test.ts
describe('OIDC Authentication Flow', () => {
  it('should complete full login flow', async () => {
    // 1. Initiate login
    const loginResponse = await fetch('/api/auth/oidc/login');
    expect(loginResponse.status).toBe(302);

    const authUrl = loginResponse.headers.get('location');
    expect(authUrl).toContain('login.microsoftonline.com');

    const cookies = parseCookies(loginResponse.headers.get('set-cookie'));
    expect(cookies['oidc-session']).toBeDefined();

    // 2. Simulate callback (with mocked token exchange)
    const callbackResponse = await fetch(
      `/api/auth/oidc/callback?code=mock-code&state=${cookies['oidc-session'].state}`,
      { headers: { Cookie: serializeCookies(cookies) } }
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toContain('/dashboard');

    // 3. Verify tokens set
    const responseCookies = parseCookies(callbackResponse.headers.get('set-cookie'));
    expect(responseCookies['access-token']).toBeDefined();
    expect(responseCookies['refresh-token']).toBeDefined();
    expect(responseCookies['oidc-session']).toBeUndefined(); // Should be deleted
  });

  it('should reject invalid state', async () => {
    const callbackResponse = await fetch(
      '/api/auth/oidc/callback?code=mock-code&state=invalid-state'
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toContain('error=invalid_state');
  });

  it('should reject non-provisioned user', async () => {
    // Mock user that doesn't exist in database
    const callbackResponse = await fetch(
      '/api/auth/oidc/callback?code=mock-code&state=valid-state',
      {
        // Mock token response with non-existent user
      }
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toContain('error=user_not_provisioned');
  });
});
```

### 7.3 E2E Tests

```typescript
// tests/e2e/oidc-login.test.ts (Playwright/Cypress)
describe('OIDC Login E2E', () => {
  it('should login successfully via OIDC', async () => {
    await page.goto('/signin');

    // Click OIDC login button
    await page.click('button:has-text("Sign in with Microsoft")');

    // Redirected to Microsoft login
    await expect(page).toHaveURL(/login\.microsoftonline\.com/);

    // Fill in credentials (use test account)
    await page.fill('input[type="email"]', 'test@aara.care');
    await page.click('input[type="submit"]');
    await page.fill('input[type="password"]', 'test-password');
    await page.click('input[type="submit"]');

    // Redirected back to app
    await expect(page).toHaveURL('/dashboard');

    // Verify user is logged in
    const userName = await page.textContent('[data-testid="user-name"]');
    expect(userName).toContain('Test User');
  });
});
```

### 7.4 Security Tests

```typescript
// tests/integration/security/oidc-security.test.ts
describe('OIDC Security', () => {
  it('should reject replay attack (reused state)', async () => {
    const { state } = await initiateOIDCLogin();

    // First callback (should succeed)
    const firstResponse = await completeOIDCCallback(state);
    expect(firstResponse.status).toBe(302);

    // Second callback with same state (should fail)
    const replayResponse = await completeOIDCCallback(state);
    expect(replayResponse.status).toBe(302);
    expect(replayResponse.headers.get('location')).toContain('error=session_expired');
  });

  it('should reject PKCE bypass attempt', async () => {
    const { state, codeVerifier } = await initiateOIDCLogin();

    // Attempt callback with wrong verifier
    const response = await completeOIDCCallback(state, 'wrong-verifier');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('error');
  });

  it('should validate email domain', async () => {
    // Mock ID token with non-allowed domain
    const response = await completeOIDCCallback('valid-state', {
      email: 'hacker@evil.com',
      email_verified: true,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('error=domain_not_allowed');
  });
});
```

---

## 8. Rollback Plan

### 8.1 Rollback Triggers

**Automatic Rollback** if:
- Authentication success rate drops below 95%
- Error rate exceeds 5%
- Response time exceeds 5 seconds (p95)
- Critical security issue discovered

**Manual Rollback** if:
- User feedback indicates major UX issues
- Integration issues with downstream systems
- Performance degradation

### 8.2 Rollback Procedure

#### **Phase 1: Immediate Rollback (5 minutes)**

```bash
# 1. Update environment variable to disable OIDC
export OIDC_ENABLED=false

# 2. Restart application
pm2 restart bendcare-os

# 3. Monitor logs
pm2 logs bendcare-os --lines 100
```

#### **Phase 2: Route Revert (if needed)**

```typescript
// app/signin/page.tsx
// Hide OIDC button, show only password + SAML
const showOIDC = process.env.OIDC_ENABLED === 'true';

{showOIDC && (
  <button onClick={handleOIDCLogin}>
    Sign in with Microsoft (OIDC)
  </button>
)}
```

#### **Phase 3: Code Revert (if catastrophic)**

```bash
# Revert to pre-OIDC commit
git revert <oidc-merge-commit>
git push origin main

# Deploy previous version
./deploy.sh production
```

### 8.3 Data Integrity

**No data migration required** - OIDC uses same user database and JWT system as SAML.

**No cleanup needed** - OIDC doesn't create new database tables (unlike SAML).

**Session continuity** - Existing JWT sessions unaffected by OIDC changes.

---

## 9. Success Metrics

### 9.1 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Login latency (p50) | <1.5s | Time from click to dashboard |
| Login latency (p95) | <3s | 95th percentile |
| Authentication success rate | >99% | Successful logins / total attempts |
| Error rate | <0.1% | Failed logins / total attempts |
| OIDC session cookie size | <1KB | Encrypted session data size |

### 9.2 Code Metrics

| Metric | Current (SAML) | Target (OIDC) | Improvement |
|--------|----------------|---------------|-------------|
| Total lines of auth code | ~2,840 | ~1,200 | **-58%** |
| Number of modules | 6 | 3 | **-50%** |
| Database tables | 1 (replay prevention) | 0 | **-100%** |
| External dependencies | `@node-saml/node-saml` | `openid-client` | Smaller, certified |
| Test complexity | High (XML mocking) | Medium (JWT mocking) | **Simpler** |

### 9.3 Security Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| No security regressions | 0 | Security audit findings |
| PKCE implementation | 100% | Code review compliance |
| State validation rate | 100% | All callbacks validated |
| Email verification rate | 100% | All logins verify email_verified |
| Audit log completeness | 100% | All auth events logged |

### 9.4 User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User-reported issues | <5 per 1000 users | Support tickets |
| Login abandonment rate | <2% | Users who start but don't complete |
| Multi-domain support | 5/5 domains working | All domains tested |
| Browser compatibility | >98% | Chrome, Safari, Firefox, Edge |

---

## 10. Appendices

### Appendix A: Environment Variable Reference

```bash
# ========================================
# OIDC Configuration (Microsoft Entra)
# ========================================

# Required: Microsoft Entra Tenant ID (UUID)
# Where to find: Azure Portal → Entra ID → Overview → Tenant ID
ENTRA_TENANT_ID=12345678-1234-1234-1234-123456789012

# Required: Application (Client) ID
# Where to find: Azure Portal → App Registrations → Your App → Overview
ENTRA_CLIENT_ID=abcd1234-5678-90ab-cdef-1234567890ab

# Required: Client Secret
# Where to find: Azure Portal → App Registrations → Your App → Certificates & secrets
# SECURITY: Rotate every 90 days
ENTRA_CLIENT_SECRET=your_client_secret_here

# Required: Application URLs
NEXT_PUBLIC_APP_URL=https://app.bendcare.com
OIDC_REDIRECT_URI=https://app.bendcare.com/api/auth/oidc/callback

# Optional: Custom configurations
OIDC_SUCCESS_REDIRECT=/dashboard
OIDC_SCOPES=openid profile email
OIDC_ALLOWED_DOMAINS=aara.care,sparc.care,illumination.health,bendcare.com,oasis.care

# Optional: Feature flag for staged rollout
OIDC_ENABLED=true

# ========================================
# Existing Configuration (unchanged)
# ========================================
JWT_ACCESS_SECRET=<your-access-secret>
JWT_REFRESH_SECRET=<your-refresh-secret>
CSRF_SECRET=<your-csrf-secret>
DATABASE_URL=<your-database-url>
```

### Appendix B: Microsoft Entra Configuration

**App Registration Setup**:

1. **Create App Registration**
   - Name: "BendCare OS OIDC"
   - Supported account types: "Single tenant"
   - Redirect URI: `https://app.bendcare.com/api/auth/oidc/callback`

2. **Authentication Settings**
   - Platform: Web
   - Redirect URIs: Add all environment URLs
     - Production: `https://app.bendcare.com/api/auth/oidc/callback`
     - Staging: `https://staging.bendcare.com/api/auth/oidc/callback`
     - Development: `http://localhost:4001/api/auth/oidc/callback`
   - Implicit grant: **Disabled** (using Authorization Code Flow)
   - Allow public client flows: **No**

3. **Certificates & Secrets**
   - Create client secret
   - Set expiration: 90 days (best practice)
   - Store in environment variables

4. **API Permissions**
   - Required permissions:
     - `openid` (required for OIDC)
     - `profile` (user name, etc.)
     - `email` (user email)
   - Optional permissions (if needed):
     - `User.Read` (Microsoft Graph API)
   - Grant admin consent

5. **Token Configuration**
   - Optional claims:
     - Email: `email`
     - Name: `given_name`, `family_name`, `name`
   - Access token version: v2

### Appendix C: Comparison Table - SAML vs OIDC

| Aspect | SAML | OIDC |
|--------|------|------|
| **Protocol Base** | XML-based | JSON-based (OAuth 2.0) |
| **Token Format** | XML Assertions | JWT (JSON Web Token) |
| **Primary Use Case** | Enterprise SSO | Modern web/mobile apps |
| **Complexity** | High (XML parsing, signatures) | Low (standard JWT) |
| **Mobile Support** | Poor (XML heavy) | Excellent (lightweight JSON) |
| **Browser Support** | Universal | Universal |
| **Standardization** | OASIS SAML 2.0 (2005) | OpenID Connect 1.0 (2014) |
| **Library Ecosystem** | Limited | Extensive |
| **Token Size** | Large (XML, base64) | Small (JWT, base64url) |
| **Metadata Format** | XML FederationMetadata | JSON Discovery Document |
| **Certificate Management** | Manual (X509) | Automatic (JWKs) |
| **Replay Prevention** | Custom implementation | Built-in (nonce) |
| **CSRF Protection** | Custom (signature validation) | Built-in (state + PKCE) |
| **Clock Skew Handling** | Manual | Built into JWT validation |
| **Learning Curve** | Steep | Moderate |
| **Debugging** | Difficult (XML, base64) | Easy (JSON, readable) |
| **OAuth 2.0 Compatibility** | No | Yes (built on OAuth 2.0) |
| **Refresh Tokens** | No standard | Built-in |
| **Scopes** | No standard | Built-in (granular access) |
| **Session Management** | Custom | Built-in (session_state) |

### Appendix D: Migration Checklist

#### **Pre-Migration**
- [ ] Create Entra app registration
- [ ] Configure redirect URIs for all environments
- [ ] Generate and store client secret
- [ ] Test OIDC flow in development
- [ ] Create rollback plan
- [ ] Update documentation

#### **Code Changes**
- [ ] Add `openid-client` dependency
- [ ] Create `lib/oidc/` modules
- [ ] Create `/api/auth/oidc/` routes
- [ ] Update middleware CSRF exemptions
- [ ] Move `lib/saml/input-validator.ts` to `lib/auth/`
- [ ] Add OIDC button to login page
- [ ] Update environment variable documentation

#### **Testing**
- [ ] Unit tests for OIDC client
- [ ] Integration tests for OIDC flow
- [ ] Security tests (PKCE, state validation)
- [ ] E2E tests for all 5 domains
- [ ] Performance testing (login latency)
- [ ] Browser compatibility testing

#### **Deployment**
- [ ] Deploy to development environment
- [ ] Internal team testing
- [ ] Deploy to staging environment
- [ ] Pilot user testing (5-10 users per domain)
- [ ] Monitor metrics for 24 hours
- [ ] Deploy to production (staged rollout)
- [ ] Monitor for 1 week

#### **Post-Migration**
- [ ] Verify zero SAML usage
- [ ] Remove SAML routes
- [ ] Remove `lib/saml/` modules
- [ ] Remove `@node-saml/node-saml` dependency
- [ ] Drop `saml_replay_prevention` table
- [ ] Update API documentation
- [ ] Create OIDC troubleshooting guide
- [ ] Archive SAML documentation

### Appendix E: Troubleshooting Guide

#### **Common Issues**

**Issue: "Invalid state" error during callback**
- **Cause**: State cookie expired (>10 minutes) or browser blocked cookies
- **Solution**: Retry login flow, check browser cookie settings

**Issue: "Email not verified" error**
- **Cause**: User's email not verified in Entra
- **Solution**: User must verify email in Microsoft account settings

**Issue: "User not provisioned" error**
- **Cause**: User doesn't exist in our database
- **Solution**: Admin must create user account first (pre-provisioning required)

**Issue: "Domain not allowed" error**
- **Cause**: User's email domain not in `OIDC_ALLOWED_DOMAINS`
- **Solution**: Add domain to environment variable or remove restriction

**Issue: PKCE validation failure**
- **Cause**: `code_verifier` not matching `code_challenge`
- **Solution**: Check OIDC session cookie integrity, browser compatibility

**Issue: Login redirect loop**
- **Cause**: JWT cookies not being set properly
- **Solution**: Check `sameSite` cookie attribute, HTTPS in production

#### **Debugging Steps**

1. **Check OIDC configuration**
   ```bash
   curl https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration
   ```

2. **Verify redirect URI matches Entra configuration**
   - Exact match required (including protocol, domain, path)

3. **Inspect OIDC session cookie**
   - Should contain `state`, `codeVerifier`, `nonce`
   - Should expire in 10 minutes

4. **Check application logs**
   - Search for "OIDC" in logs
   - Look for error details in metadata

5. **Test with OIDC playground**
   - Use https://oidcdebugger.com/ to validate configuration

---

## 11. Conclusion

### 11.1 Summary

Converting from SAML to OIDC will:
- **Reduce complexity** by 60-70% (from ~2,840 to ~1,400 lines including security enhancements)
- **Eliminate custom security infrastructure** (replay prevention database)
- **Simplify certificate management** (auto-fetched JWKs)
- **Improve maintainability** (standard protocol, better libraries)
- **Enhance security posture** with:
  - Encrypted session cookies (PKCE protection)
  - One-time state tokens (replay prevention)
  - Device fingerprint binding (hijacking prevention)
  - Explicit ID token validation (defense-in-depth)
  - RP-initiated logout (complete session termination)
- **Improve performance** via discovery caching (~200ms faster logins)
- **Support all 5 domains** with minimal configuration

### 11.2 Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Authentication failures | Low | High | Staged rollout, monitoring, rollback plan |
| Performance degradation | Low | Medium | Load testing, caching strategy |
| Security regression | Very Low | Critical | Security audit, penetration testing |
| User confusion | Low | Low | Clear UI, documentation |
| Integration issues | Low | Medium | Comprehensive testing |

### 11.3 Recommendation

**Proceed with OIDC conversion** based on:
1. Significant code reduction and simplification (still 50% less code than SAML)
2. Elimination of custom security infrastructure (no replay database)
3. Industry standard protocol with excellent library support
4. **Enhanced security** with production-grade defenses:
   - Encrypted session cookies
   - One-time state tokens
   - Device fingerprint binding
   - Explicit validation
5. Better long-term maintainability
6. Minimal configuration required (only 2 new env vars)
7. Performance improvements via caching

**Timeline**: 5-6 weeks from start to full SAML deprecation

**Effort Estimate**: ~104 hours
- **Phase 1 (Development)**: 52 hours
  - Base OIDC implementation: 40 hours
  - Critical security enhancements: 12 hours
    - Session encryption: 3 hours
    - State replay prevention: 4 hours
    - Fingerprint binding: 2 hours
    - Explicit validation: 3 hours
- **Phase 2 (Feature Parity)**: 24 hours
  - Architecture improvements: 8 hours (caching, singleton, logout, errors)
  - Code quality enhancements: 8 hours (types, error handling)
  - UX enhancements: 8 hours
- **Phase 3 (Testing)**: 28 hours
  - Security testing: 12 hours
  - Integration testing: 8 hours
  - E2E testing: 8 hours

**Team**: 2 developers, 2.5 weeks at 50% allocation

**Note**: The +24 hours for security enhancements is **non-negotiable** for production deployment but represents a sound investment in security posture.

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-10 | System Architecture | Initial design document |
| 1.1 | 2025-10-03 | System Architecture | **Integrated security review recommendations**: Added critical security enhancements (encrypted sessions, one-time state tokens, fingerprint binding, explicit validation), architecture improvements (caching, singleton, logout), updated effort estimates to 104 hours (5-6 weeks) |

**Approvals Required**:
- [ ] CTO/Technical Lead
- [ ] Security Team
- [ ] DevOps Team
- [ ] Product Owner

**Next Steps**:
1. Review and approve this design document
2. Create Entra app registration
3. Begin Phase 1 implementation
4. Schedule deployment windows
