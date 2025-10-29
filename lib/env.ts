import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    // Database
    DATABASE_URL: z.string().url('Invalid DATABASE_URL format'),
    ANALYTICS_DATABASE_URL: z.string().url('Invalid ANALYTICS_DATABASE_URL format').optional(),

    // Authentication & Security
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for security'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters for security'),
    CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters for security'),

    // Email Service - AWS SES Configuration
    SMTP_USERNAME: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM_EMAIL: z.string().email().optional(),
    SMTP_FROM_NAME: z.string().optional(),
    SMTP_REPLY_TO: z.string().email().optional(),
    AWS_REGION: z.string().optional(),
    ADMIN_NOTIFICATION_EMAILS: z.string().optional(),

    // External Services
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),

    // Microsoft Entra ID Configuration (shared by OIDC)
    ENTRA_TENANT_ID: z.string().uuid('ENTRA_TENANT_ID must be a valid UUID').optional(),
    ENTRA_APP_ID: z.string().uuid('ENTRA_APP_ID must be a valid UUID').optional(), // Application ID (client_id)
    ENTRA_CLIENT_SECRET: z.string().optional(), // Client secret for OIDC

    // OIDC Configuration (OpenID Connect)
    OIDC_REDIRECT_URI: z.string().url('OIDC_REDIRECT_URI must be a valid URL').optional(),
    OIDC_SESSION_SECRET: z
      .string()
      .min(32, 'OIDC_SESSION_SECRET must be at least 32 characters for security')
      .optional(),
    OIDC_SCOPES: z.string().optional(), // Space or comma-separated list
    OIDC_ALLOWED_DOMAINS: z.string().optional(), // Comma-separated list
    OIDC_SUCCESS_REDIRECT: z.string().optional(),
    OIDC_STRICT_FINGERPRINT: z
      .string()
      .transform((val) => val === 'true')
      .optional(),

    // S3 Private Assets - Secure file storage with presigned URLs
    S3_PRIVATE_REGION: z.string().optional(),
    S3_PRIVATE_ACCESS_KEY_ID: z.string().optional(),
    S3_PRIVATE_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PRIVATE_BUCKET: z.string().optional(),
    S3_PRIVATE_UPLOAD_EXPIRATION: z.coerce
      .number()
      .int()
      .min(60, 'Upload expiration must be at least 60 seconds')
      .max(86400, 'Upload expiration must not exceed 24 hours')
      .optional(),
    S3_PRIVATE_DOWNLOAD_EXPIRATION: z.coerce
      .number()
      .int()
      .min(60, 'Download expiration must be at least 60 seconds')
      .max(3600, 'Download expiration must not exceed 1 hour')
      .optional(),

    // Application URL (server-side runtime configuration)
    APP_URL: z.string().url('APP_URL must be a valid URL').default('http://localhost:4001'),

    // Node Environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // AWS Bedrock (Data Explorer) - AI-powered SQL generation
    AWS_BEDROCK_REGION: z.string().default('us-east-1'),
    AWS_BEDROCK_ACCESS_KEY_ID: z.string().optional(),
    AWS_BEDROCK_SECRET_ACCESS_KEY: z.string().optional(),

    // Data Explorer configuration
    DATA_EXPLORER_MODEL_ID: z.string().default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    DATA_EXPLORER_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
    DATA_EXPLORER_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
    DATA_EXPLORER_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    DATA_EXPLORER_MAX_ROWS: z.coerce.number().int().positive().default(10000),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:4001'),
    NEXT_PUBLIC_STORAGE_DOMAIN: z.string().url().optional(),
    NEXT_PUBLIC_EXPERIMENTAL_MODE: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js Edge Runtime (e.g.
   * Vercel Edge Functions) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    // Server
    DATABASE_URL: process.env.DATABASE_URL,
    ANALYTICS_DATABASE_URL: process.env.ANALYTICS_DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    CSRF_SECRET: process.env.CSRF_SECRET,
    SMTP_USERNAME: process.env.SMTP_USERNAME,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
    SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
    SMTP_REPLY_TO: process.env.SMTP_REPLY_TO,
    AWS_REGION: process.env.AWS_REGION,
    ADMIN_NOTIFICATION_EMAILS: process.env.ADMIN_NOTIFICATION_EMAILS,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,

    // Microsoft Entra ID & OIDC
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
    ENTRA_APP_ID: process.env.ENTRA_APP_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
    OIDC_SESSION_SECRET: process.env.OIDC_SESSION_SECRET,
    OIDC_SCOPES: process.env.OIDC_SCOPES,
    OIDC_ALLOWED_DOMAINS: process.env.OIDC_ALLOWED_DOMAINS,
    OIDC_SUCCESS_REDIRECT: process.env.OIDC_SUCCESS_REDIRECT,
    OIDC_STRICT_FINGERPRINT: process.env.OIDC_STRICT_FINGERPRINT,

    // S3 Private Assets
    S3_PRIVATE_REGION: process.env.S3_PRIVATE_REGION,
    S3_PRIVATE_ACCESS_KEY_ID: process.env.S3_PRIVATE_ACCESS_KEY_ID,
    S3_PRIVATE_SECRET_ACCESS_KEY: process.env.S3_PRIVATE_SECRET_ACCESS_KEY,
    S3_PRIVATE_BUCKET: process.env.S3_PRIVATE_BUCKET,
    S3_PRIVATE_UPLOAD_EXPIRATION: process.env.S3_PRIVATE_UPLOAD_EXPIRATION,
    S3_PRIVATE_DOWNLOAD_EXPIRATION: process.env.S3_PRIVATE_DOWNLOAD_EXPIRATION,

    APP_URL: process.env.APP_URL,
    NODE_ENV: process.env.NODE_ENV,

    // Bedrock configuration
    AWS_BEDROCK_REGION: process.env.AWS_BEDROCK_REGION,
    AWS_BEDROCK_ACCESS_KEY_ID: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    AWS_BEDROCK_SECRET_ACCESS_KEY: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    DATA_EXPLORER_MODEL_ID: process.env.DATA_EXPLORER_MODEL_ID,
    DATA_EXPLORER_MAX_TOKENS: process.env.DATA_EXPLORER_MAX_TOKENS,
    DATA_EXPLORER_TEMPERATURE: process.env.DATA_EXPLORER_TEMPERATURE,
    DATA_EXPLORER_QUERY_TIMEOUT_MS: process.env.DATA_EXPLORER_QUERY_TIMEOUT_MS,
    DATA_EXPLORER_MAX_ROWS: process.env.DATA_EXPLORER_MAX_ROWS,

    // Client
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STORAGE_DOMAIN: process.env.NEXT_PUBLIC_STORAGE_DOMAIN,
    NEXT_PUBLIC_EXPERIMENTAL_MODE: process.env.NEXT_PUBLIC_EXPERIMENTAL_MODE,
  },

  /**
   * Run `build` or `dev` with SKIP_ENV_VALIDATION to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=""` will throw an error.
   */
  emptyStringAsUndefined: true,
});

