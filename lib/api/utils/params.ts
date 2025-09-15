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

    // In Next.js 15, params is always a Promise that needs to be awaited
    // Try to await it regardless of type detection
    try {
      const awaited = await (params as Promise<unknown>);
      
      // Check if it has the expected structure
      if (typeof awaited === 'object' && awaited !== null) {
        resolvedParams = awaited as Record<string, unknown>;
      } else {
        throw ValidationError(null, 'Invalid params structure after awaiting');
      }
    } catch (awaitError) {
      // If awaiting fails, treat as direct params object (backwards compatibility)
      if ('params' in params) {
        resolvedParams = (params as { params: Record<string, unknown> }).params;
      } else {
        resolvedParams = params as Record<string, unknown>;
      }
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
