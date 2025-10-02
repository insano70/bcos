# BendCare OS

A comprehensive healthcare practice management system built with Next.js, featuring SAML authentication, RBAC, real-time analytics, and more.

## Overview

BendCare OS is a modern, enterprise-grade healthcare platform that provides:

- **Authentication & Authorization**: SAML 2.0 SSO, session management, and role-based access control (RBAC)
- **Practice Management**: Multi-practice support with organizational hierarchy
- **Real-time Analytics**: Custom dashboards with chart configurations and data visualization
- **Security**: CSRF protection, rate limiting, audit logging, and step-up authentication
- **Infrastructure as Code**: AWS CDK deployment configuration

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: React 19
- **Language**: TypeScript 5 (strict mode)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: iron-session, JOSE, @node-saml/node-saml
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest with Testing Library
- **Code Quality**: Biome (linting & formatting)
- **Package Manager**: pnpm
- **Infrastructure**: AWS CDK

## Getting Started

### Prerequisites

- Node.js (version specified in package.json)
- pnpm
- PostgreSQL database
- Environment variables configured (see `env.example`)

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp env.example .env.local
# Edit .env.local with your configuration

# Run database migrations
pnpm db:migrate

# Seed the database (optional)
pnpm db:seed
```

### Development

```bash
# Start the development server (default port: 4001)
pnpm dev

# With turbo mode
pnpm dev:turbo

# With warm-up script
pnpm dev:warm
```

Open [http://localhost:4001](http://localhost:4001) with your browser to see the application.

### Building

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## Key Features

### RBAC System
- Hierarchical role and permission management
- Organization-level access control
- Cached permission checking for performance
- Middleware-based route protection

### SAML Integration
- SSO with enterprise identity providers
- Metadata fetching and validation
- Replay attack prevention
- Comprehensive security auditing

### Analytics & Dashboards
- Custom chart configurations
- Real-time data visualization
- Calculated fields and aggregations
- Export capabilities

### Security
- Content Security Policy with nonce-based script execution
- CSRF token validation
- Rate limiting per endpoint
- Comprehensive audit logging
- Step-up authentication for sensitive operations

## Project Structure

```
/app                # Next.js app router pages and layouts
/components         # Reusable React components
/lib                # Core business logic
  /api              # API utilities and middleware
  /auth             # Authentication services
  /db               # Database schemas and migrations
  /rbac             # Role-based access control
  /saml             # SAML authentication
  /security         # Security utilities (CSRF, headers)
  /services         # Business services
/tests              # Test suites
  /unit             # Unit tests
  /integration      # Integration tests
  /e2e              # End-to-end tests
/infrastructure     # AWS CDK infrastructure code
/scripts            # Utility scripts
/public             # Static assets
```

## Available Scripts

### Development
- `pnpm dev` - Start development server
- `pnpm dev:turbo` - Start with turbo mode
- `pnpm build` - Build for production
- `pnpm start` - Start production server

### Code Quality
- `pnpm lint` - Run Biome linter
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code
- `pnpm check` - Run Biome check and fix

### Testing
- `pnpm test` - Run tests in watch mode
- `pnpm test:run` - Run all tests once
- `pnpm test:unit` - Run unit tests
- `pnpm test:integration` - Run integration tests
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm test:coverage` - Generate coverage report
- `pnpm test:saml` - Run SAML-specific tests

### Database
- `pnpm db:migrate` - Run migrations
- `pnpm db:seed` - Seed database
- `pnpm db:push` - Push schema changes
- `pnpm db:generate` - Generate migrations
- `pnpm db:psql` - Open PostgreSQL shell

## Environment Variables

See `env.example` for a complete list of required environment variables. Key variables include:

- Database connection settings
- Session secrets
- SAML configuration
- AWS credentials (for production)
- Email service configuration

## Infrastructure

The project includes AWS CDK infrastructure code in the `/infrastructure` directory for deploying to AWS with:

- ECS Fargate for container orchestration
- RDS PostgreSQL for the database
- CloudWatch for logging and monitoring
- Application Load Balancer
- VPC with public/private subnets

Refer to [infrastructure/README.md](infrastructure/README.md) for deployment details.

## Testing

The project uses Vitest with comprehensive test coverage:

```bash
# Run all tests
pnpm test:run

# Run with coverage
pnpm test:coverage

# Run specific test suites
pnpm test:unit
pnpm test:integration
pnpm test:saml
```

## Contributing

This project follows strict code quality standards:

- No `any` types allowed
- Strict TypeScript mode enabled
- All changes must pass `pnpm tsc` and `pnpm lint`
- Security is paramount - all changes must maintain or improve security posture
- Tests must provide real value, not just coverage

See [CLAUDE.md](CLAUDE.md) for detailed guidelines.

## License

Private - All Rights Reserved
