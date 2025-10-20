/**
 * Environment Variable Validation Script
 * Validates required environment variables at build time
 *
 * This script prevents production deployments with missing environment variables
 * by failing early in the build process.
 *
 * Usage: Add to package.json build script:
 * "build": "tsx scripts/validate-env.ts && next build"
 */

/**
 * Required environment variables for WebAuthn
 */
const WEBAUTHN_ENV_VARS = {
  WEBAUTHN_RP_ID: {
    description: 'WebAuthn Relying Party ID (domain)',
    example: 'bendcare.com',
    required: true,
  },
  NEXT_PUBLIC_APP_URL: {
    description: 'Application URL for WebAuthn origin validation',
    example: 'https://bendcare.com',
    required: true,
  },
} as const;

/**
 * Additional recommended environment variables
 */
const RECOMMENDED_ENV_VARS = {
  DATABASE_URL: {
    description: 'PostgreSQL database connection string',
    example: 'postgresql://user:pass@host:5432/db',
    required: false,
  },
  CRON_SECRET: {
    description: 'Secret for authenticating external cron endpoints (optional - only if using Vercel Cron or external HTTP cron triggers)',
    example: 'random-secret-string',
    required: false,
  },
} as const;

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate environment variables
 */
function validateEnvironmentVariables(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required WebAuthn variables
  for (const [key, config] of Object.entries(WEBAUTHN_ENV_VARS)) {
    if (!process.env[key]) {
      // Only error in production if SKIP_ENV_VALIDATION is not set
      // This allows Docker builds to proceed with dummy values
      if (process.env.NODE_ENV === 'production' && !process.env.SKIP_ENV_VALIDATION) {
        errors.push(
          `REQUIRED: ${key} is missing\n  Description: ${config.description}\n  Example: ${config.example}`
        );
      } else if (process.env.NODE_ENV === 'development') {
        warnings.push(
          `MISSING: ${key} - using fallback value\n  Description: ${config.description}\n  Example: ${config.example}`
        );
      }
    } else {
      // Validate format for specific variables
      if (key === 'NEXT_PUBLIC_APP_URL' && process.env[key]) {
        try {
          new URL(process.env[key]);
        } catch {
          errors.push(`INVALID: ${key} is not a valid URL format`);
        }
      }
    }
  }

  // Check recommended variables
  for (const [key, config] of Object.entries(RECOMMENDED_ENV_VARS)) {
    if (!process.env[key]) {
      warnings.push(
        `RECOMMENDED: ${key} is not set\n  Description: ${config.description}\n  Example: ${config.example}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Validating environment variables...\n');

  const result = validateEnvironmentVariables();

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    for (const warning of result.warnings) {
      console.log(`  ${warning}\n`);
    }
  }

  // Print errors
  if (result.errors.length > 0) {
    console.error('❌ VALIDATION FAILED:\n');
    for (const error of result.errors) {
      console.error(`  ${error}\n`);
    }
    console.error('\n💡 Tip: Check your .env.local file or deployment environment variables\n');
    process.exit(1);
  }

  console.log('✅ Environment variable validation passed\n');
}

// Run validation
main();
