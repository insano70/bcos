# BendCare OS (BCOS)

Enterprise-grade healthcare operations platform built with Next.js 15, featuring advanced RBAC, multi-factor authentication, and AWS infrastructure deployment.

## Overview

BendCare OS is a comprehensive healthcare practice management system designed for multi-organization environments. It provides secure authentication, flexible work item management, analytics dashboards, and administrative controls with enterprise-level security features.

## Tech Stack

### Core Technologies
- **Framework**: Next.js 15.5.3 (App Router)
- **Runtime**: Node.js 24
- **Language**: TypeScript 5.9.3 (strict mode)
- **UI Library**: React 19.1.1
- **Styling**: Tailwind CSS 4.1.14
- **State Management**: TanStack Query 5.90

### Backend & Database
- **Database**: PostgreSQL 17 on AWS RDS
- **ORM**: Drizzle ORM 0.44
- **Cache**: AWS Elasticache (Valkey/Redis-compatible) with IORedis 5.8
- **Session Management**: Iron Session 8.0

### Security & Authentication
- **Authentication Methods**:
  - Password-based with bcrypt 6.0
  - SAML 2.0 (Microsoft Entra ID)
  - OpenID Connect (Microsoft Entra ID)
  - WebAuthn/Passkeys (SimpleWebAuthn 13.2)
- **Multi-Factor Authentication**: TOTP, WebAuthn
- **Authorization**: Custom RBAC with granular permissions
- **Security**: JWT tokens (jose 6.1), CSRF protection, rate limiting
- **Session Security**: Encrypted sessions, device fingerprinting, step-up authentication

### Infrastructure & Deployment
- **Cloud Provider**: AWS
- **Container Orchestration**: ECS Fargate
- **Infrastructure as Code**: AWS CDK
- **Load Balancing**: Application Load Balancer (ALB)
- **Storage**: AWS S3 with presigned URLs
- **Logging**: CloudWatch Logs integration
- **Deployment**: Standalone Next.js build

### Development Tools
- **Package Manager**: pnpm
- **Linter**: Biome 2.2.6
- **Testing**: Vitest 3.2.4 with React Testing Library
- **Email**: Nodemailer with AWS SES
- **Validation**: Zod 4.1, Valibot 1.1
- **Environment**: T3 Env for validated environment variables

## Architecture

### Application Structure

