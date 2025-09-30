# Microsoft Entra SAML SSO Implementation - Development Progress

**Project**: BCOS SAML SSO Integration  
**Start Date**: September 30, 2025  
**Status**: Planning Phase  
**Current Phase**: Phase 0 - Planning & Documentation

---

## Executive Summary

### Implementation Scope
- **Objective**: Integrate Microsoft Entra ID SAML SSO with existing JWT-based authentication
- **Approach**: Hybrid authentication (SSO + traditional login coexist)
- **User Provisioning**: Manual pre-provisioning by admins
- **Tenant ID**: `e0268fe2-3176-4ac0-8cef-5f1925dd490e`
- **Environments**: Separate Entra applications for staging and production
- **Timeline**: Estimated 3-4 weeks (phased implementation)

### Key Decisions
✅ **Database**: Make `password_hash` nullable (blocks password login when null)  
✅ **Authentication**: Hybrid - users with passwords can use both methods  
✅ **Provisioning**: Manual user creation by admins  
✅ **Role Mapping**: Manual role assignment in application (no Entra group mapping initially)  
✅ **Logout**: Application-level only (no SAML logout)  
✅ **Tracking**: No additional tracking fields initially (keep schema minimal)

### Quality Standards
- **Type Safety**: ZERO `any` types - comprehensive TypeScript interfaces
- **Pattern Compliance**: Match existing auth patterns exactly (login/route.ts as template)
- **Security**: Defense in depth - built-in from day one
- **Testing**: Unit, integration, and security tests throughout
- **Performance**: Certificate caching designed upfront
- **Documentation**: Inline docs and comprehensive guides
- **Quality Gates**: `pnpm tsc` and `pnpm lint` after every phase

---

## Lessons Learned from Previous Attempt

### Critical Mistakes to Avoid
1. ❌ **Type Safety**: Used `any` types extensively
2. ❌ **Pattern Compliance**: Didn't follow existing API patterns consistently
3. ❌ **Performance**: Certificate files read on every request (no caching)
4. ❌ **Security**: Missing advanced validations
5. ❌ **Testing**: No test coverage
6. ❌ **Architecture**: Shortcuts instead of proper patterns
7. ❌ **Process**: Built everything at once without validation
8. ❌ **Documentation**: Implementation without proper docs

### New Approach - Quality First
✅ Study existing patterns thoroughly before writing any code  
✅ Create comprehensive TypeScript interfaces (no `any` types)  
✅ Implement certificate caching and performance optimization upfront  
✅ Build security validations from the start (defense in depth)  
✅ Write tests alongside implementation  
✅ Follow factory patterns and proper separation of concerns  
✅ Phased approach with quality gates at each step  
✅ Inline documentation and comprehensive guides  
✅ Incremental validation: TypeScript, linting, testing at each phase

---

## Implementation Phases

### Phase 1: Study Existing Patterns
**Status**: ⏳ Pending  
**Objective**: Deep dive into existing auth implementation to understand patterns before writing any SAML code  
**Duration**: 1-2 hours

#### Tasks
- [ ] **1.1** Study `app/api/auth/login/route.ts` - Document exact patterns: `publicRoute`, `createAPILogger`, `createSuccessResponse`, `createErrorResponse`, `AuditLogger` usage, correlation IDs
- [ ] **1.2** Study `lib/api/middleware/` patterns - Understand `applyGlobalAuth`, rate limiting, CSRF protection integration
- [ ] **1.3** Study `lib/auth/token-manager.ts` - Understand `createTokenPair`, device fingerprinting, session creation patterns to replicate in SAML callback
- [ ] **1.4** Study logging patterns - Document how to use `createAPILogger`, `apiLogger.logAuth`, `apiLogger.logSecurity`, `apiLogger.logBusiness` correctly

#### Findings

**Critical Patterns from `app/api/auth/login/route.ts`:**

1. **Route Handler Structure**
   - Uses `publicRoute()` wrapper from `lib/api/route-handler.ts`
   - Wrapped with `withCorrelation()` for request correlation IDs
   - Options: `{ rateLimit: 'auth' }` for authentication-specific rate limiting