/**
 * Additional security validation for production
 * Note: Next.js build command runs with NODE_ENV=production, but we only want
 * to enforce production security for actual production deployments
 * Only run this validation on the server side
 */
if (typeof window === 'undefined') {
  const isActualProduction =
    env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';

  if (isActualProduction) {
    // Ensure JWT secrets are strong enough for production
    if (env.JWT_SECRET.length < 64) {
      throw new Error('JWT_SECRET must be at least 64 characters in production');
    }

    if (env.JWT_REFRESH_SECRET.length < 64) {
      throw new Error('JWT_REFRESH_SECRET must be at least 64 characters in production');
    }

    if (env.CSRF_SECRET.length < 64) {
      throw new Error('CSRF_SECRET must be at least 64 characters in production');
    }

    // Ensure JWT secrets are different for better security isolation
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      throw new Error(
        'JWT_SECRET and JWT_REFRESH_SECRET must be different values for security isolation'
      );
    }

    // Ensure HTTPS in production
    if (!env.NEXT_PUBLIC_APP_URL.startsWith('https://')) {
      throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS in production');
    }

    // Email service configuration - using EMAIL_FROM if available

    if (!env.ADMIN_NOTIFICATION_EMAILS) {
      console.warn('⚠️ ADMIN_NOTIFICATION_EMAILS not configured - security alerts will not be sent');
    }
  }
}

