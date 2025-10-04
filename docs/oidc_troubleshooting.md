# OIDC Troubleshooting Guide

This guide helps diagnose and resolve common issues with OpenID Connect (OIDC) authentication using Microsoft Entra ID.

## Quick Diagnostics

### Check if OIDC is Enabled

OIDC requires all these environment variables to be set:

```bash
ENTRA_TENANT_ID=<your-tenant-id>
ENTRA_APP_ID=<your-client-id>
ENTRA_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URI=<your-callback-url>
OIDC_SESSION_SECRET=<32-char-secret>
```

### Verify Configuration

```typescript
import { isOIDCEnabled } from '@/lib/env';

console.log('OIDC Enabled:', isOIDCEnabled());
```

---

## Common Issues

### 1. "Email domain not verified by identity provider" Error

**Symptoms:**
- Login fails with "Your email must be verified in Microsoft. Contact your administrator."
- Microsoft authentication succeeds but user cannot access the application

**Root Cause:**
Microsoft Entra ID does NOT support the standard `email_verified` claim. Instead, it uses `xms_edov` (Email Domain Owner Verified) which must be explicitly configured as an optional claim.

**Resolution:**

#### Step 1: Add Email Claim (Via UI)
1. Navigate to Azure Portal → App Registrations → Your App
2. Go to **Manage → Token Configuration**
3. Click **Add optional claim**
4. Select Token type: **ID**
5. Enable **email** claim
6. Accept the Microsoft Graph email permission prompt
7. Click **Add**
8. Repeat for **Access** token type

#### Step 2: Add xms_edov Claim (Via Manifest)
The `xms_edov` claim is not available in the UI and must be added via the application manifest:

1. Go to **Manifest** in the left navigation
2. Find the `optionalClaims` section
3. Edit to include both `email` and `xms_edov`:

```json
"optionalClaims": {
  "idToken": [
    {
      "name": "email",
      "source": null,
      "essential": false,
      "additionalProperties": []
    },
    {
      "name": "xms_edov",
      "source": null,
      "essential": false,
      "additionalProperties": []
    }
  ],
  "accessToken": [
    {
      "name": "email",
      "source": null,
      "essential": false,
      "additionalProperties": []
    },
    {
      "name": "xms_edov",
      "source": null,
      "essential": false,
      "additionalProperties": []
    }
  ]
}
```

4. Click **Save** at the top
5. Return to **Token Configuration** to verify claims appear

**Note:** You may see a warning that `xms_edov` is "invalid" - ignore this. The Azure Portal UI is outdated but the claim is fully supported.

#### Step 3: Verify Domain Ownership
The `xms_edov` claim only returns `true` if your domain is verified:

1. Azure Portal → Entra ID → **Custom domain names**
2. Click **Add custom domain**
3. Add your email domain (e.g., `yourcompany.com`)
4. Add the DNS TXT record shown to your domain's DNS configuration
5. Click **Verify** (may take up to 72 hours)

#### What xms_edov Verifies
- ✅ Email domain is verified by the tenant administrator
- ✅ Email is from Microsoft account (MSA), Google account, or OTP authentication
- ❌ Facebook accounts are excluded
- ❌ SAML/WS-Fed federated accounts are excluded

### 2. "OIDC SSO is not available" Error

**Symptoms:**
- Users see "OIDC SSO is not available. Please use email and password to sign in."
- Sign in with Microsoft button redirects to signin page with error

**Causes:**
- Missing or incomplete environment variables
- OIDC_SESSION_SECRET less than 32 characters
- Invalid ENTRA_TENANT_ID format (must be valid UUID)

**Resolution:**
1. Check all required environment variables are set in `.env.local`
2. Verify `OIDC_SESSION_SECRET` is at least 32 characters:
   ```bash
   # Generate new secret
   openssl rand -base64 32
   ```
3. Verify `ENTRA_TENANT_ID` is valid UUID format
4. Restart application after changing environment variables

---

### 2. "Microsoft authentication failed due to security check"

**Symptoms:**
- Error code: `oidc_state_mismatch`
- User redirected back to signin after Microsoft login

**Causes:**
- CSRF protection detected state parameter mismatch
- User took too long to complete authentication (>10 minutes)
- Session cookie was deleted or corrupted

**Resolution:**
1. Try signing in again immediately
2. Clear browser cookies and try again
3. Check that `sameSite: 'lax'` is set for OIDC session cookie
4. Verify `OIDC_REDIRECT_URI` exactly matches the redirect URI configured in Azure Portal

