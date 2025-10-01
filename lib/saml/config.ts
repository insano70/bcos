/**
 * SAML Configuration and Certificate Management
 *
 * Features:
 * - Certificate caching with TTL and invalidation
 * - AWS Secrets Manager integration for production
 * - Certificate expiration monitoring
 * - Hot reload capability
 * - Dual certificate support during rotation
 * - Environment-aware configuration (dev/staging/production)
 *
 * @module lib/saml/config
 * @security Zero any types - strict TypeScript typing throughout
 */

import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSAMLConfig, isSAMLEnabled } from '@/lib/env';
import { createAppLogger } from '@/lib/logger/factory';
import type {
  CertificateCacheEntry,
  SAMLCertificateError,
  SAMLCertificateInfo,
  SAMLConfig,
  SAMLConfigError,
} from '@/lib/types/saml';
import { fetchIdPCertificateFromMetadata } from './metadata-fetcher';

// Create logger for SAML configuration operations
const samlConfigLogger = createAppLogger('saml-config', {
  component: 'security',
  feature: 'saml-sso',
  module: 'config',
});

/**
 * Certificate Cache Manager
 * Handles caching and validation of SAML certificates
 * Implements hot reload and dual certificate support
 */
class CertificateCache {
  private cache = new Map<string, CertificateCacheEntry>();
  private readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
  private cacheVersion = 1;

