# MFA Environment Configuration Audit

**Date**: 2025-10-06
**Status**: 🔴 **CRITICAL - MFA will not work in staging/production**

## Executive Summary

WebAuthn/MFA **will fail in staging and production environments** due to missing critical environment variables. The application will either crash or fall back to insecure 'localhost' values.

---

## Critical Missing Variables

### 🔴 WEBAUTHN_RP_ID (Relying Party ID)

**Purpose**: Domain that owns WebAuthn credentials
**Current Status**: ❌ NOT CONFIGURED
**Impact**:
- Application will fall back to `RP_ID = 'localhost'` in production
- Passkeys will be registered for 'localhost' instead of actual domain
- **MFA authentication will fail** or behave unpredictably
- Passkeys won't work across environments

**Required Values**:
- Staging: `staging.bendcare.com`
- Production: `app.bendcare.com`

**Code Reference**: [lib/auth/webauthn.ts:45](lib/auth/webauthn.ts#L45)
```typescript
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'; // 🔴 DANGEROUS FALLBACK
```

---

### 🔴 MFA_TEMP_TOKEN_SECRET

**Purpose**: Signs 5-minute temporary tokens for MFA authentication flow
**Current Status**: ❌ NOT CONFIGURED
**Impact**:
- Application will crash with: `Error: MFA_TEMP_TOKEN_SECRET environment variable is required`
- MFA registration and verification endpoints will fail
- Users cannot complete MFA setup or login with passkeys

**Required Values**:
- Staging: Random 48+ character secret (different from production)
- Production: Random 48+ character secret (different from staging)

**Code Reference**: [lib/auth/webauthn-temp-token.ts:26-30](lib/auth/webauthn-temp-token.ts#L26)
```typescript
function getTempTokenSecret(): Uint8Array {
  const secret = process.env.MFA_TEMP_TOKEN_SECRET;

  if (!secret) {
    throw new Error('MFA_TEMP_TOKEN_SECRET environment variable is required');
  }

  if (secret.length < 32) {
    throw new Error('MFA_TEMP_TOKEN_SECRET must be at least 32 characters');
  }

  return new TextEncoder().encode(secret);
}
```

---

## Current Environment Variable Status

### ✅ Correctly Configured Variables

**In AWS Secrets Manager (both staging & production)**:
- `DATABASE_URL`, `ANALYTICS_DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`
- `ENTRA_TENANT_ID`, `ENTRA_APP_ID`, `ENTRA_CLIENT_SECRET`
- `OIDC_*` configuration (redirect URI, session secret, scopes, etc.)
- `SMTP_*` email configuration
- `ADMIN_NOTIFICATION_EMAILS`

**In CDK Task Definition** ([secure-container.ts:152-157](infrastructure/lib/constructs/secure-container.ts#L152)):
- `NODE_ENV` (from environment parameter)
- `PORT` (3000)
- `AWS_REGION` (from CDK stack)
- `ENVIRONMENT` (staging/production)
- `NEXT_PUBLIC_APP_URL` (https://staging.bendcare.com or https://app.bendcare.com)

---

## Infrastructure Configuration Analysis

### Current Secret Loading ([secure-container.ts:159-171](infrastructure/lib/constructs/secure-container.ts#L159))

**BEFORE** (Missing MFA secrets):
```typescript
secrets: {
  SKIP_ENV_VALIDATION: ecs.Secret.fromSecretsManager(secret, 'SKIP_ENV_VALIDATION'),
  DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'DATABASE_URL'),
  ANALYTICS_DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'ANALYTICS_DATABASE_URL'),
  JWT_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_SECRET'),
  JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_REFRESH_SECRET'),
  CSRF_SECRET: ecs.Secret.fromSecretsManager(secret, 'CSRF_SECRET'),
  EMAIL_FROM: ecs.Secret.fromSecretsManager(secret, 'EMAIL_FROM'),
  ADMIN_NOTIFICATION_EMAILS: ecs.Secret.fromSecretsManager(secret, 'ADMIN_NOTIFICATION_EMAILS'),
}
```

**AFTER** (✅ Updated in this session):
```typescript
secrets: {
  SKIP_ENV_VALIDATION: ecs.Secret.fromSecretsManager(secret, 'SKIP_ENV_VALIDATION'),
  DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'DATABASE_URL'),
  ANALYTICS_DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'ANALYTICS_DATABASE_URL'),
  JWT_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_SECRET'),
  JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_REFRESH_SECRET'),
  CSRF_SECRET: ecs.Secret.fromSecretsManager(secret, 'CSRF_SECRET'),
  WEBAUTHN_RP_ID: ecs.Secret.fromSecretsManager(secret, 'WEBAUTHN_RP_ID'),  // ✅ ADDED
  MFA_TEMP_TOKEN_SECRET: ecs.Secret.fromSecretsManager(secret, 'MFA_TEMP_TOKEN_SECRET'),  // ✅ ADDED
  EMAIL_FROM: ecs.Secret.fromSecretsManager(secret, 'EMAIL_FROM'),
  ADMIN_NOTIFICATION_EMAILS: ecs.Secret.fromSecretsManager(secret, 'ADMIN_NOTIFICATION_EMAILS'),
}
```

### CI/CD Pipeline Analysis ([.github/workflows/deploy-staging.yml](. github/workflows/deploy-staging.yml))

**How secrets are fetched** (Lines 146-150):
```yaml
# Determine secret ARN based on environment
if [ "${{ steps.vars.outputs.TARGET_ENV }}" = "production" ]; then
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' --output text)
else
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' --output text)
fi
```

**Finding**: Pipeline correctly fetches secrets from AWS Secrets Manager, but the secrets themselves are missing the MFA variables.

---

## Required Actions (In Order)

### 1. ✅ Update CDK Infrastructure (COMPLETED)

**Status**: ✅ Done in this session
**File Modified**: [infrastructure/lib/constructs/secure-container.ts](infrastructure/lib/constructs/secure-container.ts)
**Changes**: Added `WEBAUTHN_RP_ID` and `MFA_TEMP_TOKEN_SECRET` to secrets mapping

**Next Step**: Commit this change and deploy infrastructure stack

---

### 2. ❌ Add Secrets to AWS Secrets Manager (ACTION REQUIRED)

**Status**: ⏳ Awaiting execution
**Risk**: HIGH - MFA will not work until this is done

#### Staging Environment

```bash
# Add WEBAUTHN_RP_ID
aws secretsmanager get-secret-value --secret-id staging/bcos-secrets --query SecretString --output text | \
jq '. + {"WEBAUTHN_RP_ID": "staging.bendcare.com"}' | \
aws secretsmanager put-secret-value --secret-id staging/bcos-secrets --secret-string file:///dev/stdin

# Add MFA_TEMP_TOKEN_SECRET
STAGING_MFA_SECRET=$(openssl rand -base64 48)
aws secretsmanager get-secret-value --secret-id staging/bcos-secrets --query SecretString --output text | \
jq --arg secret "$STAGING_MFA_SECRET" '. + {"MFA_TEMP_TOKEN_SECRET": $secret}' | \
aws secretsmanager put-secret-value --secret-id staging/bcos-secrets --secret-string file:///dev/stdin

# Verify
aws secretsmanager get-secret-value --secret-id staging/bcos-secrets --query SecretString --output text | \
jq -r 'keys[]' | grep -E 'WEBAUTHN|MFA'
```

#### Production Environment

```bash
# Add WEBAUTHN_RP_ID
aws secretsmanager get-secret-value --secret-id production/bcos-secrets --query SecretString --output text | \
jq '. + {"WEBAUTHN_RP_ID": "app.bendcare.com"}' | \
aws secretsmanager put-secret-value --secret-id production/bcos-secrets --secret-string file:///dev/stdin

# Add MFA_TEMP_TOKEN_SECRET (different from staging!)
PRODUCTION_MFA_SECRET=$(openssl rand -base64 48)
aws secretsmanager get-secret-value --secret-id production/bcos-secrets --query SecretString --output text | \
jq --arg secret "$PRODUCTION_MFA_SECRET" '. + {"MFA_TEMP_TOKEN_SECRET": $secret}' | \
aws secretsmanager put-secret-value --secret-id production/bcos-secrets --secret-string file:///dev/stdin

# Verify
aws secretsmanager get-secret-value --secret-id production/bcos-secrets --query SecretString --output text | \
jq -r 'keys[]' | grep -E 'WEBAUTHN|MFA'
```

---

### 3. ❌ Deploy Updated Infrastructure (ACTION REQUIRED)

**Status**: ⏳ Awaiting step 1 commit

```bash
# Navigate to infrastructure directory
cd infrastructure

# Synthesize CloudFormation templates (verify changes)
pnpm cdk synth

# Deploy to staging first
pnpm cdk deploy BCOS-StagingStack --require-approval never

# Deploy to production (after staging verification)
pnpm cdk deploy BCOS-ProductionStack --require-approval never
```

**Expected Changes**:
- Updated ECS task definitions with new secret mappings
- ECS will restart tasks to pick up new configuration

---

### 4. ❌ Force ECS Task Restart (ACTION REQUIRED)

**Status**: ⏳ Awaiting step 3 completion
**Purpose**: Ensure running tasks pick up new environment variables

#### Staging
```bash
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --force-new-deployment
```

#### Production
```bash
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --force-new-deployment
```

---

### 5. ❌ Verification Testing (ACTION REQUIRED)

**Status**: ⏳ Awaiting all previous steps

#### Test Checklist

**Staging Environment** (https://staging.bendcare.com):
- [ ] Application starts without crashing
- [ ] Check logs: `WEBAUTHN_RP_ID` should show `staging.bendcare.com` (not 'localhost')
- [ ] User can initiate MFA setup
- [ ] User can register a passkey
- [ ] User can log out and log back in with passkey
- [ ] No errors related to `MFA_TEMP_TOKEN_SECRET`

**Production Environment** (https://app.bendcare.com):
- [ ] Application starts without crashing
- [ ] Check logs: `WEBAUTHN_RP_ID` should show `app.bendcare.com` (not 'localhost')
- [ ] User can initiate MFA setup
- [ ] User can register a passkey
- [ ] User can log out and log back in with passkey
- [ ] No errors related to `MFA_TEMP_TOKEN_SECRET`

#### Verification Commands

```bash
# Check staging logs for environment variables
aws logs tail /ecs/bcos-staging --follow --since 5m | grep -E 'WEBAUTHN|MFA'

# Check production logs for environment variables
aws logs tail /ecs/bcos-production --follow --since 5m | grep -E 'WEBAUTHN|MFA'

# Check for crashes or startup errors
aws logs tail /ecs/bcos-staging --follow --since 5m --filter-pattern "ERROR"
aws logs tail /ecs/bcos-production --follow --since 5m --filter-pattern "ERROR"
```

---

## Additional Findings

### Build-time vs Runtime Configuration

**NEXT_PUBLIC_APP_URL** is configured in multiple places:

1. **Dockerfile** (Line 29): Build-time ARG
   ```dockerfile
   ENV NEXT_PUBLIC_APP_URL="https://app.bendcare.com"
   ```
   ⚠️ Hardcoded to production URL - staging builds will have wrong value

2. **CDK Stage Configs**: Runtime environment variable
   - Staging: `NEXT_PUBLIC_APP_URL: https://staging.bendcare.com` ✅ Correct
   - Production: `NEXT_PUBLIC_APP_URL: https://app.bendcare.com` ✅ Correct

**Recommendation**: Remove hardcoded value from Dockerfile or use build ARG:
```dockerfile
ARG NEXT_PUBLIC_APP_URL=https://app.bendcare.com
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
```

Then pass in CI/CD pipeline based on target environment.

---

## Security Best Practices Validation

### ✅ Correct Configurations

1. **Secret Storage**: All secrets properly stored in AWS Secrets Manager (encrypted with KMS)
2. **Secret Rotation**: Production configured with 30-day rotation
3. **Least Privilege**: ECS task execution role has minimal permissions
4. **No Secrets in Code**: No hardcoded secrets found in codebase
5. **Separate Secrets**: Staging and production use completely separate secrets

### 🟡 Recommendations

1. **Dockerfile Build Args**: Consider passing `NEXT_PUBLIC_APP_URL` as build arg for correct staging builds
2. **Local Development**: Document that `.env.local` needs `WEBAUTHN_RP_ID=localhost` for local testing
3. **Monitoring**: Add CloudWatch alarms for MFA authentication failures

---

## Risk Assessment

### Before Fix

| Risk | Severity | Impact |
|------|----------|--------|
| MFA completely broken | 🔴 CRITICAL | Application crashes on MFA operations |
| Passkeys bound to 'localhost' | 🔴 CRITICAL | Authentication fails or behaves unpredictably |
| Security posture degraded | 🟡 HIGH | MFA cannot be enforced for sensitive operations |

### After Fix

| Risk | Severity | Impact |
|------|----------|--------|
| Existing passkeys may be invalid | 🟡 MEDIUM | Users may need to re-register passkeys |
| Build-time URL mismatch | 🟢 LOW | May cause client-side URL inconsistencies |

---

## Timeline

1. **Infrastructure update committed**: ⏳ Pending
2. **Secrets added to AWS**: ⏳ Pending (5 minutes)
3. **CDK deployment**: ⏳ Pending (10-15 minutes per environment)
4. **ECS task restart**: ⏳ Pending (5 minutes per environment)
5. **Verification testing**: ⏳ Pending (15-30 minutes)

**Total Estimated Time**: 45-75 minutes

---

## Rollback Plan

If issues occur after deployment:

```bash
# Staging rollback
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:<previous-revision>

# Production rollback
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --task-definition bcos-production:<previous-revision>
```

Secrets can be removed or changed using AWS Secrets Manager console or CLI.

---

## Related Documentation

- [SECURITY_AUDIT_FINDINGS.md](SECURITY_AUDIT_FINDINGS.md) - Comprehensive security audit
- [lib/auth/webauthn.ts](lib/auth/webauthn.ts) - WebAuthn implementation
- [lib/auth/webauthn-temp-token.ts](lib/auth/webauthn-temp-token.ts) - MFA temp token manager
- [infrastructure/lib/constructs/secure-container.ts](infrastructure/lib/constructs/secure-container.ts) - ECS task configuration

---

**Prepared by**: Claude Code
**Review Status**: Awaiting user approval for secret updates
