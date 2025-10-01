/**
 * SAML Service Provider Metadata Endpoint
 * 
 * Serves SP metadata XML for Microsoft Entra configuration
 * This is optional but helpful for Entra administrators
 * 
 * @route GET /api/auth/saml/metadata
 * @access Public (metadata is not sensitive)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { withCorrelation } from '@/lib/logger';
import { createAPILogger } from '@/lib/logger/api-features';
import { createSAMLClient } from '@/lib/saml/client';
import { isSAMLEnabled } from '@/lib/env';

// Cache metadata for 1 hour (it rarely changes)
export const revalidate = 3600;

/**
 * SAML Metadata Handler
 * Generates and serves SP metadata XML
 */
const samlMetadataHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  // Create API logger
  const apiLogger = createAPILogger(request, 'saml-metadata');
  const logger = apiLogger.getLogger();

  apiLogger.logRequest({
    authType: 'none',
    suspicious: false
  });

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      logger.warn('SAML metadata requested but SAML is not configured');

      return createErrorResponse(
        'SAML SSO is not configured',
        503,
        request
      );
    }

    logger.info('Generating SAML SP metadata');

    // Create SAML client and generate metadata
    const samlClient = createSAMLClient('metadata');
    const metadata = await samlClient.generateMetadata();

    const totalDuration = Date.now() - startTime;

    logger.info('SAML metadata generated successfully', {
      metadataLength: metadata.length,
      duration: totalDuration
    });

    apiLogger.logResponse(200, {
      recordCount: 1,
      cacheHit: false,
      processingTimeBreakdown: {
        total: totalDuration
      }
    });

    // Return XML response with proper headers
    return new NextResponse(metadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/samlmetadata+xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'X-Content-Type-Options': 'nosniff'
      }
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error('SAML metadata generation failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    apiLogger.logResponse(500, {
      recordCount: 0
    }, error instanceof Error ? error : undefined);

    return createErrorResponse(
      error instanceof Error ? error : 'Metadata generation failed',
      500,
      request
    );
  }
};

// Export as public route with correlation wrapper
export const GET = publicRoute(
  withCorrelation(samlMetadataHandler),
  'SAML SP metadata - public endpoint for Entra configuration',
  { rateLimit: 'api' }
);

