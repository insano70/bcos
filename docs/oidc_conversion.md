# OIDC Conversion Design Document

**Version**: 1.0
**Date**: 2025-01-10
**Status**: Design Review
**Author**: System Architecture Team

## Executive Summary

This document outlines the design for converting from SAML-based Single Sign-On (SSO) to OpenID Connect (OIDC) with Microsoft Entra ID. The goal is to simplify authentication infrastructure while maintaining security and supporting multiple domain organizations with minimal configuration.

**Key Benefits of OIDC Conversion**:
- **60-70% reduction in custom code** (from ~2,500 lines to ~800-1,200 lines)
- **Elimination of database infrastructure** for replay prevention
- **Automatic certificate/key management** via JWKs (no manual cert lifecycle)
- **Built-in security features** (nonce, state, token validation)
- **Simpler configuration** (minimal environment variables)
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
"openid-client": "^5.8.0",         // OIDC protocol library (official certified)
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

# Optional: Custom configurations
OIDC_SUCCESS_REDIRECT=/dashboard           # Default: /dashboard
OIDC_SCOPES=openid profile email          # Default: openid profile email
OIDC_ALLOWED_DOMAINS=aara.care,sparc.care,illumination.health,bendcare.com,oasis.care
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

### 4.1 Phase 1: Parallel Development (Week 1-2)

**Goal**: Build OIDC alongside SAML without disruption

#### **Tasks**
1. Add `openid-client` dependency
2. Create OIDC modules (in parallel with SAML):
   - `lib/oidc/config.ts` - Configuration management
   - `lib/oidc/client.ts` - OIDC client wrapper
   - `lib/oidc/validator.ts` - Token validation
   - `lib/types/oidc.ts` - Type definitions
3. Create new API routes:
   - `app/api/auth/oidc/login/route.ts` - Initiate OIDC flow
   - `app/api/auth/oidc/callback/route.ts` - Handle callback
4. Reuse existing modules:
   - `lib/saml/input-validator.ts` → Rename to `lib/auth/input-validator.ts`
   - `lib/auth/token-manager.ts` - No changes needed
   - `lib/rbac/*` - No changes needed
5. Update login page to show OIDC option

#### **Testing**
- Unit tests for OIDC client
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
- [x] CSRF protection for callback
- [x] Error handling
- [x] Security logging

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

---

## 6. Implementation Details

### 6.1 Module Structure

```
lib/oidc/
├── config.ts           # Configuration management (discovery, env vars)
├── client.ts           # OIDC client wrapper (openid-client)
├── validator.ts        # Token validation helpers
└── types.ts            # TypeScript type definitions

lib/auth/
├── token-manager.ts    # JWT management (unchanged)
├── input-validator.ts  # Profile sanitization (moved from lib/saml/)
└── password.ts         # Password auth (unchanged)

app/api/auth/oidc/
├── login/route.ts      # Initiate OIDC flow
└── callback/route.ts   # Handle OIDC callback

lib/types/
└── oidc.ts            # OIDC type definitions
```

### 6.2 OIDC Client Implementation

```typescript
// lib/oidc/client.ts
import { Issuer, Client, generators } from 'openid-client';
import { buildOIDCConfig } from './config';

export class OIDCClient {
  private client: Client | null = null;
  private config: OIDCConfig | null = null;

  async initialize(): Promise<void> {
    this.config = await buildOIDCConfig();

    // Discover OIDC provider (Microsoft Entra)
    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`
    );

    // Create client
    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.redirectUri],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    });
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
    if (!this.client) await this.initialize();

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const nonce = generators.nonce();

    const url = this.client!.authorizationUrl({
      scope: this.config!.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      // Optional: Add domain_hint to pre-select organization
      // domain_hint: 'aara.care'
    });

    return { url, state, codeVerifier, nonce };
  }

  /**
   * Handle callback and validate tokens
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
    claims: Record<string, unknown>;
  }> {
    if (!this.client) await this.initialize();

    // Exchange code for tokens
    const tokenSet = await this.client!.callback(
      this.config!.redirectUri,
      params,
      {
        code_verifier: codeVerifier,
        state: expectedState,
        nonce: expectedNonce,
      }
    );

    // Validate ID token (library does this automatically)
    const claims = tokenSet.claims();

    // Extract user info
    return {
      email: claims.email as string,
      emailVerified: claims.email_verified as boolean,
      name: claims.name as string | undefined,
      givenName: claims.given_name as string | undefined,
      familyName: claims.family_name as string | undefined,
      claims: claims as Record<string, unknown>,
    };
  }
}
```

### 6.3 Login Route

```typescript
// app/api/auth/oidc/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handler';
import { OIDCClient } from '@/lib/oidc/client';
import { cookies } from 'next/headers';

const oidcLoginHandler = async (request: NextRequest) => {
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard';

  // Create OIDC client
  const oidcClient = new OIDCClient();
  const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);

  // Store PKCE and state in httpOnly cookie (encrypted)
  const cookieStore = await cookies();
  const sessionData = JSON.stringify({ state, codeVerifier, nonce, returnUrl });

  cookieStore.set('oidc-session', sessionData, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Must be 'lax' for OAuth redirects
    maxAge: 60 * 10, // 10 minutes
    path: '/',
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

### 6.4 Callback Route

```typescript
// app/api/auth/oidc/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { publicRoute } from '@/lib/api/route-handler';
import { OIDCClient } from '@/lib/oidc/client';
import { validateEmailDomain } from '@/lib/auth/input-validator';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
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

    // Retrieve session data from cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('oidc-session');
    if (!sessionCookie) {
      log.error('OIDC session cookie not found');
      return NextResponse.redirect(
        new URL('/signin?error=session_expired', request.url)
      );
    }

    const sessionData = JSON.parse(sessionCookie.value);
    const { state: expectedState, codeVerifier, nonce, returnUrl } = sessionData;

    // Validate state (CSRF protection)
    if (state !== expectedState) {
      log.error('OIDC state mismatch', { received: state, expected: expectedState });
      return NextResponse.redirect(
        new URL('/signin?error=invalid_state', request.url)
      );
    }

    // Exchange code for tokens and validate
    const oidcClient = new OIDCClient();
    const userInfo = await oidcClient.handleCallback(
      { code, state },
      expectedState,
      nonce,
      codeVerifier
    );

    // Validate email verified
    if (!userInfo.emailVerified) {
      log.warn('OIDC email not verified', { email: userInfo.email });
      return NextResponse.redirect(
        new URL('/signin?error=email_not_verified', request.url)
      );
    }

    // Validate email domain (if configured)
    const config = await getOIDCConfig();
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
- **Reduce complexity** by 60-70% (from ~2,840 to ~1,200 lines)
- **Eliminate custom security infrastructure** (replay prevention database)
- **Simplify certificate management** (auto-fetched JWKs)
- **Improve maintainability** (standard protocol, better libraries)
- **Maintain security posture** (equivalent or better than SAML)
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
1. Significant code reduction and simplification
2. Elimination of custom security infrastructure
3. Industry standard protocol with excellent library support
4. Equivalent security with built-in protections (PKCE, nonce, state)
5. Better long-term maintainability
6. Minimal configuration required

**Timeline**: 4-5 weeks from start to full SAML deprecation

**Effort**: ~80 hours (2 developers, 2 weeks at 50% allocation)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-10 | System Architecture | Initial design document |

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
