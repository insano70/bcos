import type { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { createClinectService } from '@/lib/services/clinect-service';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';

/**
 * GET /api/clinect/ratings/[practiceSlug]
 *
 * Fetch aggregate ratings data for a practice from Clinect API
 *
 * @param practiceSlug - Clinect practice slug identifier
 * @returns ClinectRating with response_count, score_value, and calculated stars
 */
const handler = async (request: NextRequest, ...args: unknown[]) => {
  const startTime = Date.now();
  const context = args[0] as { params: Promise<{ practiceSlug: string }> };
  const { practiceSlug } = await context.params;

  try {
    const clinectService = createClinectService();
    const ratings = await clinectService.getRatings(practiceSlug);

    const duration = Date.now() - startTime;
    log.info('Clinect ratings fetched successfully', {
      operation: 'fetch_clinect_ratings',
      practiceSlug,
      responseCount: ratings.response_count,
      curatedResponseCount: ratings.curated_response_count,
      scoreValue: ratings.score_value,
      duration,
      component: 'api',
    });

    return createSuccessResponse(ratings, 'Ratings fetched successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Clinect ratings fetch failed', error, {
      operation: 'fetch_clinect_ratings',
      practiceSlug,
      duration,
      component: 'api',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Failed to fetch ratings data';

    return handleRouteError(error, clientErrorMessage, request);
  }
};

export const GET = publicRoute(
  handler,
  'Fetch Clinect ratings for practice website display',
  { rateLimit: 'api' }
);