/**
 * Helper functions for accessing validated environment
 * These functions should only be used on the server side
 */
export const getJWTConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getJWTConfig can only be used on the server side');
  }
  return {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    keyId: env.NODE_ENV === 'production' ? 'prod-key-1' : 'dev-key-1',
  };
};

export const getDatabaseConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getDatabaseConfig can only be used on the server side');
  }

  // Environment-specific connection pool settings
  const getPoolSettings = () => {
    switch (env.NODE_ENV) {
      case 'production':
        return {
          max: 20, // Higher pool size for production load
          idleTimeoutMillis: 30000, // 30 seconds
          connectionTimeoutMillis: 2000, // 2 seconds
        };
      case 'test':
        return {
          max: 2, // Minimal pool for test isolation
          idleTimeoutMillis: 5000, // 5 seconds
          connectionTimeoutMillis: 1000, // 1 second
        };
      default: // development
        return {
          max: 10, // Increased pool for development (handles concurrent requests)
          idleTimeoutMillis: 30000, // 30 seconds (keep connections alive longer)
          connectionTimeoutMillis: 10000, // 10 seconds (increased from 1.5s)
        };
    }
  };

  return {
    url: env.DATABASE_URL,
    ...getPoolSettings(),
  };
};

export const getAnalyticsDatabaseConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getAnalyticsDatabaseConfig can only be used on the server side');
  }
  return {
    url: env.ANALYTICS_DATABASE_URL,
    // Production optimizations for analytics database
    ...(env.NODE_ENV === 'production' && {
      max: 10, // Smaller pool for analytics
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }),
  };
};

export const getEmailConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getEmailConfig can only be used on the server side');
  }

  const region = env.AWS_REGION || 'us-east-1';

  return {
    smtp: {
      username: env.SMTP_USERNAME,
      password: env.SMTP_PASSWORD,
      endpoint: `email-smtp.${region}.amazonaws.com`,
      startTlsPort: 587,
      tlsWrapperPort: 465,
      region: region,
    },
    from: {
      email: env.SMTP_FROM_EMAIL || 'noreply@yourdomain.com',
      name: env.SMTP_FROM_NAME || 'Bendcare Thrive',
    },
    replyTo: env.SMTP_REPLY_TO || env.SMTP_FROM_EMAIL || 'noreply@yourdomain.com',
    adminEmails: env.ADMIN_NOTIFICATION_EMAILS?.split(',') || [],
  };
};

export const isProduction = () => {
  if (typeof window !== 'undefined') {
    throw new Error('isProduction can only be used on the server side');
  }
  return env.NODE_ENV === 'production';
};

export const isDevelopment = () => {
  if (typeof window !== 'undefined') {
    throw new Error('isDevelopment can only be used on the server side');
  }
  return env.NODE_ENV === 'development';
};

/**
 * Check if running in production environment
 * Safe to use in API routes and middleware (does not throw on client side)
 *
 * WARNING: This should only be used in server-side code (API routes, middleware)
 * For build-time checks, use isProduction() instead
 */
export const isProductionEnvironment = () => process.env.NODE_ENV === 'production';

