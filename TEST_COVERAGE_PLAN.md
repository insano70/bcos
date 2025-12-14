# Test Coverage Plan: Minimum Tests for Maximum Coverage

## Executive Summary

This plan identifies **6 new test files** that provide broad coverage of untested core security features and primary user functions, while avoiding edge cases.

---

## Current Coverage Analysis

### Well-Covered Areas (No Additional Tests Needed)
| Area | Test File | Coverage |
|------|-----------|----------|
| Users CRUD | `users-service-committed.test.ts` | 14 tests |
| Charts CRUD | `charts-service-committed.test.ts` | 43 tests |
| Dashboards CRUD | `dashboards-service-committed.test.ts` | 10 tests |
| Organizations CRUD | `organizations-service-committed.test.ts` | 8 tests |
| Work Items Basic | `work-items-service-committed.test.ts` | 9 tests |
| Data Sources | `data-sources-service-committed.test.ts` | 6 tests |
| RBAC Permissions | `permissions.test.ts` | 39 tests |
| Token Lifecycle | `token-lifecycle.test.ts` | 4 tests |
| CSRF Protection | `csrf-lifecycle.test.ts` | 6 tests |
| Session Management | `session-limits.test.ts` | 2 tests |
| Security Headers | `security-features.test.ts` | 6 tests |
| Auth Flow | `auth-flow.test.ts` | 2 tests |
| S3 Upload | `upload-s3.test.ts` | 7 tests |
| Data Explorer | 5 test files | ~15 tests |

### Critical Gaps Identified

1. **MFA/WebAuthn** - Zero tests for multi-factor authentication
2. **Rate Limiting** - No tests for API rate limit enforcement
3. **Account Lockout** - No tests for failed login lockout
4. **Roles Service** - No tests for role CRUD with permission binding
5. **Work Item Attachments** - No tests for S3-backed file attachments with RBAC
6. **Work Item Comments** - No tests for comment CRUD with RBAC

---

## Proposed Test Files (6 Total)

### 1. `tests/integration/security/mfa-totp.test.ts`
**Priority:** Critical (Security)
**Estimated Tests:** 6-8

Tests MFA enrollment and verification flow:
```
describe('MFA TOTP Flow')
  - should enable TOTP MFA for user
  - should verify valid TOTP code
  - should reject invalid TOTP code
  - should reject expired TOTP code
  - should allow MFA skip when configured
  - should require MFA verification after login when enabled
```

**Services Covered:**
- `/app/api/auth/mfa/verify/route.ts`
- `/lib/auth/mfa.ts`

---

### 2. `tests/integration/security/rate-limiting.test.ts`
**Priority:** Critical (Security)
**Estimated Tests:** 5-6

Tests rate limiting enforcement:
```
describe('Rate Limiting')
  - should allow requests within rate limit
  - should reject requests exceeding auth rate limit (10/min)
  - should reject requests exceeding API rate limit (100/min)
  - should reset rate limit after window expires
  - should return proper 429 response with retry-after header
```

**Services Covered:**
- `/lib/security/rate-limiter.ts`
- Rate limit middleware integration

---

### 3. `tests/integration/security/account-lockout.test.ts`
**Priority:** Critical (Security)
**Estimated Tests:** 5-6

Tests account security after failed attempts:
```
describe('Account Lockout')
  - should track failed login attempts
  - should lock account after max failed attempts
  - should reject login attempts on locked account
  - should unlock account after lockout period
  - should reset failed attempts after successful login
```

**Services Covered:**
- `/lib/auth/security.ts` (account lockout logic)
- `/app/api/auth/login/route.ts`

---

### 4. `tests/integration/rbac/roles-service-committed.test.ts`
**Priority:** High (Core RBAC)
**Estimated Tests:** 10-12

Tests role management with permission binding:
```
describe('RBAC Roles Service')
  describe('getRoles - Read Operations')
    - should retrieve roles with permissions
    - should filter roles by organization
    - should deny role retrieval without permissions

  describe('createRole - Creation Operations')
    - should create role with permissions
    - should create organization-scoped role
    - should deny role creation without admin permissions

  describe('updateRole - Modification Operations')
    - should update role name and description
    - should add permissions to existing role
    - should remove permissions from role
    - should deny update without permissions

  describe('deleteRole - Deletion Operations')
    - should delete role and unassign from users
    - should deny deletion of system roles
```

