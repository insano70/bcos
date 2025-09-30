# Microsoft Entra SAML SSO Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Security Model](#security-model)
3. [Prerequisites](#prerequisites)
4. [Phase 1: Microsoft Entra Configuration](#phase-1-microsoft-entra-configuration)
5. [Phase 2: Generate Service Provider Keys](#phase-2-generate-service-provider-keys)
6. [Phase 3: Next.js Implementation](#phase-3-nextjs-implementation)
7. [Phase 4: Testing & Validation](#phase-4-testing--validation)
8. [Phase 5: Production Deployment](#phase-5-production-deployment)
9. [Security Considerations](#security-considerations)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### High-Level Flow
1. User clicks "Sign in with Microsoft" on login page
2. Application redirects to Microsoft Entra ID (tenant-specific endpoint)
3. User authenticates with Microsoft credentials
4. Entra returns signed SAML assertion to callback URL
5. Application validates SAML signature and tenant
6. Application matches user by email to pre-provisioned database records
7. Application issues existing custom JWT and establishes session
8. User accesses application with JWT authentication

### Key Components
- **Identity Provider (IdP)**: Microsoft Entra ID (tenant-specific)
- **Service Provider (SP)**: Your Next.js application
- **SAML Library**: `@node-saml/node-saml`
- **Authentication Bridge**: API routes that convert SAML → JWT

---

## Security Model

### Tenant Isolation Strategy
To ensure users can ONLY authenticate through YOUR approved Entra tenant (not any Microsoft account):

1. **Tenant-Specific Endpoint**: Use `https://login.microsoftonline.com/{YOUR_TENANT_ID}/saml2` instead of generic `https://login.microsoftonline.com/common/saml2`

2. **Issuer Validation**: Validate that the SAML response issuer matches your tenant's entity ID exactly

3. **Certificate Pinning**: Only accept SAML responses signed by YOUR tenant's specific certificate

4. **Audience Restriction**: Verify the SAML audience claim matches your application's entity ID

### Defense in Depth
- Signature validation (cryptographic verification)
- Issuer validation (tenant verification)
- Audience validation (application verification)
- User pre-provisioning (authorization check)
- Time-based validation (NotBefore/NotOnOrAfter)

---

## Prerequisites

### Development Environment
- Node.js 24+ installed
- Next.js 15 application with SSR enabled
- Existing user database with email addresses
- Existing JWT authentication system
- Access to Microsoft Entra ID admin portal

### Required Information
- Your Microsoft Entra Tenant ID
- Your application's public domain (e.g., `https://yourdomain.com`)
- List of pre-provisioned user emails

### NPM Dependencies
```bash
npm install @node-saml/node-saml
```

---

## Phase 1: Microsoft Entra Configuration

### Step 1.1: Create Enterprise Application

1. Navigate to **Azure Portal** → **Microsoft Entra ID** → **Enterprise Applications**
2. Click **New application** → **Create your own application**
3. Name: `[Your App Name] - SAML SSO`
4. Select: **Integrate any other application you don't find in the gallery (Non-gallery)**
5. Click **Create**

### Step 1.2: Configure Single Sign-On

1. In your new Enterprise Application, navigate to **Single sign-on**
2. Select **SAML** as the sign-on method
3. You'll see the SAML configuration screen with 5 sections

### Step 1.3: Basic SAML Configuration

Edit **Section 1: Basic SAML Configuration**:

- **Identifier (Entity ID)**: 
  - Production: `https://yourdomain.com/saml/metadata`
  - Development: `http://localhost:3000/saml/metadata`
  
- **Reply URL (Assertion Consumer Service URL)**:
  - Production: `https://yourdomain.com/api/auth/saml/callback`
  - Development: `http://localhost:3000/api/auth/saml/callback`

- **Sign on URL** (optional): Your application's home page

**Important**: Use HTTPS in production. For development, you may use HTTP with localhost.

### Step 1.4: User Attributes & Claims

In **Section 2: Attributes & Claims**, ensure these claims are configured:

| Claim Name | Source Attribute |
|------------|------------------|
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `user.mail` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `user.userprincipalname` |
| `http://schemas.microsoft.com/identity/claims/displayname` | `user.displayname` |

**These are the default claims** - you typically don't need to change them.

### Step 1.5: Download Certificate & Metadata

In **Section 3: SAML Certificates**:

1. Download **Certificate (Base64)** - save as `entra-cert.pem`
2. Download **Federation Metadata XML** - save as `entra-metadata.xml`
3. Note the **App Federation Metadata Url** for future reference

**Store these files securely** - they contain your tenant's public certificate.

### Step 1.6: Note Configuration URLs

In **Section 4: Set up [Your App]**, copy these URLs:

- **Login URL**: Should be `https://login.microsoftonline.com/{TENANT_ID}/saml2`
- **Microsoft Entra Identifier**: Should be `https://sts.windows.net/{TENANT_ID}/`
- **Logout URL**: For future use

**CRITICAL**: Verify the Login URL contains YOUR TENANT ID, not `common` or `organizations`.

### Step 1.7: Assign Users

1. Navigate to **Users and groups** in your Enterprise Application
2. Click **Add user/group**
3. Add users who should have access to your application
4. **Important**: These users must match the pre-provisioned emails in your database

---

## Phase 2: Generate Service Provider Keys

Your application needs a certificate and private key to sign SAML requests (optional but recommended) and to identify itself.

### Step 2.1: Generate Keys with OpenSSL

```bash
# Navigate to your Next.js project root
cd your-nextjs-app

# Create a certs directory (add to .gitignore!)
mkdir -p certs

# Generate private key and self-signed certificate (valid for 2 years)
openssl req -x509 -newkey rsa:4096 -keyout certs/saml-key.pem -out certs/saml-cert.pem -nodes -days 730 -subj "/CN=yourdomain.com"
```

### Step 2.2: Secure the Keys

**Add to `.gitignore`**:
```
certs/*.pem
```

**For production**, store these in:
- AWS Secrets Manager
- Azure Key Vault  
- Kubernetes Secrets
- Encrypted environment variables

### Step 2.3: Extract Certificate for Entra

```bash
# View your certificate (you'll need this for Entra)
cat certs/saml-cert.pem
```

**Optional**: Upload this certificate to Entra if you want to sign SAML requests:
1. In Entra, go to your app → **Single sign-on** → **SAML Certificates**
2. Click **Edit** in Section 3
3. Under **Verification certificates**, upload `saml-cert.pem`

---

## Phase 3: Next.js Implementation

### Step 3.1: Project Structure

Create the following directory structure:

```
your-nextjs-app/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── saml/
│   │           ├── login/
│   │           │   └── route.ts          # Initiates SAML login
│   │           ├── callback/
│   │           │   └── route.ts          # Handles SAML response
│   │           └── metadata/
│   │               └── route.ts          # Serves SP metadata (optional)
│   └── login/
│       └── page.tsx                      # Login page with Microsoft button
├── lib/
│   ├── saml/
│   │   ├── config.ts                     # SAML configuration
│   │   └── client.ts                     # SAML client wrapper
│   └── auth/
│       └── jwt.ts                        # Your existing JWT logic
├── certs/
│   ├── saml-cert.pem                     # Your SP certificate
│   ├── saml-key.pem                      # Your SP private key
│   └── entra-cert.pem                    # Entra's public certificate
└── .env.local
```

### Step 3.2: Environment Configuration

Create `.env.local` with the following variables:

```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=your-tenant-id-here
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/saml2
ENTRA_ISSUER=https://sts.windows.net/${ENTRA_TENANT_ID}/
ENTRA_CERT_PATH=./certs/entra-cert.pem

# Service Provider Configuration  
SAML_ISSUER=https://yourdomain.com/saml/metadata
SAML_CALLBACK_URL=https://yourdomain.com/api/auth/saml/callback
SAML_CERT_PATH=./certs/saml-cert.pem
SAML_KEY_PATH=./certs/saml-key.pem

# Application URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
SAML_SUCCESS_REDIRECT=/dashboard

# For development
# ENTRA_ENTRY_POINT=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/saml2
# SAML_ISSUER=http://localhost:3000/saml/metadata
# SAML_CALLBACK_URL=http://localhost:3000/api/auth/saml/callback
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Security Note**: Never commit `.env.local` to version control.

### Step 3.3: SAML Configuration (`lib/saml/config.ts`)

This file centralizes all SAML configuration:

```typescript
import fs from 'fs';
import path from 'path';

export const samlConfig = {
  // Identity Provider (Microsoft Entra)
  entryPoint: process.env.ENTRA_ENTRY_POINT!,
  issuer: process.env.SAML_ISSUER!,
  callbackUrl: process.env.SAML_CALLBACK_URL!,
  
  // IdP Certificate for validating SAML responses
  cert: fs.readFileSync(
    path.resolve(process.cwd(), process.env.ENTRA_CERT_PATH!),
    'utf-8'
  ),
  
  // Service Provider credentials (optional - for signing requests)
  privateCert: fs.readFileSync(
    path.resolve(process.cwd(), process.env.SAML_KEY_PATH!),
    'utf-8'
  ),
  
  // Security settings
  wantAssertionsSigned: true,
  wantAuthnResponseSigned: true,
  signatureAlgorithm: 'sha256',
  digestAlgorithm: 'sha256',
  
  // Expected values for validation
  audience: process.env.SAML_ISSUER,
  
  // CRITICAL: Validate issuer matches YOUR tenant
  acceptedClockSkewMs: 5000, // 5 seconds tolerance
  
  // Identity format
  identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  
  // Request settings
  forceAuthn: false, // Set true to always require re-authentication
  disableRequestedAuthnContext: false,
  
  // Protocol binding
  authnRequestBinding: 'HTTP-Redirect', // or 'HTTP-POST'
};

// Expected Entra issuer for validation
export const EXPECTED_ENTRA_ISSUER = process.env.ENTRA_ISSUER!;

// Tenant ID for additional validation
export const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID!;
```

### Step 3.4: SAML Client Wrapper (`lib/saml/client.ts`)

Create a wrapper around node-saml for easier usage:

```typescript
import { SAML } from '@node-saml/node-saml';
import { samlConfig, EXPECTED_ENTRA_ISSUER } from './config';

class SamlClient {
  private saml: SAML;

  constructor() {
    this.saml = new SAML(samlConfig);
  }

  async createLoginUrl(): Promise<string> {
    return await this.saml.getAuthorizeUrlAsync('', {});
  }

  async validateResponse(body: any): Promise<{
    profile: any;
    loggedOut: boolean;
  }> {
    const response = await this.saml.validatePostResponseAsync(body);
    
    // CRITICAL: Validate issuer is YOUR tenant
    if (response.profile.issuer !== EXPECTED_ENTRA_ISSUER) {
      throw new Error(
        `Invalid issuer. Expected ${EXPECTED_ENTRA_ISSUER}, ` +
        `received ${response.profile.issuer}`
      );
    }
    
    return response;
  }

  async generateMetadata(): Promise<string> {
    return this.saml.generateServiceProviderMetadata(
      samlConfig.privateCert,
      samlConfig.cert
    );
  }
}

export const samlClient = new SamlClient();
```

### Step 3.5: Login Initiation Route (`app/api/auth/saml/login/route.ts`)

This route initiates the SAML authentication flow:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { samlClient } from '@/lib/saml/client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Generate SAML AuthnRequest URL
    const loginUrl = await samlClient.createLoginUrl();
    
    // Redirect user to Microsoft Entra
    return NextResponse.redirect(loginUrl);
    
  } catch (error) {
    console.error('SAML login initiation error:', error);
    
    return NextResponse.redirect(
      new URL('/login?error=saml_init_failed', request.url)
    );
  }
}
```

**Key Points**:
- `runtime = 'nodejs'` is required for node-saml
- Generates a signed SAML AuthnRequest (if configured)
- Redirects to tenant-specific Entra endpoint
- Error handling redirects back to login page

### Step 3.6: Callback Handler (`app/api/auth/saml/callback/route.ts`)

This is the most critical route - it validates SAML responses and issues JWTs:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { samlClient } from '@/lib/saml/client';
import { issueJWT } from '@/lib/auth/jwt';
import { getUserByEmail } from '@/lib/database/users';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Parse form data from Entra
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse') as string;
    
    if (!samlResponse) {
      throw new Error('No SAML response received');
    }
    
    // Validate SAML response (includes signature, issuer, audience checks)
    const { profile } = await samlClient.validateResponse({
      SAMLResponse: samlResponse
    });
    
    // Extract email from SAML assertion
    const email = 
      profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
      profile.email ||
      profile.nameID;
    
    if (!email) {
      throw new Error('No email found in SAML response');
    }
    
    // CRITICAL: Check if user is pre-provisioned in your database
    const user = await getUserByEmail(email);
    
    if (!user) {
      console.warn(`SSO attempt by non-provisioned user: ${email}`);
      return NextResponse.redirect(
        new URL('/login?error=user_not_provisioned', request.url)
      );
    }
    
    // Issue your existing custom JWT
    const token = issueJWT({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    });
    
    // Create response with redirect
    const response = NextResponse.redirect(
      new URL(process.env.SAML_SUCCESS_REDIRECT || '/dashboard', request.url)
    );
    
    // Set JWT as httpOnly cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    
    return response;
    
  } catch (error) {
    console.error('SAML callback error:', error);
    
    return NextResponse.redirect(
      new URL('/login?error=saml_validation_failed', request.url)
    );
  }
}
```

**Security Validations Performed**:
1. SAML signature validation (by node-saml)
2. Issuer validation (your tenant only)
3. Audience validation (your app only)
4. Time-based validation (NotBefore/NotOnOrAfter)
5. User pre-provisioning check
6. JWT issuance with your existing system

### Step 3.7: Metadata Endpoint (Optional) (`app/api/auth/saml/metadata/route.ts`)

Serve your SP metadata for Entra:

```typescript
import { NextResponse } from 'next/server';
import { samlClient } from '@/lib/saml/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metadata = await samlClient.generateMetadata();
    
    return new NextResponse(metadata, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('Metadata generation error:', error);
    return new NextResponse('Error generating metadata', { status: 500 });
  }
}
```

### Step 3.8: Login Page (`app/login/page.tsx`)

Add the Microsoft sign-in button:

```typescript
'use client';

import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  
  const errorMessages = {
    saml_init_failed: 'Failed to initiate Microsoft sign-in. Please try again.',
    saml_validation_failed: 'Authentication failed. Please try again.',
    user_not_provisioned: 'Your account is not authorized. Contact your administrator.',
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-8">
        <div>
          <h2 className="text-3xl font-bold">Sign in to Your App</h2>
        </div>
        
        {error && (
          <div className="rounded bg-red-50 p-4 text-red-800">
            {errorMessages[error as keyof typeof errorMessages] || 
             'An error occurred. Please try again.'}
          </div>
        )}
        
        {/* Microsoft Sign-In Button */}
        <a
          href="/api/auth/saml/login"
          className="flex w-full items-center justify-center gap-3 
                     rounded-lg border border-gray-300 bg-white px-4 py-3 
                     text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          <span className="font-medium">Sign in with Microsoft</span>
        </a>
        
        {/* Optional: Traditional login form */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">
              Or continue with email
            </span>
          </div>
        </div>
        
        {/* Your existing email/password form */}
      </div>
    </div>
  );
}
```

---

## Phase 4: Testing & Validation

### Step 4.1: Local Development Testing

1. **Start your Next.js dev server**:
```bash
npm run dev
```

2. **Update Entra with localhost URLs** (if testing locally):
   - Reply URL: `http://localhost:3000/api/auth/saml/callback`
   - Entity ID: `http://localhost:3000/saml/metadata`

3. **Test the flow**:
   - Visit `http://localhost:3000/login`
   - Click "Sign in with Microsoft"
   - Should redirect to Microsoft login
   - Log in with a test user assigned in Entra
   - Should redirect back and issue JWT

### Step 4.2: Validation Checklist

**Pre-Authentication**:
- [ ] Login button appears on page
- [ ] Clicking button redirects to `login.microsoftonline.com/[YOUR_TENANT_ID]`
- [ ] Microsoft login page loads correctly

**Authentication**:
- [ ] Can sign in with test user credentials
- [ ] Redirected back to callback URL
- [ ] No CORS errors in console

**Post-Authentication**:
- [ ] User redirected to dashboard/home
- [ ] JWT cookie is set (check browser DevTools → Application → Cookies)
- [ ] User can access protected routes
- [ ] User's email matches database record

### Step 4.3: Security Validation Tests

**Test 1: Wrong Tenant Rejection**
- Attempt to use SAML response from a different tenant
- Should be rejected with issuer validation error

**Test 2: Unsigned Response Rejection**
- If possible, send an unsigned SAML response
- Should be rejected by node-saml

**Test 3: Non-Provisioned User**
- Create user in Entra but NOT in your database
- Should be rejected with "user not provisioned" error

**Test 4: Expired Assertion**
- Wait for SAML assertion to expire (typically 5 minutes)
- Should be rejected with time validation error

**Test 5: Replay Attack**
- Try to resubmit the same SAML response twice
- Should be rejected (node-saml tracks InResponseTo IDs)

### Step 4.4: Logging for Debugging

Add comprehensive logging in callback route:

```typescript
console.log('SAML Response received');
console.log('Profile issuer:', profile.issuer);
console.log('Expected issuer:', EXPECTED_ENTRA_ISSUER);
console.log('Extracted email:', email);
console.log('User found:', !!user);
```

---

## Phase 5: Production Deployment

### Step 5.1: Pre-Deployment Checklist

**Environment Variables**:
- [ ] All production URLs configured
- [ ] Certificates stored in secrets manager
- [ ] `NODE_ENV=production` set
- [ ] Tenant ID is correct
- [ ] No localhost URLs in configuration

**Entra Configuration**:
- [ ] Production Reply URL added to Entra
- [ ] Production Entity ID configured
- [ ] Certificate uploaded (if signing requests)
- [ ] All authorized users assigned

**Security**:
- [ ] HTTPS enabled on production domain
- [ ] SSL certificates valid
- [ ] CSP headers configured
- [ ] Rate limiting on auth endpoints
- [ ] Secure cookie flags enabled

### Step 5.2: ECS-Specific Configuration

**Dockerfile considerations**:
```dockerfile
# Ensure certificates are available at runtime
COPY certs/*.pem /app/certs/

# Or fetch from secrets at runtime
RUN aws secretsmanager get-secret-value \
    --secret-id saml-certificates \
    --query SecretString --output text > /app/certs/entra-cert.pem
```

**ECS Task Definition**:
- Mount secrets as environment variables
- Ensure containers have read access to certificate files
- Configure health checks on `/api/health`

**Load Balancer**:
- Ensure ALB forwards `POST` requests to callback URL
- Configure sticky sessions (optional)
- Set appropriate timeout values (30s+)

### Step 5.3: Update Entra for Production

1. Navigate to your Enterprise Application in Azure Portal
2. Go to **Single sign-on** → **Basic SAML Configuration**
3. Update URLs:
   - Entity ID: `https://yourdomain.com/saml/metadata`
   - Reply URL: `https://yourdomain.com/api/auth/saml/callback`
4. Save changes

### Step 5.4: Monitoring & Alerting

**Key Metrics to Monitor**:
- SAML authentication success rate
- SAML validation failures
- Non-provisioned user attempts
- Average authentication time
- Certificate expiration dates

**Logging**:
```typescript
// Use structured logging
logger.info('SAML authentication successful', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString(),
});

logger.error('SAML validation failed', {
  error: error.message,
  issuer: profile?.issuer,
  timestamp: new Date().toISOString(),
});
```

### Step 5.5: Rollback Plan

If issues arise after deployment:

1. **Immediate**: Disable "Sign in with Microsoft" button in UI
2. **Maintain**: Keep traditional email/password login functional
3. **Revert**: Roll back to previous deployment
4. **Debug**: Check logs for specific error patterns
5. **Fix**: Address issues in staging environment first

---

## Security Considerations

### Tenant Isolation

**Why it matters**: You want to ensure users can ONLY authenticate through YOUR Entra tenant, not any Microsoft account or other tenants.

**How it's enforced**:

1. **Tenant-specific endpoint**: 
   - ✅ Use: `https://login.microsoftonline.com/{YOUR_TENANT_ID}/saml2`
   - ❌ Avoid: `https://login.microsoftonline.com/common/saml2`

2. **Issuer validation**:
```typescript
if (profile.issuer !== `https://sts.windows.net/${YOUR_TENANT_ID}/`) {
  throw new Error('Invalid issuer - wrong tenant');
}
```

3. **Certificate pinning**: Only accept responses signed by your tenant's certificate

### Certificate Management

**Entra Certificate Rotation**:
- Entra certificates expire periodically
- Monitor expiration dates in Azure Portal
- When rotated, download new certificate
- Update `entra-cert.pem` in your application
- Deploy updated certificate

**Your SP Certificate**:
- Generated certificates expire (730 days in our example)
- Set calendar reminder to rotate before expiration
- Generate new certificate pair
- Upload public cert to Entra
- Deploy new private key to application

### Secure Storage

**Development**:
- Store certificates in `certs/` directory
- Add to `.gitignore`
- Never commit to version control

**Production**:
- Use AWS Secrets Manager, Azure Key Vault, or similar
- Rotate secrets regularly
- Limit access with IAM policies
- Audit secret access logs

### Additional Security Measures

1. **Rate Limiting**: Limit authentication attempts
2. **HTTPS Only**: Enforce HTTPS in production
3. **Secure Cookies**: Use httpOnly, secure, sameSite flags
4. **CSRF Protection**: Next.js provides this by default
5. **Input Validation**: Validate all SAML response fields
6. **Audit Logging**: Log all authentication attempts
7. **Session Timeouts**: Implement appropriate JWT expiration

---

## Troubleshooting

### Common Issues & Solutions

#### Issue 1: "SAML response signature verification failed"

**Causes**:
- Wrong Entra certificate
- Certificate expired
- Certificate file path incorrect

**Solution**:
1. Download latest certificate from Entra
2. Verify file path in environment variables
3. Check certificate format (should be PEM, with BEGIN/END markers)
4. Ensure no extra whitespace in certificate file

#### Issue 2: "Invalid issuer"

**Causes**:
- Using `common` endpoint instead of tenant-specific
- Tenant ID mismatch between Entra and application
- Wrong expected issuer format

**Solution**:
1. Verify `ENTRA_ENTRY_POINT` uses your tenant ID
2. Check expected issuer matches: `https://sts.windows.net/{TENANT_ID}/`
3. Log actual vs expected issuer values
4. Ensure no trailing slashes causing mismatch

#### Issue 3: "User not provisioned"

**Causes**:
- User exists in Entra but not in your database
- Email mismatch between Entra and database
- Case sensitivity in email comparison

**Solution**:
1. Verify user email in database matches Entra exactly
2. Use case-insensitive email comparison:
```typescript
const user = await getUserByEmail(email.toLowerCase());
```
3. Check SAML claim mapping - email might be in different claim
4. Pre-provision user in database before testing

#### Issue 4: CORS errors

**Causes**:
- Misconfigured CORS headers
- Wrong callback URL
- Browser blocking POST requests

**Solution**:
- SAML uses form POST, not XHR - CORS shouldn't be an issue
- If seeing CORS errors, check:
  1. Callback URL matches exactly in Entra
  2. No redirect middleware interfering
  3. Route handler returns proper response

#### Issue 5: "Cannot read certificate file"

**Causes**:
- Certificate path incorrect
- File permissions issue
- Certificate not deployed to production

**Solution**:
1. Verify relative path from project root
2. Check file exists: `ls -la certs/`
3. Ensure read permissions: `chmod 644 certs/*.pem`
4. In Docker, verify COPY command includes certificates
5. In ECS, verify secrets are mounted correctly

#### Issue 6: Redirect loop

**Causes**:
- JWT not being set correctly
- Cookie configuration issue
- Middleware blocking authenticated requests

**Solution**:
1. Check cookie is set in browser DevTools
2. Verify cookie domain and path settings
3. Ensure authentication middleware recognizes JWT
4. Check for conflicting middleware redirects

#### Issue 7: "Authentication failed" with no details

**Causes**:
- SAML response parsing error
- Unexpected SAML claim structure
- Missing required claims

**Solution**:
1. Add detailed logging in callback route:
```typescript
console.log('Raw SAML response:', samlResponse);
console.log('Parsed profile:', JSON.stringify(profile, null, 2));
```
2. Verify claim names match Entra configuration
3. Check for custom claim mappings in Entra
4. Validate SAML response structure using SAML decoder tool

#### Issue 8: Works in dev, fails in production

**Causes**:
- Environment variable mismatch
- HTTP vs HTTPS issue
- Certificate not deployed
- Entra not configured for production URL

**Solution**:
1. Verify all environment variables set correctly
2. Check Entra has production Reply URL added
3. Ensure HTTPS configured correctly
4. Verify certificates accessible in production environment
5. Check ECS task definition includes necessary secrets

### Debugging Tools

**SAML Tracer (Browser Extension)**:
- Install SAML-tracer for Firefox/Chrome
- Captures SAML messages in real-time
- Shows full AuthnRequest and Response
- Helps identify signature issues

**SAML Decoder**:
- Use online SAML decoder (search "SAML decoder")
- Paste base64 SAML response
- View decoded XML to inspect claims
- Verify signature and timestamps

**Logging Strategy**:
```typescript
// Add comprehensive logging
import { Logger } from 'your-logging-library';

const logger = new Logger('saml-auth');

// In callback route
logger.info('SAML callback initiated');
logger.debug('SAML response length', { length: samlResponse?.length });

try {
  const { profile } = await samlClient.validateResponse({...});
  logger.info('SAML validation successful', {
    issuer: profile.issuer,
    nameID: profile.nameID,
  });
} catch (error) {
  logger.error('SAML validation failed', {
    error: error.message,
    stack: error.stack,
  });
}
```

---

## Advanced Topics

### Multi-Environment Setup

If you have multiple environments (dev, staging, production):

**Option 1: Multiple Entra Apps**
- Create separate Enterprise Application for each environment
- Each has its own certificate and configuration
- Use environment-specific env vars

**Option 2: Single Entra App with Multiple Reply URLs**
- Add all environment URLs to single Entra app
- Configure different env vars per environment
- Simpler management but less isolation

**Recommended**: Option 1 for better security isolation

### Logout Implementation

To implement SAML logout (optional):

```typescript
// app/api/auth/saml/logout/route.ts
export async function GET(request: NextRequest) {
  // Clear JWT cookie
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('auth_token');
  
  // Optional: Initiate SAML logout with Entra
  // This would log user out of Microsoft session too
  const logoutUrl = await samlClient.getLogoutUrl(
    { nameID: user.email },
    {}
  );
  
  return NextResponse.redirect(logoutUrl);
}
```

### Handling Multiple IdPs

If you need to support multiple identity providers:

```typescript
// lib/saml/multi-idp.ts
const idpConfigs = {
  entra: { /* Entra config */ },
  okta: { /* Okta config */ },
};

export function getSamlClient(provider: string) {
  const config = idpConfigs[provider];
  return new SAML(config);
}

// Routes become: /api/auth/saml/entra/login, /api/auth/saml/okta/login
```

### Just-In-Time (JIT) Provisioning

To automatically create users on first login:

```typescript
// In callback route
let user = await getUserByEmail(email);

if (!user) {
  // Extract additional attributes from SAML
  const displayName = profile['...displayname'];
  const firstName = profile['...givenname'];
  const lastName = profile['...surname'];
  
  // Create user with default roles
  user = await createUser({
    email,
    displayName,
    firstName,
    lastName,
    roles: ['user'], // Default role
    source: 'saml-entra',
  });
  
  logger.info('JIT provisioned user', { email });
}
```

**Note**: Only implement JIT if your security model allows it. Pre-provisioning is more secure.

### Role Mapping from Entra

To map Entra groups to application roles:

**Step 1: Configure Group Claims in Entra**
1. In Entra, go to **Token configuration**
2. Add **Groups claim**
3. Select groups to include in token

**Step 2: Map in callback**
```typescript
const groups = profile['http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'] || [];

const roleMapping = {
  'group-id-1': 'admin',
  'group-id-2': 'manager',
  'group-id-3': 'user',
};

const roles = groups.map(g => roleMapping[g]).filter(Boolean);

// Issue JWT with mapped roles
const token = issueJWT({
  userId: user.id,
  email: user.email,
  roles: roles,
});
```

### Attribute-Based Access Control (ABAC)

Extract custom attributes from SAML for fine-grained access control:

```typescript
// Entra sends custom attributes
const department = profile['department'];
const employeeType = profile['employeeType'];
const costCenter = profile['costCenter'];

// Store in JWT claims
const token = issueJWT({
  userId: user.id,
  email: user.email,
  attributes: {
    department,
    employeeType,
    costCenter,
  },
});

// Use in authorization middleware
function requireDepartment(dept: string) {
  return (req, res, next) => {
    if (req.user.attributes.department === dept) {
      next();
    } else {
      res.status(403).send('Forbidden');
    }
  };
}
```

---

## Maintenance & Operations

### Regular Tasks

**Monthly**:
- [ ] Review authentication logs for anomalies
- [ ] Check certificate expiration dates
- [ ] Verify user provisioning is up to date
- [ ] Test authentication flow end-to-end

**Quarterly**:
- [ ] Review and rotate service principal credentials
- [ ] Audit user access in Entra
- [ ] Update dependencies (`@node-saml/node-saml`)
- [ ] Review security policies

**Annually**:
- [ ] Rotate SP certificates
- [ ] Review and update security configurations
- [ ] Conduct security audit
- [ ] Update documentation

### Monitoring Queries

**CloudWatch Insights / ECS Logs**:
```
# Authentication success rate
fields @timestamp, @message
| filter @message like /SAML authentication successful/
| stats count() by bin(5m)

# Failed authentication attempts
fields @timestamp, @message
| filter @message like /SAML validation failed/
| stats count() by bin(5m)

# Non-provisioned user attempts
fields @timestamp, email
| filter @message like /non-provisioned user/
| stats count() by email
```

### Certificate Expiration Monitoring

Create a script to check certificate expiration:

```typescript
// scripts/check-cert-expiration.ts
import fs from 'fs';
import { X509Certificate } from 'crypto';

const certPath = './certs/saml-cert.pem';
const cert = new X509Certificate(fs.readFileSync(certPath));

const expiryDate = new Date(cert.validTo);
const daysUntilExpiry = Math.floor(
  (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);

console.log(`Certificate expires: ${expiryDate.toDateString()}`);
console.log(`Days until expiry: ${daysUntilExpiry}`);

if (daysUntilExpiry < 30) {
  console.error('⚠️  Certificate expires in less than 30 days!');
  process.exit(1);
}
```

Run in CI/CD pipeline or as scheduled task.

---

## Performance Optimization

### Caching Strategies

**Certificate Caching**:
```typescript
// Load certificates once at startup, not per request
let cachedCert: string | null = null;

function getCert() {
  if (!cachedCert) {
    cachedCert = fs.readFileSync(certPath, 'utf-8');
  }
  return cachedCert;
}
```

**SAML Client Singleton**:
```typescript
// Already implemented in client.ts
// Single instance shared across requests
export const samlClient = new SamlClient();
```

### Response Time Optimization

**Async Operations**:
- Database user lookup
- JWT generation
- Logging operations

Keep callback route fast:
```typescript
// Offload non-critical operations
const [user, _] = await Promise.all([
  getUserByEmail(email),
  logAuthEvent(email, 'success').catch(console.error), // Don't block on logging
]);
```

---

## Compliance & Auditing

### Audit Log Requirements

**What to log**:
- All authentication attempts (success/failure)
- User email/ID
- Timestamp
- Source IP address
- Issuer validation results
- User provisioning checks

**Log retention**:
- Keep logs for minimum 90 days
- Comply with regulatory requirements (GDPR, SOC2, etc.)
- Use structured logging for easy querying

### GDPR Considerations

**User data handling**:
- SAML response contains PII (email, name)
- Store minimal data from SAML assertion
- Respect user consent preferences
- Implement data deletion processes

**Privacy by design**:
- Don't log full SAML responses (contain PII)
- Anonymize logs where possible
- Implement data retention policies

---

## Testing Checklist

### Pre-Production Testing

**Functional Tests**:
- [ ] User can initiate login from login page
- [ ] Redirect to Microsoft login works
- [ ] Successful authentication returns to app
- [ ] JWT is issued correctly
- [ ] User can access protected routes
- [ ] Logout clears session

**Security Tests**:
- [ ] Wrong tenant rejected
- [ ] Invalid signature rejected
- [ ] Non-provisioned user rejected
- [ ] Expired assertion rejected
- [ ] Replay attack prevented
- [ ] HTTPS enforced in production

**Edge Cases**:
- [ ] User exists in Entra but not DB
- [ ] User exists in DB but not assigned in Entra
- [ ] Network timeout during SAML exchange
- [ ] Malformed SAML response
- [ ] Missing required claims

**Performance Tests**:
- [ ] Authentication completes within 3 seconds
- [ ] System handles concurrent authentication requests
- [ ] No memory leaks during repeated auth

---

## Summary

### What You've Built

A secure, tenant-isolated SAML SSO integration that:

✅ Allows users to authenticate with Microsoft Entra ID  
✅ Validates users against YOUR specific tenant only  
✅ Performs cryptographic signature verification  
✅ Checks user pre-provisioning in your database  
✅ Issues your existing custom JWT tokens  
✅ Integrates seamlessly with existing authentication system  
✅ Requires minimal code changes to your application  

### Key Security Features

1. **Tenant Isolation**: Only your Entra tenant accepted
2. **Certificate Pinning**: Signed by your tenant's cert only
3. **Pre-Provisioning**: Users must exist in DB before login
4. **JWT Bridge**: SAML → JWT conversion maintains existing auth
5. **Audit Trail**: All authentication attempts logged

### Next Steps

1. **Test thoroughly** in development environment
2. **Deploy to staging** and validate with real users
3. **Train users** on new login flow
4. **Monitor** authentication metrics post-launch
5. **Plan certificate rotation** before expiration
6. **Document** any customizations for your team

### Support Resources

- **node-saml Documentation**: https://github.com/node-saml/node-saml
- **Microsoft Entra SAML**: https://learn.microsoft.com/entra/identity/enterprise-apps/configure-saml-single-sign-on
- **Next.js API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **SAML 2.0 Specification**: http://docs.oasis-open.org/security/saml/

---

## Appendix

### A. Environment Variables Reference

```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=12345678-1234-1234-1234-123456789abc
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/saml2
ENTRA_ISSUER=https://sts.windows.net/${ENTRA_TENANT_ID}/
ENTRA_CERT_PATH=./certs/entra-cert.pem

# Service Provider Configuration
SAML_ISSUER=https://yourdomain.com/saml/metadata
SAML_CALLBACK_URL=https://yourdomain.com/api/auth/saml/callback
SAML_CERT_PATH=./certs/saml-cert.pem
SAML_KEY_PATH=./certs/saml-key.pem

# Application Configuration
NEXT_PUBLIC_APP_URL=https://yourdomain.com
SAML_SUCCESS_REDIRECT=/dashboard
NODE_ENV=production
```

### B. Common SAML Claim Names

| Claim Purpose | Microsoft Entra Claim Name |
|--------------|----------------------------|
| Email Address | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| Display Name | `http://schemas.microsoft.com/identity/claims/displayname` |
| First Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` |
| Last Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` |
| User Principal Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` |
| Groups | `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` |

### C. File Checklist

After implementation, you should have:

```
your-nextjs-app/
├── .env.local (gitignored)
├── .gitignore (includes certs/)
├── app/
│   ├── api/auth/saml/
│   │   ├── login/route.ts ✓
│   │   ├── callback/route.ts ✓
│   │   └── metadata/route.ts ✓
│   └── login/page.tsx ✓
├── lib/
│   └── saml/
│       ├── config.ts ✓
│       └── client.ts ✓
├── certs/ (gitignored)
│   ├── saml-cert.pem ✓
│   ├── saml-key.pem ✓
│   └── entra-cert.pem ✓
└── package.json (with @node-saml/node-saml)
```

### D. Quick Reference Commands

```bash
# Install dependencies
npm install @node-saml/node-saml

# Generate SP certificates
openssl req -x509 -newkey rsa:4096 -keyout certs/saml-key.pem \
  -out certs/saml-cert.pem -nodes -days 730 -subj "/CN=yourdomain.com"

# Start development server
npm run dev

# Build for production
npm run build

# Check certificate expiration
openssl x509 -in certs/saml-cert.pem -noout -enddate

# View certificate details
openssl x509 -in certs/entra-cert.pem -text -noout
```

---

**Document Version**: 1.0  
**Last Updated**: September 2025  
**Author**: Technical Documentation  
**Status**: Ready for Implementation