# OpenID Connect (OIDC) Implementation Technical Specification

**System:** BendCare OS
**Identity Provider:** Microsoft Entra ID (formerly Azure AD)
**Protocol:** OpenID Connect 1.0 with OAuth 2.0 Authorization Code Flow + PKCE
**Document Version:** 1.1
**Last Updated:** 2025-10-05

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Authentication Flow](#authentication-flow)
4. [Security Controls](#security-controls)
5. [Microsoft Entra ID Configuration](#microsoft-entra-id-configuration)
6. [Session Management](#session-management)
7. [Token Management](#token-management)
8. [Error Handling](#error-handling)
9. [Audit & Compliance](#audit--compliance)
10. [API Endpoints](#api-endpoints)
11. [Data Flow Diagrams](#data-flow-diagrams)
12. [Security Threat Model](#security-threat-model)
13. [Production Considerations](#production-considerations)

---

## Executive Summary

This document provides a comprehensive technical specification of the OIDC implementation for third-party security review. The implementation uses **OpenID Connect 1.0** with **OAuth 2.0 Authorization Code Flow** enhanced with **PKCE (Proof Key for Code Exchange)** for authentication against **Microsoft Entra ID**.

### Key Security Features

- **PKCE (RFC 7636):** Prevents authorization code interception attacks
- **State Token One-Time Use:** Prevents CSRF and replay attacks
- **Nonce Validation:** Prevents token replay attacks
- **Device Fingerprinting:** Prevents session hijacking
- **AES-256-GCM Session Encryption:** Protects PKCE code_verifier in transit
- **Strict Cookie Policy:** `sameSite: 'strict'` prevents CSRF attacks
- **Defense-in-Depth ID Token Validation:** Multiple independent validation layers
- **Email Domain Verification:** Microsoft xms_edov claim validation

### Compliance

- HIPAA-compliant audit logging
- OIDC 1.0 specification compliant
- OAuth 2.0 RFC 6749 compliant
- PKCE RFC 7636 compliant
- Follows OWASP authentication best practices

---

## Architecture Overview

### Components

```
┌─────────────────┐
│   Web Browser   │
│   (User Agent)  │
└────────┬────────┘
         │
         ├─── HTTPS ───┐
         │             │
         ▼             ▼
┌──────────────┐  ┌──────────────────────────┐
│  BendCare OS │  │  Microsoft Entra ID      │
│  Next.js App │  │  (Identity Provider)     │
└──────┬───────┘  └──────────────────────────┘
       │
       ├─── Encrypted Session Cookie (iron-session AES-256-GCM)
       ├─── Auth Cookies (httpOnly, secure, sameSite: strict)
       │
       ▼
┌──────────────────────┐
│   PostgreSQL DB      │
│   - Users            │
│   - Sessions         │
│   - Audit Logs       │
└──────────────────────┘
```

### Technology Stack

- **Application Framework:** Next.js 15.1.3 (App Router)
- **Runtime:** Node.js (server-side routes only)
- **OIDC Library:** openid-client v6.8.1
- **Session Encryption:** iron-session v8.0.4 (AES-256-GCM)
- **Database:** PostgreSQL with Drizzle ORM
- **Token Format:** JWT (HS256 for internal tokens, RS256 for OIDC)

### Network Architecture

```
Internet
    │
    ▼
┌─────────────────────────┐
│   Load Balancer/CDN     │
│   (HTTPS Termination)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Next.js Application   │
│   (Node.js Runtime)     │
│                         │
│   Ports:                │
│   - 4001 (dev)          │
│   - 443 (prod via LB)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   PostgreSQL Database   │
│   (Private Network)     │
└─────────────────────────┘
```

---

## Authentication Flow

### Complete OIDC Flow (Step-by-Step)

#### Phase 1: Login Initiation

**Endpoint:** `GET /api/auth/oidc/login`

1. **User Action:** User clicks "Sign in with Microsoft" button
   - Browser shows loading state: "Authenticating with Microsoft..."

2. **Request Processing:**
   ```
   GET /api/auth/oidc/login?returnUrl=/dashboard
   ```

3. **OIDC Client Initialization:**
   - Performs OIDC discovery at: `https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration`
   - Retrieves authorization endpoint, token endpoint, JWKS URI
   - Discovery response cached for performance (~200ms saved on subsequent requests)

4. **PKCE Parameter Generation:**
   ```javascript
   code_verifier = random_string(128_characters) // High-entropy random string
   code_challenge = base64url(sha256(code_verifier))
   code_challenge_method = "S256"
   ```

5. **State Token Generation:**
   ```javascript
   state = random_string(43_characters) // Cryptographically secure random
   ```
   - State registered in StateManager (in-memory Map with 5-minute TTL)
   - Marked as "unused" for one-time validation

6. **Nonce Generation:**
   ```javascript
   nonce = random_string(43_characters) // Cryptographically secure random
   ```

7. **Device Fingerprint Calculation:**
   ```javascript
   fingerprint = sha256(ip_address + user_agent)
   ```
   - Uses `x-forwarded-for` header for IP (handles proxies)
   - Full user-agent string for device identification

8. **Session Data Encryption:**
   ```javascript
   sessionData = {
     state: "AiGaLQuQ...",
     nonce: "NFH_2k1q...",
     codeVerifier: "rKn8FvWm...",
     returnUrl: "/dashboard",
     fingerprint: "509e1380d10c32b4..."
   }

   encryptedSession = sealData(sessionData, {
     password: process.env.OIDC_SESSION_SECRET,
     ttl: 600 // 10 minutes
   })
   ```
   - Uses iron-session with AES-256-GCM encryption
   - HMAC-SHA256 for integrity verification
   - 10-minute expiration

9. **Session Cookie Set:**
   ```javascript
   Set-Cookie: oidc-session={encrypted_data};
               HttpOnly;
               Secure (production);
               SameSite=Lax;
               Max-Age=600;
               Path=/
   ```

10. **Authorization URL Construction:**
    ```
    https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize?
      client_id={clientId}
      &response_type=code
      &redirect_uri=https://yourdomain.com/api/auth/oidc/callback
      &response_mode=query
      &scope=openid+profile+email
      &state={state}
      &nonce={nonce}
      &code_challenge={code_challenge}
      &code_challenge_method=S256
    ```

11. **Redirect Response:**
    ```
    HTTP/1.1 307 Temporary Redirect
    Location: {authorization_url}
    Set-Cookie: oidc-session=...
    ```

#### Phase 2: Microsoft Entra ID Authentication

12. **User Redirected to Microsoft:**
    - Browser navigates to Microsoft login page
    - User sees Microsoft Entra ID login interface

13. **User Authentication at Microsoft:**
    - User enters Microsoft credentials (email/password)
    - May include MFA (Microsoft Authenticator, SMS, etc.)
    - Microsoft validates credentials against Azure AD

14. **User Consent (if required):**
    - First-time users may see consent screen
    - Permissions requested: openid, profile, email
    - User approves access

15. **Microsoft Authorization Decision:**
    - Microsoft validates all parameters
    - Generates authorization code
    - Authorization code is single-use, 10-minute expiration

16. **Redirect Back to Application:**
    ```
    HTTP/1.1 302 Found
    Location: https://yourdomain.com/api/auth/oidc/callback?
              code={authorization_code}
              &state={state}
              &session_state={session_id}
    ```

#### Phase 3: Callback Processing

**Endpoint:** `GET /api/auth/oidc/callback`

17. **Callback Request Received:**
    ```
    GET /api/auth/oidc/callback?code=1.ASkA4o8m...&state=AiGaLQuQ...
    Cookie: oidc-session={encrypted_data}
    ```

18. **Session Cookie Retrieval:**
    - Read `oidc-session` cookie from request
    - Fail immediately if cookie missing (error: session expired)

19. **Session Decryption:**
    ```javascript
    sessionData = unsealData(encryptedCookie, {
      password: process.env.OIDC_SESSION_SECRET
    })
    ```
    - Validates HMAC (detects tampering)
    - Decrypts using AES-256-GCM
    - Verifies TTL (rejects expired sessions)
    - **Security:** Any tampering causes authentication failure

20. **Session Cookie Deletion (One-Time Use):**
    ```javascript
    cookieStore.delete('oidc-session')
    ```
    - Prevents session replay
    - Forces new login initiation for any retry

21. **State Token Validation (CRITICAL - CSRF Protection):**
    ```javascript
    // Step 1: Parameter match
    if (receivedState !== sessionData.state) {
      throw StateValidationError // POSSIBLE_CSRF_ATTACK
    }

    // Step 2: One-time use check (PostgreSQL atomic validation)
    if (!await databaseStateManager.validateAndMarkUsed(receivedState)) {
      throw StateValidationError // REPLAY_ATTACK_DETECTED
    }
    ```
    - Dual validation: session match + one-time use
    - DatabaseStateManager uses PostgreSQL transactions with SELECT FOR UPDATE
    - Atomic validation prevents race conditions across multiple servers
    - Second use of same state triggers replay attack alert

22. **Device Fingerprint Validation (Session Hijacking Prevention):**
    ```javascript
    currentFingerprint = sha256(current_ip + current_user_agent)

    if (currentFingerprint !== sessionData.fingerprint) {
      if (OIDC_STRICT_FINGERPRINT === 'true') {
        throw SessionHijackError // SESSION_HIJACK_ATTEMPT
      } else {
        log.warn('Fingerprint changed') // Mobile networks
      }
    }
    ```
    - Compares device fingerprint from login vs callback
    - Strict mode: reject on mismatch
    - Lenient mode: warn but allow (mobile network IP changes)

23. **Token Exchange (PKCE Validation):**
    ```javascript
    // Construct token request
    tokenRequest = {
      grant_type: 'authorization_code',
      code: authorization_code,
      redirect_uri: 'https://yourdomain.com/api/auth/oidc/callback',
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: sessionData.codeVerifier // PKCE proof
    }

    // POST to Microsoft token endpoint
    POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
    Content-Type: application/x-www-form-urlencoded

    {tokenRequest}
    ```

24. **Microsoft Token Validation (Server-Side):**
    - Microsoft validates authorization code (single-use, not expired)
    - Microsoft validates redirect_uri matches registration
    - **Microsoft validates PKCE:** `sha256(code_verifier) === code_challenge`
    - Microsoft validates client credentials
    - If all valid, Microsoft issues tokens

25. **Token Response:**
    ```json
    {
      "access_token": "eyJ0eXAiOi...",
      "id_token": "eyJ0eXAiOi...",
      "refresh_token": "0.ASkA4o8m...",
      "token_type": "Bearer",
      "expires_in": 3599,
      "scope": "openid profile email"
    }
    ```

26. **ID Token Validation (Defense-in-Depth):**

    **Step 1: Signature Verification**
    ```javascript
    // Fetch Microsoft's public keys
    jwks = fetch('https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys')

    // Verify RS256 signature
    isValid = verifyJWT(id_token, jwks)
    ```

    **Step 2: Claims Validation**
    ```javascript
    claims = decode(id_token)

    // Required claims check
    assert(claims.email !== undefined)
    assert(claims.iss === 'https://login.microsoftonline.com/{tenantId}/v2.0')
    assert(claims.aud === clientId)
    assert(claims.exp > Date.now())
    assert(claims.nbf <= Date.now())
    assert(claims.nonce === sessionData.nonce)
    ```

    **Step 3: Email Verification (Microsoft-Specific)**
    ```javascript
    // Microsoft uses xms_edov instead of standard email_verified
    isEmailVerified = claims.email_verified === true || claims.xms_edov === true

    if (!isEmailVerified) {
      throw TokenValidationError('Email domain not verified')
    }
    ```
    - `xms_edov` = Email Domain Owner Verified
    - Only present if domain verified in Azure tenant
    - Must be explicitly configured in app registration manifest

27. **Email Domain Validation (Organization Access Control):**
    ```javascript
    allowedDomains = [
      'aara.care',
      'sparc.care',
      'illumination.health',
      'bendcare.com',
      'oasis.care'
    ]

    emailDomain = claims.email.split('@')[1]

    if (!allowedDomains.includes(emailDomain)) {
      throw DomainNotAllowedError
    }
    ```

28. **Profile Data Validation & Sanitization:**
    ```javascript
    profile = {
      email: claims.email,
      displayName: claims.name,
      givenName: claims.given_name,
      surname: claims.family_name
    }

    // Zod schema validation
    sanitized = validateAuthProfile(profile, 'oidc')

    // Prevents XSS, SQL injection, length overflow
    ```

29. **User Lookup in Database:**
    ```sql
    SELECT * FROM users
    WHERE email = $1
    AND is_active = true
    LIMIT 1
    ```
    - User must exist (no auto-provisioning)
    - User must be active
    - Failure redirects to error: `user_not_provisioned`

30. **Internal JWT Token Generation:**
    ```javascript
    deviceInfo = {
      ipAddress: current_ip,
      userAgent: current_user_agent,
      fingerprint: currentFingerprint,
      deviceName: 'Chrome Browser' // Parsed from user-agent
    }

    tokens = createTokenPair(
      userId,
      deviceInfo,
      rememberMe: false, // SSO = 7 days max
      email
    )

    // Returns:
    {
      accessToken: 'eyJhbGciOi...', // HS256, 15-minute expiry
      refreshToken: 'eyJhbGciOi...', // HS256, 7-day expiry
      sessionId: '2tQndGm6_9gs...'
    }
    ```

31. **Session Creation in Database:**
    ```sql
    -- Insert refresh token
    INSERT INTO refresh_tokens (
      token_id, user_id, token_hash, device_fingerprint,
      ip_address, user_agent, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7);

    -- Insert session record
    INSERT INTO user_sessions (
      session_id, user_id, refresh_token_id, device_fingerprint,
      device_name, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    ```

32. **Audit Logging:**
    ```javascript
    AuditLogger.logAuth({
      action: 'login',
      userId: user.user_id,
      email: user.email,
      ipAddress: current_ip,
      userAgent: current_user_agent,
      metadata: {
        authMethod: 'oidc',
        deviceName: 'Chrome Browser',
        sessionId: tokens.sessionId,
        duration: 481 // ms
      }
    })
    ```
    - Logged to `audit_logs` table
    - Severity: 'medium'
    - Event type: 'auth'
    - HIPAA-compliant retention: 7 years

33. **Authentication Cookies Set:**
    ```javascript
    // Access token (15 minutes)
    Set-Cookie: access-token={jwt};
                HttpOnly;
                Secure (production);
                SameSite=Strict;
                Max-Age=900;
                Path=/

    // Refresh token (7 days)
    Set-Cookie: refresh-token={jwt};
                HttpOnly;
                Secure (production);
                SameSite=Strict;
                Max-Age=604800;
                Path=/
    ```
    - **HttpOnly:** JavaScript cannot access (XSS protection)
    - **Secure:** HTTPS-only in production
    - **SameSite=Strict:** Maximum CSRF protection
    - **Path=/:** Application-wide access

34. **Final Redirect:**
    ```
    HTTP/1.1 307 Temporary Redirect
    Location: /dashboard
    Set-Cookie: access-token=...
    Set-Cookie: refresh-token=...
    ```

#### Phase 4: Authenticated Access

35. **Subsequent Requests:**
    ```
    GET /dashboard
    Cookie: access-token={jwt}; refresh-token={jwt}
    ```

36. **Middleware Authentication:**
    - Middleware extracts `access-token` from cookie
    - Validates JWT signature (HS256)
    - Checks expiration
    - Checks token blacklist
    - Loads user context from database
    - Attaches user to request context

37. **Access Granted:**
    - User accesses protected resources
    - RBAC permissions enforced per route
    - Session tracked in database

---

## Security Controls

### 1. PKCE (Proof Key for Code Exchange)

**Purpose:** Prevents authorization code interception attacks

**Implementation:**
- Code verifier: 128-character random string
- Code challenge: SHA-256 hash of verifier, base64url-encoded
- Challenge method: S256 (SHA-256)

**Flow:**
1. Client generates `code_verifier` (kept secret in encrypted session)
2. Client sends `code_challenge = SHA256(code_verifier)` to authorization endpoint
3. Authorization server stores `code_challenge`
4. Client sends `code_verifier` during token exchange
5. Server validates: `SHA256(received_verifier) === stored_challenge`

**Threat Mitigated:**
- Authorization code interception (man-in-the-middle)
- Malicious apps intercepting redirect URIs

### 2. State Token (CSRF Protection)

**Purpose:** Prevents cross-site request forgery and replay attacks

**Implementation:**
- 43-character cryptographically secure random string
- Registered in StateManager before redirect
- One-time use validation on callback
- 5-minute TTL + 30-second clock skew tolerance

**Validation:**
```javascript
// Dual validation
1. State from URL === State from encrypted session
2. StateManager.validateAndMarkUsed(state) // Atomic operation
```

**Threat Mitigated:**
- CSRF attacks on authentication flow
- Replay attacks (state can only be used once)

### 3. Nonce (Token Replay Prevention)

**Purpose:** Binds ID token to specific authentication request

**Implementation:**
- 43-character cryptographically secure random string
- Included in authorization request
- Microsoft embeds nonce in ID token claims
- Validated during ID token verification

**Validation:**
```javascript
assert(id_token.claims.nonce === session.nonce)
```

**Threat Mitigated:**
- ID token replay attacks
- Token substitution attacks

### 4. Device Fingerprinting

**Purpose:** Prevents session hijacking

**Implementation:**
```javascript
fingerprint = SHA256(ip_address + user_agent)
```

**Storage:**
- Captured during login initiation
- Stored in encrypted session
- Re-calculated during callback
- Validated before token exchange

**Modes:**
- **Strict Mode:** Reject on fingerprint mismatch
- **Lenient Mode:** Warn but allow (mobile networks)

**Threat Mitigated:**
- Session hijacking (attacker stealing session cookie)
- Cross-device authentication attacks

### 5. Encrypted Session (iron-session)

**Purpose:** Protect PKCE code_verifier and session data in transit

**Encryption:**
- Algorithm: AES-256-GCM
- Integrity: HMAC-SHA256
- Key: `OIDC_SESSION_SECRET` environment variable
- TTL: 10 minutes

**Data Protected:**
```javascript
{
  state: "...",
  nonce: "...",
  codeVerifier: "...", // CRITICAL - must not leak
  returnUrl: "...",
  fingerprint: "..."
}
```

**Threat Mitigated:**
- PKCE code_verifier interception
- Session tampering
- Session cookie theft (useless without decryption key)

### 6. Strict Cookie Policy

**Purpose:** Prevent CSRF and XSS attacks on authentication cookies

**Cookie Attributes:**
```
HttpOnly: true     // JavaScript cannot access
Secure: true       // HTTPS only (production)
SameSite: Strict   // No cross-site sending
Path: /            // Application-wide
Max-Age: 900       // 15 minutes (access token)
```

**Threat Mitigated:**
- XSS attacks (HttpOnly prevents script access)
- CSRF attacks (SameSite prevents cross-site requests)
- Network interception (Secure requires HTTPS)

### 7. Defense-in-Depth ID Token Validation

**Purpose:** Verify token authenticity and integrity

**Validation Layers:**
1. **Signature Verification:** RS256 signature with Microsoft public keys
2. **Issuer Validation:** Must be Microsoft Entra ID tenant
3. **Audience Validation:** Must be application client ID
4. **Expiration Validation:** Token not expired
5. **Not-Before Validation:** Token is valid now
6. **Nonce Validation:** Matches session nonce
7. **Email Verification:** Domain verified by Microsoft (`xms_edov`)

**Threat Mitigated:**
- Token forgery
- Token substitution
- Expired token use
- Cross-tenant token reuse

### 8. Email Domain Verification (xms_edov)

**Purpose:** Ensure user's email domain is verified by organization

**Microsoft-Specific Claim:**
- Claim: `xms_edov` (Email Domain Owner Verified)
- Type: Boolean
- Meaning: Email domain verified by Azure tenant administrator

**Configuration Required:**
- Domain must be verified in Azure tenant
- Claim must be added to app registration manifest
- Both `email_verified` (standard) and `xms_edov` (Microsoft) checked

**Validation:**
```javascript
isVerified = claims.email_verified === true || claims.xms_edov === true
```

**Threat Mitigated:**
- Unverified email addresses
- Domain spoofing
- Unauthorized organization access

### 9. Email Domain Allowlist

**Purpose:** Restrict access to specific organizational domains

**Configuration:**
```javascript
OIDC_ALLOWED_DOMAINS=aara.care,sparc.care,illumination.health
```

**Validation:**
```javascript
domain = email.split('@')[1]
if (!allowedDomains.includes(domain)) {
  throw DomainNotAllowedError
}
```

**Threat Mitigated:**
- Unauthorized external user access
- Multi-tenant isolation violations

### 10. Input Validation & Sanitization

**Purpose:** Prevent injection attacks

**Implementation:**
- Zod schema validation for all auth profiles
- Email format validation (RFC 5322)
- Length limits on all string fields
- HTML entity encoding for display
- SQL parameterized queries (Drizzle ORM)

**Fields Validated:**
- Email: valid format, max 255 chars
- Display name: max 255 chars, sanitized
- Given name: max 100 chars, sanitized
- Surname: max 100 chars, sanitized

**Threat Mitigated:**
- SQL injection
- XSS attacks
- Buffer overflow
- NoSQL injection

### 11. Rate Limiting

**Purpose:** Prevent brute force and DoS attacks

**Configuration:**
- Auth endpoints: 5 requests per 15 minutes per IP
- Implemented at route handler level
- Uses in-memory rate limit tracking

**Threat Mitigated:**
- Brute force attacks
- Denial of service
- Account enumeration

### 12. Audit Logging

**Purpose:** Security monitoring and compliance

**Events Logged:**
- All authentication attempts (success/failure)
- CSRF attack attempts (state mismatch)
- Replay attack attempts (state reuse)
- Session hijack attempts (fingerprint mismatch)
- Token validation failures
- Domain authorization failures

**Log Format:**
```javascript
{
  event_type: 'auth',
  action: 'login',
  user_id: '...',
  ip_address: '...',
  user_agent: '...',
  metadata: {
    authMethod: 'oidc',
    sessionId: '...',
    duration: 481
  },
  severity: 'medium',
  created_at: '2025-10-04T11:09:37.991Z'
}
```

**Retention:** 7 years (HIPAA compliance)

---

## Microsoft Entra ID Configuration

### App Registration Settings

**Required Configuration in Azure Portal:**

1. **Application (client) ID:**
   - Generate at app registration
   - Store in `OIDC_CLIENT_ID` environment variable

2. **Client Secret:**
   - Generate in "Certificates & secrets"
   - Store in `OIDC_CLIENT_SECRET` environment variable
   - Recommended: Use certificate instead of secret for production

3. **Redirect URIs:**
   ```
   Development: http://localhost:4001/api/auth/oidc/callback
   Production:  https://yourdomain.com/api/auth/oidc/callback
   ```
   - Type: Web
   - Must match exactly (including protocol, domain, path)

4. **Logout URL:**
   ```
   https://yourdomain.com/api/auth/oidc/logout
   ```

5. **Token Configuration:**
   - Optional claims required
   - Must add `email` and `xms_edov` claims

**Adding Optional Claims (Via Manifest):**

```json
{
  "optionalClaims": {
    "idToken": [
      {
        "name": "email",
        "essential": true
      },
      {
        "name": "xms_edov",
        "essential": false
      }
    ]
  }
}
```

6. **API Permissions:**
   - Microsoft Graph: `email` (Delegated)
   - Microsoft Graph: `openid` (Delegated)
   - Microsoft Graph: `profile` (Delegated)
   - Admin consent: Required

7. **Supported Account Types:**
   - "Accounts in this organizational directory only (Single tenant)"
   - Recommended for enterprise applications

8. **Tenant ID:**
   - Found in "Overview" section
   - Store in `OIDC_TENANT_ID` environment variable

### Domain Verification in Azure

**Required for xms_edov Claim:**

1. Navigate to Azure AD → Custom domain names
2. Add custom domain (e.g., `aara.care`)
3. Add TXT or MX record to DNS
4. Verify domain ownership
5. Set as primary domain (optional)

**Verification TXT Record Example:**
```
Name:  @
Type:  TXT
Value: MS=ms12345678
TTL:   3600
```

### Discovery Endpoints

**Well-Known Configuration:**
```
https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration
```

**Key Endpoints:**
```json
{
  "authorization_endpoint": "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
  "token_endpoint": "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
  "jwks_uri": "https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys",
  "issuer": "https://login.microsoftonline.com/{tenantId}/v2.0",
  "end_session_endpoint": "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/logout"
}
```

---

## Session Management

### Session Lifecycle

```
Login → Session Created → Active → Expired/Revoked → Session Ended
```

### Session Types

**1. OIDC Temporary Session (Login Flow Only)**
- Duration: 10 minutes
- Storage: Encrypted cookie
- Purpose: Protect PKCE code_verifier during OAuth flow
- Deleted: After callback completion (one-time use)

**2. Application Session (Post-Authentication)**
- Duration: 7 days (SSO), 30 days (remember me)
- Storage: PostgreSQL `user_sessions` table
- Tracking: Session ID, device fingerprint, IP, user-agent
- Renewal: On token refresh

### Session Storage Schema

```sql
CREATE TABLE user_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id),
  refresh_token_id VARCHAR(255) NOT NULL,
  device_fingerprint VARCHAR(64) NOT NULL,
  device_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  remember_me BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  end_reason VARCHAR(50)
);
```

### Session Termination

**Explicit Logout:**
1. User clicks logout
2. Access token blacklisted
3. Refresh token revoked
4. Session marked `is_active = false`
5. `ended_at` timestamp set
6. `end_reason = 'user_logout'`
7. Cookies cleared
8. Audit log created

**Automatic Expiration:**
- Access token: 15 minutes (not renewable)
- Refresh token: 7 days (SSO) or 30 days (remember me)
- Session: Tied to refresh token expiration

**Forced Revocation (Admin):**
- Admin can revoke user sessions
- All refresh tokens invalidated
- User forced to re-authenticate

---

## Token Management

### Token Types

**1. Microsoft OIDC Tokens (External)**

**Access Token:**
- Format: JWT (RS256)
- Issuer: Microsoft Entra ID
- Audience: Microsoft Graph API
- Expiration: ~60 minutes
- Use: Call Microsoft APIs (not used in our implementation)

**ID Token:**
- Format: JWT (RS256)
- Issuer: Microsoft Entra ID
- Audience: Application client ID
- Expiration: ~60 minutes
- Use: User identity verification (validated, then discarded)

**Refresh Token:**
- Format: Opaque string
- Issuer: Microsoft Entra ID
- Expiration: 90 days (configurable)
- Use: Not used (we issue our own internal tokens)

**2. Internal Application Tokens**

**Access Token:**
```javascript
{
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    jti: 'gBI1VzDg7_4X97dTrrA3w',      // JWT ID (unique)
    sub: 'cfd640bd-fcb6-4a78-ab0f-...',  // User ID
    email: 'user@domain.com',
    sessionId: '2tQndGm6_9gs...',
    iat: 1728039677,                     // Issued at
    exp: 1728040577,                     // Expires (15 min)
    fingerprint: '509e1380d10c32b4...'
  },
  signature: HMAC-SHA256(header.payload, JWT_SECRET)
}
```

**Refresh Token:**
```javascript
{
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    jti: '0ykIYEcDvufvB8g-v0rb7G6D...',  // Token ID
    sub: 'cfd640bd-fcb6-4a78-ab0f-...',  // User ID
    tokenId: '0ykIYEcDvufvB8g-v0rb7G6D',
    iat: 1728039677,
    exp: 1728644477,                     // Expires (7 days)
    fingerprint: '509e1380d10c32b4...'
  },
  signature: HMAC-SHA256(header.payload, JWT_SECRET)
}
```

### Token Storage

**Access Token:**
- Client: HttpOnly cookie (`access-token`)
- Server: Not stored (stateless validation via JWT signature)
- Blacklist: Checked on each request (revocation)

**Refresh Token:**
- Client: HttpOnly cookie (`refresh-token`)
- Server: PostgreSQL `refresh_tokens` table (hashed with SHA-256)

```sql
CREATE TABLE refresh_tokens (
  token_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id),
  token_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
  device_fingerprint VARCHAR(64),
  ip_address VARCHAR(45),
  user_agent TEXT,
  remember_me BOOLEAN DEFAULT false,
  issued_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_used TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR(100),
  rotation_count INTEGER DEFAULT 0
);
```

### Token Validation Flow

**Every Protected Request:**

1. **Extract Token:**
   ```javascript
   accessToken = request.cookies.get('access-token')
   ```

2. **Verify Signature:**
   ```javascript
   isValid = verifyJWT(accessToken, JWT_SECRET, 'HS256')
   ```

3. **Check Expiration:**
   ```javascript
   if (Date.now() > claims.exp * 1000) {
     return 401 Unauthorized // Trigger token refresh
   }
   ```

4. **Check Blacklist:**
   ```sql
   SELECT * FROM token_blacklist WHERE jti = $1
   ```
   - If found: Token revoked, reject request

5. **Load User Context:**
   ```sql
   SELECT u.*, ur.role_id, p.permission_id
   FROM users u
   JOIN user_roles ur ON u.user_id = ur.user_id
   JOIN role_permissions rp ON ur.role_id = rp.role_id
   JOIN permissions p ON rp.permission_id = p.permission_id
   WHERE u.user_id = $1 AND u.is_active = true
   ```

6. **Attach to Request:**
   ```javascript
   request.user = userContext
   request.session = sessionContext
   ```

### Token Refresh Flow

**Endpoint:** `POST /api/auth/refresh`

**Trigger:** Access token expired (401 response)

**Process:**
1. Client detects 401 response
2. Automatically calls `/api/auth/refresh`
3. Server extracts refresh token from cookie
4. Validates refresh token JWT signature
5. Checks refresh token in database (active, not expired)
6. Validates device fingerprint
7. Issues new access token (15 min)
8. Optionally rotates refresh token (refresh token rotation strategy)
9. Updates `last_used` timestamp
10. Returns new access token in cookie

**Refresh Token Rotation (IMPLEMENTED - Always On):**
```javascript
async function refreshTokenPair(refreshToken) {
  // Verify and validate token
  const tokenRecord = await validateRefreshToken(refreshToken);

  // TOKEN REUSE DETECTION: Check if revoked token is being reused
  if (!tokenRecord) {
    const revokedToken = await findRevokedToken(refreshToken);
    if (revokedToken && !revokedToken.is_active) {
      // SECURITY ALERT: Token theft detected
      await revokeAllUserTokens(revokedToken.user_id, 'security');
      await logSecurityIncident({
        action: 'token_reuse_detected',
        severity: 'high',
        userId: revokedToken.user_id
      });
      throw new Error('Token reuse detected - all tokens revoked');
    }
  }

  // Issue new tokens
  newAccessToken = generateAccessToken();
  newRefreshToken = generateRefreshToken();

  // Revoke old refresh token (rotation)
  await db.update(refresh_tokens)
    .set({
      is_active: false,
      revoked_reason: 'rotation'
    })
    .where({ token_id: tokenRecord.token_id });

  // Store new refresh token
  await db.insert(refresh_tokens).values({
    token_id: newRefreshToken.jti,
    rotation_count: tokenRecord.rotation_count + 1
  });

  return { newAccessToken, newRefreshToken };
}
```

### Token Revocation

**Scenarios:**

1. **User Logout:**
   - Blacklist access token (immediate effect)
   - Revoke refresh token in database
   - Clear cookies

2. **Admin Revocation:**
   - Revoke all user's refresh tokens
   - Blacklist all active access tokens
   - User forced to re-authenticate

3. **Security Event:**
   - Suspicious activity detected
   - Compromised credentials
   - Mass revocation of all sessions

4. **Token Reuse Detection (IMPLEMENTED):**
   - Detects when a revoked refresh token is reused
   - Automatically revokes ALL user tokens as security measure
   - Logs security alert for monitoring
   - **Attack Scenario:** Attacker obtains old refresh token after user logout
   - **Response:** All sessions terminated, user must re-authenticate

**Blacklist Schema:**
```sql
CREATE TABLE token_blacklist (
  jti VARCHAR(255) PRIMARY KEY,       -- JWT ID
  user_id UUID NOT NULL,
  token_type VARCHAR(20) NOT NULL,    -- 'access' or 'refresh'
  blacklisted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,      -- Auto-cleanup after expiry
  reason VARCHAR(100),
  blacklisted_by UUID                 -- Admin user ID
);
```

---

## Error Handling

### Error Types

**1. Provider Errors (from Microsoft)**
- Code: `oidc_provider_error`
- Cause: Microsoft returned error in callback
- User Message: "Unable to start Microsoft sign-in. Please try again or use email and password."
- Action: Log error details, redirect to login with error message

**2. State Validation Errors**
- Code: `oidc_state_mismatch`
- Cause: State parameter doesn't match session
- User Message: "Microsoft authentication failed due to security check. Please try again."
- Security Alert: `POSSIBLE_CSRF_ATTACK`
- Action: Audit log, reject authentication

**3. State Replay Errors**
- Code: `oidc_state_replay`
- Cause: State token already used or expired
- User Message: "Session expired or already used. Please try again."
- Security Alert: `REPLAY_ATTACK_DETECTED`
- Action: Audit log with replay attempt details

**4. Session Hijack Errors**
- Code: `oidc_session_hijack`
- Cause: Device fingerprint mismatch (strict mode)
- User Message: "Security validation failed. Please try again from your original device."
- Security Alert: `SESSION_HIJACK_ATTEMPT`
- Action: Audit log with IP and fingerprint details

**5. Token Exchange Errors**
- Code: `oidc_token_exchange_failed`
- Cause: Microsoft rejected token exchange
- User Message: "Authentication with Microsoft failed. Please try again."
- Action: Log Microsoft error, check PKCE validation

**6. Token Validation Errors**
- Code: `oidc_token_validation_failed`
- Cause: ID token signature or claims invalid
- User Message: "Microsoft token validation failed. Please try again."
- Action: Log validation failure details

**7. Email Verification Errors**
- Code: `oidc_email_not_verified`
- Cause: `email_verified` and `xms_edov` both false
- User Message: "Your email must be verified in Microsoft. Contact your administrator."
- Action: Guide admin to verify domain in Azure

**8. Domain Not Allowed Errors**
- Code: `oidc_domain_not_allowed`
- Cause: Email domain not in allowlist
- User Message: "Your email domain is not authorized. Contact your administrator."
- Action: Log unauthorized domain attempt

**9. User Not Provisioned Errors**
- Code: `user_not_provisioned`
- Cause: User authenticated with Microsoft but not in database
- User Message: "Your account is not provisioned. Contact your administrator."
- Action: Admin must create user in system

**10. User Inactive Errors**
- Code: `user_inactive`
- Cause: User account disabled
- User Message: "Your account is not active. Contact your administrator."
- Action: Admin must reactivate account

**11. Session Expired Errors**
- Code: `oidc_callback_failed`
- Cause: OIDC session cookie missing or expired
- User Message: "Authentication session expired. Please try again."
- Action: User must restart login flow

**12. Invalid Profile Errors**
- Code: `oidc_invalid_profile`
- Cause: Profile validation failed (injection attempt)
- User Message: "Profile information invalid. Please try again."
- Action: Log validation errors, check for attack

### Error Response Format

**Redirect to Login:**
```
HTTP/1.1 307 Temporary Redirect
Location: /signin?error={error_code}&message={encoded_message}
```

**Error Display:**
```javascript
// login-form.tsx displays error
if (oidcError) {
  const message = oidcErrorMessages[oidcError] || 'Authentication failed.'
  // Show red error banner
}
```

### Error Logging

**All Errors Logged:**
```javascript
log.error('OIDC callback failed', {
  error: error.message,
  errorName: error.constructor.name,
  stack: error.stack,
  duration: 481,
  requestId: 'cor_mgc683ki_jxuplpwk'
})

AuditLogger.logAuth({
  action: 'login_failed',
  ipAddress: request.ip,
  userAgent: request.userAgent,
  metadata: {
    authMethod: 'oidc',
    reason: 'token_validation_failed',
    error: error.message,
    errorType: error.constructor.name
  }
})
```

### Error Recovery

**User Actions:**
- Click "Sign in with Microsoft" again (new state token)
- Use email/password login as fallback
- Contact administrator for provisioning/domain issues

**Admin Actions:**
- Check Azure domain verification
- Add xms_edov claim to manifest
- Provision user in database
- Activate user account
- Review audit logs for security events

---

## Audit & Compliance

### Audit Events

**Authentication Events:**
- `login` - Successful authentication
- `login_failed` - Authentication failure
- `logout` - User logout
- `session_ended` - Session expiration/revocation

**Security Events:**
- `POSSIBLE_CSRF_ATTACK` - State mismatch
- `REPLAY_ATTACK_DETECTED` - State reuse
- `SESSION_HIJACK_ATTEMPT` - Fingerprint mismatch
- `token_validation_failed` - Invalid token
- `domain_not_allowed` - Unauthorized domain

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
  audit_log_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,        -- 'auth', 'access', 'admin'
  action VARCHAR(100) NOT NULL,           -- 'login', 'login_failed', etc.
  user_id UUID REFERENCES users(user_id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,                         -- Flexible additional data
  severity VARCHAR(20) NOT NULL,          -- 'low', 'medium', 'high', 'critical'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
```

### Sample Audit Log Entry

```json
{
  "audit_log_id": "YWBR6tMA8Y8LpDt316SvL",
  "event_type": "auth",
  "action": "login",
  "user_id": "cfd640bd-fcb6-4a78-ab0f-0bc8f0ab8d0f",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "metadata": {
    "email": "user@domain.com",
    "authMethod": "oidc",
    "deviceName": "Chrome Browser",
    "sessionId": "2tQndGm6_9gskTg2dittOAw8n2D2Cuy1",
    "duration": 479
  },
  "severity": "medium",
  "created_at": "2025-10-04T11:09:38.005Z"
}
```

### Compliance Requirements

**HIPAA (Health Insurance Portability and Accountability Act):**
- ✅ Audit logging enabled for all authentication events
- ✅ 7-year retention policy
- ✅ User identification in all logs
- ✅ Access controls on audit logs
- ✅ Tamper-resistant logging (append-only)

**SOC 2 Type II:**
- ✅ Security monitoring and incident detection
- ✅ Authentication and authorization logging
- ✅ Change management audit trail
- ✅ Regular security reviews

**GDPR (General Data Protection Regulation):**
- ✅ User consent for data processing
- ✅ Right to access (users can request audit logs)
- ✅ Right to erasure (user deletion includes audit log anonymization)
- ✅ Data minimization (only necessary data logged)

### Monitoring & Alerting

**Recommended Alerts:**

1. **CSRF Attack Attempts:**
   ```sql
   SELECT COUNT(*) FROM audit_logs
   WHERE action = 'login_failed'
   AND metadata->>'reason' = 'state_mismatch'
   AND created_at > NOW() - INTERVAL '5 minutes'
   HAVING COUNT(*) > 3
   ```

2. **Replay Attack Attempts:**
   ```sql
   SELECT user_id, ip_address, COUNT(*) FROM audit_logs
   WHERE action = 'login_failed'
   AND metadata->>'alert' = 'REPLAY_ATTACK_DETECTED'
   AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY user_id, ip_address
   HAVING COUNT(*) > 2
   ```

3. **Session Hijack Attempts:**
   ```sql
   SELECT user_id, ip_address FROM audit_logs
   WHERE metadata->>'alert' = 'SESSION_HIJACK_ATTEMPT'
   AND created_at > NOW() - INTERVAL '1 hour'
   ```

4. **Failed Login Spikes:**
   ```sql
   SELECT COUNT(*) FROM audit_logs
   WHERE action = 'login_failed'
   AND created_at > NOW() - INTERVAL '15 minutes'
   HAVING COUNT(*) > 10
   ```

---

## API Endpoints

### Authentication Endpoints

**1. OIDC Login Initiation**
```
GET /api/auth/oidc/login
```

**Query Parameters:**
- `returnUrl` (optional): URL to redirect after successful login (default: `/dashboard`)

**Response:**
```
HTTP/1.1 307 Temporary Redirect
Location: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?...
Set-Cookie: oidc-session=...
```

**Rate Limit:** 5 requests / 15 minutes per IP

---

**2. OIDC Callback**
```
GET /api/auth/oidc/callback
```

**Query Parameters:**
- `code`: Authorization code from Microsoft
- `state`: State token for CSRF protection
- `session_state`: Microsoft session identifier (ignored)
- `error` (optional): Error code from Microsoft
- `error_description` (optional): Error description

**Success Response:**
```
HTTP/1.1 307 Temporary Redirect
Location: /dashboard
Set-Cookie: access-token=...; HttpOnly; Secure; SameSite=Strict
Set-Cookie: refresh-token=...; HttpOnly; Secure; SameSite=Strict
```

**Error Response:**
```
HTTP/1.1 307 Temporary Redirect
Location: /signin?error=oidc_token_validation_failed
```

**Rate Limit:** 5 requests / 15 minutes per IP

---

**3. OIDC Logout**
```
GET /api/auth/oidc/logout
```

**Process:**
1. Blacklist access token
2. Revoke refresh token
3. End session in database
4. Clear cookies
5. Redirect to Microsoft logout
6. Microsoft redirects back to application

**Response:**
```
HTTP/1.1 307 Temporary Redirect
Location: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout?post_logout_redirect_uri=...
Set-Cookie: access-token=; Max-Age=0
Set-Cookie: refresh-token=; Max-Age=0
```

---

**4. Token Refresh**
```
POST /api/auth/refresh
```

**Headers:**
```
Cookie: refresh-token={jwt}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully"
}
```
```
Set-Cookie: access-token={new_jwt}; HttpOnly; Secure; SameSite=Strict; Max-Age=900
```

**Error Response:**
```json
{
  "error": "refresh_token_expired",
  "message": "Refresh token expired. Please log in again."
}
```

**Rate Limit:** 10 requests / minute per user

---

**5. Current User Context**
```
GET /api/auth/me
```

**Headers:**
```
Cookie: access-token={jwt}
```

**Success Response:**
```json
{
  "user": {
    "userId": "cfd640bd-fcb6-4a78-ab0f-0bc8f0ab8d0f",
    "email": "user@domain.com",
    "firstName": "John",
    "lastName": "Doe",
    "isActive": true,
    "emailVerified": true
  },
  "roles": [
    {
      "roleId": "7dcc0ee9-6d94-4bc7-84fe-ab674bb38c8b",
      "name": "super_admin",
      "isSystemRole": true
    }
  ],
  "permissions": [
    {
      "permissionId": "...",
      "name": "users:read:all",
      "resource": "users",
      "action": "read",
      "scope": "all"
    }
  ],
  "organizations": []
}
```

**Error Response:**
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

---

## Data Flow Diagrams

### Login Flow Sequence

```
┌─────────┐                ┌──────────┐                ┌───────────┐                ┌──────────────┐
│ Browser │                │ Next.js  │                │ Microsoft │                │  PostgreSQL  │
│         │                │   App    │                │ Entra ID  │                │   Database   │
└────┬────┘                └────┬─────┘                └─────┬─────┘                └──────┬───────┘
     │                          │                            │                              │
     │  1. Click "Sign in"      │                            │                              │
     ├─────────────────────────>│                            │                              │
     │                          │                            │                              │
     │                          │  2. Generate PKCE params   │                              │
     │                          │     (code_verifier,        │                              │
     │                          │      code_challenge)       │                              │
     │                          │                            │                              │
     │                          │  3. Generate state & nonce │                              │
     │                          │                            │                              │
     │                          │  4. Encrypt session        │                              │
     │                          │     (iron-session)         │                              │
     │                          │                            │                              │
     │  5. 307 Redirect to MS   │                            │                              │
     │  + oidc-session cookie   │                            │                              │
     │<─────────────────────────┤                            │                              │
     │                          │                            │                              │
     │  6. GET /authorize       │                            │                              │
     │  ?code_challenge=...     │                            │                              │
     │  &state=...              │                            │                              │
     ├──────────────────────────┴───────────────────────────>│                              │
     │                                                       │                              │
     │  7. Microsoft login page                              │                              │
     │<──────────────────────────────────────────────────────┤                              │
     │                                                       │                              │
     │  8. User enters credentials                           │                              │
     ├──────────────────────────────────────────────────────>│                              │
     │                                                       │                              │
     │  9. 302 Redirect back                                 │                              │
     │  ?code=...&state=...                                  │                              │
     │<──────────────────────────────────────────────────────┤                              │
     │                          │                            │                              │
     │  10. GET /callback       │                            │                              │
     │  ?code=...&state=...     │                            │                              │
     │  Cookie: oidc-session    │                            │                              │
     ├─────────────────────────>│                            │                              │
     │                          │                            │                              │
     │                          │  11. Decrypt session       │                              │
     │                          │      Validate state        │                              │
     │                          │      Validate fingerprint  │                              │
     │                          │                            │                              │
     │                          │  12. POST /token           │                              │
     │                          │      code=...              │                              │
     │                          │      code_verifier=...     │                              │
     │                          ├───────────────────────────>│                              │
     │                          │                            │                              │
     │                          │  13. Validate PKCE         │                              │
     │                          │      SHA256(verifier) ==   │                              │
     │                          │      stored_challenge      │                              │
     │                          │                            │                              │
     │                          │  14. Return tokens         │                              │
     │                          │      access_token          │                              │
     │                          │      id_token              │                              │
     │                          │      refresh_token         │                              │
     │                          │<───────────────────────────┤                              │
     │                          │                            │                              │
     │                          │  15. Validate ID token     │                              │
     │                          │      (signature, claims)   │                              │
     │                          │                            │                              │
     │                          │  16. Lookup user                                          │
     │                          ├──────────────────────────────────────────────────────────>│
     │                          │                                                           │
     │                          │  17. User record                                          │
     │                          │<──────────────────────────────────────────────────────────┤
     │                          │                            │                              │
     │                          │  18. Create session                                       │
     │                          ├──────────────────────────────────────────────────────────>│
     │                          │                                                           │
     │                          │  19. Generate internal JWT │                              │
     │                          │      (access & refresh)    │                              │
     │                          │                            │                              │
     │  20. 307 Redirect        │                            │                              │
     │  + access-token cookie   │                            │                              │
     │  + refresh-token cookie  │                            │                              │
     │<─────────────────────────┤                            │                              │
     │                          │                            │                              │
     │  21. GET /dashboard      │                            │                              │
     │  Cookie: access-token    │                            │                              │
     ├─────────────────────────>│                            │                              │
     │                          │                            │                              │
     │  22. Dashboard HTML      │                            │                              │
     │<─────────────────────────┤                            │                              │
     │                          │                            │                              │
```

### Token Validation Flow

```
┌─────────┐          ┌──────────┐          ┌──────────────┐
│ Browser │          │ Next.js  │          │  PostgreSQL  │
│         │          │   App    │          │   Database   │
└────┬────┘          └────┬─────┘          └──────┬───────┘
     │                    │                       │
     │  1. API Request    │                       │
     │  Cookie: access-   │                       │
     │         token      │                       │
     ├───────────────────>│                       │
     │                    │                       │
     │                    │  2. Extract JWT       │
     │                    │                       │
     │                    │  3. Verify signature  │
     │                    │     (HS256 + secret)  │
     │                    │                       │
     │                    │  4. Check expiration  │
     │                    │                       │
     │                    │  5. Check blacklist   │
     │                    ├──────────────────────>│
     │                    │                       │
     │                    │  6. Blacklist result  │
     │                    │<──────────────────────┤
     │                    │                       │
     │                    │  7. Load user context │
     │                    ├──────────────────────>│
     │                    │                       │
     │                    │  8. User + roles +    │
     │                    │     permissions       │
     │                    │<──────────────────────┤
     │                    │                       │
     │                    │  9. Check RBAC        │
     │                    │     permissions       │
     │                    │                       │
     │  10. API Response  │                       │
     │<───────────────────┤                       │
     │                    │                       │
```

---

## Security Threat Model

### Threat Analysis

**1. Authorization Code Interception**
- **Threat:** Attacker intercepts authorization code
- **Mitigation:** PKCE (code_challenge/code_verifier)
- **Residual Risk:** Low (PKCE makes code useless without verifier)

**2. CSRF (Cross-Site Request Forgery)**
- **Threat:** Attacker tricks user into authenticating
- **Mitigation:**
  - State token (one-time use, encrypted session)
  - SameSite=Strict cookies
- **Residual Risk:** Very Low (dual protection)

**3. Replay Attacks**
- **Threat:** Attacker replays captured authentication request
- **Mitigation:**
  - State token one-time use (StateManager)
  - Nonce validation in ID token
  - Session cookie one-time use
- **Residual Risk:** Very Low (multiple one-time use checks)

**4. Session Hijacking**
- **Threat:** Attacker steals session cookie
- **Mitigation:**
  - Device fingerprinting (IP + user-agent)
  - HttpOnly cookies (XSS protection)
  - Secure cookies (HTTPS only)
  - SameSite=Strict (cross-site protection)
- **Residual Risk:** Low (multi-factor binding)

**5. Token Forgery**
- **Threat:** Attacker creates fake tokens
- **Mitigation:**
  - RS256 signature validation (Microsoft tokens)
  - HS256 signature validation (internal tokens)
  - HMAC with strong secret
- **Residual Risk:** Very Low (cryptographic signatures)

**6. Man-in-the-Middle (MITM)**
- **Threat:** Attacker intercepts network traffic
- **Mitigation:**
  - HTTPS/TLS encryption (all traffic)
  - Secure cookies (HTTPS only)
  - PKCE (even if code intercepted, verifier protected)
- **Residual Risk:** Very Low (encrypted transport)

**7. Phishing Attacks**
- **Threat:** User tricked into fake Microsoft login
- **Mitigation:**
  - Redirect to official login.microsoftonline.com
  - Browser shows Microsoft domain
  - User education
- **Residual Risk:** Medium (user behavior dependent)

**8. Account Takeover**
- **Threat:** Compromised Microsoft credentials
- **Mitigation:**
  - Microsoft MFA enforcement (tenant policy)
  - Conditional access policies
  - Unusual activity detection
  - Session revocation capability
- **Residual Risk:** Low (Microsoft security controls)

**9. Domain Spoofing**
- **Threat:** Attacker uses unverified email domain
- **Mitigation:**
  - xms_edov claim validation
  - Email domain allowlist
  - Azure domain verification requirement
- **Residual Risk:** Very Low (dual domain validation)

**10. Injection Attacks (XSS, SQL)**
- **Threat:** Malicious code injection
- **Mitigation:**
  - Input validation (Zod schemas)
  - Parameterized queries (Drizzle ORM)
  - HTML entity encoding
  - Content Security Policy headers
- **Residual Risk:** Very Low (multiple input validation layers)

**11. Denial of Service (DoS)**
- **Threat:** Service unavailability
- **Mitigation:**
  - Rate limiting (5 req/15min auth endpoints)
  - Cloud infrastructure auto-scaling
  - CDN/load balancer protection
- **Residual Risk:** Medium (infrastructure dependent)

**12. Insufficient Logging**
- **Threat:** Security events undetected
- **Mitigation:**
  - Comprehensive audit logging
  - Security event alerts
  - 7-year retention
  - Tamper-resistant logs
- **Residual Risk:** Very Low (extensive logging)

### Attack Surface

**External Attack Vectors:**
- HTTPS endpoints (protected by TLS, rate limiting)
- Client-side JavaScript (minimal, CSP headers)
- Cookies (HttpOnly, Secure, SameSite=Strict)

**Internal Attack Vectors:**
- Database access (requires credentials, encrypted at rest)
- Environment variables (secrets management)
- Server-side code (regular security reviews)

**Third-Party Dependencies:**
- Microsoft Entra ID (trusted IDP, SOC 2 certified)
- openid-client library (well-audited, 6.8.1 stable)
- iron-session library (cryptographically secure)

---

## Production Considerations

### Environment Variables

**Required:**
```bash
# Microsoft Entra ID Configuration
OIDC_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
OIDC_CLIENT_ID=44ae5aae-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OIDC_CLIENT_SECRET=your_client_secret_here

# OIDC Session Encryption (32+ character random string)
OIDC_SESSION_SECRET=your_session_secret_minimum_32_characters_long

# Internal JWT Secret (32+ character random string)
JWT_SECRET=your_jwt_secret_minimum_32_characters_long

# Application URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

**Optional:**
```bash
# Email Domain Restriction
OIDC_ALLOWED_DOMAINS=aara.care,sparc.care,illumination.health

# Device Fingerprint Strict Mode
OIDC_STRICT_FINGERPRINT=false

# Environment
NODE_ENV=production
```

### Scaling Considerations

**✅ PRODUCTION READY: Horizontal Scaling Implemented**

**Current Implementation:**
- ✅ State Manager: PostgreSQL-backed (shared across all servers)
- ✅ Token Blacklist: PostgreSQL-backed (scales horizontally)
- ✅ Refresh Tokens: PostgreSQL-backed (survives restarts)
- ✅ Stateless Application Layer: No server affinity required

**1. PostgreSQL State Manager (IMPLEMENTED):**
```javascript
// Database-backed with atomic row-level locking
class DatabaseStateManager {
  async registerState(state, nonce, fingerprint) {
    // Atomic INSERT with PRIMARY KEY constraint
    await db.insert(oidc_states).values({
      state,              // PRIMARY KEY - prevents duplicates
      nonce,
      user_fingerprint: fingerprint,
      is_used: false,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5*60*1000 + 30*1000) // 5min + 30s
    });
  }

  async validateAndMarkUsed(state) {
    // PostgreSQL transaction with SELECT FOR UPDATE (row-level lock)
    return await db.transaction(async (tx) => {
      // Lock row to prevent concurrent access
      const [record] = await tx
        .select()
        .from(oidc_states)
        .where(and(
          eq(oidc_states.state, state),
          gt(oidc_states.expires_at, new Date())
        ))
        .for('update');  // CRITICAL: Row-level lock prevents race conditions

      if (!record || record.is_used) return false;

      // Mark as used (atomic within transaction)
      await tx
        .update(oidc_states)
        .set({ is_used: true, used_at: new Date() })
        .where(eq(oidc_states.state, state));

      return true;
    });
  }

  async cleanupExpired() {
    // Scheduled job removes expired states
    const statesDeleted = await db
      .delete(oidc_states)
      .where(lt(oidc_states.expires_at, new Date()));
    return statesDeleted.length;
  }
}
```

**Security Properties:**
- ✅ Atomic one-time use validation across multiple servers
- ✅ SELECT FOR UPDATE prevents race conditions
- ✅ Transaction rollback on validation failure
- ✅ Works with blue/green deployments
- ✅ No external dependencies (no Redis required)

**2. Load Balancer Configuration:**
- Sticky sessions NOT required (stateless JWT)
- Health check endpoint: `/api/health`
- Session affinity: None (cookies work across instances)

**3. Database Connection Pooling:**
```javascript
// Increase pool size for multiple app servers
{
  min: 10,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
}
```

### Certificate-Based Authentication (Production Best Practice)

**Replace Client Secret with Certificate:**

**1. Generate Certificate:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout oidc-key.pem -out oidc-cert.pem -days 365 -nodes
```

**2. Upload to Azure:**
- Azure Portal → App Registration → Certificates & secrets
- Upload oidc-cert.pem

**3. Update Configuration:**
```javascript
// lib/oidc/config.ts
clientAssertion: {
  clientAssertionType: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
  clientAssertion: generateJWT(privateKey, clientId, issuer)
}
```

**Benefits:**
- No secrets in environment variables
- Certificate rotation without app restart
- Enhanced security (private key never transmitted)

### Monitoring Checklist

**Health Checks:**
- [ ] Database connectivity
- [ ] Microsoft Entra ID discovery endpoint reachability
- [ ] PostgreSQL OIDC state table connectivity

**Performance Metrics:**
- [ ] OIDC login duration (target: < 3 seconds)
- [ ] Token validation time (target: < 100ms)
- [ ] Database query time (target: < 50ms)

**Security Alerts:**
- [ ] CSRF attack attempts (state mismatch)
- [ ] Replay attack attempts (state reuse)
- [ ] Session hijack attempts (fingerprint mismatch)
- [ ] Failed login spike (> 10 in 15 minutes)
- [ ] Token validation failures
- [ ] Unauthorized domain attempts

**Availability Monitoring:**
- [ ] Uptime (target: 99.9%)
- [ ] Microsoft Entra ID service status
- [ ] Database availability
- [ ] Application server health

### Disaster Recovery

**Session Continuity:**
- Refresh tokens stored in database (survives app restarts)
- Users remain logged in across deployments
- No re-authentication required (unless refresh token expired)

**State Manager Recovery:**
- ✅ Database-backed state persists across restarts
- ✅ Active login flows survive app restarts
- ✅ No impact from deployments (stateless application layer)
- ✅ Production-ready horizontal scaling

**Database Backup:**
- Regular backups of user_sessions, refresh_tokens
- Point-in-time recovery capability
- Audit logs backup (7-year retention)

### Security Incident Response

**Compromised Credentials Detection:**
1. Monitor audit logs for unusual patterns
2. Alert on multiple failed login attempts
3. Geographic anomaly detection (IP-based)

**Session Revocation Procedure:**
```sql
-- Revoke all user sessions
UPDATE refresh_tokens
SET is_active = false,
    revoked_at = NOW(),
    revoked_reason = 'security_incident'
WHERE user_id = $1;

-- Blacklist active access tokens
INSERT INTO token_blacklist (jti, user_id, token_type, expires_at, reason)
SELECT jti, user_id, 'access', exp, 'security_incident'
FROM active_sessions
WHERE user_id = $1;
```

**Mass Logout Procedure:**
```sql
-- Emergency: Revoke ALL sessions
UPDATE refresh_tokens SET is_active = false, revoked_at = NOW();
DELETE FROM token_blacklist WHERE expires_at < NOW();
NOTIFY administrators;
```

---

## Conclusion

This OIDC implementation follows industry best practices and exceeds OIDC 1.0 specification requirements. The defense-in-depth security architecture provides multiple independent validation layers, ensuring robust protection against common authentication attacks.

**Key Security Strengths:**
- PKCE prevents authorization code interception
- State tokens prevent CSRF and replay attacks
- Device fingerprinting prevents session hijacking
- Encrypted sessions protect sensitive data
- Defense-in-depth ID token validation
- Comprehensive audit logging for compliance

**Production Readiness:**
- ✅ Security audit passed
- ✅ HIPAA-compliant logging
- ✅ Horizontal scaling path documented
- ✅ Disaster recovery procedures defined
- ✅ Monitoring and alerting configured

**Recommended Third-Party Review Focus:**
1. PKCE implementation correctness
2. State token one-time use enforcement
3. Session encryption strength (iron-session)
4. ID token validation completeness
5. Audit logging coverage
6. ✅ Horizontal scaling ready (PostgreSQL state manager)

---

**Document Control:**
- Version: 1.0
- Last Updated: 2025-10-04
- Next Review: 2026-01-04 (quarterly)
- Owner: Security Team
- Classification: Internal Use

---

**Appendix A: Glossary**

- **OIDC:** OpenID Connect - Identity layer on top of OAuth 2.0
- **PKCE:** Proof Key for Code Exchange - Authorization code security enhancement
- **JWT:** JSON Web Token - Compact URL-safe token format
- **CSRF:** Cross-Site Request Forgery - Attack forcing unauthorized actions
- **XSS:** Cross-Site Scripting - Injection of malicious scripts
- **MFA:** Multi-Factor Authentication - Two or more verification methods
- **RBAC:** Role-Based Access Control - Permission system
- **HMAC:** Hash-based Message Authentication Code - Integrity verification
- **AES-256-GCM:** Advanced Encryption Standard with Galois/Counter Mode
- **RS256:** RSA Signature with SHA-256
- **HS256:** HMAC with SHA-256
- **TTL:** Time To Live - Expiration duration
- **IDP:** Identity Provider - Authentication service (Microsoft Entra ID)

**Appendix B: References**

- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0 RFC 6749: https://datatracker.ietf.org/doc/html/rfc6749
- PKCE RFC 7636: https://datatracker.ietf.org/doc/html/rfc7636
- Microsoft Identity Platform: https://docs.microsoft.com/en-us/azure/active-directory/develop/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- iron-session Documentation: https://github.com/vvo/iron-session
- openid-client Documentation: https://github.com/panva/node-openid-client
