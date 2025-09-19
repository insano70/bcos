import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    // Database
    DATABASE_URL: z.string().url("Invalid DATABASE_URL format"),
    ANALYTICS_DATABASE_URL: z.string().url("Invalid ANALYTICS_DATABASE_URL format").optional(),
    
    // Authentication & Security
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters for security"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters for security"),
    CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters for security"),
    
    // Email Service
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    ADMIN_NOTIFICATION_EMAILS: z.string().optional(),
    
    // External Services
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    
    // Node Environment
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:4001"),
    NEXT_PUBLIC_STORAGE_DOMAIN: z.string().url().optional(),
    NEXT_PUBLIC_EXPERIMENTAL_MODE: z.string().default("false").transform(val => val === "true"),
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
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    ADMIN_NOTIFICATION_EMAILS: process.env.ADMIN_NOTIFICATION_EMAILS,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    
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
  const isActualProduction = env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production";

  if (isActualProduction) {
    // Ensure JWT secrets are strong enough for production
    if (env.JWT_SECRET.length < 64) {
      throw new Error("JWT_SECRET must be at least 64 characters in production");
    }
    
    if (env.JWT_REFRESH_SECRET.length < 64) {
      throw new Error("JWT_REFRESH_SECRET must be at least 64 characters in production");
    }
    
    if (env.CSRF_SECRET.length < 64) {
      throw new Error("CSRF_SECRET must be at least 64 characters in production");
    }
    
    // Ensure JWT secrets are different for better security isolation
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be different values for security isolation");
    }
    
    // Ensure HTTPS in production
    if (!env.NEXT_PUBLIC_APP_URL.startsWith("https://")) {
      throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
    }
    
    // Warn about missing production services
    if (!env.RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured - email features will not work");
    }
    
    if (!env.ADMIN_NOTIFICATION_EMAILS) {
      console.warn("⚠️ ADMIN_NOTIFICATION_EMAILS not configured - security alerts will not be sent");
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
    keyId: env.NODE_ENV === 'production' ? 'prod-key-1' : 'dev-key-1'
  };
};

export const getDatabaseConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getDatabaseConfig can only be used on the server side');
  }
  return {
    url: env.DATABASE_URL,
    // Production optimizations
    ...(env.NODE_ENV === 'production' && {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
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
    })
  };
};

export const getEmailConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getEmailConfig can only be used on the server side');
  }
  return {
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM || 'noreply@yourdomain.com',
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

export const getCSRFConfig = () => {
  if (typeof window !== 'undefined') {
    throw new Error('getCSRFConfig can only be used on the server side');
  }
  return {
    secret: env.CSRF_SECRET,
  };
};