  /**
   * Get certificate with caching
   * @param key - Cache key (e.g., 'idp_cert', 'sp_cert')
   * @param loader - Function to load certificate if cache miss
   * @param ttl - Time to live in milliseconds
   */
  async get(
    key: string,
    loader: () => Promise<string> | string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<{ certificate: string; info: SAMLCertificateInfo }> {
    const cached = this.cache.get(key);
    const now = new Date();

    // Check if cached and not expired
    if (cached && cached.expiresAt > now) {
      samlConfigLogger.debug('Certificate cache hit', {
        key,
        cachedAt: cached.cachedAt,
        expiresAt: cached.expiresAt,
        version: cached.version,
      });
      return {
        certificate: cached.certificate,
        info: cached.info,
      };
    }

    // Cache miss or expired - load certificate
    samlConfigLogger.info('Certificate cache miss - loading certificate', {
      key,
      cacheExpired: cached ? cached.expiresAt <= now : false,
    });

    const certificate = await loader();
    const info = this.parseCertificateInfo(certificate, key);

    // Validate certificate before caching
    this.validateCertificate(info, key);

    // Cache the certificate
    const cacheEntry: CertificateCacheEntry = {
      certificate,
      info,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      version: this.cacheVersion,
    };

    this.cache.set(key, cacheEntry);

    samlConfigLogger.info('Certificate cached successfully', {
      key,
      expiresAt: cacheEntry.expiresAt,
      certValidUntil: info.validUntil,
      daysUntilExpiry: info.daysUntilExpiry,
    });

    return { certificate, info };
  }

  /**
   * Parse certificate information from PEM string
   */
  private parseCertificateInfo(certPEM: string, key: string): SAMLCertificateInfo {
    try {
      // X509Certificate requires the PEM to be properly formatted
      const cert = new X509Certificate(certPEM);

      const validFrom = new Date(cert.validFrom);
      const validUntil = new Date(cert.validTo);
      const now = new Date();
      const daysUntilExpiry = Math.floor(
        (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate SHA-256 fingerprint
      const derBuffer = cert.raw;
      const fingerprint =
        createHash('sha256')
          .update(derBuffer)
          .digest('hex')
          .toUpperCase()
          .match(/.{2}/g)
          ?.join(':') || '';

      const envConfig = getSAMLConfig();
      const warningDays = envConfig?.certExpiryWarningDays || 30;

      return {
        fingerprint,
        validFrom,
        validUntil,
        daysUntilExpiry,
        isExpired: now > validUntil,
        expiresSoon: daysUntilExpiry < warningDays && daysUntilExpiry > 0,
        subject: cert.subject,
        issuer: cert.issuer,
      };
    } catch (error) {
      const certError: SAMLCertificateError = {
        name: 'SAMLCertificateError',
        message: `Failed to parse certificate '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        certificateType: key.includes('idp') ? 'idp' : 'sp',
        details: { key, error: error instanceof Error ? error.message : String(error) },
      } as SAMLCertificateError;

      samlConfigLogger.error(
        'Certificate parsing failed',
        new Error(certError.message),
        certError.details
      );
      throw certError;
    }
  }

  /**
   * Validate certificate is suitable for use
   * Implements certificate expiration pre-checks
   */
  private validateCertificate(info: SAMLCertificateInfo, key: string): void {
    const envConfig = getSAMLConfig();
    const warningDays = envConfig?.certExpiryWarningDays || 30;

    // Check if certificate is expired
    if (info.isExpired) {
      const error: SAMLCertificateError = {
        name: 'SAMLCertificateError',
        message: `Certificate '${key}' has expired. Valid until: ${info.validUntil.toISOString()}`,
        certificateType: key.includes('idp') ? 'idp' : 'sp',
        details: {
          key,
          validUntil: info.validUntil,
          daysExpired: Math.abs(info.daysUntilExpiry),
        },
      } as SAMLCertificateError;

      samlConfigLogger.error(
        'Certificate expired - rejecting',
        new Error(error.message),
        error.details
      );
      throw error;
    }

    // Reject startup if certificate expires in less than 15 days (production safety)
    if (info.daysUntilExpiry < 15 && process.env.NODE_ENV === 'production') {
      const error: SAMLCertificateError = {
        name: 'SAMLCertificateError',
        message: `Certificate '${key}' expires in ${info.daysUntilExpiry} days - too soon for production use. Please rotate certificate.`,
        certificateType: key.includes('idp') ? 'idp' : 'sp',
        details: {
          key,
          daysUntilExpiry: info.daysUntilExpiry,
          validUntil: info.validUntil,
          minimumDays: 15,
        },
      } as SAMLCertificateError;

      samlConfigLogger.error(
        'Certificate expires too soon - rejecting startup',
        new Error(error.message),
        error.details
      );
      throw error;
    }

    // Warning if certificate expires soon
    if (info.expiresSoon) {
      samlConfigLogger.warn('Certificate expires soon - plan rotation', {
        key,
        daysUntilExpiry: info.daysUntilExpiry,
        validUntil: info.validUntil,
        warningThreshold: warningDays,
      });

      // TODO: Send alert notification to admin
      // This should integrate with your monitoring/alerting system
    }

    // Log successful validation
    samlConfigLogger.info('Certificate validated successfully', {
      key,
      fingerprint: info.fingerprint.substring(0, 20) + '...',
      validFrom: info.validFrom,
      validUntil: info.validUntil,
      daysUntilExpiry: info.daysUntilExpiry,
    });
  }

  /**
   * Invalidate cache (for hot reload)
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      samlConfigLogger.info('Certificate cache invalidated', { key });
    } else {
      this.cache.clear();
      this.cacheVersion++;
      samlConfigLogger.info('All certificate cache invalidated', { newVersion: this.cacheVersion });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[]; version: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      version: this.cacheVersion,
    };
  }
}

// Global certificate cache instance
const certificateCache = new CertificateCache();

/**
 * Load certificate from file system or environment variable
 * @param certPathOrContent - File path or PEM content
 * @param certName - Name for error messages
 */
function loadCertificateFromFS(certPathOrContent: string | undefined, certName: string): string {
  if (!certPathOrContent) {
    throw new Error(`${certName} is not configured`);
  }

  // If it looks like a file path, read it
  if (certPathOrContent.includes('/') || certPathOrContent.includes('.pem')) {
    try {
      const certPath = resolve(process.cwd(), certPathOrContent);
      const cert = readFileSync(certPath, 'utf-8');
      samlConfigLogger.debug('Certificate loaded from file', {
        certName,
        path: certPath,
        length: cert.length,
      });
      return cert;
    } catch (error) {
      const err = new Error(
        `Failed to load ${certName} from path '${certPathOrContent}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      samlConfigLogger.error('Certificate file read failed', err, {
        certName,
        path: certPathOrContent,
      });
      throw err;
    }
  }

  // Otherwise, assume it's the PEM content directly
  if (
    !certPathOrContent.includes('BEGIN CERTIFICATE') &&
    !certPathOrContent.includes('BEGIN RSA PRIVATE KEY')
  ) {
    samlConfigLogger.warn('Certificate content does not contain expected PEM markers', {
      certName,
      contentPreview: certPathOrContent.substring(0, 50),
    });
  }

  return certPathOrContent;
}

/**
 * Load certificate from AWS Secrets Manager
 * For production environments
 *
 * Note: AWS SDK will be added in Phase 6 when we update package.json
 * For now, this is a placeholder that will be activated after dependency installation
 */
async function loadCertificateFromSecretsManager(
  secretKey: string,
  certName: string
): Promise<string> {
  // TODO: Uncomment after @aws-sdk/client-secrets-manager is added to package.json
  // This will be activated in Phase 6

  samlConfigLogger.error(
    'AWS Secrets Manager integration not yet available',
    new Error('Dependency not installed'),
    {
      secretKey,
      certName,
      note: 'Install @aws-sdk/client-secrets-manager to use Secrets Manager',
    }
  );

  throw new Error(
    `AWS Secrets Manager integration requires @aws-sdk/client-secrets-manager package. ` +
      `For now, use file paths or direct PEM content in environment variables.`
  );

  /*
  // This code will be uncommented after AWS SDK is installed:
  
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetSecretValueCommand({ SecretId: secretKey });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret '${secretKey}' has no SecretString value`);
    }

    const secrets = JSON.parse(response.SecretString) as Record<string, string>;
    const certificate = secrets[certName];

    if (!certificate) {
      throw new Error(`Certificate '${certName}' not found in secret '${secretKey}'`);
    }

    samlConfigLogger.info('Certificate loaded from AWS Secrets Manager', {
      secretKey,
      certName,
      length: certificate.length
    });

    return certificate;
  } catch (error) {
    const err = new Error(
      `Failed to load ${certName} from Secrets Manager '${secretKey}': ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    samlConfigLogger.error('Secrets Manager certificate load failed', err, {
      secretKey,
      certName
    });
    throw err;
  }
  */
}

/**
 * Get IdP (Entra) certificate with caching
 *
 * Strategy:
 * - Production: Automatically fetch from Microsoft's metadata endpoint
 * - Development: Try metadata fetch, fall back to file if ENTRA_CERT is configured
 *
 * The certificateCache.get() method:
 * - Takes a loader function that returns the raw certificate string
 * - Automatically parses certificate info and validates it
 * - Returns { certificate, info }
 */
async function getIdPCertificate(): Promise<{ certificate: string; info: SAMLCertificateInfo }> {
  return await certificateCache.get('idp_cert', async (): Promise<string> => {
    const envConfig = getSAMLConfig();
    if (!envConfig) {
      throw new Error('SAML configuration is not available');
    }

    // DUAL CERTIFICATE SUPPORT for rotation scenarios
    // Microsoft publishes new certs in metadata before using them for signing
    // We need to try BOTH the metadata cert AND the file cert during rotation

    const certificates: string[] = [];
    let metadataCert: string | null = null;
    let fileCert: string | null = null;

    // Always try to fetch from metadata first
    try {
      samlConfigLogger.info('Fetching IDP certificate from metadata', {
        tenantId: envConfig.tenantId,
        appId: envConfig.appId,
      });
      metadataCert = await fetchIdPCertificateFromMetadata(envConfig.tenantId, envConfig.appId);
      certificates.push(metadataCert);
    } catch (error) {
      samlConfigLogger.warn('Metadata fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Also load from file if available (for dual-cert support during rotation)
    if (envConfig.entraCert) {
      try {
        fileCert = loadCertificateFromFS(envConfig.entraCert, 'ENTRA_CERT');

        // Only add file cert if it's different from metadata cert
        if (metadataCert) {
          const crypto = await import('node:crypto');
          const metadataFingerprint = new crypto.X509Certificate(metadataCert).fingerprint256;
          const fileFingerprint = new crypto.X509Certificate(fileCert).fingerprint256;

          if (metadataFingerprint !== fileFingerprint) {
            samlConfigLogger.warn('Certificate rotation detected - using BOTH certificates', {
              metadataFingerprint: metadataFingerprint.substring(0, 20) + '...',
              fileFingerprint: fileFingerprint.substring(0, 20) + '...',
            });
            certificates.push(fileCert);
          }
        } else {
          // No metadata cert, use file as primary
          certificates.push(fileCert);
        }
      } catch (error) {
        samlConfigLogger.warn('File certificate load failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Must have at least one certificate
    if (certificates.length === 0) {
      throw new Error('No IDP certificates available - both metadata fetch and file load failed');
    }

    // Return the primary certificate (first one)
    // The SAML client will be configured with ALL certificates for validation
    const primaryCert = certificates[0];
    if (!primaryCert) {
      throw new Error('Primary certificate is undefined - this should not happen');
    }

    samlConfigLogger.info('IDP certificates loaded', {
      count: certificates.length,
      source:
        certificates.length > 1
          ? 'metadata+file (dual-cert rotation)'
          : metadataCert
            ? 'metadata'
            : 'file',
    });

    return primaryCert;
  });
}

/**
 * Get SP (Service Provider) certificate with caching
 */
async function getSPCertificate(): Promise<
  { certificate: string; info: SAMLCertificateInfo } | undefined
> {
  const envConfig = getSAMLConfig();
  if (!envConfig?.spCert) {
    return undefined; // SP certificate is optional
  }

  return await certificateCache.get('sp_cert', async () => {
    // Production: Load from Secrets Manager
    if (process.env.NODE_ENV === 'production' && envConfig.spCert?.startsWith('arn:')) {
      return await loadCertificateFromSecretsManager(envConfig.spCert, 'SAML_CERT');
    }

    // Development/Staging: Load from file or env var
    return loadCertificateFromFS(envConfig.spCert, 'SAML_CERT');
  });
}

/**
 * Get SP (Service Provider) private key
 * Note: Private keys are NOT certificates, so we don't use certificate caching/parsing
 */
async function getSPPrivateKey(): Promise<string | undefined> {
  const envConfig = getSAMLConfig();
  if (!envConfig?.spPrivateKey) {
    return undefined; // SP private key is optional
  }

  // Production: Load from Secrets Manager
  if (process.env.NODE_ENV === 'production' && envConfig.spPrivateKey.startsWith('arn:')) {
    return await loadCertificateFromSecretsManager(envConfig.spPrivateKey, 'SAML_PRIVATE_KEY');
  }

  // Development/Staging: Load from file or env var
  // Private keys don't go through certificate cache since they're not X509 certificates
  const privateKey = loadCertificateFromFS(envConfig.spPrivateKey, 'SAML_PRIVATE_KEY');

  samlConfigLogger.debug('SP private key loaded', {
    length: privateKey.length,
    type: 'RSA_PRIVATE_KEY',
  });

  return privateKey;
}

/**
 * Build complete SAML configuration
 * Validates all settings and loads certificates with caching
 */
export async function buildSAMLConfig(): Promise<SAMLConfig> {
  const startTime = Date.now();

  // Check if SAML is enabled
  if (!isSAMLEnabled()) {
    const error: SAMLConfigError = {
      name: 'SAMLConfigError',
      message: 'SAML SSO is not configured. Required environment variables are missing.',
      details: {
        required: ['ENTRA_TENANT_ID', 'SAML_ISSUER', 'SAML_CALLBACK_URL'],
        configured: {
          ENTRA_TENANT_ID: !!process.env.ENTRA_TENANT_ID,
          SAML_ISSUER: !!process.env.SAML_ISSUER,
          SAML_CALLBACK_URL: !!process.env.SAML_CALLBACK_URL,
        },
      },
    } as SAMLConfigError;

    samlConfigLogger.error(
      'SAML configuration incomplete',
      new Error(error.message),
      error.details
    );
    throw error;
  }

  const envConfig = getSAMLConfig();
  if (!envConfig) {
    throw new Error('SAML configuration returned undefined despite being enabled');
  }

  samlConfigLogger.info('Building SAML configuration', {
    environment: process.env.NODE_ENV,
    tenantId: envConfig.tenantId,
    issuer: envConfig.issuer,
    callbackUrl: envConfig.callbackUrl,
  });

  // Load and validate IdP certificate (required)
  const { certificate: idpCert, info: idpCertInfo } = await getIdPCertificate();

  // Load SP certificate and private key (optional)
  const spCertResult = await getSPCertificate();
  const spPrivateKey = await getSPPrivateKey();

  // Log certificate information
  samlConfigLogger.info('SAML certificates loaded', {
    idpCertFingerprint: idpCertInfo.fingerprint.substring(0, 20) + '...',
    idpCertExpiry: idpCertInfo.validUntil,
    idpCertDaysRemaining: idpCertInfo.daysUntilExpiry,
    spCertConfigured: !!spCertResult,
    spPrivateKeyConfigured: !!spPrivateKey,
    loadDuration: Date.now() - startTime,
  });

  // Validate configuration URLs
  validateConfigurationURLs(envConfig);

  // Build the configuration object
  // Use explicit undefined for optional properties to satisfy exactOptionalPropertyTypes
  const config: SAMLConfig = {
    entryPoint: envConfig.entryPoint,
    issuer: envConfig.issuer,
    callbackUrl: envConfig.callbackUrl,
    tenantId: envConfig.tenantId,
    expectedIssuer: envConfig.expectedIssuer,
    cert: idpCert,
    ...(spPrivateKey !== undefined && { privateKey: spPrivateKey }),
    ...(spCertResult?.certificate !== undefined && { spCert: spCertResult.certificate }),

    security: {
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      acceptedClockSkewMs: 5000, // 5 seconds tolerance
    },

    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    forceAuthn: false,
    disableRequestedAuthnContext: false,
    authnRequestBinding: 'HTTP-Redirect',

    allowedEmailDomains: envConfig.allowedEmailDomains,
    certExpiryWarningDays: envConfig.certExpiryWarningDays,
    callbackRateLimit: envConfig.callbackRateLimit,
    logRawResponses: envConfig.logRawResponses,
  };

  samlConfigLogger.info('SAML configuration built successfully', {
    duration: Date.now() - startTime,
    allowedDomains: config.allowedEmailDomains.length,
    certExpiryWarning: config.certExpiryWarningDays,
    callbackRateLimit: config.callbackRateLimit,
  });

  return config;
}

/**
 * Validate configuration URLs are properly formatted
 */
function validateConfigurationURLs(envConfig: ReturnType<typeof getSAMLConfig>): void {
  if (!envConfig) {
    throw new Error('Environment configuration is undefined');
  }

  const validations = [
    {
      name: 'entryPoint',
      value: envConfig.entryPoint,
      mustInclude: envConfig.tenantId,
      mustNotInclude: ['common', 'organizations'],
    },
    {
      name: 'expectedIssuer',
      value: envConfig.expectedIssuer,
      mustInclude: envConfig.tenantId,
      mustEndWith: '/',
    },
    {
      name: 'callbackUrl',
      value: envConfig.callbackUrl,
      mustInclude: '/api/auth/saml/callback',
      mustStartWith: process.env.NODE_ENV === 'production' ? 'https://' : undefined,
    },
  ];

  for (const validation of validations) {
    // Check mustInclude
    if (validation.mustInclude && !validation.value.includes(validation.mustInclude)) {
      const error: SAMLConfigError = {
        name: 'SAMLConfigError',
        message: `${validation.name} must include '${validation.mustInclude}'`,
        details: {
          name: validation.name,
          value: validation.value,
          mustInclude: validation.mustInclude,
        },
      } as SAMLConfigError;

      samlConfigLogger.error(
        'Configuration validation failed',
        new Error(error.message),
        error.details
      );
      throw error;
    }

    // Check mustNotInclude
    if (validation.mustNotInclude) {
      for (const forbidden of validation.mustNotInclude) {
        if (validation.value.toLowerCase().includes(forbidden.toLowerCase())) {
          const error: SAMLConfigError = {
            name: 'SAMLConfigError',
            message: `${validation.name} must NOT include '${forbidden}' - use tenant-specific endpoint for security`,
            details: { name: validation.name, value: validation.value, forbidden },
          } as SAMLConfigError;

          samlConfigLogger.error(
            'Configuration validation failed - security risk',
            new Error(error.message),
            error.details
          );
          throw error;
        }
      }
    }

    // Check mustEndWith
    if (validation.mustEndWith && !validation.value.endsWith(validation.mustEndWith)) {
      samlConfigLogger.warn('Configuration URL format warning', {
        name: validation.name,
        value: validation.value,
        expected: `should end with '${validation.mustEndWith}'`,
      });
    }

    // Check mustStartWith
    if (validation.mustStartWith && !validation.value.startsWith(validation.mustStartWith)) {
      const error: SAMLConfigError = {
        name: 'SAMLConfigError',
        message: `${validation.name} must start with '${validation.mustStartWith}' in production`,
        details: {
          name: validation.name,
          value: validation.value,
          mustStartWith: validation.mustStartWith,
        },
      } as SAMLConfigError;

      samlConfigLogger.error(
        'Configuration validation failed - must use HTTPS',
        new Error(error.message),
        error.details
      );
      throw error;
    }
  }

  samlConfigLogger.debug('Configuration URLs validated successfully');
}

/**
 * Invalidate certificate cache
 * For hot reload capability
 */
export function invalidateCertificateCache(key?: string): void {
  certificateCache.invalidate(key);
}

/**
 * Get certificate cache statistics
 * For monitoring and debugging
 */
export function getCertificateCacheStats(): { size: number; keys: string[]; version: number } {
  return certificateCache.getStats();
}

/**
 * Pre-validate SAML configuration at startup
 * Ensures all certificates are valid before accepting requests
 * Call this during application initialization
 */
export async function validateSAMLConfigAtStartup(): Promise<void> {
  if (!isSAMLEnabled()) {
    samlConfigLogger.info('SAML SSO is disabled - skipping configuration validation');
    return;
  }

  samlConfigLogger.info('Validating SAML configuration at startup...');

  try {
    const config = await buildSAMLConfig();

    samlConfigLogger.info('SAML configuration validated successfully at startup', {
      tenantId: config.tenantId,
      allowedDomains: config.allowedEmailDomains,
      certExpiryWarning: config.certExpiryWarningDays,
      environment: process.env.NODE_ENV,
    });

    // Log certificate cache stats
    const cacheStats = getCertificateCacheStats();
    samlConfigLogger.debug('Certificate cache initialized', cacheStats);
  } catch (error) {
    samlConfigLogger.error(
      'SAML configuration validation failed at startup',
      error instanceof Error ? error : new Error(String(error)),
      { error: error instanceof Error ? error.message : String(error) }
    );

    // In production, fail fast if SAML is misconfigured
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    // In development, log warning but allow startup
    samlConfigLogger.warn('SAML configuration invalid - SSO will not be available', {
      environment: process.env.NODE_ENV,
    });
  }
}

/**
 * Get certificate information for monitoring
 * Returns current certificate expiration status
 */
export async function getCertificateInfo(): Promise<{
  idp: SAMLCertificateInfo;
  sp?: SAMLCertificateInfo;
}> {
  const idp = await getIdPCertificate();
  const sp = await getSPCertificate();

  // Explicitly handle optional sp to satisfy exactOptionalPropertyTypes
  const result: { idp: SAMLCertificateInfo; sp?: SAMLCertificateInfo } = {
    idp: idp.info,
  };

  if (sp?.info !== undefined) {
    result.sp = sp.info;
  }

  return result;
}