```
bcos/
├── app/                          # Next.js App Router
│   ├── (default)/               # Authenticated app layout
│   │   ├── dashboard/           # Dashboard views
│   │   ├── work/                # Work item management
│   │   ├── configure/           # Configuration modules
│   │   │   ├── users/           # User management
│   │   │   ├── organizations/   # Organization settings
│   │   │   ├── practices/       # Practice management
│   │   │   ├── charts/          # Chart configuration
│   │   │   ├── dashboards/      # Dashboard builder
│   │   │   └── data-sources/    # Data source configuration
│   │   ├── settings/            # User settings
│   │   └── admin/               # Admin command center
│   ├── (auth)/                  # Authentication layout
│   │   ├── signin/              # Login page
│   │   ├── reset-password/      # Password reset
│   │   └── authenticating/      # SAML/OIDC callback
│   ├── (alternative)/           # Alternative layouts
│   │   └── components-library/  # Component showcase
│   ├── api/                     # API routes
│   │   ├── auth/                # Authentication endpoints
│   │   ├── users/               # User CRUD
│   │   ├── organizations/       # Organization management
│   │   ├── practices/           # Practice operations
│   │   ├── work-items/          # Work item operations
│   │   ├── roles/               # RBAC roles
│   │   ├── admin/               # Admin operations
│   │   └── security/            # Security endpoints (CSP reports)
│   └── css/                     # Global styles
├── components/                   # React components
│   ├── ui/                      # Base UI components
│   │   └── sidebar/             # Navigation sidebar
│   ├── charts/                  # Chart components (Chart.js)
│   ├── dashboards/              # Dashboard components
│   ├── work-items/              # Work item components
│   ├── auth/                    # Authentication components
│   └── rbac/                    # RBAC components
├── lib/                         # Core libraries
│   ├── api/                     # API utilities
│   │   ├── route-handlers/      # Route protection wrappers
│   │   ├── middleware/          # API middleware
│   │   ├── responses/           # Response helpers
│   │   └── types/               # API types
│   ├── auth/                    # Authentication logic
│   │   ├── jwt.ts               # JWT token generation/validation
│   │   ├── password.ts          # Password hashing
│   │   ├── webauthn.ts          # WebAuthn implementation
│   │   └── tokens/              # Token management
│   ├── rbac/                    # Role-based access control
│   │   ├── server-permission-service.ts
│   │   ├── cached-user-context.ts
│   │   └── middleware.ts
│   ├── db/                      # Database layer
│   │   ├── schema.ts            # Unified schema exports
│   │   ├── migrations/          # Drizzle migrations
│   │   └── seed.ts              # Database seeding
│   ├── logger/                  # Logging system
│   │   ├── logger.ts            # Core logger
│   │   ├── constants.ts         # Slow thresholds
│   │   └── message-templates.ts # Log templates
│   ├── cache/                   # Redis caching layer
│   ├── security/                # Security utilities
│   ├── oidc/                    # OpenID Connect integration
│   ├── s3/                      # S3 operations
│   ├── validations/             # Validation schemas
│   ├── hooks/                   # React hooks
│   ├── utils/                   # Utility functions
│   ├── types/                   # TypeScript types
│   ├── config/                  # Configuration
│   └── env.ts                   # Environment validation
├── infrastructure/              # AWS CDK infrastructure
│   ├── bin/                     # CDK app entry point
│   ├── lib/
│   │   ├── stacks/              # CDK stacks
│   │   │   ├── security-stack.ts      # IAM, KMS, ECR
│   │   │   ├── network-stack.ts       # VPC, ALB, Security Groups
│   │   │   ├── staging-stack.ts       # Staging environment
│   │   │   └── production-stack.ts    # Production environment
│   │   ├── constructs/          # Reusable CDK constructs
│   │   └── stages/              # Deployment stages
│   └── cdk.json                 # CDK configuration
├── tests/                       # Test suite
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   │   ├── api/                 # API route tests
│   │   ├── rbac/                # RBAC tests
│   │   ├── saml/                # SAML tests
│   │   └── security/            # Security tests
│   ├── e2e/                     # End-to-end tests
│   ├── setup/                   # Test configuration
│   ├── mocks/                   # Mock data
│   ├── factories/               # Test data factories
│   └── helpers/                 # Test utilities
├── scripts/                     # Utility scripts
│   ├── validate-env.ts          # Environment validation
│   ├── run-migrations.ts        # Database migrations
│   ├── warmup-dev.js            # Dev server warmup
│   └── lint-no-server-logger-in-client.ts
├── docs/                        # Documentation (192 files)
│   ├── sop/                     # Standard Operating Procedures
│   ├── runbooks/                # Operational runbooks
│   ├── designs/                 # Design documents
│   ├── quality/                 # Quality standards
│   ├── linting/                 # Linting rules
│   └── go-tos/                  # Quick reference guides
└── .claude/                     # Claude AI configuration
```

### Database Schema

The application uses a comprehensive PostgreSQL schema managed by Drizzle ORM:

**Core Tables**:
- `users` - System users with email, name, password
- `organizations` - Multi-tenant organizations
- `practices` - Medical practices within organizations

**RBAC Tables**:
- `roles` - User roles (e.g., Super Admin, Admin, Manager)
- `permissions` - Granular permissions (`resource:action:scope`)
- `role_permissions` - Role-permission mappings
- `user_roles` - User-role assignments
- `user_organizations` - User-organization memberships

**Authentication Tables**:
- `user_sessions` - Active user sessions
- `refresh_tokens` - JWT refresh tokens
- `token_blacklist` - Revoked tokens
- `login_attempts` - Failed login tracking
- `account_security` - MFA settings, device tracking
- `webauthn_credentials` - Passkey/WebAuthn credentials
- `webauthn_challenges` - WebAuthn challenges
- `oidc_states` - OIDC state tokens
- `oidc_nonces` - OIDC nonce tracking