---

### 3. "Session expired or already used"

**Symptoms:**
- Error code: `oidc_state_replay`
- Authentication fails even though Microsoft redirected successfully

**Causes:**
- Duplicate callback request (user refreshed callback page)
- State token already consumed (replay attack prevention)
- State token expired (>10 minutes old)

**Resolution:**
1. **Do not refresh** the callback page - always start from login
2. Start authentication flow again from `/api/auth/oidc/login`
3. Check server logs for "State token replay attempt detected"
4. If issue persists, check for browser extensions interfering with redirects

---

### 4. "Security validation failed. Please try again from your original device"

**Symptoms:**
- Error code: `oidc_session_hijack`
- Authentication fails with fingerprint validation error

**Causes:**
- `OIDC_STRICT_FINGERPRINT=true` and user's IP or User-Agent changed
- User switched networks mid-authentication (e.g., WiFi to mobile)
- VPN connection changed during auth flow

**Resolution:**
1. Set `OIDC_STRICT_FINGERPRINT=false` for normal mode (recommended)
2. Advise users not to change networks during authentication
3. Check server logs for fingerprint mismatch details:
   ```
   OIDC session fingerprint changed
   expected: abc123...
   received: xyz789...
   ```

**Strict Mode vs Normal Mode:**
- **Strict (`true`)**: Maximum security, blocks any fingerprint change
- **Normal (`false`)**: Allows fingerprint changes but logs warnings (recommended for production)

---

### 5. "Your email must be verified in Microsoft"

**Symptoms:**
- Error code: `oidc_email_not_verified`
- User has Microsoft account but `email_verified` claim is false

**Causes:**
- User's email not verified in Microsoft Entra ID
- Guest users with unverified email addresses

**Resolution:**
1. User must verify email in their Microsoft account settings
2. Admin can check verification status in Azure Portal:
   - Azure Active Directory → Users → Select User → Contact Info
3. For guest users, ensure email is verified before granting access

---

### 6. "Your email domain is not authorized"

**Symptoms:**
- Error code: `oidc_domain_not_allowed`
- User authenticates successfully but domain is blocked

**Causes:**
- User's email domain not in `OIDC_ALLOWED_DOMAINS`
- Configuration mismatch between Azure and application

**Resolution:**
1. Check `OIDC_ALLOWED_DOMAINS` in `.env.local`:
   ```bash
   OIDC_ALLOWED_DOMAINS=example.com,company.org,partner.net
   ```
2. Add user's email domain to allowed list
3. Remove `OIDC_ALLOWED_DOMAINS` to allow all domains (not recommended for production)
4. Restart application after config change

---

### 7. "Your account is not authorized for this application"

**Symptoms:**
- Error code: `user_not_provisioned`
- User authenticates with Microsoft successfully but no account in database

**Causes:**
- User exists in Microsoft Entra ID but not in application database
- User was never created in the application

**Resolution:**
1. Check if user exists in database:
   ```sql
   SELECT * FROM users WHERE email = 'user@example.com';
   ```
2. Create user account in application
3. Sync Microsoft Entra ID users to application database (if sync is configured)
4. For auto-provisioning, ensure OIDC callback creates users (currently not implemented)

---

### 8. "Your account has been deactivated"

**Symptoms:**
- Error code: `user_inactive`
- User exists in database but `is_active = false`

**Causes:**
- Administrator deactivated user account
- Account suspended for policy violation

**Resolution:**
1. Admin reactivates account:
   ```sql
   UPDATE users SET is_active = true WHERE email = 'user@example.com';
   ```
2. Contact administrator to restore account access

---

### 9. "Authentication with Microsoft failed"

**Symptoms:**
- Error code: `oidc_token_exchange_failed`
- Token exchange with Microsoft fails

**Causes:**
- Invalid `ENTRA_CLIENT_SECRET`
- Authorization code expired (>10 minutes)
- Network connectivity issues with Microsoft

**Resolution:**
1. Verify `ENTRA_CLIENT_SECRET` in Azure Portal matches `.env.local`
2. Complete authentication flow quickly (<10 minutes)
3. Check server logs for detailed error from Microsoft:
   ```
   Token exchange failed
   error: invalid_client
   ```
4. Test connectivity to `login.microsoftonline.com`:
   ```bash
   curl -I https://login.microsoftonline.com
   ```

---

### 10. "Microsoft sign-in failed" (General Error)

