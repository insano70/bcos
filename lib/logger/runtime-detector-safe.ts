/**
 * Edge Runtime Safe Runtime Detector
 * Detects runtime environment without using Node.js-specific APIs that cause bundling issues
 */

export type RuntimeEnvironment = 'nodejs' | 'edge'

/**
 * Cached runtime detection result to avoid repeated checks
 */
let detectedRuntime: RuntimeEnvironment | null = null

/**
 * Edge Runtime safe runtime detection using only Web APIs and safe checks
 */
export function detectRuntimeSafe(): RuntimeEnvironment {
  // Return cached result if already detected
  if (detectedRuntime) {
    return detectedRuntime
  }

  try {
    // Strategy 1: Check for explicit Edge Runtime marker (safest)
    if (typeof globalThis !== 'undefined') {
      const globalWithEdge = globalThis as { EdgeRuntime?: unknown }
      if (globalWithEdge.EdgeRuntime !== undefined) {
        detectedRuntime = 'edge'
        return detectedRuntime
      }
    }

    // Strategy 2: Check for client-side context (browser/Edge Runtime)
    if (typeof window !== 'undefined' || typeof document !== 'undefined') {
      detectedRuntime = 'edge'
      return detectedRuntime
    }

    // Strategy 3: Check for Node.js globals in a safe way
    try {
      // Use indirect access to prevent bundling issues
      const globalThis_ = globalThis as any;
      if (typeof globalThis_['global'] !== 'undefined' && 
          globalThis_['global'] === globalThis_) {
        // This pattern is specific to Node.js
        detectedRuntime = 'nodejs'
        return detectedRuntime
      }
    } catch {
      // Expected to fail in Edge Runtime
    }

    // Strategy 4: Check for Node.js require function safely
    try {
      const globalThis_ = globalThis as any;
      if (typeof globalThis_['require'] === 'function') {
        detectedRuntime = 'nodejs'
        return detectedRuntime
      }
    } catch {
      // Expected to fail in Edge Runtime
    }

    // Strategy 5: Web API presence check (default to edge for web-like environments)
    if (
      typeof fetch === 'function' &&
      typeof Response === 'function' &&
      typeof Headers === 'function'
    ) {
      // Default to edge for web-like environments
      detectedRuntime = 'edge'
      return detectedRuntime
    }

    // Final fallback - assume edge for safety
    detectedRuntime = 'edge'
    return detectedRuntime

  } catch (error) {
    // Ultimate fallback - assume edge runtime for safety
    detectedRuntime = 'edge'
    return detectedRuntime
  }
}

/**
 * Check if running in Node.js runtime (safe version)
 */
export function isNodeRuntimeSafe(): boolean {
  return detectRuntimeSafe() === 'nodejs'
}

/**
 * Check if running in Edge runtime (safe version)
 */
export function isEdgeRuntimeSafe(): boolean {
  return detectRuntimeSafe() === 'edge'
}

/**
 * Get safe runtime information without Node.js-specific APIs
 */
export function getRuntimeInfoSafe(): {
  runtime: RuntimeEnvironment
  hasWebAPIs: boolean
  hasGlobalThis: boolean
  isClientSide: boolean
  supportsModules: boolean
} {
  const runtime = detectRuntimeSafe()
  
  return {
    runtime,
    hasWebAPIs: typeof fetch === 'function' && typeof Response === 'function',
    hasGlobalThis: typeof globalThis !== 'undefined',
    isClientSide: typeof window !== 'undefined',
    supportsModules: typeof globalThis !== 'undefined' && 
                    (globalThis as any).require !== undefined
  }
}

/**
 * Reset runtime detection cache (for testing)
 */
export function resetRuntimeDetectionSafe(): void {
  detectedRuntime = null
}