2. **Logging Pattern** (MUST FOLLOW EXACTLY)
   ```typescript
   const apiLogger = createAPILogger(request, 'authentication')
   const logger = apiLogger.getLogger()
   
   apiLogger.logRequest({ authType: 'none', suspicious: false })
   apiLogger.logAuth('login_validation', true, { ... })
   apiLogger.logSecurity('authentication_failure', 'medium', { ... })
   apiLogger.logBusiness('user_authentication', 'sessions', 'success', { ... })
   apiLogger.logResponse(200, { recordCount: 1, processingTimeBreakdown: { ... } })
   ```

3. **Error Handling Pattern**
   - Use `createSuccessResponse()` and `createErrorResponse()` from `lib/api/responses`
   - Throw `AuthenticationError()` for auth failures
   - Always log errors with correlation ID
   - Include PII masking for emails: `email.replace(/(.{2}).*@/, '$1***@')`

4. **Token Generation Pattern**
   ```typescript
   const deviceInfo = {
     ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
     userAgent: request.headers.get('user-agent') || 'unknown',
     fingerprint: TokenManager.generateDeviceFingerprint(ipAddress, userAgent),
     deviceName: TokenManager.generateDeviceName(userAgent)
   }
   
   const tokenPair = await TokenManager.createTokenPair(
     user.user_id,
     deviceInfo,
     remember || false,
     email // For audit logging
   )
   ```

5. **Cookie Setting Pattern**
   ```typescript
   const cookieStore = await cookies()
   const isSecureEnvironment = process.env.NODE_ENV === 'production'
   const maxAge = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60
   
   cookieStore.set('refresh-token', tokenPair.refreshToken, {
     httpOnly: true,
     secure: isSecureEnvironment,
     sameSite: 'strict',
     path: '/',
     maxAge
   })
   
   cookieStore.set('access-token', tokenPair.accessToken, {
     httpOnly: true,
     secure: isSecureEnvironment,
     sameSite: 'strict',
     path: '/',
     maxAge: 15 * 60 // 15 minutes
   })
   ```

6. **Audit Logging Pattern**
   ```typescript
   await AuditLogger.logAuth({
     action: 'login',
     userId: user.user_id,
     ipAddress,
     userAgent,
     metadata: {
       email,
       sessionId: tokenPair.sessionId,
       rememberMe: remember,
       deviceFingerprint,
       correlationId: CorrelationContextManager.getCurrentId()
     }
   })
   ```

7. **User Context Loading**
   ```typescript
   const userContext = await getCachedUserContextSafe(user.user_id)
   const userRoles = userContext?.roles?.map(r => r.name) || []
   const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user'
   ```

8. **Performance Logging**
   ```typescript
   const startTime = Date.now()
   logPerformanceMetric(logger, 'operation_name', Date.now() - startTime, { ... })
   ```

9. **Rate Limiting**
   - Auth endpoints: `await applyRateLimit(request, 'auth')` = 5 requests per 15 minutes
   - API endpoints: `await applyRateLimit(request, 'api')` = 200 requests per minute
   - Implemented in `lib/api/middleware/rate-limit.ts`

10. **CSRF Token Generation**
    ```typescript
    const csrfToken = await UnifiedCSRFProtection.setCSRFToken(user.user_id)
    // Include in response for authenticated users
    ```

**Key Security Validations:**
- Account lockout check via `AccountSecurity.isAccountLocked(email)`
- `is_active` flag enforcement
- Password verification with `verifyPassword()`
- Failed attempt recording: `AccountSecurity.recordFailedAttempt(email)`
- Clear attempts on success: `AccountSecurity.clearFailedAttempts(email)`

**Response Structure:**
```typescript
return createSuccessResponse({
  user: { id, email, name, firstName, lastName, role, emailVerified, roles, permissions },
  accessToken: tokenPair.accessToken,
  sessionId: tokenPair.sessionId,
  expiresAt: tokenPair.expiresAt.toISOString(),
  csrfToken
}, 'Login successful')
```

**Critical TypeScript Patterns:**
- NO `any` types anywhere
- Strict typing on all functions
- Proper interface definitions from `@/lib/types`
- Use JWTPayload from 'jose' package
- DeviceInfo interface exported from token-manager

---

