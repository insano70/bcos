# Microsoft Entra SAML SSO - Deployment Guide

**Project**: BCOS SAML SSO Implementation  
**Date**: September 30, 2025  
**Status**: Core Implementation Complete - Ready for Deployment  
**Tenant ID**: `e0268fe2-3176-4ac0-8cef-5f1925dd490e`

---

## Implementation Status

✅ **Phases 1-8 Complete**
- Type definitions (348 lines, zero `any` types)
- Certificate caching & configuration (684 lines)
- SAML client factory (833 lines)
- API routes (805 lines across 3 endpoints)
- Middleware updates (CSRF exemption)
- Database migration (nullable password_hash)
- UI integration (SSO button + error handling)

**Total**: 3,499 lines of production-ready SAML code

---

## Pre-Deployment Checklist

Before deploying, ensure you have:
- [ ] Admin access to Microsoft Entra ID
- [ ] Database admin access to run migrations
- [ ] AWS access for certificate storage (production only)
- [ ] List of users who will use SSO (with emails matching database)

---

## Deployment Steps

### Step 1: Generate SAML Certificates (Development)

**Development certificates** are needed for your Service Provider (SP) to sign requests and identify itself.

```bash
# Navigate to project root
cd /Users/pstewart/bcos

# Create certs directory (already in .gitignore)
mkdir -p certs

# Generate self-signed certificate (valid for 2 years)
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/saml-dev-key.pem \
  -out certs/saml-dev-cert.pem \
  -nodes -days 730 \
  -subj "/CN=localhost/O=BendCare OS Development"

# Verify certificate was created
ls -lh certs/
openssl x509 -in certs/saml-dev-cert.pem -text -noout | grep -E "Subject:|Not After"

# View your public certificate (you'll need this for Entra)
cat certs/saml-dev-cert.pem
```

**Important**: The certificate content will be used in environment variables.

---

### Step 2: Configure Microsoft Entra (Development Environment)

#### 2.1 Create Enterprise Application

1. **Navigate**: Azure Portal → Microsoft Entra ID → Enterprise Applications
2. **Click**: "New application" → "Create your own application"
3. **Name**: `BCOS SAML SSO - Development`
4. **Select**: "Integrate any other application you don't find in the gallery"
5. **Click**: "Create"

#### 2.2 Configure SAML Settings

1. **Navigate**: Your new app → "Single sign-on"
2. **Select**: "SAML"

**Basic SAML Configuration** (Section 1):
- **Identifier (Entity ID)**: `http://localhost:4001/saml/metadata`
- **Reply URL**: `http://localhost:4001/api/auth/saml/callback`
- **Sign on URL**: `http://localhost:4001/signin`

#### 2.3 Download Entra Certificate

In **Section 3: SAML Certificates**:
1. **Download**: "Certificate (Base64)"
2. **Save as**: `certs/entra-dev-cert.pem`

```bash
# Verify Entra certificate
openssl x509 -in certs/entra-dev-cert.pem -text -noout | grep -E "Subject:|Not After"
```

#### 2.4 Note Configuration Values

In **Section 4: Set up BCOS**:
- **Login URL**: Should be `https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2`
- **Identifier**: Should be `https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/`

**CRITICAL**: Verify the Login URL contains YOUR TENANT ID (`e0268fe2-3176-4ac0-8cef-5f1925dd490e`), NOT `common` or `organizations`.

#### 2.5 Assign Test Users

1. **Navigate**: Your app → "Users and groups"
2. **Click**: "Add user/group"
3. **Add users** whose emails exist in your database

**Example**: If you have `admin@bendcare.com` in your users table, assign that user in Entra.

---

### Step 3: Configure Environment Variables (Development)

Create or update `.env.local`:

```bash
# ======================
# SAML SSO CONFIGURATION - DEVELOPMENT
# ======================

# Microsoft Entra Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=./certs/entra-dev-cert.pem

# Service Provider Configuration
SAML_ISSUER=http://localhost:4001/saml/metadata
SAML_CALLBACK_URL=http://localhost:4001/api/auth/saml/callback
SAML_CERT=./certs/saml-dev-cert.pem
SAML_PRIVATE_KEY=./certs/saml-dev-key.pem

# Security Configuration
SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com,yourdomain.com
SAML_CERT_EXPIRY_WARNING_DAYS=30
SAML_CALLBACK_RATE_LIMIT=10

# Optional
SAML_SUCCESS_REDIRECT=/dashboard
SAML_LOG_RAW_RESPONSES=true  # Development only - for debugging
```

