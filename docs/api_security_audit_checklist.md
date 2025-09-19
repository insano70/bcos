# API Security Audit Checklist

## Overview
This checklist should be used to audit all API endpoints to ensure they meet our security standards. Each endpoint should be reviewed against these criteria.

## Endpoint Information
- [ ] **Endpoint Path**: ________________________________
- [ ] **HTTP Methods**: ________________________________
- [ ] **Purpose**: ________________________________
- [ ] **Last Reviewed**: ________________________________
- [ ] **Reviewer**: ________________________________

## 1. Authentication & Authorization

### 1.1 Authentication
- [ ] Endpoint requires authentication (unless explicitly public)
- [ ] Uses `rbacRoute` wrapper for protected endpoints
- [ ] Uses `publicRoute` wrapper for public endpoints with documented reason
- [ ] JWT token validation is properly implemented
- [ ] Session management follows best practices

### 1.2 Authorization (RBAC)
- [ ] Appropriate permission(s) defined for the endpoint
- [ ] Permission granularity matches the operation (read/write/manage)
- [ ] Resource-level permissions checked where applicable
- [ ] Organization-level scoping implemented if needed
- [ ] Super admin bypasses are intentional and documented

## 2. Input Validation & Sanitization

### 2.1 Request Validation
- [ ] All input parameters are validated
- [ ] Zod schemas or similar validation for complex inputs
- [ ] Type checking for all parameters
- [ ] Length limits enforced on strings
- [ ] Numeric ranges validated where applicable

### 2.2 Sanitization
- [ ] Request sanitization middleware is active
- [ ] SQL injection protection verified
- [ ] NoSQL injection protection verified
- [ ] XSS protection in place
- [ ] Path traversal attempts blocked
- [ ] Prototype pollution protection

## 3. Security Headers & Middleware

### 3.1 CSRF Protection
- [ ] CSRF protection active for state-changing operations
- [ ] Endpoint correctly included/excluded from CSRF checks
- [ ] Double-submit cookie pattern implemented

### 3.2 Rate Limiting
- [ ] Appropriate rate limit tier applied (auth/api/upload)
- [ ] Rate limits reasonable for the operation
- [ ] Special limits for sensitive operations

### 3.3 Security Headers
- [ ] Content-Security-Policy header present
- [ ] X-Frame-Options set appropriately
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy configured
- [ ] CORS settings appropriate for the endpoint

## 4. Data Security

### 4.1 Sensitive Data Handling
- [ ] PII is properly protected
- [ ] Passwords are hashed with bcrypt (never stored plain)
- [ ] Sensitive data not logged
- [ ] API keys/secrets not exposed in responses
- [ ] Proper data masking in logs

### 4.2 Database Security
- [ ] Uses parameterized queries (Drizzle ORM)
- [ ] No raw SQL unless absolutely necessary
- [ ] Soft deletes implemented where appropriate
- [ ] Transaction isolation for critical operations
- [ ] Connection pooling configured properly

## 5. Response Security

### 5.1 Error Handling
- [ ] Generic error messages for security failures
- [ ] Stack traces never exposed to clients
- [ ] Detailed errors only in development
- [ ] Consistent error response format
- [ ] No information leakage in errors

### 5.2 Response Data
- [ ] Only necessary data included in responses
- [ ] Sensitive fields excluded from responses
- [ ] Pagination implemented for list endpoints
- [ ] Response size limits enforced

## 6. Logging & Monitoring

### 6.1 Security Logging
- [ ] Authentication attempts logged
- [ ] Authorization failures logged
- [ ] Security events use appropriate severity levels
- [ ] Correlation IDs properly propagated
- [ ] Performance metrics collected

### 6.2 Audit Trail
- [ ] User actions logged with AuditLogger
- [ ] Resource modifications tracked
- [ ] IP addresses and user agents captured
- [ ] Timestamp accuracy ensured

## 7. Business Logic Security

### 7.1 Access Control
- [ ] Users can only access their own resources
- [ ] Organization boundaries enforced
- [ ] Hierarchical permissions respected
- [ ] No privilege escalation paths

### 7.2 State Management
- [ ] Race conditions addressed
- [ ] Idempotency implemented where needed
- [ ] Consistent state transitions
- [ ] Proper transaction handling

## 8. File Upload Security (if applicable)

### 8.1 File Validation
- [ ] File type validation (MIME and extension)
- [ ] File size limits enforced
- [ ] Virus scanning implemented (if required)
- [ ] Magic number validation for critical types

### 8.2 Storage Security
- [ ] Files stored outside web root
- [ ] Unique filenames generated
- [ ] Direct file access prevented
- [ ] Proper file permissions set

## 9. Third-party Integration Security

### 9.1 Webhook Security
- [ ] Signature verification implemented
- [ ] Replay attack protection
- [ ] Timeout handling
- [ ] Error recovery mechanisms

### 9.2 External API Calls
- [ ] API keys stored securely (environment variables)
- [ ] TLS/SSL enforced
- [ ] Certificate validation enabled
- [ ] Timeout configurations set

## 10. Performance & DoS Protection

### 10.1 Resource Limits
- [ ] Request body size limits
- [ ] JSON parsing depth limits
- [ ] Array size limits
- [ ] Query complexity limits

### 10.2 Caching
- [ ] Appropriate cache headers
- [ ] No sensitive data in cached responses
- [ ] Cache invalidation strategy

## Security Risk Assessment

### Overall Risk Level
- [ ] **Critical**: Immediate action required
- [ ] **High**: Should be addressed soon
- [ ] **Medium**: Plan for remediation
- [ ] **Low**: Acceptable with monitoring

### Identified Issues
1. ________________________________
2. ________________________________
3. ________________________________

### Recommended Actions
1. ________________________________
2. ________________________________
3. ________________________________

## Sign-off
- **Security Review Completed By**: ________________________________
- **Date**: ________________________________
- **Next Review Date**: ________________________________

---

## Quick Reference: Common Security Patterns

### Protected Endpoint Pattern
```typescript
export const GET = rbacRoute(
  handlerFunction,
  {
    permission: 'resource:read:own',
    rateLimit: 'api'
  }
);
```

### Public Endpoint Pattern
```typescript
export const GET = publicRoute(
  handlerFunction,
  'Reason why this endpoint is public',
  { rateLimit: 'api' }
);
```

### Input Validation Pattern
```typescript
const schema = z.object({
  field: z.string().min(1).max(255),
  number: z.number().int().positive()
});

const validated = schema.parse(body);
```

### Secure Database Query Pattern
```typescript
const result = await db
  .select()
  .from(table)
  .where(and(
    eq(table.user_id, userId),
    isNull(table.deleted_at)
  ))
  .limit(1);
```