**Work Management Tables**:
- `work_items` - Core work items
- `work_item_types` - Configurable work item types
- `work_item_statuses` - Workflow statuses
- `work_item_fields` - Custom field definitions
- `work_item_field_values` - Field values
- `work_item_comments` - Comments and notes
- `work_item_attachments` - File attachments
- `work_item_activity` - Audit trail
- `work_item_watchers` - Notification subscriptions
- `work_item_type_relationships` - Type hierarchies
- `work_item_status_transitions` - Workflow rules

**Analytics Tables**:
- `chart_definitions` - Chart configurations
- `chart_categories` - Chart organization
- `chart_permissions` - Chart access control
- `dashboards` - Dashboard definitions
- `dashboard_charts` - Chart-dashboard mappings
- `data_sources` - External data sources
- `chart_data_sources` - Chart data bindings
- `chart_data_source_columns` - Column mappings
- `chart_display_configurations` - Display settings
- `color_palettes` - Chart color schemes
- `user_chart_favorites` - Favorited charts

**Audit Tables**:
- `audit_logs` - Comprehensive audit trail
- `csrf_failure_events` - CSRF attack monitoring

### API Route Protection

All API routes use one of three security wrappers located in [lib/api/route-handlers](lib/api/route-handlers):

#### 1. `rbacRoute` - Permission-Based Protection (Primary)

Used for all business logic endpoints requiring specific permissions:

```typescript
import { rbacRoute } from '@/lib/api/route-handlers';

export const GET = rbacRoute(handler, {
  permission: 'users:read:all',  // Single permission
  rateLimit: 'api',
});

// Multiple permissions (user needs ANY)
export const POST = rbacRoute(handler, {
  permission: ['users:create:all', 'users:create:organization'],
  rateLimit: 'api',
});

// Require ALL permissions
export const PUT = rbacRoute(handler, {
  permission: ['users:update:all', 'users:update:sensitive'],
  requireAllPermissions: true,
  rateLimit: 'api',
});
```

**Permission Format**: `resource:action:scope`
- **Resources**: `users`, `practices`, `analytics`, `work_items`, `roles`, etc.
- **Actions**: `read`, `create`, `update`, `delete`, `manage`
- **Scopes**: `all`, `organization`, `own`

Handler receives `UserContext` with:
- `user_id` - User ID
- `roles` - Array of user roles
- `all_permissions` - Array of user permissions
- `is_super_admin` - Super admin flag
- `current_organization_id` - Current organization

#### 2. `authRoute` - Authentication Without RBAC

Used for authentication system routes (MFA, profile, sessions):

```typescript
import { authRoute } from '@/lib/api/route-handlers';

export const GET = authRoute(handler, { rateLimit: 'api' });
```

Handler receives `session` object with authentication data.

#### 3. `publicRoute` - No Authentication

Used for public endpoints (health checks, CSRF tokens, login, CSP reports):

```typescript
import { publicRoute } from '@/lib/api/route-handlers';

export const GET = publicRoute(
  handler,
  'Health check endpoint for monitoring tools',
  { rateLimit: 'api' }
);
```

**Rate Limit Options**:
- `auth`: Strict (10 req/min) - Authentication endpoints
- `api`: Standard (100 req/min) - Normal API operations
- `upload`: Relaxed (20 req/min) - File uploads

### Authentication Flow

1. **Standard Login**:
   - User submits credentials
   - Password verified with bcrypt
   - JWT access token (15 min) + refresh token (7 days) issued
   - Secure HTTP-only cookies set
   - MFA required if enabled

2. **SAML 2.0 Flow**:
   - User clicks SAML login
   - Redirect to Microsoft Entra ID
   - SAML assertion received
   - User created/updated from assertion
   - Session established

3. **OpenID Connect Flow**:
   - OAuth 2.0 / OIDC authorization code flow
   - Microsoft Entra ID integration
   - Email domain validation
   - Session fingerprinting
   - Automatic user provisioning

4. **WebAuthn/Passkeys**:
   - Registration: Challenge → Credential → Storage
   - Authentication: Challenge → Assertion → Verification
   - Supports MFA and passwordless flows