### Phase 2: Type Definitions
**Status**: ⏳ Pending  
**Objective**: Create comprehensive TypeScript interfaces with ZERO `any` types  
**Duration**: 2-3 hours

#### Tasks
- [ ] **2.1** Create `lib/types/saml.ts` - Define `SAMLConfig`, `SAMLProfile`, `SAMLResponse`, `SAMLAssertion` interfaces with strict typing (no `any` types)
- [ ] **2.2** Create type guards and validation functions - `isSAMLProfile`, `validateSAMLResponse`, etc. with proper type narrowing
- [ ] **2.3** Add SAML environment variable types to `lib/env.ts` - Use zod schema validation for all SAML config (`ENTRA_TENANT_ID`, `SAML_CALLBACK_URL`, etc.)
- [ ] **2.4** **QUALITY GATE**: Run `pnpm tsc` (strict mode, zero errors), `pnpm lint` (zero warnings), verify all types exported correctly

#### Type Definitions Created
*List all interfaces and types created*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] All types properly exported
- [ ] No `any` types used

---

### Phase 3: SAML Configuration
**Status**: ⏳ Pending  
**Objective**: Build configuration layer with security and performance built-in  
**Duration**: 3-4 hours

#### Tasks
- [ ] **3.1** Design certificate caching strategy - Create `CertificateCache` class with TTL, invalidation, AWS Secrets Manager integration for production
- [ ] **3.2** Create `lib/saml/config.ts` - Implement configuration with certificate caching, environment-aware (dev/staging/prod), validation at startup
- [ ] **3.3** Add configuration validation - Startup checks for required env vars, certificate validity, tenant ID format, callback URL format
- [ ] **3.4** Certificate expiration management - Pre-check on startup (reject if cert expires in <15 days), expiration warnings, monitoring alerts
- [ ] **3.5** Hot reload capability - Implement certificate rotation without downtime (watch for secret changes, graceful reload)
- [ ] **3.6** Dual certificate support - Support two certificates during rotation period (old + new), seamless transition strategy
- [ ] **3.7** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, verify config loads correctly in all environments, test certificate caching behavior, test hot reload

#### Configuration Design
*Document caching strategy, environment handling, validation approach*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Config loads in dev/staging/prod
- [ ] Certificate caching tested

---

### Phase 4: SAML Client Wrapper
**Status**: ⏳ Pending  
**Objective**: Factory pattern implementation with comprehensive error handling  
**Duration**: 4-5 hours

#### Tasks
- [ ] **4.1** Create `lib/saml/client.ts` - Implement `SAMLClientFactory` (factory pattern, not singleton) with proper lifecycle management
- [ ] **4.2** Add SAML response validation - Issuer validation, signature verification, replay attack prevention, timestamp validation, audience restriction
- [ ] **4.3** Implement comprehensive error handling - Custom error types (`SAMLValidationError`, `SAMLConfigError`), proper error context, security logging
- [ ] **4.4** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, unit test all SAML client methods, test error scenarios, verify no `any` types

#### Client Architecture
*Document factory pattern implementation, error handling strategy*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Unit tests passing
- [ ] Error scenarios tested
- [ ] No `any` types

---

### Phase 5: API Routes
**Status**: ⏳ Pending  
**Objective**: Follow existing auth route patterns EXACTLY  
**Duration**: 5-6 hours

#### Tasks
- [ ] **5.1** Create `app/api/auth/saml/login/route.ts` - Use `publicRoute` wrapper, rate limiting, `createAPILogger`, correlation IDs, match `login/route.ts` patterns
- [ ] **5.2** Create `app/api/auth/saml/callback/route.ts` - CRITICAL: Match `login/route.ts` patterns exactly (`TokenManager.createTokenPair`, device fingerprinting, audit logging, session creation)
- [ ] **5.3** Add callback security validations - User pre-provisioning check, `is_active` check, `password_hash` null check for SSO-only enforcement, tenant isolation
- [ ] **5.4** Email domain validation - Verify email domain matches expected tenant domain(s), configurable allowed domains, reject unauthorized domains
- [ ] **5.5** SAML callback-specific rate limiting - Prevent callback flooding attacks, separate rate limit for callback endpoint (stricter than general API)
- [ ] **5.6** Raw SAML response logging - Log sanitized SAML response for debugging in non-production environments (redact sensitive data in production)
- [ ] **5.7** Create `app/api/auth/saml/metadata/route.ts` - Service provider metadata endpoint with proper headers, caching
- [ ] **5.8** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, integration tests for all routes, verify pattern compliance with existing auth routes

