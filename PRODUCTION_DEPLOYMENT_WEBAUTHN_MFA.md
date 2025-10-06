# WebAuthn MFA - Production Deployment Guide

**Version:** 1.0.0
**Date:** 2025-10-06
**Status:** ✅ READY FOR PRODUCTION

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Migration](#database-migration)
4. [Deployment Steps](#deployment-steps)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedure](#rollback-procedure)
7. [Monitoring & Alerts](#monitoring--alerts)
8. [User Communication](#user-communication)

---

## Pre-Deployment Checklist

### Development Environment
- ✅ Migration 0019 applied successfully
- ✅ TypeScript compilation clean (MFA code)
- ✅ All route handlers working
- ✅ Security audit completed

### Staging Environment
- ⚠️ Deploy to staging first
- ⚠️ Test all MFA flows
- ⚠️ Verify OIDC bypass
- ⚠️ Test admin MFA reset

### Production Readiness
- ⚠️ Environment variables configured
- ⚠️ Database backup taken
- ⚠️ Rollback plan reviewed
- ⚠️ Monitoring alerts configured
- ⚠️ User communication prepared

---

## Environment Configuration

### Required Environment Variables

```bash
# WebAuthn Configuration
WEBAUTHN_RP_ID=bendcare.com           # Production domain (NO protocol, NO trailing slash)
NEXT_PUBLIC_APP_URL=https://bendcare.com  # Full production URL

# Existing Variables (verify)
NODE_ENV=production                    # For secure cookies
DATABASE_URL=<production_db_url>       # Production database
```

### Important Notes

1. **WEBAUTHN_RP_ID**
   - Must match the domain where the application is hosted
   - NO `https://` prefix
   - NO port numbers
   - NO trailing slash
   - Examples:
     - ✅ `bendcare.com`
     - ✅ `staging.bendcare.com`
     - ❌ `https://bendcare.com`
     - ❌ `bendcare.com:3000`
     - ❌ `bendcare.com/`

2. **NEXT_PUBLIC_APP_URL**
   - Full URL with protocol
   - Used for origin validation
   - Examples:
     - ✅ `https://bendcare.com`
     - ✅ `https://staging.bendcare.com`
     - ❌ `http://bendcare.com` (unless testing)

3. **NODE_ENV=production**
   - Required for secure cookies
   - httpOnly, secure, sameSite=strict flags enabled

---

## Database Migration

### Step 1: Backup Database

```bash
# Create backup before migration
pg_dump $DATABASE_URL > backup_before_mfa_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Review Migration

```bash
# Review migration file
cat lib/db/migrations/0019_webauthn_mfa.sql
```

### Step 3: Apply Migration (Staging)

```bash
# Apply to staging first
psql $STAGING_DATABASE_URL < lib/db/migrations/0019_webauthn_mfa.sql
```

### Step 4: Verify Migration (Staging)

```bash
# Verify tables created
psql $STAGING_DATABASE_URL -c "\dt webauthn_*"

# Verify columns added
psql $STAGING_DATABASE_URL -c "\d account_security" | grep mfa
```

### Step 5: Apply Migration (Production)

```bash
# After successful staging testing
psql $DATABASE_URL < lib/db/migrations/0019_webauthn_mfa.sql
```

---

## Deployment Steps

### Step 1: Deploy Code to Staging

```bash
# Deploy to staging environment
git checkout staging
git merge main
git push origin staging

# Verify deployment
curl https://staging.bendcare.com/api/auth/mfa/register/begin
# Should return 401 (auth required)
```

### Step 2: Test Staging

#### Test 1: Password Login + MFA Setup
1. Create test user with password
2. Login → should see "mfa_setup_required"
3. Complete passkey registration
4. Verify login works with passkey

#### Test 2: Password Login + Existing MFA
1. Use user from Test 1
2. Login → should see "mfa_required"
3. Complete passkey verification
4. Verify full access granted

#### Test 3: OIDC Login (Bypass MFA)
1. Login via Microsoft SSO
2. Verify NO MFA prompt
3. Verify direct access granted

#### Test 4: Admin MFA Reset
1. Admin user resets Test 1 user's MFA
2. Verify all passkeys deactivated
3. Verify all sessions revoked
4. Verify user forced to re-setup on next login

#### Test 5: Credential Management
1. Add multiple passkeys
2. Rename a passkey
3. Delete a passkey (not the last one)
4. Verify cannot delete last passkey

### Step 3: Deploy Code to Production

```bash
# After successful staging testing
git checkout main
git push origin main

# Verify deployment
curl https://bendcare.com/api/auth/mfa/register/begin
# Should return 401 (auth required)
```

### Step 4: Enable Feature (Gradual Rollout)

**Option A: Immediate Enforcement (All Users)**
- MFA required on first password login
- OIDC users unaffected

**Option B: Gradual Rollout (Recommended)**
1. Enable for internal team first (week 1)
2. Enable for pilot users (week 2)
3. Enable for all users (week 3)
4. Communicate timeline in advance

---

## Post-Deployment Verification

### Immediate Checks (T+0)

```bash
# 1. Verify database migration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM webauthn_credentials"
# Should return 0 (no credentials yet)

# 2. Verify API endpoints respond
curl -I https://bendcare.com/api/auth/mfa/register/begin
# Should return 401

# 3. Check logs for errors
grep -i "mfa\|webauthn" /var/log/application.log | tail -50
```

### First Hour Checks (T+1h)

1. **Monitor Audit Logs**
   ```sql
   SELECT action, COUNT(*)
   FROM audit_logs
   WHERE event_type = 'auth'
     AND action LIKE 'mfa_%'
     AND timestamp > NOW() - INTERVAL '1 hour'
   GROUP BY action;
   ```

2. **Check for Errors**
   ```bash
   grep -i "error\|failed" /var/log/application.log | grep -i "mfa\|webauthn"
   ```

3. **Verify User Registrations**
   ```sql
   SELECT COUNT(*), credential_device_type
   FROM webauthn_credentials
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY credential_device_type;
   ```

### First Day Checks (T+24h)

1. **MFA Adoption Rate**
   ```sql
   SELECT
     (SELECT COUNT(*) FROM account_security WHERE mfa_enabled = true) AS mfa_users,
     (SELECT COUNT(*) FROM users WHERE password_hash IS NOT NULL) AS password_users,
     ROUND(100.0 * (SELECT COUNT(*) FROM account_security WHERE mfa_enabled = true) /
           NULLIF((SELECT COUNT(*) FROM users WHERE password_hash IS NOT NULL), 0), 2) AS adoption_percentage;
   ```

2. **Failed Authentication Attempts**
   ```sql
   SELECT COUNT(*)
   FROM audit_logs
   WHERE action = 'mfa_verification_failed'
     AND timestamp > NOW() - INTERVAL '24 hours';
   ```

3. **Authenticator Clone Detections**
   ```sql
   SELECT COUNT(*)
   FROM audit_logs
   WHERE action = 'authenticator_cloned'
     AND timestamp > NOW() - INTERVAL '24 hours';
   ```
   **Expected:** 0 (any detections = security incident)

---

## Rollback Procedure

### If Critical Issue Discovered

#### Option 1: Disable MFA Enforcement (Quick)

**NOT IMPLEMENTED** - Would require code change to make MFA optional
- Current implementation enforces MFA on all password logins
- Cannot be disabled without code change

#### Option 2: Rollback Database Migration

```bash
# 1. Stop application
systemctl stop bendcare-app

# 2. Restore database backup
psql $DATABASE_URL < backup_before_mfa_YYYYMMDD_HHMMSS.sql

# 3. Deploy previous code version
git checkout <previous_commit>
git push origin main --force

# 4. Restart application
systemctl start bendcare-app

# 5. Verify rollback
psql $DATABASE_URL -c "\dt webauthn_*"
# Should return no tables
```

#### Option 3: Manual Cleanup (Surgical)

```sql
-- Disable MFA for all users
UPDATE account_security SET mfa_enabled = false, mfa_method = NULL, mfa_enforced_at = NULL;

-- Deactivate all credentials (keep for audit)
UPDATE webauthn_credentials SET is_active = false;

-- Clear challenges
DELETE FROM webauthn_challenges;
```

**Note:** Option 3 keeps audit trail intact but disables MFA

---

## Monitoring & Alerts

### Metrics to Monitor

1. **MFA Registration Success Rate**
   - Target: >95%
   - Alert if: <90% for 1 hour

2. **MFA Verification Success Rate**
   - Target: >98%
   - Alert if: <95% for 1 hour

3. **Authenticator Clone Detections**
   - Target: 0
   - Alert if: >0 (immediate)

4. **Average Registration Time**
   - Target: <30 seconds
   - Alert if: >60 seconds

5. **Failed MFA Attempts**
   - Target: <5% of total attempts
   - Alert if: >10% for 1 hour

### Alert Queries

```sql
-- Clone detection alert
SELECT user_id, metadata
FROM audit_logs
WHERE action = 'authenticator_cloned'
  AND timestamp > NOW() - INTERVAL '1 hour';

-- High failure rate alert
SELECT
  COUNT(*) FILTER (WHERE action = 'mfa_verification_failed') AS failures,
  COUNT(*) FILTER (WHERE action = 'mfa_verification_success') AS successes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE action = 'mfa_verification_failed') /
        NULLIF(COUNT(*), 0), 2) AS failure_rate
FROM audit_logs
WHERE action IN ('mfa_verification_failed', 'mfa_verification_success')
  AND timestamp > NOW() - INTERVAL '1 hour';
```

---

## User Communication

### Pre-Deployment Announcement

**Subject:** Important Security Update - Passkey Authentication

**Body:**
```
Dear BendCare Users,

On [DEPLOYMENT_DATE], we're enhancing account security with passkey authentication.

What's changing:
• On your next login, you'll be prompted to set up a passkey
• Passkeys use Touch ID, Face ID, or your device's biometric authentication
• This takes less than 30 seconds to set up

What's NOT changing:
• Microsoft SSO users: No action needed - continue using SSO
• Your existing passwords remain valid

Benefits:
• Faster login (no typing passwords)
• More secure than passwords alone
• Works across your devices

Need help? Contact support@bendcare.com

Thanks,
BendCare Security Team
```

### Post-Deployment Support

**Common Issues:**

1. **"I don't have Touch ID/Face ID"**
   - USB security keys supported
   - Admin can reset if needed

2. **"I lost my device"**
   - Contact admin for MFA reset
   - Admin can reset your passkeys

3. **"I use multiple devices"**
   - Set up a passkey on each device (up to 5)
   - Or use a USB security key

---

## Maintenance Tasks

### Daily

```bash
# Check for anomalies
psql $DATABASE_URL -c "
SELECT action, COUNT(*)
FROM audit_logs
WHERE event_type = 'auth'
  AND action LIKE 'mfa_%'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY action;
"
```

### Weekly

```bash
# Cleanup expired challenges (manual for now)
psql $DATABASE_URL -c "
DELETE FROM webauthn_challenges
WHERE expires_at < NOW() - INTERVAL '1 day';
"
```

### Monthly

```bash
# MFA adoption metrics report
psql $DATABASE_URL -c "
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS new_credentials,
  COUNT(DISTINCT user_id) AS new_users
FROM webauthn_credentials
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date;
"
```

---

## Success Criteria

### Week 1
- ✅ Zero critical bugs reported
- ✅ <5% user support tickets
- ✅ >95% registration success rate
- ✅ Zero authenticator clone detections

### Week 2
- ✅ >50% password users have MFA enabled
- ✅ <3% user support tickets
- ✅ >98% verification success rate

### Month 1
- ✅ >90% password users have MFA enabled
- ✅ <1% user support tickets
- ✅ Zero security incidents

---

## Emergency Contacts

**On-Call Engineer:** [CONTACT]
**Security Team:** security@bendcare.com
**Support Team:** support@bendcare.com

---

## Appendix: Browser Compatibility

### Supported Browsers

✅ **Desktop:**
- Chrome 90+ (Touch ID on macOS, Windows Hello on Windows)
- Safari 15+ (Touch ID on macOS)
- Firefox 90+
- Edge 90+ (Windows Hello)

✅ **Mobile:**
- iOS Safari 15+ (Face ID / Touch ID)
- Chrome Mobile 90+ (biometric)
- Samsung Internet 14+

❌ **Not Supported:**
- Internet Explorer (end of life)
- Chrome <90
- Safari <15

**Note:** Users on unsupported browsers should use Microsoft SSO or contact support.

---

**END OF DEPLOYMENT GUIDE**