### RBAC System

**Permission Hierarchy**:
- Super Admin: Full system access
- Organization Admin: Organization-level management
- Manager: Team and practice management
- Staff: Limited operational access

**Permission Examples**:
- `users:read:all` - Read all users across organizations
- `users:create:organization` - Create users in own organization
- `practices:update:own` - Update own practices
- `analytics:read:organization` - View organization analytics
- `work_items:delete:all` - Delete any work item
- `roles:manage:all` - Full role management

**Caching**: User context cached in Redis with automatic invalidation on permission changes.

### Logging System

Custom logging wrapper ([lib/logger](lib/logger)) built on native console methods with:

- Automatic context capture (file, line, function)
- Correlation ID tracking across requests
- PII sanitization (emails, SSNs, credit cards, UUIDs)
- Structured logging to CloudWatch
- Sampling (INFO: 10%, DEBUG: 1% in production)

**Usage**:
```typescript
import { log, correlation } from '@/lib/logger';

// Basic logging
log.info('Operation completed', { data });
log.error('Operation failed', error, { context });

// API routes with correlation
return correlation.withContext(
  correlation.generate(),
  { method: request.method, path: pathname },
  async () => {
    log.api('Request started', request);
    // ... handler logic
    log.api('Request completed', request, 200, duration);
  }
);

// Specialized logging
log.auth('login', true, { userId, method: 'saml' });
log.security('rate_limit_exceeded', 'high', { blocked: true });
log.db('SELECT', 'users', duration, { recordCount });
```

**Important**: Logger is server-side only. Custom lint rule prevents client-side imports.

### Caching Strategy

Redis-based caching with IORedis:

**Cache Layers**:
- **RBAC Cache**: User permissions, roles, organization memberships
- **Analytics Cache**: Chart data, dashboard configurations
- **Data Source Cache**: External data source results
- **Session Cache**: Active user sessions

**Invalidation**: Automatic cache invalidation on data changes via centralized cache service.

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL 17
- Redis/Valkey (optional for local development)
- AWS Account (for deployment)

### Environment Variables

Create `.env.local` with required variables (see [lib/env.ts](lib/env.ts)):

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bcos
ANALYTICS_DATABASE_URL=postgresql://user:password@localhost:5432/bcos_analytics

# Security
JWT_SECRET=your-64-char-jwt-secret-here
JWT_REFRESH_SECRET=your-64-char-refresh-secret-here
CSRF_SECRET=your-64-char-csrf-secret-here

# Application
APP_URL=http://localhost:4001
NEXT_PUBLIC_APP_URL=http://localhost:4001
NODE_ENV=development

# Email (AWS SES)
SMTP_USERNAME=your-ses-username
SMTP_PASSWORD=your-ses-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=BendCare OS
AWS_REGION=us-east-1

# Microsoft Entra ID (Optional)
ENTRA_TENANT_ID=your-tenant-uuid
ENTRA_APP_ID=your-app-uuid
ENTRA_CLIENT_SECRET=your-client-secret

# OIDC (Optional)
OIDC_REDIRECT_URI=http://localhost:4001/api/auth/oidc/callback
OIDC_SESSION_SECRET=your-32-char-session-secret
OIDC_SCOPES=openid profile email
OIDC_ALLOWED_DOMAINS=yourdomain.com
OIDC_SUCCESS_REDIRECT=/dashboard
OIDC_STRICT_FINGERPRINT=true
```

### Installation

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Seed initial data (optional)
pnpm db:seed

# Start development server
pnpm dev

# Or with Turbopack (faster)
pnpm dev:turbo
```

The application will be available at `http://localhost:4001`.

### Development Workflow

```bash
# Make code changes

# Type check
pnpm tsc

# Lint
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Run all checks (lint + format)
pnpm check

# Run tests
pnpm test

# Run specific test suites
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests
pnpm test:api          # API route tests
pnpm test:rbac         # RBAC tests
pnpm test:saml         # SAML tests
pnpm test:e2e          # End-to-end tests

# Test coverage
pnpm test:coverage
pnpm test:coverage:ui  # Visual coverage report
```