#### Pattern Compliance Checklist
- [ ] Uses `publicRoute` wrapper
- [ ] Uses `createAPILogger` with correlation IDs
- [ ] Uses `createSuccessResponse` / `createErrorResponse`
- [ ] Uses `AuditLogger.logAuth` for all attempts
- [ ] Rate limiting applied (general + SAML callback-specific)
- [ ] Device fingerprinting implemented
- [ ] Session creation matches existing pattern
- [ ] Error handling matches existing pattern
- [ ] Email domain validation implemented
- [ ] Raw SAML response logging (non-prod only)

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Integration tests passing
- [ ] Pattern compliance verified

---

### Phase 6: Middleware & Infrastructure Updates
**Status**: ⏳ Pending  
**Objective**: Update middleware, environment config, and dependencies  
**Duration**: 2-3 hours

#### Tasks
- [ ] **6.1** Update `middleware.ts` - Add `/api/auth/saml/callback` to `CSRF_EXEMPT_PATHS` with security comment explaining why
- [ ] **6.2** Update `lib/env.ts` - Add SAML environment variables with zod validation (`ENTRA_TENANT_ID`, `SAML_CALLBACK_URL`, certificate paths)
- [ ] **6.3** Update `package.json` - Add `@node-saml/node-saml` dependency with specific version (`^5.0.0`), run `pnpm install`
- [ ] **6.4** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, verify middleware changes don't break existing flows, test CSRF exemption works

#### Environment Variables Added
*List all new environment variables with validation schema*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Middleware doesn't break existing flows
- [ ] CSRF exemption tested

---

### Phase 7: Database Migration
**Status**: ⏳ Pending  
**Objective**: Nullable `password_hash` with validation  
**Duration**: 2-3 hours

#### Tasks
- [ ] **7.1** Create `lib/db/migrations/0015_saml_support.sql` - `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` with proper comments
- [ ] **7.2** Update `lib/db/schema.ts` - Change `password_hash` to nullable, update TypeScript types to reflect optional `password_hash`
- [ ] **7.3** Update `app/api/auth/login/route.ts` - Add validation: reject login if `password_hash` is null (SSO-only user attempting password login)
- [ ] **7.4** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, test migration on dev database, verify password login blocked for null `password_hash` users

#### Migration Details
*Document migration SQL, schema changes, validation logic*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Migration tested on dev database
- [ ] Password login blocked for SSO-only users

---

### Phase 8: UI Integration
**Status**: ⏳ Pending  
**Objective**: Login page with SSO button and error handling  
**Duration**: 3-4 hours

#### Tasks
- [ ] **8.1** Update `components/auth/login-form.tsx` - Add "Sign in with Microsoft" button above form, divider, match existing design patterns
- [ ] **8.2** Add SAML error handling to login page - Handle `saml_init_failed`, `saml_validation_failed`, `user_not_provisioned` errors with clear messaging
- [ ] **8.3** Add loading states for SSO - Handle redirect to Microsoft, callback processing, proper UX during authentication flow
- [ ] **8.4** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, manually test UI flows, verify error states display correctly, accessibility check

#### UI Design Decisions
*Document button placement, error messaging, loading states*

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] UI flows tested manually
- [ ] Error states display correctly
- [ ] Accessibility validated

---

### Phase 9: Security Hardening
**Status**: ⏳ Pending  
**Objective**: Defense in depth validation  
**Duration**: 4-5 hours

#### Tasks
- [ ] **9.1** Implement replay attack prevention - InResponseTo tracking, assertion ID deduplication using Redis or database
- [ ] **9.2** Add certificate fingerprint validation - Pin expected certificate fingerprints, alert on certificate changes
- [ ] **9.3** Enhanced audit logging - Log all SAML attempts (success/failure), issuer validation results, security events with full context
- [ ] **9.4** Add SAML response sanitization - Validate and sanitize all fields from SAML response before using in database queries
- [ ] **9.5** Security test scenarios - Test wrong tenant rejection, unsigned response rejection, expired assertion, replay attack, modified response
- [ ] **9.6** **QUALITY GATE**: Run `pnpm tsc`, `pnpm lint`, security penetration tests, verify all security validations working, audit log review

