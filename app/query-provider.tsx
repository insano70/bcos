'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { clientErrorLog } from '@/lib/utils/debug-client';

/**
 * Global error handler for React Query
 * 
 * Logs errors to client-side telemetry for monitoring.
 * In production, this could be extended to send errors to a monitoring service.
 */
function handleQueryError(error: Error): void {
  // Log error for telemetry
  clientErrorLog('React Query error', error, {
    timestamp: new Date().toISOString(),
    type: 'query_error',
  });
}

/**
 * Global error handler for React Query mutations
 */
function handleMutationError(error: Error): void {
  // Log error for telemetry
  clientErrorLog('React Query mutation error', error, {
    timestamp: new Date().toISOString(),
    type: 'mutation_error',
  });
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 10 * 60 * 1000, // 10 minutes
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors
              if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
                const status = error.status;
                if (status >= 400 && status < 500) {
                  return false;
                }
              }
              return failureCount < 3;
            },
            // Global error handler for all queries
            // Note: throwOnError is intentionally false to let components handle errors gracefully
            // Error boundaries + ErrorDisplay components provide better UX than throwing
            throwOnError: false,
          },
          mutations: {
            retry: false,
            // Global error handler for all mutations
            throwOnError: false,
          },
        },
        // Query cache-level error handlers for telemetry
        queryCache: new QueryCache({
          onError: handleQueryError,
        }),
        mutationCache: new MutationCache({
          onError: handleMutationError,
        }),
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