**Symptoms:**
- Error code: `oidc_callback_failed`
- Generic error during callback processing

**Causes:**
- Unexpected error during OIDC flow
- Server-side error (check logs)

**Resolution:**
1. Check server logs for detailed error:
   ```
   OIDC callback failed
   error: <detailed error message>
   stack: <stack trace>
   ```
2. Common sub-issues:
   - ID token validation failed
   - Profile data invalid
   - Database connection error
3. Try authentication again
4. If persistent, check application health and restart if needed

---

## Azure Portal Configuration

### Required Redirect URIs

Ensure these redirect URIs are configured in Azure Portal → App Registrations → Authentication:

**Local Development:**
```
http://localhost:4001/api/auth/oidc/callback
```

**Production:**
```
https://app.bendcare.com/api/auth/oidc/callback
https://staging.bendcare.com/api/auth/oidc/callback
```

### Required API Permissions

Ensure these Microsoft Graph permissions are granted:

- `openid` (enabled by default)
- `profile` (enabled by default)
- `email` (enabled by default)
- `User.Read` (optional, for additional profile data)

### Token Configuration

Ensure these token configuration settings:

1. **ID tokens** checkbox is enabled
2. **Access tokens** checkbox is enabled (for future API access)
3. **Token version** is set to v2.0

---

## Debugging Tools

### Enable Debug Logging

Set environment variable:
```bash
NODE_ENV=development
```

This enables detailed OIDC logs in server console.

### Check OIDC State

```typescript
import { stateManager } from '@/lib/oidc/state-manager';

console.log('Active states:', stateManager.getStateCount());
console.log('Cleanup count:', stateManager.cleanupExpired());
```

### Inspect Session Cookie

In browser DevTools → Application → Cookies:
- Look for `oidc-session` cookie
- Should be HttpOnly, Secure (in production), SameSite=lax
- Should expire in 10 minutes

### Test OIDC Flow Manually

```bash
# 1. Initiate login
curl -v http://localhost:4001/api/auth/oidc/login

# 2. Extract redirect URL from Location header

# 3. Open redirect URL in browser, complete Microsoft login

# 4. Callback should set access-token and refresh-token cookies
```

---

## Performance Issues

### Slow Login (>2 seconds)

**Symptoms:**
- Login takes longer than expected
- Discovery requests are slow

**Causes:**
- Discovery configuration not cached
- Network latency to Microsoft endpoints
- Database query performance

**Resolution:**
1. Discovery caching is implemented with 24-hour TTL
2. Check discovery cache is working:
   ```
   Discovery configuration cached
   cacheAge: <seconds>
   ```
3. Monitor database query performance
4. Consider CDN/edge caching for static resources

---

## Security Alerts

### State Replay Attempt Detected

**Log Message:**
```
State token replay attempt detected
state: abc123...
originalTimestamp: 2025-01-15T10:30:00Z
age: 120000
```

**Action:**
- This is expected behavior (one-time state token enforcement)
- No action needed unless repeated from same IP (possible attack)
- Monitor for patterns indicating automated attacks

### Session Hijack Attempt

**Log Message:**
```
OIDC session hijack attempt detected
expected: abc123...
received: xyz789...
ipAddress: 192.168.1.100
```

**Action:**
- User's device fingerprint changed during authentication
- If `OIDC_STRICT_FINGERPRINT=true`, login was blocked
- If `OIDC_STRICT_FINGERPRINT=false`, login allowed with warning
- Investigate if pattern indicates credential theft

---

## Getting Help

### Check Logs

**Server Logs:**
```bash
# Filter OIDC-related logs
grep "OIDC" logs/application.log

# Filter authentication failures
grep "login_failed" logs/audit.log | grep "authMethod.*oidc"
```

**Audit Logs:**
```sql
SELECT * FROM audit_logs
WHERE action = 'login_failed'
AND metadata->>'authMethod' = 'oidc'
ORDER BY timestamp DESC
LIMIT 50;
```

### Contact Support

Provide this information when reporting issues:

1. Error code from browser (e.g., `oidc_state_mismatch`)
2. Timestamp of authentication attempt
3. User email (if applicable)
4. Server logs around timestamp
5. Environment (dev, staging, production)
6. Browser and OS version

### Related Documentation

- [OIDC Conversion Design](./oidc_conversion.md)
- [Microsoft Entra ID Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [OpenID Connect Specification](https://openid.net/specs/openid-connect-core-1_0.html)