#### Security Validations Implemented
*Document each security layer and validation approach*

#### Security Test Results
- [ ] Wrong tenant rejected
- [ ] Unsigned response rejected
- [ ] Expired assertion rejected
- [ ] Replay attack prevented
- [ ] Modified response rejected
- [ ] Certificate fingerprint validated
- [ ] All attempts logged

#### Quality Gate Results
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings
- [ ] Security tests passing
- [ ] Audit logs reviewed

---

### Phase 10: Comprehensive Testing
**Status**: ⏳ Pending  
**Objective**: Unit, integration, and security tests  
**Duration**: 5-6 hours

#### Tasks
- [ ] **10.1** Create unit tests - `tests/unit/saml-client.test.ts`, `tests/unit/saml-config.test.ts` with comprehensive coverage
- [ ] **10.2** Create integration tests - `tests/integration/saml-auth.test.ts` covering full SAML flow with mocked Entra responses
- [ ] **10.3** Create security tests - `tests/integration/saml-security.test.ts` for tenant isolation, signature validation, replay prevention
- [ ] **10.4** Create test fixtures - `tests/mocks/saml-responses.ts` with valid/invalid SAML response samples for testing
- [ ] **10.5** **QUALITY GATE**: Run `pnpm test`, achieve >80% coverage, all tests passing, `pnpm tsc`, `pnpm lint` all green

#### Test Coverage
*Document test files created and coverage metrics*

#### Quality Gate Results
- [ ] `pnpm test` - All tests passing
- [ ] Coverage > 80%
- [ ] `pnpm tsc` - Zero errors
- [ ] `pnpm lint` - Zero warnings

---

### Phase 11: Performance Optimization & Monitoring
**Status**: ⏳ Pending  
**Objective**: Performance validation and monitoring setup  
**Duration**: 3-4 hours

#### Tasks
- [ ] **11.1** Validate certificate caching - Benchmark certificate loading, verify cache hits, test cache invalidation
- [ ] **11.2** Add performance metrics - Track SAML login duration, JWT generation time, database lookup time, end-to-end auth time
- [ ] **11.3** Setup monitoring - CloudWatch metrics for SAML success/failure rates, alert on error rate >10%, certificate expiration warnings
- [ ] **11.4** **QUALITY GATE**: Performance benchmarks meet targets (<3s auth time), monitoring alerts configured, load testing passed

#### Performance Benchmarks
*Document performance metrics and targets*

#### Monitoring Setup
*Document CloudWatch metrics, alarms, and alert thresholds*

#### Quality Gate Results
- [ ] Auth time < 3 seconds
- [ ] Certificate caching working
- [ ] Monitoring configured
- [ ] Load testing passed
- [ ] No memory leaks

---

### Phase 12: Documentation
**Status**: ⏳ Pending  
**Objective**: Comprehensive documentation for developers, ops, and users  
**Duration**: 3-4 hours

#### Tasks
- [ ] **12.1** Add comprehensive inline documentation - JSDoc comments for all SAML functions, explain security validations, certificate management
- [ ] **12.2** Create environment setup guide - Document `SAML_*` env vars for dev/staging/prod, certificate generation steps, Secrets Manager setup
- [ ] **12.3** Create Entra configuration guide - Step-by-step for creating Enterprise Application, certificate upload, user assignment
- [ ] **12.4** Create troubleshooting guide - Common errors, certificate issues, tenant validation failures, user provisioning problems
- [ ] **12.5** Document certificate management - Generation, storage in Secrets Manager, rotation procedures, expiration monitoring

#### Documentation Created
*List all documentation files and guides created*

---

### Phase 13: Final Validation
**Status**: ⏳ Pending  
**Objective**: Production readiness checklist  
**Duration**: 2-3 hours

