# Comprehensive Security Audit - Auth & Login System
**Date**: 2025-10-06
**Scope**: Complete authentication system (MFA, OIDC, tokens, cookies, CSRF, middleware, headers)

---

## 🔴 CRITICAL FINDINGS (Must Fix Immediately)

### 1. WebAuthn Environment Variables Not Configured
**File**: `lib/auth/webauthn.ts:45-46`
**Risk**: High - Production WebAuthn will fail or accept localhost origins

```typescript
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'; // DANGEROUS FALLBACK
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'; // DANGEROUS FALLBACK
```

**Impact**:
- In production without env vars, WebAuthn will use `localhost` as RP_ID
- Passkeys registered with localhost cannot be used in production
- OR passkeys could be validated against wrong origin
- Complete MFA bypass possible

**Fix Required**:
```typescript
const RP_ID = process.env.WEBAUTHN_RP_ID;
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL;

if (!RP_ID) {
  throw new Error('WEBAUTHN_RP_ID environment variable is required');
}
if (!ORIGIN) {
  throw new Error('NEXT_PUBLIC_APP_URL environment variable is required');
}
```

**Action**: Add to `.env.local` and all deployment environments:
```
WEBAUTHN_RP_ID=bendcare.com
NEXT_PUBLIC_APP_URL=https://bendcare.com
```

### 2. JWT Secret Has "your-" Prefix (Possible Placeholder)
**File**: `.env.local:15`
**Risk**: Medium-High - May be placeholder secret

```
JWT_SECRET=your-CfcZ/hv4i7hMhIkuW1dub2bBQI9TOVJJ2h4w98QDmVENqw/Fu4lWdByDkaQkiBMlbWSg+Jb6Xzvu0cWVVIynR22crDisMn/MQsgntOytB88oUaj2rVj9dC5CsgY85M/A
```

**Impact**:
- If this is a shared/example secret, all tokens can be forged
- Complete authentication bypass possible

**Fix Required**:
- Generate new cryptographically random secret
- Rotate in all environments
- Invalidate all existing tokens

**Command**:
```bash
openssl rand -base64 128
```

---

## 🟡 HIGH PRIORITY FINDINGS

### 3. MFA Challenge Cleanup Not Scheduled
**File**: `app/api/admin/maintenance/security/route.ts`
**Risk**: Medium - Table bloat, no automated cleanup

**Status**: Endpoint exists but not scheduled

**Fix Required**:
- Set up cron job to call `/api/admin/maintenance/security` every hour
- Or add to deployment platform's scheduled tasks (Vercel Cron, AWS EventBridge)

### 4. No Token Rotation on Password Change
**File**: Password reset flows
**Risk**: Medium - Stolen tokens remain valid after password change

**Fix Required**:
- Call `revokeAllUserTokens()` when password is changed
- Force re-authentication on all devices

### 5. OIDC Session Cookie Not Marked Secure in Development
**File**: `app/api/auth/oidc/login/route.ts:128`
**Risk**: Low-Medium - Development MITM possible

```typescript
cookieStore.set('oidc-session', sealed, {
  httpOnly: true,
  secure: false, // ⚠️ Not secure in dev
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 10, // 10 minutes
});
```

**Impact**:
- Development traffic can be intercepted
- Session hijacking possible over HTTP

**Fix**: Use `secure: process.env.NODE_ENV === 'production'` consistently

---

## 🟢 MEDIUM PRIORITY FINDINGS

### 6. No Session Invalidation on MFA Disable
**Risk**: Low-Medium - Active sessions remain valid if admin disables user's MFA

**Fix**: When MFA is disabled for a user, invalidate all their sessions

### 7. Rate Limiter Uses In-Memory Storage
**File**: `lib/api/middleware/rate-limit.ts`
**Risk**: Low - Rate limits reset on server restart, doesn't scale horizontally

**Current**: `Map<string, RateLimitEntry>` in memory

**Impact**:
- Multi-instance deployments won't share rate limit state
- Server restart clears all rate limits
- Attacker can bypass by targeting different instances

**Fix** (Production):
- Use Redis for shared rate limiting
- Or use edge rate limiting (Vercel Edge Config, Cloudflare KV)

### 8. No Rate Limiting on OIDC Endpoints
**Files**:
- `app/api/auth/oidc/login/route.ts`
- `app/api/auth/oidc/callback/route.ts`

**Risk**: Low-Medium - OIDC flow can be abused for DoS

**Fix**: Add rate limiting to OIDC login/callback

### 9. Audit Logs Missing from Some Endpoints
**Files**: Several API routes
**Risk**: Low - Compliance/forensics gaps

**Missing audit logs**:
- Challenge cleanup operations
- Some MFA registration failures
- Rate limit violations

---