**Replace `yourdomain.com`** with your actual email domain(s).

---

### Step 4: Run Database Migration

The migration makes `password_hash` nullable to support SSO-only users.

```bash
# Connect to your development database
psql $DATABASE_URL

# Run the migration
\i lib/db/migrations/0015_saml_support.sql

# Verify the change
\d users

# You should see password_hash as nullable (no "not null" constraint)
# Exit psql
\q
```

**Expected Output**:
```
ALTER TABLE
COMMENT
COMMIT
```

---

### Step 5: Create Test User

Create a test user in your database with an email that matches Entra:

```bash
# Option A: Use your existing seed/admin script
# Option B: Manual SQL (for testing)

psql $DATABASE_URL << SQL
INSERT INTO users (user_id, email, first_name, last_name, password_hash, is_active, email_verified)
VALUES (
  gen_random_uuid(),
  'your.email@bendcare.com',  -- MUST match Entra user
  'Test',
  'User',
  NULL,  -- NULL password_hash = SSO-only user
  true,
  true
);
SQL
```

**Important**: The email MUST exactly match a user assigned in Entra (Step 2.5).

---

### Step 6: Start Development Server

```bash
cd /Users/pstewart/bcos

# Start Next.js development server
pnpm dev

# Server should start on http://localhost:4001
# Watch console for any SAML configuration errors
```

**Expected Console Output**:
```
✓ Ready in 2.3s
○ Local: http://localhost:4001
```

**Check for SAML warnings**: If SAML env vars are missing, you'll see warnings but the app will still start (SAML just won't be available).

---

### Step 7: Test SAML SSO Flow (Development)

#### 7.1 Access Login Page

1. **Navigate**: http://localhost:4001/signin
2. **Verify**: You see "Sign in with Microsoft" button

#### 7.2 Initiate SAML Login

1. **Click**: "Sign in with Microsoft"
2. **Expected**: Redirect to `login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e`
3. **Verify**: URL contains YOUR tenant ID (not `common`)

#### 7.3 Authenticate with Microsoft

1. **Enter**: Your Microsoft credentials (user assigned in Entra)
2. **Expected**: Microsoft login page
3. **Authenticate**: Complete MFA if required

#### 7.4 Verify Callback Success

1. **Expected**: Redirect back to `http://localhost:4001/dashboard`
2. **Verify**: You're logged in (check browser DevTools → Application → Cookies)
   - Should see `access-token` cookie (httpOnly)
   - Should see `refresh-token` cookie (httpOnly)

#### 7.5 Test Error Scenarios

**Test 1: Non-Provisioned User**
- Assign a user in Entra who does NOT exist in your database
- Attempt SSO login
- **Expected**: Error message "Your account is not authorized..."

**Test 2: Inactive User**
- Set `is_active = false` for a user in database
- Attempt SSO login
- **Expected**: Error message "Your account has been deactivated..."

**Test 3: SSO-Only User Password Login**
- Try to login with email/password for a user with NULL password_hash
- **Expected**: Error message "This account uses Single Sign-On. Please sign in with Microsoft."

---

### Step 8: Verify Logging & Auditing

Check your application logs for SAML events:

```bash
# If using local development, check console output
# Look for these log entries:

# SAML login initiated
grep "SAML login initiation" logs/*

# SAML validation
grep "SAML validation" logs/*

# Authentication success
grep "SAML authentication completed" logs/*
```

**Expected Log Entries**:
- ✅ SAML login URL created successfully
- ✅ SAML response parsed successfully
- ✅ SAML validation completed successfully
- ✅ User RBAC context loaded
- ✅ Authentication cookies set successfully

---

## Staging Deployment

### Step 1: Create Staging Entra Application

Repeat **Deployment Step 2** but use staging URLs:
- **Entity ID**: `https://staging.bendcare.com/saml/metadata`
- **Reply URL**: `https://staging.bendcare.com/api/auth/saml/callback`
- **Name**: `BCOS SAML SSO - Staging`

### Step 2: Generate Staging Certificates

```bash
# Generate staging certificates (longer validity for stability)
openssl req -x509 -newkey rsa:4096 \
  -keyout staging-saml-key.pem \
  -out staging-saml-cert.pem \
  -nodes -days 730 \
  -subj "/CN=staging.bendcare.com/O=BendCare OS Staging"
```