#### Tasks
- [ ] **13.1** Final type safety audit - Verify ZERO `any` types anywhere in SAML code, strict TypeScript mode, no type assertions or workarounds
- [ ] **13.2** Pattern compliance audit - Verify 100% match with existing auth patterns (logging, error handling, API responses, middleware)
- [ ] **13.3** Test coverage verification - Unit tests, integration tests, security tests all passing, coverage >80%
- [ ] **13.4** Security audit - Penetration test scenarios passed, replay prevention working, tenant isolation verified, audit logging complete
- [ ] **13.5** Performance benchmarks - Certificate caching working, auth <3s, no memory leaks, load testing passed
- [ ] **13.6** Final quality check - `pnpm tsc` (zero errors), `pnpm lint` (zero warnings), biome config compliance, no regressions in existing tests
- [ ] **13.7** Deployment preparation - Staging deployment checklist, production deployment checklist, rollback plan documented

#### Production Readiness Checklist
- [ ] Type Safety: Zero `any` types confirmed
- [ ] Pattern Compliance: 100% match with existing patterns
- [ ] Test Coverage: >80% with all tests passing
- [ ] Security: All penetration tests passed
- [ ] Performance: All benchmarks met
- [ ] Quality: `pnpm tsc` and `pnpm lint` clean
- [ ] Documentation: All guides completed
- [ ] Deployment: Checklists and rollback plan ready

#### Final Quality Gate Results
- [ ] `pnpm tsc` - Zero errors, strict mode
- [ ] `pnpm lint` - Zero warnings
- [ ] All tests passing
- [ ] No regressions
- [ ] Security audit passed
- [ ] Performance targets met
- [ ] Documentation complete

---

## Files to Create

### New Files
- `lib/types/saml.ts` - TypeScript interfaces for SAML
- `lib/saml/config.ts` - SAML configuration with certificate caching
- `lib/saml/client.ts` - SAML client factory wrapper
- `app/api/auth/saml/login/route.ts` - SAML login initiation
- `app/api/auth/saml/callback/route.ts` - SAML response handler
- `app/api/auth/saml/metadata/route.ts` - Service provider metadata
- `lib/db/migrations/0015_saml_support.sql` - Database migration
- `tests/unit/saml-client.test.ts` - Client unit tests
- `tests/unit/saml-config.test.ts` - Config unit tests
- `tests/integration/saml-auth.test.ts` - Auth integration tests
- `tests/integration/saml-security.test.ts` - Security tests
- `tests/mocks/saml-responses.ts` - Test fixtures
- `docs/saml-environment-setup.md` - Environment setup guide
- `docs/saml-entra-configuration.md` - Entra setup guide
- `docs/saml-troubleshooting.md` - Troubleshooting guide
- `docs/saml-certificate-management.md` - Certificate procedures

### Files to Update
- `middleware.ts` - Add CSRF exemption
- `lib/env.ts` - Add SAML environment variables
- `lib/db/schema.ts` - Make password_hash nullable
- `app/api/auth/login/route.ts` - Block password login for SSO-only users
- `components/auth/login-form.tsx` - Add SSO button
- `package.json` - Add @node-saml/node-saml dependency

---

## Environment Variables

### Development
```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=<path-to-cert-file>

# Service Provider Configuration
SAML_ISSUER=http://localhost:4001/saml/metadata
SAML_CALLBACK_URL=http://localhost:4001/api/auth/saml/callback
SAML_CERT=<path-to-sp-cert>
SAML_PRIVATE_KEY=<path-to-sp-key>

# Security Configuration
SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com,yourdomain.com
SAML_CERT_EXPIRY_WARNING_DAYS=30
SAML_CALLBACK_RATE_LIMIT=10  # requests per minute per IP

# Optional
SAML_SUCCESS_REDIRECT=/dashboard
SAML_LOG_RAW_RESPONSES=true  # Development only
```

### Staging
```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=<from-secrets-manager>

# Service Provider Configuration
SAML_ISSUER=https://staging.bendcare.com/saml/metadata
SAML_CALLBACK_URL=https://staging.bendcare.com/api/auth/saml/callback
SAML_CERT=<from-secrets-manager>
SAML_PRIVATE_KEY=<from-secrets-manager>

# Security Configuration
SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com
SAML_CERT_EXPIRY_WARNING_DAYS=30
SAML_CALLBACK_RATE_LIMIT=20  # requests per minute per IP

# Optional
SAML_SUCCESS_REDIRECT=/dashboard
SAML_LOG_RAW_RESPONSES=true  # Staging: enabled for debugging
```

