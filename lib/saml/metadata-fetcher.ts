/**
 * SAML Metadata Fetcher
 *
 * Automatically fetches and parses Microsoft Entra federation metadata
 * to extract the IDP signing certificate. This eliminates the need for
 * manual certificate management.
 *
 * Features:
 * - Automatic metadata fetch from Microsoft's federation endpoint
 * - Simple regex-based certificate extraction (no complex XML parsing)
 * - 24-hour in-memory cache with automatic invalidation
 * - Certificate rotation detection and logging
 * - HTTPS enforcement for security
 *
 * @module lib/saml/metadata-fetcher
 * @security Zero any types - strict TypeScript typing throughout
 */

import { X509Certificate } from 'node:crypto';
import { createAppLogger } from '@/lib/logger/factory';

// Create logger for metadata operations
const metadataLogger = createAppLogger('saml-metadata', {
  component: 'security',
  feature: 'saml-sso',
  module: 'metadata-fetcher',
});

/**
 * Metadata cache entry
 */
interface MetadataCacheEntry {
  certificate: string;
  fetchedAt: Date;
  fingerprint: string;
  validUntil: Date;
}

/**
 * Metadata fetch result
 */
interface MetadataFetchResult {
  certificate: string;
  fingerprint: string;
  validUntil: Date;
  fromCache: boolean;
}

/**
 * In-memory metadata cache
 * Maps tenantId -> cache entry
 */
const metadataCache = new Map<string, MetadataCacheEntry>();

/**
 * Cache TTL - 24 hours
 * Metadata doesn't change frequently, but we want to pick up certificate rotations
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch timeout - 10 seconds
 * Microsoft's endpoint should respond quickly
 */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch IDP certificate from Microsoft Entra federation metadata
 *
 * This function:
 * 1. Checks cache first (24-hour TTL)
 * 2. If not cached or expired, fetches metadata XML from Microsoft
 * 3. Extracts signing certificate using simple regex
 * 4. Formats certificate as PEM
 * 5. Caches the result
 * 6. Detects certificate rotation
 *
 * @param tenantId - Microsoft Entra tenant ID
 * @param appId - Optional Application ID for app-specific metadata
 * @returns Certificate in PEM format
 * @throws Error if fetch fails or certificate not found in metadata
 */
