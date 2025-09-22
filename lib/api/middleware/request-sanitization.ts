import type { NextRequest } from 'next/server'
import { createAPILogger } from '@/lib/logger/api-features'

/**
 * Request Sanitization Middleware
 * Provides protection against various injection attacks and malformed data
 */

// Dangerous keys that could lead to prototype pollution
const DANGEROUS_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString'
]

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
  /(\b(UNION|JOIN|WHERE|ORDER BY|GROUP BY|HAVING)\b.*\b(SELECT|FROM)\b)/i,
  /(--|#|\/\*|\*\/)/,
  /(\bOR\b\s*\d+\s*=\s*\d+)/i,
  /(\bAND\b\s*\d+\s*=\s*\d+)/i,
  /(';|";|`)/
]

// NoSQL injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where/i,
  /\$regex/i,
  /\$ne/i,
  /\$gt/i,
  /\$lt/i,
  /\$gte/i,
  /\$lte/i,
  /\$in/i,
  /\$nin/i,
  /\$exists/i,
  /\$type/i,
  /\$mod/i,
  /\$text/i,
  /\$where.*function/i
]

// XSS patterns
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object[^>]*>[\s\S]*?<\/object>/gi,
  /<embed[^>]*>/gi,
  /<svg[^>]*onload[^>]*>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  /<img[^>]*onerror[^>]*>/gi,
  /<input[^>]*onfocus[^>]*>/gi
]

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\/g,
  /%2e%2e%2f/gi,
  /%2e%2e%5c/gi,
  /\.\./g
]

interface SanitizationResult {
  isValid: boolean
  errors: string[]
  sanitized?: unknown
}

/**
 * Deep sanitize an object, removing dangerous keys and values
 */
function deepSanitize(obj: unknown, path: string = 'root', errors: string[] = []): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  // Handle primitive types
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj, path, errors)
    }
    return obj
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => deepSanitize(item, `${path}[${index}]`, errors))
  }

  // Handle objects
  const sanitized: Record<string, unknown> = {}
  
  // Type guard to ensure obj is an object with string keys
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }
  
  const objRecord = obj as Record<string, unknown>
  for (const key in objRecord) {
    // Skip dangerous keys
    if (DANGEROUS_KEYS.includes(key)) {
      errors.push(`Dangerous key '${key}' detected at ${path}`)
      continue
    }

    // Skip keys with special characters that might indicate injection
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      errors.push(`Invalid key '${key}' detected at ${path}`)
      continue
    }

    // Recursively sanitize the value
    sanitized[key] = deepSanitize(objRecord[key], `${path}.${key}`, errors)
  }

  return sanitized
}

/**
 * Sanitize string values for common injection patterns
 */
function sanitizeString(value: string, path: string, errors: string[]): string {
  if (typeof value !== 'string') {
    return value
  }

  // Check for SQL injection
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(`Potential SQL injection detected at ${path}`)
      // Remove the malicious pattern but keep the rest
      value = value.replace(pattern, '')
    }
  }

  // Check for NoSQL injection
  for (const pattern of NOSQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(`Potential NoSQL injection detected at ${path}`)
      value = value.replace(pattern, '')
    }
  }

  // Check for XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(`Potential XSS detected at ${path}`)
      value = value.replace(pattern, '')
    }
  }

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(`Potential path traversal detected at ${path}`)
      value = value.replace(pattern, '')
    }
  }

  // Trim excessive whitespace
  value = value.trim()

  // Limit string length to prevent DoS
  const MAX_STRING_LENGTH = 10000
  if (value.length > MAX_STRING_LENGTH) {
    errors.push(`String too long at ${path} (max ${MAX_STRING_LENGTH} chars)`)
    value = value.substring(0, MAX_STRING_LENGTH)
  }

  return value
}

/**
 * Validate JSON structure depth to prevent DoS
 */
function validateDepth(obj: unknown, maxDepth: number = 10, currentDepth: number = 0): boolean {
  if (currentDepth > maxDepth) {
    return false
  }

  if (typeof obj !== 'object' || obj === null) {
    return true
  }

  const objRecord = obj as Record<string, unknown>
  for (const key in objRecord) {
    if (!validateDepth(objRecord[key], maxDepth, currentDepth + 1)) {
      return false
    }
  }

  return true
}

/**
 * Validate array sizes to prevent DoS
 */