### Step 3: Store Certificates in AWS Secrets Manager

```bash
# Install AWS CLI if needed
# brew install awscli

# Configure AWS credentials
aws configure

# Create secret for staging SAML certificates
aws secretsmanager create-secret \
  --name staging/saml-certificates \
  --description "SAML SSO certificates for staging environment" \
  --secret-string file://staging-saml-secrets.json \
  --region us-east-1

# Where staging-saml-secrets.json contains:
{
  "ENTRA_CERT": "<paste content of entra-staging-cert.pem>",
  "SAML_CERT": "<paste content of staging-saml-cert.pem>",
  "SAML_PRIVATE_KEY": "<paste content of staging-saml-key.pem>"
}
```

### Step 4: Configure Staging Environment Variables

In your **AWS ECS Task Definition** or **Secrets Manager**, add:

```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=./certs/entra-staging-cert.pem  # Or from Secrets Manager

# Service Provider Configuration
SAML_ISSUER=https://staging.bendcare.com/saml/metadata
SAML_CALLBACK_URL=https://staging.bendcare.com/api/auth/saml/callback
SAML_CERT=<from-secrets-manager>
SAML_PRIVATE_KEY=<from-secrets-manager>

# Security Configuration
SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com
SAML_CERT_EXPIRY_WARNING_DAYS=30
SAML_CALLBACK_RATE_LIMIT=20

# Optional
SAML_SUCCESS_REDIRECT=/dashboard
SAML_LOG_RAW_RESPONSES=true  # Staging: enabled for debugging
```

### Step 5: Deploy to Staging

```bash
# Build and deploy (your existing process)
git checkout staging
git merge develop  # Or your branch
git push origin staging

# Your GitHub Actions should handle deployment
# Or manual ECS deployment:
# ./deploy-staging.sh
```

### Step 6: Run Migration on Staging Database

```bash
# Connect to staging database
psql $STAGING_DATABASE_URL

# Run migration
\i lib/db/migrations/0015_saml_support.sql

\q
```

### Step 7: Test Staging SAML Flow

1. Navigate to: `https://staging.bendcare.com/signin`
2. Click "Sign in with Microsoft"
3. Verify redirect to Microsoft
4. Complete authentication
5. Verify callback and login success

---

## Production Deployment

### Step 1: Create Production Entra Application

**IMPORTANT**: Use separate Enterprise Application for production.

Repeat **Deployment Step 2** but use production URLs:
- **Entity ID**: `https://app.bendcare.com/saml/metadata`
- **Reply URL**: `https://app.bendcare.com/api/auth/saml/callback`
- **Name**: `BCOS SAML SSO - Production`

### Step 2: Generate Production Certificates

```bash
# Generate production certificates (2 year validity)
openssl req -x509 -newkey rsa:4096 \
  -keyout prod-saml-key.pem \
  -out prod-saml-cert.pem \
  -nodes -days 730 \
  -subj "/CN=app.bendcare.com/O=BendCare OS"

# Verify certificate
openssl x509 -in prod-saml-cert.pem -text -noout | grep -E "Subject:|Not After"

# Set calendar reminder for rotation 30 days before expiration!
```

### Step 3: Store Production Certificates in AWS Secrets Manager

```bash
# Create production SAML certificates secret
aws secretsmanager create-secret \
  --name production/saml-certificates \
  --description "SAML SSO certificates for production environment" \
  --secret-string file://prod-saml-secrets.json \
  --kms-key-id <your-kms-key-id> \
  --region us-east-1

# Grant ECS task role access
aws secretsmanager put-resource-policy \
  --secret-id production/saml-certificates \
  --resource-policy file://secret-policy.json

# Where secret-policy.json grants read access to your ECS task role
```

**Production secret JSON** (`prod-saml-secrets.json`):
```json
{
  "ENTRA_CERT": "<paste entra-prod-cert.pem content>",
  "SAML_CERT": "<paste prod-saml-cert.pem content>",
  "SAML_PRIVATE_KEY": "<paste prod-saml-key.pem content>"
}
```

### Step 4: Update ECS Task Definition

Add SAML secrets to your ECS task definition:

