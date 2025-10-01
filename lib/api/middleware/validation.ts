import type { z } from 'zod';
import { ValidationError } from '../responses/error';

export async function validateRequest<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  try {
    const body = await request.json();

    // ✅ BEST PRACTICE: Use safeParse for better error handling
    const result = schema.safeParse(body);

    if (!result.success) {
      // ✅ SECURITY: Sanitize validation errors for production
      const sanitizedErrors = sanitizeValidationErrors(result.error.issues);
      throw ValidationError(sanitizedErrors);
    }

    return result.data;
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'SyntaxError') {
      throw ValidationError(null, 'Invalid JSON in request body');
    }
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
      throw error;
    }
    throw ValidationError(null, 'Invalid request body');
  }
}

export function validateQuery<T>(searchParams: URLSearchParams, schema: z.ZodSchema<T>): T {
  const queryObject = Object.fromEntries(searchParams.entries());

  // ✅ BEST PRACTICE: Use safeParse for better error handling
  const result = schema.safeParse(queryObject);

  if (!result.success) {
    // ✅ SECURITY: Sanitize validation errors for production
    const sanitizedErrors = sanitizeValidationErrors(result.error.issues);
    throw ValidationError(sanitizedErrors);
  }

  return result.data;
}

export function validateParams<T>(params: Record<string, string>, schema: z.ZodSchema<T>): T {
  // ✅ BEST PRACTICE: Use safeParse for better error handling
  const result = schema.safeParse(params);

  if (!result.success) {
    // ✅ SECURITY: Sanitize validation errors for production
    const sanitizedErrors = sanitizeValidationErrors(result.error.issues);
    throw ValidationError(sanitizedErrors);
  }

  return result.data;
}

/**
 * Sanitize Zod validation errors for production
 * Removes potentially sensitive information while preserving useful feedback
 */
function sanitizeValidationErrors(issues: z.ZodIssue[]): z.ZodIssue[] {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return issues; // Full error details in development
  }

  // Production: Sanitize error messages
  return issues.map((issue) => ({
    ...issue,
    message: sanitizeErrorMessage(issue.message),
    // Remove potentially sensitive path information in production
    path: issue.path.length > 0 ? [issue.path[0]].filter((p) => p !== undefined) : [],
  }));
}

/**
 * Sanitize individual error messages
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potentially sensitive information from error messages
  return message
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
    .replace(/\b\d{3,}\b/g, '[NUMBER]');
}