function validateArraySizes(obj: unknown, maxSize: number = 1000): boolean {
  if (Array.isArray(obj)) {
    if (obj.length > maxSize) {
      return false
    }
    return obj.every(item => validateArraySizes(item, maxSize))
  }

  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).every(value => validateArraySizes(value, maxSize))
  }

  return true
}

/**
 * Main sanitization function for request bodies
 */
// Simple logger interface for sanitization
interface SanitizationLogger {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}

export async function sanitizeRequestBody(body: unknown, logger: SanitizationLogger): Promise<SanitizationResult> {
  const startTime = Date.now()
  const errors: string[] = []

  try {
    // Check for empty body
    if (!body) {
      return { isValid: true, errors: [], sanitized: body }
    }

    // Validate JSON depth
    if (!validateDepth(body)) {
      errors.push('JSON structure too deep (max 10 levels)')
      logger.warn('JSON depth validation failed', {
        action: 'request_sanitization',
        threat: 'json_depth_attack',
        maxDepth: 10
      })
      return { isValid: false, errors }
    }

    // Validate array sizes
    if (!validateArraySizes(body)) {
      errors.push('Array too large (max 1000 items)')
      logger.warn('Array size validation failed', {
        action: 'request_sanitization',
        threat: 'resource_exhaustion_attack',
        maxSize: 1000
      })
      return { isValid: false, errors }
    }

    // Deep sanitize the object
    const sanitized = deepSanitize(body, 'body', errors)

    // Log sanitization performance
    const duration = Date.now() - startTime
    logger.debug('Request sanitization completed', {
      duration,
      hasErrors: errors.length > 0,
      errorCount: errors.length
    })

    return {
      isValid: errors.length === 0,
      errors,
      sanitized
    }

  } catch (error) {
    logger.error('Request sanitization system error', {
      error: error instanceof Error ? error.message : String(error),
      action: 'sanitization_failed',
      threat: 'system_error'
    })
    
    return {
      isValid: false,
      errors: ['Internal sanitization error']
    }
  }
}

/**
 * Middleware to wrap a handler with request sanitization
 */
export function withRequestSanitization<T extends (request: NextRequest, ...args: unknown[]) => Promise<Response>>(
  handler: T,
  options: {
    allowEmptyBody?: boolean
    customValidators?: Array<(body: unknown) => string | null>
  } = {}
): T {
  return (async (request: NextRequest, ...args: unknown[]) => {
    const apiLogger = createAPILogger(request, 'request-sanitization')
    const logger = apiLogger.getLogger()
    
    // Only sanitize for methods that typically have bodies
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return handler(request, ...args)
    }

    try {
      // Parse the body
      const body = await request.json().catch(() => null)

      // Check empty body
      if (!body && !options.allowEmptyBody) {
        logger.warn('Empty request body received')
        return new Response(
          JSON.stringify({ error: 'Request body is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Create compatible logger for sanitization function
      const sanitizationLogger = {
        info: (message: string, meta?: unknown) => logger.info(message, meta as Record<string, unknown>),
        warn: (message: string, meta?: unknown) => logger.warn(message, meta as Record<string, unknown>),
        error: (message: string, meta?: unknown) => logger.error(message, undefined, meta as Record<string, unknown>),
        debug: (message: string, meta?: unknown) => logger.debug(message, meta as Record<string, unknown>)
      }
      
      // Sanitize the body
      const result = await sanitizeRequestBody(body, sanitizationLogger)

      if (!result.isValid) {
        logger.warn('Request sanitization failed', {
          errors: result.errors
        })
        return new Response(
          JSON.stringify({ 
            error: 'Invalid request data',
            details: result.errors.slice(0, 3) // Only show first 3 errors to client
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Run custom validators if provided
      if (options.customValidators) {
        for (const validator of options.customValidators) {
          const error = validator(result.sanitized)
          if (error) {
            logger.warn('Custom validation failed', { error })
            return new Response(
              JSON.stringify({ error }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }
        }
      }

      // Create a new request with the sanitized body
      const sanitizedRequest = new Request(request, {
        body: JSON.stringify(result.sanitized)
      })

      // Call the original handler with sanitized request
      return handler(sanitizedRequest as NextRequest, ...args)

    } catch (error) {
      logger.error('Request sanitization middleware error', error)
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }) as T
}
