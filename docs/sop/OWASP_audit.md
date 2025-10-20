# OWASP Security Audit & Verification Guide
## Next.js 15 / React 19 / Node 24 / PostgreSQL 17

**Version:** 1.0  
**Last Updated:** 2025  
**Purpose:** Complete security audit checklist for external OWASP compliance verification

---

## Table of Contents

1. [Pre-Audit Preparation](#pre-audit-preparation)
2. [OWASP Top 10 (2021) Verification](#owasp-top-10-verification)
3. [Next.js Specific Security Checks](#nextjs-specific-checks)
4. [React 19 Security Checks](#react-security-checks)
5. [PostgreSQL Security Checks](#postgresql-checks)
6. [Infrastructure & Deployment](#infrastructure-deployment)
7. [Documentation Requirements](#documentation-requirements)
8. [Testing Requirements](#testing-requirements)
9. [Audit Evidence Collection](#audit-evidence)

---

## Pre-Audit Preparation

### Required Documentation to Prepare

- [ ] **Architecture Diagram** showing data flow from client → Next.js → PostgreSQL
- [ ] **Authentication & Authorization Model** documentation
- [ ] **API Route Inventory** with authentication/authorization requirements per endpoint
- [ ] **Third-party Dependencies List** with version numbers and security scanning results
- [ ] **Environment Configuration Documentation** (all environment variables explained)
- [ ] **Database Schema** with sensitive data fields identified
- [ ] **Deployment Architecture** (CDN, load balancers, firewalls, etc.)
- [ ] **Incident Response Plan** for security breaches
- [ ] **Data Classification Policy** (what data is PII, financial, etc.)
- [ ] **Access Control Matrix** (who can access what)

### Tools to Have Ready

- [ ] Dependency scanner results (npm audit, Snyk, or Dependabot)
- [ ] Static analysis tool results (ESLint security plugins, SonarQube, Semgrep)
- [ ] SAST (Static Application Security Testing) results
- [ ] DAST (Dynamic Application Security Testing) results if available
- [ ] Penetration test results if previously conducted
- [ ] Log aggregation tool access (CloudWatch, Datadog, etc.)
- [ ] Database query logs enabled and accessible
- [ ] Git commit history showing security-related changes

---

## OWASP Top 10 (2021) Verification

## A01:2021 – Broken Access Control

### Authentication Verification

**Session Management:**
- [ ] Verify sessions are stored server-side (Redis, PostgreSQL, not JWT for sessions)
- [ ] Check session tokens are cryptographically random (minimum 128-bit entropy)
- [ ] Confirm session tokens are transmitted only via secure, HttpOnly cookies
- [ ] Verify session timeout values are appropriate (idle timeout + absolute timeout)
- [ ] Check that logout properly invalidates sessions server-side
- [ ] Verify concurrent session limits are enforced per user
- [ ] Confirm session fixation attacks are prevented (new session ID after login)
- [ ] Check that session tokens are regenerated after privilege escalation

**Password Security:**
- [ ] Verify passwords are hashed using bcrypt, Argon2, or scrypt (NOT MD5, SHA1, or plain SHA256)
- [ ] Confirm bcrypt cost factor is 12 or higher (or Argon2 equivalent)
- [ ] Check password minimum length requirements (12+ characters recommended)
- [ ] Verify password complexity requirements exist and are enforced
- [ ] Confirm password breach checking (Have I Been Pwned API or similar)
- [ ] Check that password reset tokens are single-use and expire within 15-60 minutes
- [ ] Verify password reset tokens are cryptographically random
- [ ] Confirm old password is required for password changes

**Multi-Factor Authentication (MFA):**
- [ ] Check if MFA is available (TOTP, SMS, hardware keys)
- [ ] Verify MFA is enforced for administrative accounts
- [ ] Confirm MFA codes are single-use (not replayable)
- [ ] Check MFA backup codes exist and are properly secured
- [ ] Verify MFA setup flow requires current password/session verification

### Authorization Verification

**API Route Protection:**
- [ ] Verify ALL API routes have authentication checks (no unprotected routes except public endpoints)
- [ ] Check that authentication middleware runs before route handlers
- [ ] Confirm authorization checks happen after authentication (who can do what)
- [ ] Verify direct object references are validated (user can only access their own data)
- [ ] Check that ID parameters are validated against authenticated user's permissions
- [ ] Confirm horizontal privilege escalation is prevented (user A can't access user B's data)
- [ ] Verify vertical privilege escalation is prevented (user can't access admin functions)
- [ ] Check that API routes validate both authentication AND authorization on every request

**Role-Based Access Control (RBAC):**
- [ ] Verify roles are defined and documented (admin, user, viewer, etc.)
- [ ] Check permissions are assigned to roles, not directly to users
- [ ] Confirm role checks happen server-side (not client-side only)
- [ ] Verify users can only have authorized roles assigned
- [ ] Check that role changes require appropriate authorization
- [ ] Confirm audit logging exists for role/permission changes

**Resource Access Validation:**
- [ ] Verify every database query includes user ID or permission filter
- [ ] Check that file uploads are restricted by user permissions
- [ ] Confirm API rate limiting is implemented per user/IP
- [ ] Verify cross-tenant data access is impossible in multi-tenant scenarios
- [ ] Check that administrative endpoints require admin role verification
- [ ] Confirm batch operations validate permissions for each item

**Client-Side Protection (Defense in Depth):**
- [ ] Verify UI elements are hidden based on permissions (but NOT relied upon for security)
- [ ] Check that client-side route guards exist but are complemented by server checks
- [ ] Confirm API responses don't leak unauthorized data in error messages

---

## A02:2021 – Cryptographic Failures

### Data at Rest

**Database Encryption:**
- [ ] Verify PostgreSQL connection uses SSL/TLS (sslmode=require or verify-full)
- [ ] Check that database credentials are stored in environment variables or secrets manager
- [ ] Confirm sensitive columns are encrypted at application level if required (credit cards, SSNs)
- [ ] Verify encryption keys are stored separately from encrypted data
- [ ] Check that database backups are encrypted
- [ ] Confirm RDS/managed database encryption at rest is enabled

**Sensitive Data Identification:**
- [ ] Verify all PII (Personally Identifiable Information) is identified in schema
- [ ] Check that payment information is not stored (or is PCI-DSS compliant if stored)
- [ ] Confirm passwords are never stored in plaintext anywhere
- [ ] Verify API keys and secrets are never committed to Git
- [ ] Check that sensitive data has appropriate retention policies

### Data in Transit

**HTTPS/TLS:**
- [ ] Verify application enforces HTTPS for all connections (no HTTP allowed)
- [ ] Check TLS version is 1.2 or 1.3 minimum (TLS 1.0/1.1 disabled)
- [ ] Confirm HSTS (HTTP Strict Transport Security) header is set with long max-age
- [ ] Verify SSL certificate is valid and not self-signed in production
- [ ] Check that mixed content warnings don't exist (all resources loaded via HTTPS)
- [ ] Confirm certificate pinning is implemented for mobile apps if applicable

**API Communication:**
- [ ] Verify internal service-to-service communication uses TLS
- [ ] Check that database connections use SSL/TLS
- [ ] Confirm Redis/cache connections use TLS if over network
- [ ] Verify third-party API calls use HTTPS
- [ ] Check that webhook callbacks validate TLS certificates

### Key Management

**Secrets Storage:**
- [ ] Verify no hardcoded secrets, API keys, or passwords in source code
- [ ] Check .env files are in .gitignore and never committed
- [ ] Confirm production secrets are stored in AWS Secrets Manager, HashiCorp Vault, or similar
- [ ] Verify secrets are rotated periodically (document rotation schedule)
- [ ] Check that expired/revoked secrets are properly removed
- [ ] Confirm separate secrets for dev, staging, production environments

**Encryption Keys:**
- [ ] Verify encryption keys are cryptographically random and appropriate length
- [ ] Check keys are stored separately from encrypted data
- [ ] Confirm key rotation procedures exist and are documented
- [ ] Verify application can handle key rotation without downtime

---

## A03:2021 – Injection

### SQL Injection Prevention

**Query Parameterization:**
- [ ] Verify ALL database queries use parameterized queries or prepared statements
- [ ] Check that no string concatenation is used to build SQL queries
- [ ] Confirm ORM (Prisma, TypeORM, etc.) is used correctly (no raw queries without params)
- [ ] Verify dynamic table/column names are validated against whitelist
- [ ] Check that LIMIT/OFFSET values are properly sanitized
- [ ] Confirm ORDER BY column names are whitelisted, not user-controlled

**Input Validation:**
- [ ] Verify all user inputs to database queries are validated (type, length, format)
- [ ] Check that numeric IDs are parsed as integers and validated
- [ ] Confirm UUIDs are validated against proper format
- [ ] Verify email addresses are validated before database queries
- [ ] Check that special characters in search queries are properly escaped

**Database Permissions:**
- [ ] Verify application database user has minimal required permissions (no DROP, ALTER in production)
- [ ] Check that different users exist for read-only vs. write operations if applicable
- [ ] Confirm stored procedures have proper permission boundaries

### NoSQL Injection (if using JSON queries)

- [ ] Verify MongoDB/JSON query operators are not directly user-controlled
- [ ] Check that JSON schema validation exists for API inputs
- [ ] Confirm filter objects are constructed safely, not from direct user input

### Command Injection

**System Commands:**
- [ ] Verify no user input is passed to child_process.exec() or similar
- [ ] Check that file system operations don't use user-controlled paths directly
- [ ] Confirm shell commands are avoided; if necessary, use parameterized execution
- [ ] Verify file uploads don't trigger command execution

**Path Traversal:**
- [ ] Check that file paths are validated and sanitized
- [ ] Verify ../ sequences are blocked or path is canonicalized
- [ ] Confirm file access is restricted to specific directories
- [ ] Check that file download endpoints validate paths against whitelist

### Server-Side Template Injection

- [ ] Verify user input is not directly embedded in template strings
- [ ] Check that email templates use safe rendering (no eval, no direct string interpolation)
- [ ] Confirm React/JSX escapes user content automatically (verify no dangerouslySetInnerHTML with user input)

### XPath/XML Injection (if applicable)

- [ ] Verify XML parsing uses safe parser configuration
- [ ] Check that XPath queries are parameterized if used
- [ ] Confirm XML external entity (XXE) attacks are prevented

---

## A04:2021 – Insecure Design

### Architecture Review

**Threat Modeling:**
- [ ] Verify threat model exists documenting attack surfaces
- [ ] Check that trust boundaries are clearly defined
- [ ] Confirm data flow diagrams show sensitive data paths
- [ ] Verify assumptions about security controls are documented

**Secure Design Principles:**
- [ ] Check that principle of least privilege is applied throughout
- [ ] Verify defense in depth strategy (multiple layers of security)
- [ ] Confirm fail-secure defaults (deny by default, allow explicitly)
- [ ] Check that security requirements were defined during design phase
- [ ] Verify separation of duties for administrative functions

**Business Logic Security:**
- [ ] Verify critical business flows have been analyzed for abuse cases
- [ ] Check that race conditions in transactions are handled (database locks, optimistic locking)
- [ ] Confirm monetary transactions are atomic and consistent
- [ ] Verify limits exist on sensitive operations (daily withdrawal limits, etc.)
- [ ] Check that business logic can't be bypassed by repeating/skipping steps
- [ ] Confirm state machines for workflows are enforced server-side

**Rate Limiting & Resource Controls:**
- [ ] Verify rate limiting exists on authentication endpoints
- [ ] Check rate limits on API endpoints prevent abuse
- [ ] Confirm file upload size limits are enforced
- [ ] Verify pagination limits prevent large data exports
- [ ] Check that expensive operations have appropriate throttling
- [ ] Confirm CAPTCHA or similar protection on public forms

---

## A05:2021 – Security Misconfiguration

### Next.js Configuration

**next.config.js Security:**
- [ ] Verify `reactStrictMode: true` is enabled
- [ ] Check that security headers are configured (see Security Headers section)
- [ ] Confirm `poweredByHeader: false` to remove X-Powered-By header
- [ ] Verify image optimization domains are whitelisted, not allowing arbitrary URLs
- [ ] Check that redirects/rewrites don't create open redirect vulnerabilities
- [ ] Confirm environment variables are properly scoped (NEXT_PUBLIC_ prefix only for client-safe vars)

**Environment-Specific Settings:**
- [ ] Verify development tools are disabled in production (React DevTools, debug logs)
- [ ] Check that source maps are disabled or protected in production
- [ ] Confirm verbose error messages are disabled in production
- [ ] Verify different configurations exist for dev/staging/production
- [ ] Check that test/debug endpoints are disabled in production

### Security Headers

**Required Headers:**
- [ ] Verify `Strict-Transport-Security` header is set (HSTS with min 1 year max-age)
- [ ] Check `X-Frame-Options: DENY` or `SAMEORIGIN` is set
- [ ] Confirm `X-Content-Type-Options: nosniff` is present
- [ ] Verify `Referrer-Policy` is set appropriately (no-referrer or strict-origin-when-cross-origin)
- [ ] Check `Permissions-Policy` restricts dangerous features (geolocation, camera, microphone)
- [ ] Confirm Content-Security-Policy (CSP) is configured (see CSP section below)

**Content Security Policy (CSP):**
- [ ] Verify CSP header exists and is not set to `unsafe-inline` or `unsafe-eval` without justification
- [ ] Check that script-src restricts inline scripts (use nonces or hashes)
- [ ] Confirm style-src is appropriately restricted
- [ ] Verify img-src doesn't allow data: URIs unless necessary
- [ ] Check connect-src restricts API endpoints to expected domains
- [ ] Confirm frame-ancestors prevents clickjacking
- [ ] Verify CSP violations are logged/monitored
- [ ] Check that CSP doesn't break legitimate application functionality

### Server Configuration

**Node.js/Express:**
- [ ] Verify Node.js version is current and supported (Node 24 LTS)
- [ ] Check that Express (if used) security headers middleware is configured
- [ ] Confirm server doesn't expose version information
- [ ] Verify request body size limits are set
- [ ] Check that compression settings don't enable BREACH attacks
- [ ] Confirm cookie parser is configured with secure settings

**Default Credentials:**
- [ ] Verify no default/demo accounts exist in production
- [ ] Check that database admin accounts use strong, unique passwords
- [ ] Confirm no shared developer accounts exist
- [ ] Verify AWS/cloud credentials are rotated and user-specific

**Error Handling:**
- [ ] Verify stack traces are not exposed to users in production
- [ ] Check that error messages don't reveal sensitive information (database structure, file paths)
- [ ] Confirm generic error messages for authentication failures (don't reveal if username exists)
- [ ] Verify detailed errors are logged server-side but not sent to client

**Unnecessary Features:**
- [ ] Check that unused API routes are removed or disabled
- [ ] Verify unnecessary dependencies are not installed
- [ ] Confirm debug endpoints are removed
- [ ] Check that admin panels are properly protected or removed if not needed
- [ ] Verify sample/test data is not present in production

---

## A06:2021 – Vulnerable and Outdated Components

### Dependency Management

**NPM Packages:**
- [ ] Verify `npm audit` shows zero high/critical vulnerabilities
- [ ] Check that all dependencies are at current stable versions
- [ ] Confirm no deprecated packages are in use
- [ ] Verify automated dependency scanning is configured (Dependabot, Snyk, etc.)
- [ ] Check that package-lock.json is committed and used for reproducible builds
- [ ] Confirm no packages with known security issues are present
- [ ] Verify licenses for all dependencies are compatible with project

**Direct Dependencies:**
- [ ] Check Next.js is at 15.x latest patch version
- [ ] Verify React is at 19.x latest patch version
- [ ] Confirm Node.js is at 24.x LTS latest patch version
- [ ] Check PostgreSQL client library is current version
- [ ] Verify authentication libraries are current (Passport, NextAuth, etc.)
- [ ] Confirm all AWS SDK packages are current if used

**Transitive Dependencies:**
- [ ] Verify no critical vulnerabilities in sub-dependencies
- [ ] Check that dependency tree doesn't include known vulnerable versions
- [ ] Confirm npm audit fix or npm update resolves issues

**Update Policy:**
- [ ] Verify documented policy for updating dependencies
- [ ] Check that security updates are applied within defined SLA (e.g., 7 days for critical)
- [ ] Confirm testing process exists for dependency updates
- [ ] Verify rollback plan exists if updates cause issues

### Runtime Environment

**Node.js:**
- [ ] Verify Node 24 LTS is used consistently across all environments
- [ ] Check for known vulnerabilities in Node.js version
- [ ] Confirm Node.js is kept updated to latest patch version
- [ ] Verify no unsupported Node.js versions in use anywhere

**Operating System:**
- [ ] Check that base OS images are current (if using containers)
- [ ] Verify security patches are applied regularly
- [ ] Confirm no end-of-life OS versions in use

**Third-Party Services:**
- [ ] Verify AWS services are using current SDKs
- [ ] Check that API integrations are using latest stable versions
- [ ] Confirm monitoring tools are current

---

## A07:2021 – Identification and Authentication Failures

### Authentication Implementation

**Login Mechanism:**
- [ ] Verify multi-factor authentication is available and enforced for sensitive accounts
- [ ] Check that account lockout exists after N failed login attempts (5-10 recommended)
- [ ] Confirm lockout duration is reasonable (15-30 minutes) or requires manual unlock
- [ ] Verify brute force protection via rate limiting on login endpoint
- [ ] Check that timing attacks are prevented (constant-time comparison for passwords)
- [ ] Confirm username enumeration is prevented (same error for invalid user and invalid password)
- [ ] Verify CAPTCHA or similar challenge after failed attempts

**Password Recovery:**
- [ ] Check that password reset requires email verification
- [ ] Verify reset tokens are single-use and expire quickly (15-60 minutes)
- [ ] Confirm old password can't be reused (password history of 5-10)
- [ ] Check that security questions are not used (or are properly implemented if required)
- [ ] Verify password reset doesn't reveal if account exists
- [ ] Confirm reset process requires current session termination

**Session Management:**
- [ ] Verify session IDs are never in URLs (cookie-based only)
- [ ] Check that concurrent sessions are limited or monitored
- [ ] Confirm session regeneration after login, privilege change, logout
- [ ] Verify absolute session timeout exists (e.g., 8 hours)
- [ ] Check idle timeout is enforced (e.g., 30 minutes of inactivity)
- [ ] Confirm logout invalidates session server-side, not just client-side
- [ ] Verify "remember me" functionality uses separate long-lived token with lower privileges

**Credential Storage:**
- [ ] Verify passwords are salted and hashed with strong algorithm (bcrypt cost 12+)
- [ ] Check that password hashes are never logged or transmitted
- [ ] Confirm API keys/tokens are stored hashed if applicable
- [ ] Verify no plaintext passwords exist anywhere (logs, database, config files)

### OAuth/SSO (if implemented)

- [ ] Verify OAuth state parameter is used to prevent CSRF
- [ ] Check that authorization codes are single-use
- [ ] Confirm PKCE (Proof Key for Code Exchange) is used for public clients
- [ ] Verify redirect URIs are strictly validated (no open redirects)
- [ ] Check that JWT tokens are properly validated (signature, issuer, audience, expiration)
- [ ] Confirm scope limitations are enforced

---

## A08:2021 – Software and Data Integrity Failures

### Build Pipeline Security

**Source Code Integrity:**
- [ ] Verify Git repository requires signed commits for production deployments
- [ ] Check that code review is required before merging to main branch
- [ ] Confirm branch protection rules are enforced
- [ ] Verify no direct commits to production branch
- [ ] Check that CI/CD pipeline validates code before deployment

**Dependency Integrity:**
- [ ] Verify package-lock.json ensures reproducible builds
- [ ] Check that npm dependencies are verified (npm signatures)
- [ ] Confirm supply chain attack protection (lock file integrity)
- [ ] Verify private packages are hosted on trusted registry
- [ ] Check that dependencies come from npm, not arbitrary URLs

**Build Artifacts:**
- [ ] Verify build process is automated and reproducible
- [ ] Check that build artifacts are versioned and tagged
- [ ] Confirm build environment is isolated and secure
- [ ] Verify artifacts are scanned for vulnerabilities before deployment
- [ ] Check that production builds are separate from development builds

### Deployment Security

**Code Signing:**
- [ ] Verify deployment packages are signed
- [ ] Check that signature verification happens during deployment
- [ ] Confirm only authorized personnel can sign production releases

**Update Mechanism:**
- [ ] Verify auto-update mechanisms validate signatures
- [ ] Check that rollback capability exists for bad deployments
- [ ] Confirm deployment process includes health checks
- [ ] Verify canary or blue-green deployment strategy reduces risk

### Deserialization

**Data Parsing:**
- [ ] Verify JSON.parse() is used, not eval() for JSON
- [ ] Check that untrusted data is validated after deserialization
- [ ] Confirm no pickle/YAML/XML deserialization of untrusted data without validation
- [ ] Verify file uploads are validated before processing
- [ ] Check that uploaded files are scanned for malware

---

## A09:2021 – Security Logging and Monitoring Failures

### Logging Implementation

**What to Log:**
- [ ] Verify all authentication events are logged (login, logout, failed attempts)
- [ ] Check that authorization failures are logged (access denied events)
- [ ] Confirm input validation failures are logged
- [ ] Verify administrative actions are logged with full audit trail
- [ ] Check that security-relevant errors are logged (CSP violations, rate limit hits)
- [ ] Confirm changes to user accounts/permissions are logged
- [ ] Verify high-value transactions are logged
- [ ] Check that suspicious activity patterns are logged

**What NOT to Log:**
- [ ] Verify passwords are NEVER logged (even hashed ones)
- [ ] Check that session tokens are not logged
- [ ] Confirm credit card numbers are not logged (PCI-DSS compliance)
- [ ] Verify API keys/secrets are not in logs
- [ ] Check that full request/response bodies with PII are not logged

**Log Content:**
- [ ] Verify logs include timestamp (with timezone)
- [ ] Check logs include user ID or IP address
- [ ] Confirm logs include action/event type
- [ ] Verify logs include outcome (success/failure)
- [ ] Check logs include relevant context (resource accessed, error details)
- [ ] Confirm logs use structured format (JSON recommended)

**Log Storage:**
- [ ] Verify logs are centralized (CloudWatch, Datadog, ELK, etc.)
- [ ] Check that logs are retained for appropriate duration (90+ days for security logs)
- [ ] Confirm logs are backed up and protected from tampering
- [ ] Verify log access is restricted to authorized personnel
- [ ] Check that logs are encrypted at rest and in transit

### Monitoring & Alerting

**Security Monitoring:**
- [ ] Verify automated monitoring for failed login attempts (threshold alerting)
- [ ] Check for monitoring of privilege escalation attempts
- [ ] Confirm monitoring of unusual data access patterns
- [ ] Verify SQL injection attempts are detected and alerted
- [ ] Check for monitoring of suspicious file uploads
- [ ] Confirm rate limit violations trigger alerts
- [ ] Verify infrastructure changes are monitored (new instances, config changes)

**Alert Configuration:**
- [ ] Check that critical security alerts go to on-call team immediately
- [ ] Verify alert thresholds are tuned to minimize false positives
- [ ] Confirm alerts include actionable information
- [ ] Check that alert fatigue is avoided (not too many alerts)
- [ ] Verify escalation procedures exist for unacknowledged alerts

**Incident Response:**
- [ ] Verify incident response plan exists and is documented
- [ ] Check that security incidents have defined severity levels
- [ ] Confirm runbooks exist for common security scenarios
- [ ] Verify contact information for security team is current
- [ ] Check that post-incident review process exists

---

## A10:2021 – Server-Side Request Forgery (SSRF)

### URL/API Request Validation

**External Requests:**
- [ ] Verify all user-provided URLs are validated before making requests
- [ ] Check that URL scheme is restricted (only http/https, not file://, gopher://, etc.)
- [ ] Confirm requests to internal IPs are blocked (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- [ ] Verify requests to localhost/127.0.0.1 are blocked
- [ ] Check that DNS rebinding attacks are prevented
- [ ] Confirm URL redirects are followed carefully (max redirect limit, validate each hop)

**Webhooks/Callbacks:**
- [ ] Verify webhook URLs are validated before use
- [ ] Check that webhook destinations are on allow-list if possible
- [ ] Confirm internal services can't be reached via webhooks
- [ ] Verify webhook responses are treated as untrusted data

**File Fetching:**
- [ ] Check that file fetch operations validate URLs
- [ ] Verify image proxying doesn't allow internal resource access
- [ ] Confirm PDF generation from URLs validates destinations
- [ ] Check that import functionality doesn't fetch from internal URLs

**API Integrations:**
- [ ] Verify third-party API endpoints are hardcoded or from trusted config
- [ ] Check that user input doesn't control API endpoint URLs
- [ ] Confirm service-to-service communication uses authentication

---

## Next.js Specific Security Checks

### Server Components & Actions (Next.js 15)

**Server Components:**
- [ ] Verify sensitive operations only happen in Server Components, not Client Components
- [ ] Check that API keys and secrets are only imported in Server Components
- [ ] Confirm Server Components don't leak sensitive data to client
- [ ] Verify environment variables are properly scoped (NEXT_PUBLIC_ vs server-only)

**Server Actions:**
- [ ] Verify all Server Actions validate authentication/authorization
- [ ] Check that Server Actions validate and sanitize all inputs
- [ ] Confirm Server Actions use CSRF protection (built-in Next.js token)
- [ ] Verify Server Actions don't return sensitive data unnecessarily
- [ ] Check that Server Actions handle errors securely (no stack traces to client)
- [ ] Confirm rate limiting is applied to Server Actions

**Route Handlers (API Routes):**
- [ ] Verify route handlers validate HTTP methods (GET, POST, etc.)
- [ ] Check that route handlers validate authentication on every request
- [ ] Confirm route handlers validate authorization for resources
- [ ] Verify route handlers sanitize inputs
- [ ] Check that route handlers use appropriate HTTP status codes
- [ ] Confirm route handlers don't expose internal errors

### Middleware Security

**Middleware Configuration:**
- [ ] Verify middleware applies security headers to all routes
- [ ] Check that authentication middleware runs on protected routes
- [ ] Confirm CSRF protection is implemented for state-changing operations
- [ ] Verify rate limiting middleware is configured
- [ ] Check that middleware matcher patterns are secure (no accidental exclusions)

### Static vs Dynamic Routes

**Static Generation:**
- [ ] Verify static pages don't contain sensitive data
- [ ] Check that build-time data fetching doesn't expose secrets
- [ ] Confirm static pages are regenerated when needed (ISR if applicable)

**Dynamic Routes:**
- [ ] Verify dynamic route parameters are validated (type, format, range)
- [ ] Check that dynamic routes enforce authorization
- [ ] Confirm catch-all routes don't create security holes

### Image Optimization

**Next.js Image Component:**
- [ ] Verify image domains are whitelisted in next.config.js
- [ ] Check that image URLs don't allow arbitrary external sources
- [ ] Confirm image optimization doesn't create SSRF vulnerability
- [ ] Verify uploaded images are validated (file type, size, dimensions)
- [ ] Check that image metadata is stripped (EXIF data may contain sensitive info)

---

## React 19 Security Checks

### XSS Prevention

**JSX Rendering:**
- [ ] Verify dangerouslySetInnerHTML is avoided or has strict sanitization
- [ ] Check that user input is not rendered in script tags
- [ ] Confirm HTML sanitization library (DOMPurify) is used if needed
- [ ] Verify markdown rendering uses safe parser
- [ ] Check that href attributes don't allow javascript: protocol
- [ ] Confirm event handler props don't accept user input directly

**Client-Side Rendering:**
- [ ] Verify user-generated content is escaped before rendering
- [ ] Check that URL parameters are validated before use in UI
- [ ] Confirm localStorage/sessionStorage values are validated before use
- [ ] Verify window.location is not controlled by user input

### Component Security

**Props Validation:**
- [ ] Verify PropTypes or TypeScript ensures type safety
- [ ] Check that component props are validated before use
- [ ] Confirm sensitive operations validate prop values

**State Management:**
- [ ] Verify sensitive data isn't stored in client-side state unnecessarily
- [ ] Check that Redux/Zustand stores don't contain secrets
- [ ] Confirm authentication tokens are stored securely (httpOnly cookies, not localStorage)

**Third-Party Components:**
- [ ] Verify all React component libraries are from trusted sources
- [ ] Check that third-party components are current versions
- [ ] Confirm no known vulnerabilities in UI component libraries

---

## PostgreSQL Security Checks

### Database Configuration

**Access Control:**
- [ ] Verify PostgreSQL only accepts connections from application servers (firewall rules)
- [ ] Check that pg_hba.conf restricts connections appropriately
- [ ] Confirm password authentication is required (not trust)
- [ ] Verify SSL/TLS is required for all connections
- [ ] Check that public schema permissions are restricted
- [ ] Confirm database superuser is not used by application

**Connection Security:**
- [ ] Verify connection strings use SSL mode (sslmode=require or verify-full)
- [ ] Check that connection pooling is configured securely
- [ ] Confirm connection limits prevent resource exhaustion
- [ ] Verify idle connections are closed after timeout

**Database User Permissions:**
- [ ] Verify application database user has minimal required permissions
- [ ] Check that application user cannot DROP or ALTER tables in production
- [ ] Confirm separate read-only user exists if needed
- [ ] Verify application user cannot access system tables unnecessarily
- [ ] Check that database roles follow principle of least privilege

### Data Protection

**Encryption:**
- [ ] Verify PostgreSQL data-at-rest encryption is enabled (AWS RDS encryption, etc.)
- [ ] Check that backups are encrypted
- [ ] Confirm sensitive columns use application-level encryption if required
- [ ] Verify encryption keys are managed separately from data

**Backup Security:**
- [ ] Verify automated backups are configured
- [ ] Check that backups are encrypted
- [ ] Confirm backup retention policy is appropriate
- [ ] Verify backup restoration is tested regularly
- [ ] Check that backups are stored in separate location from primary

**Audit Logging:**
- [ ] Verify pgaudit or similar logging extension is enabled
- [ ] Check that DDL operations are logged (CREATE, ALTER, DROP)
- [ ] Confirm permission changes are logged
- [ ] Verify failed authentication attempts are logged
- [ ] Check that query logging is configured for sensitive tables

---

## Infrastructure & Deployment Security

### Cloud Security (AWS/Azure/GCP)

**IAM/Access Management:**
- [ ] Verify principle of least privilege for all IAM roles
- [ ] Check that root account is not used for deployments
- [ ] Confirm MFA is required for all human users
- [ ] Verify service accounts have minimal required permissions
- [ ] Check that IAM policies are reviewed regularly
- [ ] Confirm access keys are rotated regularly

**Network Security:**
- [ ] Verify VPC is properly configured with private/public subnets
- [ ] Check that security groups follow least privilege (minimal open ports)
- [ ] Confirm network ACLs are configured appropriately
- [ ] Verify database is in private subnet (not publicly accessible)
- [ ] Check that bastion host or VPN is required for database access
- [ ] Confirm CloudFront or CDN is configured with security headers

**Resource Configuration:**
- [ ] Verify S3 buckets are not publicly accessible unless intended
- [ ] Check that CloudWatch logging is enabled for all resources
- [ ] Confirm GuardDuty or security monitoring is active
- [ ] Verify Config Rules monitor compliance
- [ ] Check that CloudTrail logs all API calls
- [ ] Confirm encryption is enabled for all storage services

### Container Security (if applicable)

**Docker Images:**
- [ ] Verify base images are from trusted sources (official images)
- [ ] Check that images are scanned for vulnerabilities
- [ ] Confirm images don't run as root user
- [ ] Verify secrets are not baked into images
- [ ] Check that image tags are specific (not :latest)

**Container Runtime:**
- [ ] Verify containers run with minimal privileges
- [ ] Check that sensitive host directories are not mounted
- [ ] Confirm resource limits are set (CPU, memory)
- [ ] Verify network policies restrict container communication

### CI/CD Pipeline Security

**Pipeline Access:**
- [ ] Verify CI/CD credentials are secured (not in repository)
- [ ] Check that pipeline secrets are encrypted
- [ ] Confirm only authorized users can trigger production deployments
- [ ] Verify deployment requires approval for production

**Build Process:**
- [ ] Check that dependencies are verified during build
- [ ] Confirm security scanning runs on every build
- [ ] Verify tests include security tests
- [ ] Check that build artifacts are signed
- [ ] Confirm build logs don't contain secrets

---

## Documentation Requirements

### Security Documentation

- [ ] **Security Architecture Document** describing all security controls
- [ ] **Authentication/Authorization Model** documenting roles, permissions, flows
- [ ] **Data Classification Policy** identifying sensitive data and protection requirements
- [ ] **Encryption Key Management** documenting key storage, rotation, and access
- [ ] **Incident Response Plan** with contacts, procedures, and escalation
- [ ] **Security Training Records** showing team has received security training
- [ ] **Third-Party Security Assessments** (penetration tests, audits)
- [ ] **Compliance Documentation** (GDPR, SOC 2, PCI-DSS if applicable)
- [ ] **Change Management Process** for security-related changes
- [ ] **Vulnerability Management Policy** documenting patching SLAs

### Code Documentation

- [ ] **Security Comments** in code explaining security-sensitive decisions
- [ ] **Input Validation Rules** documented per endpoint
- [ ] **Authentication Flows** documented with sequence diagrams
- [ ] **Authorization Matrix** showing who can access what
- [ ] **Dependency Update Policy** with schedule and testing procedures

---

## Testing Requirements

### Security Testing to Perform

**Automated Testing:**
- [ ] **Unit Tests** for authentication and authorization logic
- [ ] **Integration Tests** validating security controls end-to-end
- [ ] **Dependency Scanning** (npm audit, Snyk) in CI/CD
- [ ] **Static Analysis** (ESLint security rules, Semgrep, SonarQube)
- [ ] **Secret Scanning** (git-secrets, TruffleHog) to find committed secrets
- [ ] **Container Scanning** if using Docker

**Manual Testing:**
- [ ] **Code Review** focusing on security-sensitive areas
- [ ] **Authentication Testing** (bypass attempts, session hijacking)
- [ ] **Authorization Testing** (horizontal/vertical privilege escalation)
- [ ] **Input Validation Testing** (SQL injection, XSS, command injection)
- [ ] **Session Management Testing** (fixation, timeout, logout)
- [ ] **CSRF Testing** on state-changing operations
- [ ] **Error Handling Testing** (information disclosure)
- [ ] **File Upload Testing** (malicious files, path traversal)

**External Testing:**
- [ ] **Penetration Testing** by qualified third party (recommended annually)
- [ ] **Vulnerability Assessment** using automated scanners
- [ ] **Red Team Exercise** if applicable for high-security environments

---

## Audit Evidence Collection

### Evidence to Provide to Auditor

**Configuration Evidence:**
- [ ] Screenshots of security headers from production
- [ ] Database connection string configuration (redact credentials)
- [ ] next.config.js security settings
- [ ] Middleware configuration showing authentication enforcement
- [ ] CSP policy configuration
- [ ] Rate limiting configuration

**Code Evidence:**
- [ ] Sample authentication/authorization code
- [ ] Database query examples showing parameterization
- [ ] Password hashing implementation
- [ ] Session management implementation
- [ ] Input validation examples

**Testing Evidence:**
- [ ] npm audit results (zero critical/high)
- [ ] Static analysis results
- [ ] Test coverage reports showing security tests
- [ ] Penetration test report (if available)

**Operational Evidence:**
- [ ] CloudWatch logs showing security event logging
- [ ] Incident response plan document
- [ ] Dependency update history (Git commits)
- [ ] Security training completion records

**Compliance Evidence:**
- [ ] AWS Config compliance reports
- [ ] Database encryption verification
- [ ] Backup verification
- [ ] Access control documentation

---

## Remediation Tracking

### Issue Management

For each finding during audit:

- [ ] **Document Issue** with severity (Critical, High, Medium, Low)
- [ ] **Assign Owner** responsible for remediation
- [ ] **Set Due Date** based on severity (Critical: 7 days, High: 30 days, Medium: 90 days)
- [ ] **Create Remediation Plan** with specific steps
- [ ] **Track Progress** in ticketing system (Jira, Linear, etc.)
- [ ] **Verify Fix** with testing
- [ ] **Document Fix** with code changes and reasoning
- [ ] **Re-test** to ensure issue is resolved
- [ ] **Close Issue** with sign-off from security team

---

## Pre-Audit Checklist

**One Week Before Audit:**

- [ ] Run all automated security scans and fix critical/high issues
- [ ] Review and update all security documentation
- [ ] Ensure all team members are aware of audit scope
- [ ] Prepare evidence package for auditor
- [ ] Test all authentication/authorization flows
- [ ] Review production logs for suspicious activity
- [ ] Verify backups and disaster recovery procedures
- [ ] Confirm all production secrets are properly secured

**Day Before Audit:**

- [ ] Final npm audit check (zero critical/high vulnerabilities)
- [ ] Verify production environment matches documented configuration
- [ ] Confirm all team members are available for questions
- [ ] Have runbook ready for demonstrating security controls
- [ ] Prepare screen-sharing environment for code review

---

## Post-Audit Actions

**After Receiving Audit Report:**

- [ ] Review all findings with development team
- [ ] Prioritize remediation based on severity
- [ ] Create tickets for each finding
- [ ] Establish remediation timeline
- [ ] Schedule follow-up audit or verification
- [ ] Update security documentation based on learnings
- [ ] Conduct team retrospective on security practices
- [ ] Update secure development training based on findings

---

**This document should be used as a comprehensive checklist. Each item should be verified and documented with evidence. Any "No" or "Uncertain" responses should be flagged for remediation before the external audit.**