export const getCSRFConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getCSRFConfig can only be used on the server side');
  }
  return {
    secret: env.CSRF_SECRET,
  };
};

/**
 * Get OIDC Configuration
 * Server-side only
 *
 * Returns OIDC configuration if all required environment variables are set.
 * Returns undefined otherwise (allows graceful degradation).
 */
export const getOIDCConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getOIDCConfig can only be used on the server side');
  }

  // Return undefined if OIDC is not configured (allows graceful degradation)
  if (
    !env.ENTRA_TENANT_ID ||
    !env.ENTRA_APP_ID ||
    !env.ENTRA_CLIENT_SECRET ||
    !env.OIDC_REDIRECT_URI ||
    !env.OIDC_SESSION_SECRET
  ) {
    return undefined;
  }

  return {
    // Microsoft Entra Configuration
    tenantId: env.ENTRA_TENANT_ID,
    clientId: env.ENTRA_APP_ID,
    clientSecret: env.ENTRA_CLIENT_SECRET,

    // OIDC Configuration
    redirectUri: env.OIDC_REDIRECT_URI,
    sessionSecret: env.OIDC_SESSION_SECRET,
    scopes: env.OIDC_SCOPES?.split(/[\s,]+/).filter(Boolean) || ['openid', 'profile', 'email'],
    allowedEmailDomains: env.OIDC_ALLOWED_DOMAINS?.split(',').map((d) => d.trim()) || [],
    successRedirect: env.OIDC_SUCCESS_REDIRECT || '/dashboard',
    strictFingerprint: env.OIDC_STRICT_FINGERPRINT || false,
  };
};

/**
 * Check if OIDC is enabled
 * Server-side only
 */
export const isOIDCEnabled = () => {
  if (typeof window !== 'undefined') {
    throw new Error('isOIDCEnabled can only be used on the server side');
  }
  return getOIDCConfig() !== undefined;
};

/**
 * Get S3 Private Assets Configuration
 * Server-side only
 * 
 * Returns configuration for secure file uploads with presigned URLs.
 * Used for work item attachments, invoices, reports, and other sensitive files.
 * 
 * @returns S3 private assets configuration
 * @throws Error if called from client side
 * 
 * @example
 * const config = getPrivateS3Config();
 * console.log(`Bucket: ${config.bucket}`);
 * console.log(`Upload expiration: ${config.uploadExpiration}s`);
 */
export const getPrivateS3Config = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getPrivateS3Config can only be used on the server side');
  }

  return {
    region: env.S3_PRIVATE_REGION || 'us-east-1',
    accessKeyId: env.S3_PRIVATE_ACCESS_KEY_ID || '',
    secretAccessKey: env.S3_PRIVATE_SECRET_ACCESS_KEY || '',
    bucket: env.S3_PRIVATE_BUCKET || '',
    uploadExpiration: env.S3_PRIVATE_UPLOAD_EXPIRATION || 3600, // 1 hour default
    downloadExpiration: env.S3_PRIVATE_DOWNLOAD_EXPIRATION || 900, // 15 minutes default
  };
};

/**
 * Check if S3 Private Assets are enabled
 * Server-side only
 * 
 * Validates that all required S3 private assets credentials are configured.
 * Use this to gracefully handle missing S3 configuration.
 * 
 * @returns True if all required credentials are configured
 * @throws Error if called from client side
 * 
 * @example
 * if (isPrivateS3Enabled()) {
 *   // Generate presigned URLs
 *   const { uploadUrl } = await generateUploadUrl(...);
 * } else {
 *   // Handle gracefully or throw error
 *   throw new Error('S3 private assets not configured');
 * }
 */
export const isPrivateS3Enabled = () => {
  if (typeof window !== 'undefined') {
    throw new Error('isPrivateS3Enabled can only be used on the server side');
  }
  const config = getPrivateS3Config();
  return !!(config.region && config.accessKeyId && config.secretAccessKey && config.bucket);
};