**Services Covered:**
- `/lib/services/rbac-roles-service.ts`
- Role-permission binding logic

---

### 5. `tests/integration/rbac/work-item-attachments-service-committed.test.ts`
**Priority:** High (Primary User Function)
**Estimated Tests:** 8-10

Tests work item file attachments with RBAC:
```
describe('Work Item Attachments Service')
  describe('getAttachments - Read Operations')
    - should retrieve attachments for work item
    - should include presigned download URLs
    - should deny retrieval without work-items:read permission

  describe('createAttachment - Upload Operations')
    - should create attachment record with S3 metadata
    - should generate presigned upload URL
    - should validate file type (MIME whitelist)
    - should enforce file size limits
    - should deny upload without work-items:update permission

  describe('deleteAttachment - Deletion Operations')
    - should delete attachment and S3 object
    - should deny deletion without work-items:update permission
```

**Services Covered:**
- `/lib/services/rbac-work-item-attachments-service.ts`
- `/lib/s3/private-assets/` (presigned URL generation)

---

### 6. `tests/integration/rbac/work-item-comments-service-committed.test.ts`
**Priority:** High (Primary User Function)
**Estimated Tests:** 8-10

Tests work item comments with RBAC:
```
describe('Work Item Comments Service')
  describe('getComments - Read Operations')
    - should retrieve comments for work item
    - should include author information
    - should return comments in chronological order
    - should deny retrieval without work-items:read permission

  describe('createComment - Creation Operations')
    - should create comment with content
    - should record author and timestamp
    - should deny creation without work-items:update permission

  describe('updateComment - Modification Operations')
    - should update own comment content
    - should deny update of others' comments (without admin)

  describe('deleteComment - Deletion Operations')
    - should delete own comment
    - should allow admin to delete any comment
```

**Services Covered:**
- `/lib/services/rbac-work-item-comments-service.ts`
- Comment-author relationship

---

## Implementation Order

| Order | Test File | Est. Time | Reason |
|-------|-----------|-----------|--------|
| 1 | `roles-service-committed.test.ts` | 2-3 hrs | Core RBAC, enables other tests |
| 2 | `account-lockout.test.ts` | 1-2 hrs | Critical security, simple setup |
| 3 | `rate-limiting.test.ts` | 1-2 hrs | Critical security, standalone |
| 4 | `mfa-totp.test.ts` | 2-3 hrs | Security feature, moderate complexity |
| 5 | `work-item-comments-service-committed.test.ts` | 2 hrs | User function, follows existing pattern |
| 6 | `work-item-attachments-service-committed.test.ts` | 2-3 hrs | User function, S3 integration |

**Total Estimated Tests:** 42-52 new tests
**Total Estimated Time:** 10-16 hours

---

## Test Infrastructure Notes

### Existing Patterns to Follow
- Use `createTestScope()` for test isolation
- Use committed factories (`createCommittedUser`, etc.) for cross-connection visibility
- Call `rollbackTransaction()` before `scope.cleanup()` in afterEach
- Use `buildUserContext()` for RBAC context
- Use `assignRoleToUser()` for permission setup

### Required Factories (May Need Creation)
- `createCommittedRole` - for roles-service tests
- `createCommittedWorkItemAttachment` - for attachments tests
- `createCommittedWorkItemComment` - for comments tests

### Mock Requirements
- Rate limiting tests may need Redis mock or test Redis instance
- MFA tests may need TOTP library mock for deterministic codes
- S3 tests can use existing mocking patterns from `upload-s3.test.ts`

---

## Coverage Impact

| Metric | Before | After |
|--------|--------|-------|
| Security Features Tested | 4/7 (57%) | 7/7 (100%) |
| Core RBAC Services Tested | 6/8 (75%) | 7/8 (88%) |
| Primary User Functions Tested | 5/7 (71%) | 7/7 (100%) |
| Integration Test Files | 28 | 34 |
| Total Integration Tests | ~179 | ~225 |

---

## Out of Scope (Edge Cases Not Prioritized)

The following are intentionally excluded as edge cases:
- WebAuthn/FIDO2 registration flow (complex hardware dependency)
- SAML/OIDC provider-specific edge cases
- Dashboard chart type variations
- Data Explorer AI suggestion quality
- Admin monitoring endpoints
- Announcement targeting logic
- Report card peer comparison
- Practice attribute management
