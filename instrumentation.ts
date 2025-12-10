/**
 * Next.js Instrumentation
 *
 * This file is automatically loaded by Next.js during server startup.
 * Use it to initialize server-side services that should run once per process.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

/**
 * Register function called by Next.js during startup
 *
 * IMPORTANT: This runs during build AND runtime. We only want to start
 * the scheduler during actual server runtime, not during build.
 */
export async function register(): Promise<void> {
  // Only run on the Node.js server runtime (not during build or edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Skip during build process
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return;
    }

    // Dynamically import to avoid loading during build
    const { startBackgroundWarmingScheduler, stopBackgroundWarmingScheduler } = await import(
      '@/lib/cache/background-warming-scheduler'
    );
    const { disconnectRedis } = await import('@/lib/redis');
    const { closeAnalyticsDb } = await import('@/lib/services/analytics-db');

    // Start the background cache warming scheduler
    // This runs in the main thread but spawns worker threads for actual warming
    startBackgroundWarmingScheduler();

    // Track if shutdown is in progress to prevent multiple shutdowns
    let isShuttingDown = false;

    // Register graceful shutdown handlers
    // These ensure clean connection cleanup on process termination
    //
    // NOTE: We use console.log instead of the structured logger here because:
    // 1. The logger may have dependencies that are being torn down during shutdown
    // 2. Console output is guaranteed to work during process termination
    // 3. Shutdown logs are primarily for debugging, not production monitoring
    const gracefulShutdown = async (signal: string) => {
      // Prevent multiple simultaneous shutdown attempts
      if (isShuttingDown) {
        console.log(`[instrumentation] Shutdown already in progress, ignoring ${signal}`);
        return;
      }
      isShuttingDown = true;

      console.log(`[instrumentation] Received ${signal}, initiating graceful shutdown...`);
      
      // Set a maximum time for graceful shutdown (10 seconds)
      // If cleanup takes longer, force exit to prevent hanging
      const forceExitTimeout = setTimeout(() => {
        console.error('[instrumentation] Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10000);

      try {
        // Stop the background warming scheduler (synchronous, non-blocking)
        stopBackgroundWarmingScheduler();
        
        // Disconnect Redis (async, wait for completion)
        await disconnectRedis();
        
        // Close analytics database connections
        await closeAnalyticsDb();
        
        console.log('[instrumentation] Graceful shutdown complete');
      } catch (error) {
        console.error('[instrumentation] Error during graceful shutdown:', error);
      } finally {
        clearTimeout(forceExitTimeout);
        // Small delay to allow any remaining I/O to flush
        setTimeout(() => process.exit(0), 100);
      }
    };

    // Handle termination signals
    // Use once() to prevent handler from being called multiple times
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

