#!/usr/bin/env tsx
/**
 * Enhanced Development Server Warmup Script
 * Pre-compiles common routes to eliminate compilation delays
 * Now with enhanced debugging and performance monitoring
 */

import { createDebugLogger, debugLog, debugTiming } from '@/lib/utils/debug';

const warmupLogger = createDebugLogger('warmup-script', 'development-warmup');

const routes = [
  'http://localhost:4001/',
  'http://localhost:4001/signin',
  'http://localhost:4001/dashboard',
  'http://localhost:4001/configure/users',
  'http://localhost:4001/configure/practices',
  'http://localhost:4001/configure/charts',
  'http://localhost:4001/configure/dashboards',
  'http://localhost:4001/api/health',
  'http://localhost:4001/api/csrf',
  'http://localhost:4001/api/auth/me',
];

interface WarmupResult {
  url: string;
  status: number;
  statusText: string;
  duration: number;
  success: boolean;
  error?: string;
}

async function warmupRoute(url: string): Promise<WarmupResult> {
  const startTime = Date.now();

  try {
    debugLog.api(`Warming up route: ${url}`, {
      operation: 'route_warmup',
      url,
      startTime,
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'enhanced-warmup-script/1.0',
      },
    });

    const duration = Date.now() - startTime;
    const result: WarmupResult = {
      url,
      status: response.status,
      statusText: response.statusText,
      duration,
      success: response.ok,
    };

    if (response.ok) {
      debugLog.performance(`✅ ${url}`, startTime, {
        status: response.status,
        statusText: response.statusText,
        responseTime: duration,
        performanceOptimized: duration < 1000,
      });
    } else {
      debugLog.api(`⚠️ ${url} - Non-OK status`, {
        status: response.status,
        statusText: response.statusText,
        duration,
        warning: 'non_ok_status',
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    debugLog.api(`❌ ${url} - Error: ${errorMessage}`, {
      operation: 'route_warmup_failed',
      url,
      error: errorMessage,
      duration,
      failed: true,
    });

    return {
      url,
      status: 0,
      statusText: 'ERROR',
      duration,
      success: false,
      error: errorMessage,
    };
  }
}

async function warmupServer(): Promise<void> {
  const startTime = Date.now();

  debugLog.api('🔥 Warming up development server...', {
    operation: 'development_warmup_start',
    routeCount: routes.length,
    serverUrl: 'localhost:4001',
  });

  warmupLogger.info('📍 Development warmup initiated', {
    routes: routes.length,
    warmupType: 'parallel',
    developmentOptimization: true,
  });

  try {
    // Warm up routes in parallel with enhanced monitoring
    const results = await Promise.all(routes.map(warmupRoute));

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const averageResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    debugTiming('Development server warmup completed', startTime);

    debugLog.api('🎉 Warmup completed', {
      operation: 'development_warmup_complete',
      totalDuration: duration,
      routeCount: routes.length,
      successCount,
      failureCount,
      averageResponseTime,
      performanceOptimized: averageResponseTime < 500,
    });

    // Enhanced warmup analytics
    warmupLogger.info('Development warmup analytics', {
      totalRoutes: routes.length,
      successRate: (successCount / routes.length) * 100,
      averageResponseTime,
      fastestRoute: Math.min(...results.map((r) => r.duration)),
      slowestRoute: Math.max(...results.map((r) => r.duration)),
      developmentReady: failureCount === 0,
      warmupEffective: duration < 10000,
    });

    if (failureCount > 0) {
      const failures = results.filter((r) => !r.success);
      debugLog.api('⚠️ Some routes failed during warmup', {
        failureCount,
        failures: failures.map((f) => ({ url: f.url, error: f.error })),
      });
    }

    warmupLogger.info('🚀 Development server is ready for fast responses!', {
      serverStatus: 'warmed_up',
      developmentReady: true,
      totalWarmupTime: duration,
    });
  } catch (error) {
    debugLog.api('❌ Development server warmup failed', {
      operation: 'development_warmup_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    throw error;
  }
}

// Enhanced warmup execution with error handling
if (require.main === module) {
  warmupServer()
    .then(() => {
      debugLog.api('✅ Warmup script completed successfully', {
        operation: 'warmup_script_complete',
        success: true,
      });
      process.exit(0);
    })
    .catch((error) => {
      debugLog.api('💥 Warmup script failed', {
        operation: 'warmup_script_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        fatal: true,
      });
      process.exit(1);
    });
}