export async function fetchIdPCertificateFromMetadata(
  tenantId: string,
  appId?: string
): Promise<string> {
  // Validate tenant ID format (basic check)
  if (!tenantId || !/^[a-f0-9-]{36}$/i.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  // Create cache key that includes app ID
  const cacheKey = appId ? `${tenantId}:${appId}` : tenantId;

  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    metadataLogger.debug('Using cached IDP certificate', {
      tenantId,
      appId,
      cacheAge: Date.now() - cached.fetchedAt.getTime(),
      fingerprint: `${cached.fingerprint.substring(0, 20)}...`,
      validUntil: cached.validUntil.toISOString(),
    });
    return cached.certificate;
  }

  // Fetch fresh metadata
  metadataLogger.info('Fetching IDP metadata from Microsoft', { tenantId, appId });

  // Build metadata URL with optional appid parameter for app-specific certificates
  const metadataUrl = appId
    ? `https://login.microsoftonline.com/${tenantId}/federationmetadata/2007-06/federationmetadata.xml?appid=${appId}`
    : `https://login.microsoftonline.com/${tenantId}/federationmetadata/2007-06/federationmetadata.xml`;

  const startTime = Date.now();
  let response: Response;

  try {
    response = await fetch(metadataUrl, {
      headers: {
        'User-Agent': 'BCOS-SAML/1.0',
        Accept: 'application/samlmetadata+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    metadataLogger.error(
      'Failed to fetch IDP metadata',
      error instanceof Error ? error : new Error(String(error)),
      {
        tenantId,
        url: metadataUrl,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    throw new Error(
      `Failed to fetch metadata from Microsoft: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (!response.ok) {
    metadataLogger.error(
      'IDP metadata fetch returned error status',
      new Error(`HTTP ${response.status}`),
      {
        tenantId,
        status: response.status,
        statusText: response.statusText,
      }
    );
    throw new Error(`Metadata fetch failed: HTTP ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const fetchDuration = Date.now() - startTime;

  metadataLogger.debug('IDP metadata fetched successfully', {
    tenantId,
    duration: fetchDuration,
    xmlLength: xml.length,
  });

  // Extract certificate from metadata XML
  // Microsoft's federation metadata contains: <X509Certificate>base64cert</X509Certificate>
  // We use simple regex instead of full XML parser for performance and simplicity
  const certMatch = xml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/);

  if (!certMatch || !certMatch[1]) {
    metadataLogger.error(
      'No certificate found in metadata XML',
      new Error('Certificate not found'),
      {
        tenantId,
        xmlLength: xml.length,
        xmlPreview: `${xml.substring(0, 200)}...`,
      }
    );
    throw new Error('No signing certificate found in metadata XML');
  }

  // Extract base64 certificate (single line, no whitespace)
  const base64Cert = certMatch[1].trim().replace(/\s+/g, '');

  // Format as PEM with proper line breaks (64 characters per line)
  let pemCert = '-----BEGIN CERTIFICATE-----\n';
  for (let i = 0; i < base64Cert.length; i += 64) {
    pemCert += `${base64Cert.substring(i, i + 64)}\n`;
  }
  pemCert += '-----END CERTIFICATE-----\n';

  // Parse certificate to get metadata and validate format
  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(pemCert);
  } catch (error) {
    metadataLogger.error(
      'Failed to parse extracted certificate',
      error instanceof Error ? error : new Error(String(error)),
      {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
        pemPreview: `${pemCert.substring(0, 100)}...`,
      }
    );
    throw new Error('Extracted certificate is invalid');
  }

  const fingerprint = x509.fingerprint256;
  const validUntil = new Date(x509.validTo);

  // Log certificate details
  metadataLogger.info('IDP certificate extracted from metadata', {
    tenantId,
    fingerprint: `${fingerprint.substring(0, 20)}...`,
    validFrom: x509.validFrom,
    validUntil: x509.validTo,
    issuer: x509.issuer,
    subject: x509.subject,
  });

  // Check if certificate rotated (different from cached)
  if (cached && cached.fingerprint !== fingerprint) {
    metadataLogger.warn('IDP certificate ROTATED - new certificate detected', {
      tenantId,
      oldFingerprint: `${cached.fingerprint.substring(0, 20)}...`,
      newFingerprint: `${fingerprint.substring(0, 20)}...`,
      oldValidUntil: cached.validUntil.toISOString(),
      newValidUntil: validUntil.toISOString(),
      alert: 'CERTIFICATE_ROTATION',
    });
  }

  // Warn if certificate expires soon
  const daysUntilExpiry = Math.floor((validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 30) {
    metadataLogger.warn('IDP certificate expires soon', {
      tenantId,
      fingerprint: `${fingerprint.substring(0, 20)}...`,
      validUntil: validUntil.toISOString(),
      daysRemaining: daysUntilExpiry,
      alert: 'CERTIFICATE_EXPIRY_WARNING',
    });
  }

  // Cache the certificate (use same key as lookup)
  metadataCache.set(cacheKey, {
    certificate: pemCert,
    fetchedAt: new Date(),
    fingerprint,
    validUntil,
  });

  metadataLogger.debug('IDP certificate cached', {
    tenantId,
    cacheSize: metadataCache.size,
    cacheTTL: CACHE_TTL_MS,
  });

  return pemCert;
}

/**
 * Get IDP certificate with caching and metadata details
 * Returns additional metadata for monitoring
 */
export async function getIdPCertificate(
  tenantId: string,
  appId?: string
): Promise<MetadataFetchResult> {
  const cacheKey = appId ? `${tenantId}:${appId}` : tenantId;
  const cached = metadataCache.get(cacheKey);
  const fromCache = cached !== undefined && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;

  const certificate = await fetchIdPCertificateFromMetadata(tenantId, appId);

  // Get fresh cache entry (updated by fetchIdPCertificateFromMetadata)
  const entry = metadataCache.get(cacheKey);
  if (!entry) {
    throw new Error('Cache entry not found after fetch - this should not happen');
  }

  return {
    certificate,
    fingerprint: entry.fingerprint,
    validUntil: entry.validUntil,
    fromCache,
  };
}

/**
 * Clear metadata cache (for testing or manual refresh)
 */
export function clearMetadataCache(tenantId?: string): void {
  if (tenantId) {
    metadataCache.delete(tenantId);
    metadataLogger.info('Metadata cache cleared for tenant', { tenantId });
  } else {
    metadataCache.clear();
    metadataLogger.info('Metadata cache cleared for all tenants');
  }
}

/**
 * Get metadata cache statistics (for monitoring)
 */
export function getMetadataCacheStats(): {
  totalEntries: number;
  tenants: Array<{
    tenantId: string;
    age: number;
    fingerprint: string;
    validUntil: string;
  }>;
} {
  const tenants = Array.from(metadataCache.entries()).map(([tenantId, entry]) => ({
    tenantId,
    age: Date.now() - entry.fetchedAt.getTime(),
    fingerprint: `${entry.fingerprint.substring(0, 20)}...`,
    validUntil: entry.validUntil.toISOString(),
  }));

  return {
    totalEntries: metadataCache.size,
    tenants,
  };
}