### Database Operations

```bash
# Generate migration from schema changes
pnpm db:generate

# Run migrations
pnpm db:migrate

# Validate migrations
pnpm db:validate

# Push schema directly (dev only)
pnpm db:push

# Seed database
pnpm db:seed

# Connect to PostgreSQL
pnpm db:psql

# Check database connection
pnpm db:check
```

## Building for Production

```bash
# Validate environment variables
tsx scripts/validate-env.ts

# Build application
pnpm build

# Start production server
pnpm start
```

Build output is optimized for standalone deployment with all dependencies bundled.

## Infrastructure Deployment

The application uses AWS CDK for infrastructure management.

### CDK Stacks

1. **SecurityStack** ([infrastructure/lib/stacks/security-stack.ts](infrastructure/lib/stacks/security-stack.ts))
   - IAM roles (GitHub Actions OIDC, ECS Task, ECS Execution)
   - KMS encryption keys
   - ECR repository for container images
   - Secrets Manager integration

2. **NetworkStack** ([infrastructure/lib/stacks/network-stack.ts](infrastructure/lib/stacks/network-stack.ts))
   - VPC lookup (uses existing VPC)
   - Application Load Balancer
   - Security Groups (ALB, ECS)
   - Target Groups

3. **StagingStack** ([infrastructure/lib/stacks/staging-stack.ts](infrastructure/lib/stacks/staging-stack.ts))
   - ECS Fargate cluster
   - Task definitions
   - RDS PostgreSQL instance
   - Elasticache cluster
   - S3 buckets
   - CloudWatch log groups

4. **ProductionStack** ([infrastructure/lib/stacks/production-stack.ts](infrastructure/lib/stacks/production-stack.ts))
   - Same as staging with production configurations
   - Multi-AZ RDS
   - Enhanced monitoring
   - Backup configurations

### Deploy Infrastructure

```bash
cd infrastructure

# Install CDK dependencies
pnpm install

# Configure AWS credentials
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1

# Bootstrap CDK (first time only)
cdk bootstrap

# Synthesize CloudFormation templates
cdk synth

# Deploy all stacks
cdk deploy --all

# Or deploy individual stacks
cdk deploy BCOS-SecurityStack
cdk deploy BCOS-NetworkStack
cdk deploy BCOS-StagingStack
cdk deploy BCOS-ProductionStack
```

## Testing

### Test Structure

- **Unit Tests** ([tests/unit](tests/unit)): Individual function/component tests
- **Integration Tests** ([tests/integration](tests/integration)): API routes, RBAC, SAML flows
- **Security Tests** ([tests/security](tests/security)): Security feature validation
- **E2E Tests** ([tests/e2e](tests/e2e)): Full user workflows

### Test Configuration

- **Framework**: Vitest with jsdom environment
- **Parallel Execution**: Fork pool with up to 8 concurrent workers
- **Coverage Target**: 20% (statements/functions/lines), 15% (branches)
- **Timeouts**: 30s for DB operations
- **Retry**: 1 automatic retry for flaky tests

### Running Tests

```bash
# Run all tests
pnpm test

# Run with UI
pnpm test:ui

# Watch mode
pnpm test:watch

# Parallel execution (max performance)
pnpm test:parallel:max

# Sequential execution (debugging)
pnpm test:sequential

# Specific test files
pnpm test:specific:users
pnpm test:specific:permissions
```

## Code Quality Standards

### TypeScript

- **Strict Mode**: Enabled with additional strictness
- **No `any` Type**: Forbidden under all circumstances
- **Null Checking**: `strictNullChecks` and `noUncheckedIndexedAccess`
- **Exact Optional Properties**: `exactOptionalPropertyTypes`

### Linting

- **Biome**: Modern, fast linter and formatter
- **Custom Rule**: No server logger imports in client components
- **Auto-fix**: Available via `pnpm lint:fix`

### Security

- **Environment Validation**: Validated with T3 Env and Zod
- **API Route Protection**: 100% of routes use security wrappers
- **CSRF Protection**: All state-changing operations
- **Rate Limiting**: Applied to all routes
- **Input Sanitization**: DOMPurify for user content
- **SQL Injection**: Prevented via Drizzle ORM parameterization
- **XSS Prevention**: Content Security Policy + sanitization
- **Session Security**: Encrypted sessions, device fingerprinting