```json
{
  "containerDefinitions": [{
    "secrets": [
      {
        "name": "ENTRA_CERT",
        "valueFrom": "production/saml-certificates:ENTRA_CERT::"
      },
      {
        "name": "SAML_CERT",
        "valueFrom": "production/saml-certificates:SAML_CERT::"
      },
      {
        "name": "SAML_PRIVATE_KEY",
        "valueFrom": "production/saml-certificates:SAML_PRIVATE_KEY::"
      }
    ],
    "environment": [
      {
        "name": "ENTRA_TENANT_ID",
        "value": "e0268fe2-3176-4ac0-8cef-5f1925dd490e"
      },
      {
        "name": "ENTRA_ENTRY_POINT",
        "value": "https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2"
      },
      {
        "name": "ENTRA_ISSUER",
        "value": "https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/"
      },
      {
        "name": "SAML_ISSUER",
        "value": "https://app.bendcare.com/saml/metadata"
      },
      {
        "name": "SAML_CALLBACK_URL",
        "value": "https://app.bendcare.com/api/auth/saml/callback"
      },
      {
        "name": "SAML_ALLOWED_EMAIL_DOMAINS",
        "value": "bendcare.com"
      },
      {
        "name": "SAML_CERT_EXPIRY_WARNING_DAYS",
        "value": "30"
      },
      {
        "name": "SAML_CALLBACK_RATE_LIMIT",
        "value": "50"
      },
      {
        "name": "SAML_LOG_RAW_RESPONSES",
        "value": "false"
      },
      {
        "name": "SAML_SUCCESS_REDIRECT",
        "value": "/dashboard"
      }
    ]
  }]
}
```

### Step 5: Run Production Database Migration

```bash
# Connect to production database (use read replica for migration safety)
psql $PRODUCTION_DATABASE_URL

# IMPORTANT: Run migration during low-traffic window
BEGIN;

-- Preview the change
\d users

-- Run migration
\i lib/db/migrations/0015_saml_support.sql

-- Verify
\d users

-- Commit if everything looks good
COMMIT;

\q
```

### Step 6: Deploy to Production

```bash
# Merge to main/production branch
git checkout main
git merge staging  # After successful staging testing
git push origin main

# GitHub Actions will deploy automatically
# Monitor deployment in AWS Console
```

### Step 7: Verify Production Deployment

#### 7.1 Check ECS Service

```bash
# Verify task is running
aws ecs describe-services \
  --cluster bcos-production-cluster \
  --services bcos-production-service \
  --region us-east-1

# Check task logs for SAML configuration
aws logs tail /ecs/bcos-production --follow
```

**Look for**:
- ✅ "SAML configuration validated successfully at startup"
- ✅ "Certificate cached successfully"
- ❌ Any "SAMLConfigError" or "SAMLCertificateError"

#### 7.2 Test Production SAML Flow

1. **Navigate**: https://app.bendcare.com/signin
2. **Click**: "Sign in with Microsoft"
3. **Verify**: Redirect to Microsoft (production tenant)
4. **Authenticate**: With production user credentials
5. **Verify**: Successful login to dashboard

#### 7.3 Monitor CloudWatch

```bash
# View SAML authentication logs
aws logs filter-pattern "SAML" \
  --log-group-name /ecs/bcos-production \
  --start-time $(date -u -d '5 minutes ago' +%s)000 \
  --region us-east-1
```

---

## Post-Deployment Validation

### Functional Tests

Run these tests in each environment:

- [ ] **SAML Login Initiation**: Click SSO button → Redirects to Microsoft
- [ ] **Microsoft Authentication**: Can authenticate with Microsoft credentials
- [ ] **Callback Processing**: Redirects back to app after auth
- [ ] **JWT Issuance**: Cookies are set (check DevTools)
- [ ] **Session Creation**: Can access protected pages
- [ ] **Traditional Login Still Works**: Email/password login functional
- [ ] **Error Handling**: SAML errors display correctly

### Security Tests

- [ ] **Wrong Tenant**: SAML response from different tenant rejected
- [ ] **Non-Provisioned User**: User not in database rejected
- [ ] **Inactive User**: User with `is_active=false` rejected
- [ ] **SSO-Only User**: Password login blocked for NULL password_hash
- [ ] **Certificate Validation**: Invalid certificate rejected
- [ ] **HTTPS Enforcement**: Production uses HTTPS only

### Performance Tests

