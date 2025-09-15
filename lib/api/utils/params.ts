import type { z } from 'zod';
import { ValidationError } from '@/lib/api/responses/error';

/**
 * Next.js 15 Dynamic Route Parameters
 * In Next.js 15, dynamic route parameters are passed as a Promise
 * This utility handles the async extraction and validation
 */

/**
 * Type for Next.js 15 dynamic route params
 */
export type RouteParams<T = Record<string, string>> = Promise<{ params: T }>;

/**
 * Extract and validate dynamic route parameters from Next.js 15 API routes
 * @param params - The params object from Next.js 15 (Promise)
 * @param schema - Zod schema for validation
 * @returns Validated parameters
 */
export async function extractRouteParams<T extends z.ZodType>(
  params: unknown,
  schema: T
): Promise<z.infer<T>> {
  try {
    // Handle the Next.js 15 params structure
    if (!params || typeof params !== 'object') {
      throw ValidationError(null, 'Invalid route parameters');
    }

    let resolvedParams: Record<string, unknown>;

    // Check if the object has route params directly (Next.js 15 pattern)
    // The object has both 'params' (Promise) and direct properties like 'id'
    const paramsObj = params as Record<string, unknown>;
    
    // Check if it has direct route param properties (like 'id', 'slug', etc.)
    const hasDirectParams = Object.keys(paramsObj).some(key => 
      key !== 'params' && !key.startsWith('Symbol(')
    );
    
    if (hasDirectParams) {
      // Extract only the non-params, non-Symbol properties
      resolvedParams = {};
      for (const [key, value] of Object.entries(paramsObj)) {
        if (key !== 'params' && !key.startsWith('Symbol(')) {
          resolvedParams[key] = value;
        }
      }
    } else if ('params' in paramsObj) {
      try {
        const awaited = await (paramsObj.params as Promise<unknown>);
        resolvedParams = awaited as Record<string, unknown>;
      } catch (awaitError) {
        resolvedParams = paramsObj.params as Record<string, unknown>;
      }
    } else {
      resolvedParams = paramsObj;
    }
    
    // Validate with the provided schema
    const result = schema.safeParse(resolvedParams);
    
    if (!result.success) {
      throw ValidationError(result.error, `Invalid route parameters: ${result.error.message}`);
    }

    return result.data;
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'APIError') {
      throw error;
    }
    
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    
    throw ValidationError(
      error,
      `Failed to extract route parameters: ${errorMessage}`
    );
  }
}

/**
 * Type-safe wrapper for route handlers with dynamic params
 */
export type RouteHandlerWithParams<TParams = Record<string, string>> = {
  params: Promise<TParams>;
};
