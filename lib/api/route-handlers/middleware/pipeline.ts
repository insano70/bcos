/**
 * Middleware Pipeline
 *
 * Orchestrates sequential execution of middleware with early exit on failure.
 * Core abstraction that replaces nested if/else chains with clean composition.
 *
 * Pattern:
 * - Middleware execute in order (correlation → rate limit → auth → RBAC)
 * - Each middleware can read and update context
 * - First failure stops pipeline and returns error response
 * - Context accumulates through successful middleware
 *
 * Benefits:
 * - Composable: Easy to add/remove/reorder middleware
 * - Testable: Each middleware isolated
 * - Readable: Linear flow vs 7-level nesting
 *
 * Usage:
 * ```typescript
 * const pipeline = new MiddlewarePipeline([
 *   new CorrelationMiddleware(),
 *   new RateLimitMiddleware('api'),
 *   new AuthMiddleware(true),
 *   new RBACMiddleware(permission, options),
 * ]);
 *
 * const result = await pipeline.execute(request, initialContext);
 * if (!result.success) {
 *   return result.response; // Early exit
 * }
 *
 * // All middleware passed, call handler
 * const response = await handler(request, result.context.userContext);
 * ```
 */

import type { NextRequest } from 'next/server';
import type { Middleware, MiddlewareResult, RouteContext } from '../types';

export class MiddlewarePipeline {
  constructor(private middlewares: Middleware[]) {}

  /**
   * Execute all middleware sequentially
   *
   * Stops at first failure and returns error response.
   * Accumulates context through successful middleware.
   *
   * @param request - NextRequest object
   * @param context - Initial route context
   * @returns MiddlewareResult with success flag and final context
   */
  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    let currentContext = context;

    for (const middleware of this.middlewares) {
      // Track timing for this middleware
      const startTime = Date.now();

      // Execute middleware
      const result = await middleware.execute(request, currentContext);

      // Record timing
      currentContext.timings = {
        ...currentContext.timings,
        [middleware.name]: Date.now() - startTime,
      };

      // If middleware failed, return immediately
      if (!result.success) {
        // Ensure response is set for failure cases
        if (!result.response) {
          throw new Error(`Middleware ${middleware.name} failed without providing error response`);
        }
        return {
          success: false,
          response: result.response,
          context: result.context ?? currentContext,
        };
      }

      // Merge context updates from successful middleware
      if (result.context) {
        currentContext = { ...currentContext, ...result.context };
      }
    }

    // All middleware passed
    return { success: true, context: currentContext };
  }

  /**
   * Get list of middleware names in pipeline
   *
   * Useful for debugging and logging.
   *
   * @returns Array of middleware names
   */
  getMiddlewareNames(): string[] {
    return this.middlewares.map((m) => m.name);
  }
}