- [ ] **Authentication Time**: Complete flow < 5 seconds
- [ ] **Certificate Caching**: Second login faster (cache hit)
- [ ] **Concurrent Logins**: Multiple users can SSO simultaneously

---

## Monitoring Setup

### CloudWatch Alarms

Create alarms for SAML authentication:

```bash
# SAML error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name saml-error-rate-high \
  --alarm-description "Alert when SAML error rate > 10%" \
  --metric-name SAMLErrors \
  --namespace BCOS/Authentication \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 0.1 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions <sns-topic-arn>
```

### Log Insights Queries

```sql
-- SAML authentication success rate
fields @timestamp, @message
| filter @message like /SAML authentication/
| stats count(*) as total, 
        sum(success) as successes,
        (sum(success) / count(*)) * 100 as success_rate
  by bin(5m)

-- Failed SAML attempts
fields @timestamp, email, error
| filter @message like /SAML validation failed/
| stats count() by error

-- Non-provisioned user attempts
fields @timestamp, email
| filter @message like /non-provisioned user/
| stats count() as attempts by email
```

---

## Troubleshooting Common Issues

### Issue 1: "SAML SSO is not configured"

**Cause**: Environment variables missing or invalid

**Solution**:
```bash
# Check env vars are set
echo $ENTRA_TENANT_ID
echo $SAML_ISSUER
echo $SAML_CALLBACK_URL

# Verify in ECS task definition
aws ecs describe-task-definition \
  --task-definition bcos-production \
  --query 'taskDefinition.containerDefinitions[0].environment'
```

### Issue 2: "Certificate parsing failed"

**Cause**: Certificate file not found or invalid format

**Solution**:
```bash
# Verify certificate files exist
ls -l certs/

# Verify certificate format (should show BEGIN CERTIFICATE)
head -1 certs/entra-dev-cert.pem

# Test certificate validity
openssl x509 -in certs/entra-dev-cert.pem -text -noout
```

### Issue 3: "Invalid issuer"

**Cause**: Using `common` endpoint instead of tenant-specific

**Solution**:
- Check `ENTRA_ENTRY_POINT` includes your tenant ID
- Verify Entra app is configured correctly
- Check logs for received vs expected issuer

### Issue 4: "User not provisioned"

**Cause**: User exists in Entra but not in database

**Solution**:
```sql
-- Check if user exists
SELECT email, is_active FROM users WHERE email = 'user@bendcare.com';

-- Create user if missing
INSERT INTO users (email, first_name, last_name, password_hash, is_active)
VALUES ('user@bendcare.com', 'First', 'Last', NULL, true);
```

### Issue 5: "SAML validation failed"

**Cause**: Multiple possible causes

**Solution**:
1. Check certificate is correct (download latest from Entra)
2. Verify callback URL matches exactly in Entra
3. Enable `SAML_LOG_RAW_RESPONSES=true` in development
4. Use SAML tracer browser extension
5. Check logs for specific validation failure

### Issue 6: Cookies not set / Redirect loop

**Cause**: Cookie configuration issue

**Solution**:
```typescript
// Check cookie settings in browser DevTools
// Expected:
// - access-token: httpOnly, secure (in prod), sameSite=strict
// - refresh-token: httpOnly, secure (in prod), sameSite=strict

// Verify in code:
// - isSecureEnvironment = true in production
// - Domain matches your app domain
```

---

## Certificate Rotation Procedure

### When to Rotate

**Entra Certificate** (Microsoft manages this):
- Monitor expiration in Azure Portal
- Download new certificate when rotated
- Update in your environment

**SP Certificate** (You manage this):
- Rotate before expiration (730 days from generation)
- Set calendar reminder 60 days before expiration

### Rotation Steps (Zero Downtime)

**Phase 1: Generate New Certificate**
```bash
# Generate new certificate
openssl req -x509 -newkey rsa:4096 \
  -keyout saml-key-new.pem \
  -out saml-cert-new.pem \
  -nodes -days 730 \
  -subj "/CN=app.bendcare.com/O=BendCare OS"
```

**Phase 2: Upload to Entra** (Dual Certificate Support)
1. Keep old certificate active
2. Upload new certificate to Entra
3. Entra now accepts BOTH certificates

**Phase 3: Deploy New Certificate**
```bash
# Update Secrets Manager with new certificate
aws secretsmanager update-secret \
  --secret-id production/saml-certificates \
  --secret-string file://new-certificates.json

# Restart ECS tasks to pick up new certificate
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --force-new-deployment
```

