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
import { log, correlation } from '@/lib/logger';
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

  log.api('GET /api/auth/saml/metadata - Metadata request', request, 0, 0);

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      log.warn('SAML metadata requested but SAML is not configured');

      return createErrorResponse(
        'SAML SSO is not configured',
        503,
        request
      );
    }

    log.info('Generating SAML SP metadata');

    // Create SAML client and generate metadata
    const samlClient = createSAMLClient('metadata');
    const metadata = await samlClient.generateMetadata();

    const totalDuration = Date.now() - startTime;

    log.info('SAML metadata generated successfully', {
      metadataLength: metadata.length,
      duration: totalDuration
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

    log.error('SAML metadata generation failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    return createErrorResponse(
      error instanceof Error ? error : 'Metadata generation failed',
      500,
      request
    );
  }
};

// Export as public route with correlation wrapper
export const GET = publicRoute(
  async (request: NextRequest) => {
    const correlationId = correlation.generate()
    return correlation.withContext(correlationId, {}, () => samlMetadataHandler(request))
  },
  'SAML SP metadata - public endpoint for Entra configuration',
  { rateLimit: 'api' }
);

