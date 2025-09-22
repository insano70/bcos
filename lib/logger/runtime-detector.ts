/**
 * Runtime Environment Detection
 * Detects whether we're running in Node.js or Edge Runtime environments
 */

export type RuntimeEnvironment = 'nodejs' | 'edge'

/**
 * Cached runtime detection result to avoid repeated checks
 */
let detectedRuntime: RuntimeEnvironment | null = null

/**
 * Detect the current runtime environment using multiple strategies
 * Uses a combination of checks to reliably distinguish between Node.js and Edge Runtime
 */
export function detectRuntime(): RuntimeEnvironment {
  // Return cached result if already detected
  if (detectedRuntime) {
    return detectedRuntime
  }

  try {
    // Strategy 1: Check for explicit Edge Runtime marker
    if (typeof globalThis !== 'undefined') {
      const globalWithEdge = globalThis as { EdgeRuntime?: unknown }
      if (globalWithEdge.EdgeRuntime !== undefined) {
        detectedRuntime = 'edge'
        return detectedRuntime
      }
    }

    // Strategy 2: Check for Node.js specific process object characteristics
    if (typeof process !== 'undefined') {
      // Edge Runtime has a limited process object, Node.js has full process
      if (
        typeof process.nextTick === 'function' &&
        typeof process.versions === 'object' &&
        process.versions.node &&
        typeof process.cwd === 'function'
      ) {
        detectedRuntime = 'nodejs'
        return detectedRuntime
      }
    }

    // Strategy 3: Check for Node.js specific globals that Edge Runtime lacks
    if (typeof global !== 'undefined' && typeof global.process !== 'undefined') {
      // This is likely Node.js
      detectedRuntime = 'nodejs'
      return detectedRuntime
    }

    // Strategy 4: Try to access Node.js specific APIs
    try {
      // This will throw in Edge Runtime but succeed in Node.js
      const nodeTest = typeof require !== 'undefined' && 
                      typeof require.resolve === 'function'
      if (nodeTest) {
        detectedRuntime = 'nodejs'
        return detectedRuntime
      }
    } catch {
      // Expected to fail in Edge Runtime
    }

    // Strategy 5: Check for Web APIs that are primary in Edge Runtime
    if (
      typeof fetch === 'function' &&
      typeof Response === 'function' &&
      typeof Request === 'function' &&
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined'
    ) {
      // These exist in both environments, but if we reach here without
      // detecting Node.js, it's likely Edge Runtime
      detectedRuntime = 'edge'
      return detectedRuntime
    }

    // Fallback: Default to edge for safety (won't try to import Node.js modules)
    detectedRuntime = 'edge'
    return detectedRuntime

  } catch (error) {
    // If any detection fails, default to edge for safety
    detectedRuntime = 'edge'
    return detectedRuntime
  }
}

/**
 * Check if currently running in Node.js environment
 */
export function isNodeRuntime(): boolean {
  return detectRuntime() === 'nodejs'
}

/**
 * Check if currently running in Edge Runtime environment
 */
export function isEdgeRuntime(): boolean {
  return detectRuntime() === 'edge'
}

/**
 * Get runtime information for debugging
 */
export function getRuntimeInfo(): {
  runtime: RuntimeEnvironment
  hasProcess: boolean
  hasGlobal: boolean
  hasEdgeRuntime: boolean
  hasNodeAPIs: boolean
  hasWebAPIs: boolean
} {
  const runtime = detectRuntime()
  
  return {
    runtime,
    hasProcess: typeof process !== 'undefined',
    hasGlobal: typeof global !== 'undefined',
    hasEdgeRuntime: typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== 'undefined',
    hasNodeAPIs: typeof require !== 'undefined' && typeof process?.versions?.node === 'string',
    hasWebAPIs: typeof fetch === 'function' && typeof crypto?.subtle !== 'undefined'
  }
}

/**
 * Reset runtime detection cache (useful for testing)
 */
export function resetRuntimeDetection(): void {
  detectedRuntime = null
}