## ✅ SECURITY CONTROLS WORKING CORRECTLY

### Authentication
- ✅ Password hashing with bcrypt
- ✅ Account lockout after failed attempts
- ✅ MFA challenge one-time use (NOW FIXED - marked on all code paths)
- ✅ WebAuthn counter regression detection
- ✅ OIDC state validation (one-time use, database-backed)
- ✅ OIDC device fingerprint validation
- ✅ PKCE flow for OIDC

### Session Management
- ✅ JWT with 15-minute expiration
- ✅ Refresh tokens with device binding
- ✅ Token blacklist for revocation
- ✅ httpOnly cookies for tokens
- ✅ Separate secrets for access/refresh/MFA temp tokens

### CSRF Protection
- ✅ Double-submit cookie pattern
- ✅ Signed authenticated tokens
- ✅ Anonymous tokens for pre-auth
- ✅ Dual-token endpoints (login, MFA)
- ✅ Constant-time comparison (Edge Runtime compatible)

### Cookies
- ✅ httpOnly: true for auth tokens
- ✅ secure: true in production
- ✅ sameSite: 'strict' for auth tokens
- ✅ sameSite: 'lax' for OIDC session (correct for redirects)
- ✅ Appropriate maxAge values

### MFA/WebAuthn
- ✅ Challenge marked as used immediately (prevents replay)
- ✅ 5-minute challenge expiration
- ✅ Counter regression detection
- ✅ Max 5 credentials per user
- ✅ Credential name validation (100 char max)
- ✅ Database transactions for atomic operations
- ✅ MFA-specific rate limiting (5 per 15 min)

### Middleware
- ✅ Global rate limiting (100 req/15min)
- ✅ Auth rate limiting (20 req/15min)
- ✅ MFA rate limiting (5 req/15min)
- ✅ JWT validation in middleware
- ✅ Token blacklist check
- ✅ RBAC permission checks

---

## 📊 SECURITY POSTURE SUMMARY

**Overall Grade**: B+ (Good, with critical config issues)

**Critical Issues**: 2 (Environment configuration)
**High Priority**: 3 (Operational/production hardening)
**Medium Priority**: 4 (Improvements, not urgent)

**Strengths**:
- Comprehensive MFA implementation
- Proper CSRF protection
- Good cookie security
- Audit logging present
- Defense-in-depth approach

**Weaknesses**:
- Missing production environment configuration
- Rate limiting not production-ready (in-memory)
- Some operational gaps (token rotation, session invalidation)

---

## 🎯 IMMEDIATE ACTION ITEMS (Next 24 Hours)

1. **Add WebAuthn environment variables** to `.env.local` and production
2. **Verify JWT_SECRET** is truly random (regenerate if needed)
3. **Test MFA flow end-to-end** to verify challenge marking
4. **Schedule challenge cleanup** (cron or platform scheduler)
5. **Add rate limiting** to OIDC endpoints

---

## 📋 COMPLIANCE NOTES

**HIPAA**:
- ✅ Audit logging in place
- ✅ Access controls (RBAC)
- ✅ Session management
- ⚠️ Need Redis rate limiting for production scale
- ⚠️ Need token rotation on password change

**SOC 2**:
- ✅ Authentication controls
- ✅ MFA enforcement
- ✅ Audit trail
- ⚠️ Need automated security maintenance
- ⚠️ Need incident response procedures for rate limit violations

---

## 🔍 TESTING RECOMMENDATIONS

1. **MFA Replay Attack Test**:
   - Attempt to reuse a challenge after failure
   - Verify challenge is marked as used
   - Check database: `SELECT * FROM webauthn_challenges WHERE used_at IS NULL`

2. **Token Revocation Test**:
   - Login, get token
   - Logout
   - Attempt to use old token
   - Verify 401 response

3. **CSRF Test**:
   - Attempt state-changing request without CSRF token
   - Verify 403 response
   - Attempt with invalid CSRF token
   - Verify 403 response

4. **Rate Limit Test**:
   - Make 6 MFA attempts within 15 minutes
   - Verify 429 (Too Many Requests) on 6th attempt

5. **Counter Regression Test**:
   - Would require authenticator cloning (skip in dev)
   - Monitor production logs for counter regression alerts

---

## 📞 SECURITY CONTACTS

**For production deployment**:
- Ensure all environment variables are set
- Use proper secrets management (AWS Secrets Manager, etc.)
- Enable monitoring/alerting for security events
- Set up log aggregation (CloudWatch, Datadog, etc.)

**Incident Response**:
- Monitor `audit_logs` table for suspicious activity
- Set up alerts for:
  - Multiple failed MFA attempts
  - Counter regression detection
  - Rate limit violations
  - Unusual login patterns

---

*End of Security Audit Report*