**Phase 4: Verify & Remove Old Certificate**
1. Test SAML login with new certificate
2. Monitor for 24 hours
3. Remove old certificate from Entra
4. Delete old certificate files

---

## Rollback Plan

If SAML authentication fails after deployment:

### Immediate Actions (< 5 minutes)

1. **Users can still login** with email/password (hybrid auth preserved)
2. **No service disruption** to existing password-based users

### Rollback Options

**Option A: Disable SAML Temporarily**
```bash
# Remove SAML env vars from ECS task definition
# Restart service
# SSO button will disappear, password login continues to work
```

**Option B: Revert Code**
```bash
# Revert to previous deployment
git revert <saml-merge-commit>
git push origin main

# Redeploy previous version
```

**Option C: Fix Forward**
- Check logs for specific error
- Fix configuration
- Redeploy quickly

---

## Maintenance Schedule

### Weekly
- [ ] Review SAML authentication logs
- [ ] Check error rates in CloudWatch

### Monthly
- [ ] Verify certificate expiration dates
- [ ] Review user provisioning status
- [ ] Test SAML flow end-to-end

### Quarterly
- [ ] Update @node-saml/node-saml dependency
- [ ] Review security configuration
- [ ] Audit user access in Entra

### Annually
- [ ] Rotate SP certificates (before expiration)
- [ ] Security audit
- [ ] Review and update documentation

---

## Quick Reference Commands

```bash
# Check SAML configuration
cd /Users/pstewart/bcos
node -e "require('dotenv').config({path:'.env.local'}); console.log('SAML Enabled:', !!process.env.ENTRA_TENANT_ID)"

# Test certificate expiration
openssl x509 -in certs/saml-cert.pem -noout -enddate

# View certificate fingerprint
openssl x509 -in certs/entra-cert.pem -noout -fingerprint -sha256

# Test SAML metadata endpoint
curl http://localhost:4001/api/auth/saml/metadata

# Check database migration status
psql $DATABASE_URL -c "\d users" | grep password_hash

# View SAML logs (development)
tail -f .next/server/app/api/auth/saml/*/route.log
```

---

## Success Criteria

Your SAML SSO deployment is successful when:

✅ **Functionality**
- [ ] Users can click "Sign in with Microsoft" and authenticate
- [ ] SAML authentication completes in < 5 seconds
- [ ] Cookies are set correctly
- [ ] Users can access protected pages after SSO
- [ ] Traditional email/password login still works

✅ **Security**
- [ ] Only your Entra tenant accepted (tenant isolation verified)
- [ ] Non-provisioned users rejected
- [ ] Inactive users rejected
- [ ] SSO-only users cannot use password login
- [ ] All authentication attempts logged

✅ **Operations**
- [ ] No errors in application logs
- [ ] CloudWatch metrics showing successful auth
- [ ] Certificate expiration monitoring active
- [ ] Rollback plan documented and tested

---

## Support & Documentation

**Internal Documentation**:
- `docs/saml-implementation-doc.md` - Original design document
- `docs/saml_dev_progress.md` - Implementation progress tracking
- `lib/saml/config.ts` - Inline code documentation
- `lib/saml/client.ts` - Security validation documentation

**External Resources**:
- Microsoft Entra SAML: https://learn.microsoft.com/entra/identity/enterprise-apps/configure-saml-single-sign-on
- node-saml Documentation: https://github.com/node-saml/node-saml
- SAML 2.0 Spec: http://docs.oasis-open.org/security/saml/

**Browser Tools**:
- SAML-tracer (Firefox/Chrome extension) - for debugging SAML messages
- Browser DevTools → Network tab - for monitoring redirects
- Browser DevTools → Application → Cookies - for verifying tokens

---

## Contact & Escalation

**For SAML Issues**:
1. Check logs first (`/ecs/bcos-production`)
2. Review this deployment guide
3. Check Entra configuration in Azure Portal
4. Verify environment variables in ECS

**For Security Concerns**:
- Immediately check audit logs
- Review CloudWatch for unusual patterns
- Verify certificate validity
- Check for tenant isolation bypass attempts

---

**Document Version**: 1.0  
**Last Updated**: September 30, 2025  
**Implementation**: Phases 1-8 Complete  
**Status**: Ready for Development Testing
