/**
 * Environment-Specific Logging Configuration
 * Provides optimized logging settings for different deployment environments
 */

export interface LogConfig {
  level: string
  redact?: string[]
  transport?: any
  formatters?: any
  serializers?: any
}

/**
 * Base configuration for all environments
 */
const baseConfig = {
  redact: [
    'password',
    'token', 
    'secret',
    'key',
    'auth',
    'authorization',
    'cookie',
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-auth-token"]',
    '*.password',
    '*.token',
    '*.secret',
    '*.auth',
    '*.authorization',
    // Healthcare-specific PII redaction
    'ssn',
    'social_security_number',
    'date_of_birth',
    'dob',
    'phone',
    'phone_number',
    'email',
    'address',
    'medical_record_number',
    'patient_id',
    'insurance_number',
    '*.ssn',
    '*.social_security_number',
    '*.date_of_birth',
    '*.dob',
    '*.phone',
    '*.phone_number',
    '*.email',
    '*.address',
    '*.medical_record_number',
    '*.patient_id',
    '*.insurance_number'
  ],
  serializers: {
    err: (error: Error) => ({
      type: error.constructor.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Development environment configuration
 * Optimized for debugging with pretty printing
 */
export const developmentConfig: LogConfig = {
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      messageFormat: '{module} | {msg}',
      errorLikeObjectKeys: ['err', 'error'],
      customPrettifiers: {
        time: () => `[${new Date().toLocaleTimeString()}]`,
        module: (module: string) => `[${module?.toUpperCase() || 'APP'}]`,
        requestId: (id: string) => `reqId:${id}`,
        userId: (id: string) => `user:${id}`,
        organizationId: (id: string) => `org:${id}`
      }
    }
  },
  ...baseConfig
}

/**
 * Test environment configuration
 * Silent logging to avoid test output pollution
 */
export const testConfig: LogConfig = {
  level: 'silent',
  ...baseConfig
}

/**
 * Staging environment configuration
 * Balanced between debugging and performance
 */
export const stagingConfig: LogConfig = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
    log: (object: any) => {
      // Add staging-specific metadata
      return {
        ...object,
        environment: 'staging',
        version: process.env.npm_package_version || 'unknown',
        node_version: process.version
      }
    }
  },
  ...baseConfig
}

/**
 * Production environment configuration  
 * Optimized for performance and security
 */
export const productionConfig: LogConfig = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
    log: (object: any) => {
      // Add production metadata and sanitization
      return {
        ...sanitizeProductionLog(object),
        environment: 'production',
        version: process.env.npm_package_version || 'unknown',
        service: 'bendcare-os',
        timestamp: new Date().toISOString()
      }
    }
  },
  // Production transport configuration (examples)
  transport: process.env.LOG_TRANSPORT ? {
    target: process.env.LOG_TRANSPORT, // e.g., 'pino-datadog', 'pino-elasticsearch'
    options: {
      apiKey: process.env.LOG_API_KEY,
      service: 'bendcare-os',
      env: 'production',
      source: 'nodejs',
      hostname: process.env.HOSTNAME || 'unknown',
      tags: ['healthcare', 'nextjs', 'api']
    }
  } : undefined,
  ...baseConfig
}

/**
 * Get configuration based on current environment
 */
export function getLogConfig(): LogConfig {
  const env = process.env.NODE_ENV || 'development'
  
  switch (env) {
    case 'development':
      return developmentConfig
    case 'test':
      return testConfig
    case 'staging':
      return stagingConfig
    case 'production':
      return productionConfig
    default:
      return developmentConfig
  }
}

/**
 * Sanitize log data for production environment
 * Removes sensitive information beyond standard redaction
 */
function sanitizeProductionLog(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj

  const sensitized = { ...obj }
  
  // Remove potentially large objects in production
  if (sensitized.req && typeof sensitized.req === 'object') {
    sensitized.req = {
      method: sensitized.req.method,
      url: sanitizeUrl(sensitized.req.url),
      headers: sanitizeHeaders(sensitized.req.headers)
    }
  }
  
  // Remove detailed stack traces in production (keep error type and message)
  if (sensitized.error && typeof sensitized.error === 'object') {
    sensitized.error = {
      name: sensitized.error.name,
      message: sanitizeErrorMessage(sensitized.error.message)
    }
  }
  
  // Limit array sizes to prevent log bloat
  for (const [key, value] of Object.entries(sensitized)) {
    if (Array.isArray(value) && value.length > 10) {
      sensitized[key] = {
        truncated: true,
        count: value.length,
        sample: value.slice(0, 3)
      }
    }
  }
  
  return sensitized
}

/**
 * Sanitize URLs to remove sensitive query parameters
 */
function sanitizeUrl(url: string): string {
  if (!url) return url
  
  try {
    const urlObj = new URL(url)
    const sensitiveParams = ['token', 'api_key', 'secret', 'password', 'auth']
    
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]')
      }
    })
    
    return urlObj.toString()
  } catch {
    return url.replace(/([?&])(token|api_key|secret|password|auth)=[^&]*/gi, '$1$2=[REDACTED]')
  }
}

/**
 * Sanitize request headers
 */
function sanitizeHeaders(headers: any): any {
  if (!headers) return headers
  
  const sanitized = { ...headers }
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]'
    }
    if (sanitized[header.toLowerCase()]) {
      sanitized[header.toLowerCase()] = '[REDACTED]'  
    }
  })
  
  return sanitized
}

/**
 * Sanitize error messages
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return message
  
  return message
    .replace(/password[=:\s]+[^\s]+/gi, 'password=[REDACTED]')
    .replace(/token[=:\s]+[^\s]+/gi, 'token=[REDACTED]')
    .replace(/key[=:\s]+[^\s]+/gi, 'key=[REDACTED]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/gi, '[EMAIL]')
    .replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]')
    .replace(/\(\d{3}\)\s*\d{3}-\d{4}/g, '[PHONE]')
}

/**
 * Environment-specific log level helpers
 */
export const LogLevels = {
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isTest: () => process.env.NODE_ENV === 'test',
  isStaging: () => process.env.NODE_ENV === 'staging',
  isProduction: () => process.env.NODE_ENV === 'production',
  shouldLogDebug: () => process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug',
  shouldLogTrace: () => process.env.LOG_LEVEL === 'trace'
}