### Production
```bash
# Microsoft Entra Configuration
ENTRA_TENANT_ID=e0268fe2-3176-4ac0-8cef-5f1925dd490e
ENTRA_ENTRY_POINT=https://login.microsoftonline.com/e0268fe2-3176-4ac0-8cef-5f1925dd490e/saml2
ENTRA_ISSUER=https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/
ENTRA_CERT=<from-secrets-manager>

# Service Provider Configuration
SAML_ISSUER=https://app.bendcare.com/saml/metadata
SAML_CALLBACK_URL=https://app.bendcare.com/api/auth/saml/callback
SAML_CERT=<from-secrets-manager>
SAML_PRIVATE_KEY=<from-secrets-manager>

# Security Configuration
SAML_ALLOWED_EMAIL_DOMAINS=bendcare.com
SAML_CERT_EXPIRY_WARNING_DAYS=30
SAML_CALLBACK_RATE_LIMIT=50  # requests per minute per IP

# Optional
SAML_SUCCESS_REDIRECT=/dashboard
SAML_LOG_RAW_RESPONSES=false  # Production: disabled for security
```

---

## Risk Register

### Technical Risks
| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|-----------|---------|
| Certificate expiration causes outage | Medium | High | Calendar reminders, monitoring, 30-day warning alerts | Active |
| Entra service outage | Low | Medium | Keep traditional login available as fallback | Active |
| User not pre-provisioned | High (initially) | Low | Clear error message, admin notification | Active |
| SAML signature validation bugs | Low | Critical | Thorough testing, security audit, well-maintained library | Active |
| Runtime errors in node-saml | Low | Medium | Comprehensive error handling, rollback plan | Active |

### Operational Risks
| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|-----------|---------|
| Users confused by new login option | Medium | Low | Clear UI, training, documentation | Active |
| Increased support tickets | Medium | Low | Comprehensive FAQ, admin tools | Active |
| Misconfiguration in production | Low | High | Staging environment testing, deployment checklist | Active |
| Secrets leaked/compromised | Low | Critical | AWS Secrets Manager, least-privilege IAM, rotation | Active |

### Security Risks
| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|-----------|---------|
| Tenant isolation bypass attempt | Low | Critical | Issuer validation, certificate pinning, monitoring | Active |
| SAML response replay | Low | High | InResponseTo tracking, timestamp validation | Active |
| Man-in-the-middle attack | Very Low | Critical | HTTPS everywhere, certificate validation | Active |
| Compromised Entra admin account | Low | Critical | Azure MFA, privileged access management, audit logs | Active |

---

## Progress Log

### 2025-09-30

**Morning: Planning & Setup**
- Created implementation plan with 13 phases
- Documented all lessons learned from previous attempt
- Established quality gates and standards
- Enhanced Phase 3: Added certificate expiration pre-checks, hot reload capability, dual certificate support
- Enhanced Phase 5: Added email domain validation, SAML callback-specific rate limiting, raw SAML response logging
- Added new environment variables for security configuration

**Afternoon: ✅ Phase 1 Complete - Pattern Study**
- Analyzed `app/api/auth/login/route.ts` (439 lines of enterprise authentication)
- Documented exact patterns for publicRoute, createAPILogger, correlation IDs, error handling
- Studied rate limiting: auth (5/15min), API (200/min)
- Analyzed TokenManager.createTokenPair() for device fingerprinting  
- Documented comprehensive logging patterns
- Identified critical security validations  
- **Quality Gate**: ✅ pnpm tsc clean (zero errors at baseline)

**Next: Beginning Phase 2 - Type Definitions**

---

## Next Steps

1. **Review this document** - Ensure all phases and approach are approved
2. **Begin Phase 1** - Study existing authentication patterns
3. **Update this document** - Track progress and findings as we proceed
4. **Quality gates** - Verify `pnpm tsc` and `pnpm lint` after each phase

---

## Notes & Observations

*Use this section to capture important insights, decisions, and learnings during implementation*

---

**Last Updated**: September 30, 2025  
**Document Version**: 1.0  
**Author**: Development Team
