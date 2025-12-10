import type { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { createClinectService } from '@/lib/services/clinect-service';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { z } from 'zod';

/**
 * Query parameter validation schema
 */
const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  type: z.enum(['provider', 'location']).default('provider'),
});

/**
 * GET /api/clinect/reviews/[practiceSlug]
 *
 * Fetch individual patient reviews for a practice from Clinect API
 *
 * @param practiceSlug - Clinect practice slug identifier
 * @query limit - Number of reviews to fetch (1-50, default: 10)
 * @query type - Review type: 'provider' or 'location' (default: 'provider')
 * @returns ClinectReviews with array of patient reviews
 */
const handler = async (request: NextRequest, ...args: unknown[]) => {
  const startTime = Date.now();
  const context = args[0] as { params: Promise<{ practiceSlug: string }> };
  const { practiceSlug } = await context.params;

  try {
    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams = querySchema.parse({
      limit: url.searchParams.get('limit'),
      type: url.searchParams.get('type'),
    });

    const clinectService = createClinectService();
    const reviews = await clinectService.getReviews(
      practiceSlug,
      queryParams.limit,
      queryParams.type
    );

    const duration = Date.now() - startTime;
    log.info('Clinect reviews fetched successfully', {
      operation: 'fetch_clinect_reviews',
      practiceSlug,
      reviewCount: reviews.data.length,
      limit: queryParams.limit,
      type: queryParams.type,
      duration,
      component: 'api',
    });

    return createSuccessResponse(reviews, 'Reviews fetched successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Clinect reviews fetch failed', error, {
      operation: 'fetch_clinect_reviews',
      practiceSlug,
      duration,
      component: 'api',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Failed to fetch reviews data';

    return handleRouteError(error, clientErrorMessage, request);
  }
};

export const GET = publicRoute(
  handler,
  'Fetch Clinect reviews for practice website display',
  { rateLimit: 'api' }
);