## Documentation

The project includes 192+ documentation files:

- **[docs/sop](docs/sop)**: Standard Operating Procedures
- **[docs/runbooks](docs/runbooks)**: Operational runbooks
- **[docs/designs](docs/designs)**: Architecture and design docs
- **[docs/quality](docs/quality)**: Quality standards and best practices
- **[docs/linting](docs/linting)**: Custom linting rules
- **[docs/go-tos](docs/go-tos)**: Quick reference guides
- **[CLAUDE.md](CLAUDE.md)**: AI assistant guidelines and rules

## Key Features

### Dashboard System
- Configurable multi-chart dashboards
- Real-time data updates
- Chart types: line, bar, pie, doughnut, polar, area, dual-axis
- Fullscreen mode
- Drill-down capabilities
- Permission-based access

### Work Item Management
- Customizable work item types
- Flexible field system (text, number, date, select, multi-select)
- Workflow statuses and transitions
- Comments and attachments
- Activity tracking and audit trail
- Watchers and notifications
- Type relationships (parent-child, blocks, relates to)

### User Management
- Multi-organization support
- Role-based access control
- Bulk user operations
- Email verification
- Password policies
- Account security settings
- Session management

### Practice Management
- Multi-practice organizations
- Practice staff assignments
- Practice-level permissions
- Practice templates
- Practice branding

### Analytics & Reporting
- Custom chart builder
- Data source integration
- Chart permissions
- Dashboard builder
- Favorite charts
- Export capabilities

### Administrative Tools
- Command center for system monitoring
- User session management
- Audit log viewer
- System health checks
- Cache management
- Database utilities

## Security Features

- **Multi-Factor Authentication**: TOTP, WebAuthn/Passkeys
- **Passwordless Authentication**: WebAuthn-based
- **SAML 2.0**: Enterprise SSO integration
- **OpenID Connect**: Microsoft Entra ID integration
- **Step-Up Authentication**: Re-authentication for sensitive operations
- **Device Fingerprinting**: Detect suspicious device changes
- **Session Management**: Concurrent session limits, revocation
- **Rate Limiting**: Per-endpoint rate limits
- **CSRF Protection**: Token-based with cookie validation
- **Content Security Policy**: Strict CSP with nonce-based inline scripts
- **Audit Logging**: Comprehensive activity tracking
- **Token Blacklist**: Immediate token revocation
- **Login Attempt Tracking**: Brute force prevention
- **Password Policies**: Complexity requirements, history

## Performance Optimizations

- **Chart Request Caching**: Redis-based analytics caching
- **RBAC Caching**: User context caching with TTL
- **Data Source Caching**: Configurable TTL per source
- **Connection Pooling**: Optimized database pool sizes
- **Standalone Build**: Minimal deployment footprint
- **Package Optimization**: Optimized imports for headlessui, tanstack
- **Parallel Testing**: Up to 8 concurrent test workers
- **Turbopack**: Optional faster dev server

## Contributing

### Before Committing

1. Run type checking: `pnpm tsc`
2. Run linting: `pnpm lint`
3. Fix any errors introduced by your changes
4. Run relevant tests
5. Follow commit message conventions

### Git Rules

- **NEVER** use `git reset` (hard, soft, or any form)
- **DO NOT** force push to main/master
- **DO NOT** skip hooks (`--no-verify`, `--no-gpg-sign`)
- Only commit when explicitly requested
- Use descriptive commit messages focusing on "why" not "what"

### Code Standards

- **Quality over speed**: Take time to do things correctly
- **No shortcuts**: Maintain high code quality
- **No `any` types**: Strict TypeScript typing
- **Test value**: Tests must provide real value, not just coverage
- **Security first**: Always prioritize security

## License

Proprietary - All rights reserved

## Support

For issues, questions, or support, contact the development team or refer to the [documentation](docs/).

---

**BendCare OS** - Built with security, scalability, and user experience in mind.
