# SAML SSO Quick Start Guide

**5-Minute Development Setup**

---

## Prerequisites

✅ Phases 1-8 complete (code is ready)  
✅ Admin access to Microsoft Entra ID  
✅ PostgreSQL database running locally

---

## Quick Start (Development)

### 1. Generate Certificates (2 minutes)

```bash
cd /Users/pstewart/bcos
mkdir -p certs

# Generate SP certificate
openssl req -x509 -newkey rsa:4096 -keyout certs/saml-dev-key.pem \
  -out certs/saml-dev-cert.pem -nodes -days 730 \
  -subj "/CN=localhost/O=BendCare Dev"

# You'll also need Entra's certificate (download from Azure Portal after Step 2)
```

### 2. Configure Microsoft Entra (10 minutes)

1. **Azure Portal** → **Entra ID** → **Enterprise Applications** → **New application**
2. **Name**: `BCOS SAML SSO - Dev`
3. **Single sign-on** → **SAML**
4. **Basic SAML Configuration**:
   - Entity ID: `http://localhost:4001/saml/metadata`
   - Reply URL: `http://localhost:4001/api/auth/saml/callback`
5. **Section 3**: Download "Certificate (Base64)" → Save as `certs/entra-dev-cert.pem`
6. **Users and groups**: Add yourself (use your bendcare.com email)

### 3. Configure Environment (1 minute)

Add to `.env.local`:

```bash
# SAML Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=./certs/entra-dev-cert.pem

SAML_ISSUER=http://localhost:4001/saml/metadata
SAML_CALLBACK_URL=http://localhost:4001/api/auth/saml/callback
SAML_CERT=./certs/saml-dev-cert.pem
SAML_PRIVATE_KEY=./certs/saml-dev-key.pem

SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com
SAML_LOG_RAW_RESPONSES=true
```

### 4. Run Database Migration (1 minute)

```bash
psql $DATABASE_URL -f lib/db/migrations/0015_saml_support.sql
```

### 5. Create Test User (1 minute)

```sql
INSERT INTO users (email, first_name, last_name, password_hash, is_active, email_verified)
VALUES ('your.email@bendcare.com', 'Your', 'Name', NULL, true, true);
```

**CRITICAL**: Email must match your Entra user from Step 2.6.

### 6. Start Server & Test (30 seconds)

```bash
pnpm dev

# Navigate to: http://localhost:4001/signin
# Click: "Sign in with Microsoft"
# Expected: Redirect to Microsoft → Login → Redirect back → Success!
```

---

## Verification Checklist

After completing setup:

- [ ] See "Sign in with Microsoft" button on login page
- [ ] Click button redirects to `login.microsoftonline.com/e0268...`
- [ ] Can authenticate with Microsoft credentials
- [ ] Redirects back to `localhost:4001/dashboard`
- [ ] Cookies are set (check DevTools → Application → Cookies)
- [ ] Can access protected pages

---

## Common Quick Fixes

**No SSO button showing?**
- Check environment variables are loaded: `echo $ENTRA_TENANT_ID`
- Restart dev server: `pnpm dev`

**"SAML SSO is not configured" error?**
- Verify all 4 required env vars: `ENTRA_TENANT_ID`, `SAML_ISSUER`, `SAML_CALLBACK_URL`, `ENTRA_CERT`

**"User not provisioned" error?**
- Check user exists in database with exact email from Entra
- Use: `SELECT * FROM users WHERE email = 'your@email.com';`

**"Certificate parsing failed"?**
- Verify file paths are correct
- Check PEM format: `head -1 certs/entra-dev-cert.pem` should show `-----BEGIN CERTIFICATE-----`

---

## Next Steps

Once development testing is successful:

1. **Staging Deployment**: See `docs/saml-deployment-guide.md`
2. **Production Deployment**: See `docs/saml-deployment-guide.md`
3. **User Training**: Create guide for end users
4. **Monitoring**: Set up CloudWatch alarms

---

## Files Created

**SAML Implementation** (Ready to use):
- `lib/types/saml.ts` - Type definitions
- `lib/saml/config.ts` - Configuration & certificate caching
- `lib/saml/client.ts` - SAML client factory
- `app/api/auth/saml/login/route.ts` - Login initiation
- `app/api/auth/saml/callback/route.ts` - Authentication handler
- `app/api/auth/saml/metadata/route.ts` - SP metadata

**Database**:
- `lib/db/migrations/0015_saml_support.sql` - Migration

**UI**:
- `components/auth/login-form.tsx` - Updated with SSO button

---

**Questions?** See full deployment guide: `docs/saml-deployment-guide.md`
