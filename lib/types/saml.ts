/**
 * SAML Type Definitions
 * Comprehensive TypeScript interfaces for SAML SSO implementation
 * 
 * @module lib/types/saml
 * @security All types are strictly typed - ZERO any types
 * @see docs/saml-implementation-doc.md
 */

/**
 * SAML Configuration
 * Complete configuration for SAML Service Provider
 */
export interface SAMLConfig {
  /** Microsoft Entra tenant-specific endpoint */
  entryPoint: string;
  
  /** Service Provider issuer/entity ID (https://app.bendcare.com/saml/metadata) */
  issuer: string;
  
  /** Callback URL where Entra sends SAML responses */
  callbackUrl: string;
  
  /** Microsoft Entra tenant ID for validation */
  tenantId: string;
  
  /** Expected issuer from Entra (https://sts.windows.net/{TENANT_ID}/) */
  expectedIssuer: string;
  
  /** Entra's public certificate for validating SAML signatures (PEM format) */
  cert: string;
  
  /** Service Provider's private key for signing requests (PEM format, optional) */
  privateKey?: string;
  
  /** Service Provider's public certificate (PEM format, optional) */
  spCert?: string;
  
  /** Security settings */
  security: {
    /** Require signed assertions */
    wantAssertionsSigned: boolean;
    
    /** Require signed responses */
    wantAuthnResponseSigned: boolean;
    
    /** Signature algorithm (default: sha256) */
    signatureAlgorithm: 'sha1' | 'sha256' | 'sha512';
    
    /** Digest algorithm (default: sha256) */
    digestAlgorithm: 'sha1' | 'sha256' | 'sha512';
    
    /** Allowed clock skew in milliseconds (default: 5000) */
    acceptedClockSkewMs: number;
  };
  
  /** Name ID format */
  identifierFormat: string;
  
  /** Force re-authentication */
  forceAuthn: boolean;
  
  /** Disable requested authentication context */
  disableRequestedAuthnContext: boolean;
  
  /** Protocol binding for authentication requests */
  authnRequestBinding: 'HTTP-Redirect' | 'HTTP-POST';
  
  /** Allowed email domains for validation */
  allowedEmailDomains: string[];
  
  /** Certificate expiration warning threshold (days) */
  certExpiryWarningDays: number;
  
  /** SAML callback rate limit (requests per minute per IP) */
  callbackRateLimit: number;
  
  /** Enable raw SAML response logging (non-production only) */
  logRawResponses: boolean;
}

/**
 * SAML Profile
 * User information extracted from SAML assertion
 */
export interface SAMLProfile {
  /** SAML issuer (must match expectedIssuer) */
  issuer: string;
  
  /** Session index for logout */
  sessionIndex?: string;
  
  /** Name ID (typically email) */
  nameID: string;
  
  /** Name ID format */
  nameIDFormat?: string;
  
  /** InResponseTo (for replay attack prevention) */
  inResponseTo?: string;
  
  /** Assertion ID (for deduplication) */
  assertionID?: string;
  
  /** Session expiry timestamp (NotOnOrAfter from assertion) */
  sessionNotOnOrAfter?: string;
  
  /** Email address */
  email: string;
  
  /** Display name */
  displayName?: string;
  
  /** Given name (first name) */
  givenName?: string;
  
  /** Surname (last name) */
  surname?: string;
  
  /** User principal name */
  upn?: string;
  
  /** Groups/roles from Entra */
  groups?: string[];
  
  /** Custom attributes from SAML assertion */
  attributes?: Record<string, string | string[]>;
  
  /** Assertion not valid before timestamp */
  notBefore?: string;
  
  /** Assertion not valid after timestamp */
  notOnOrAfter?: string;
  
  /** Audience (should match our issuer) */
  audience?: string;
}

/**
 * SAML Response Validation Result
 * Result of validating a SAML response
 */
export interface SAMLValidationResult {
  /** Whether validation was successful */
  success: boolean;
  
  /** User profile if validation succeeded */
  profile?: SAMLProfile;
  
  /** Error message if validation failed */
  error?: string;
  
  /** Validation checks performed */
  validations: {
    signatureValid: boolean;
    issuerValid: boolean;
    audienceValid: boolean;
    timestampValid: boolean;
    notReplay: boolean;
    emailDomainValid: boolean;
  };
  
  /** Metadata about the validation */
  metadata: {
    validatedAt: Date;
    issuer: string;
    assertionID?: string;
    sessionIndex?: string;
  };
}

/**
 * SAML Certificate Information
 * Details about SAML certificates
 */
export interface SAMLCertificateInfo {
  /** Certificate fingerprint (SHA-256) */
  fingerprint: string;
  
  /** Certificate valid from */
  validFrom: Date;
  
  /** Certificate valid until */
  validUntil: Date;
  
  /** Days until expiration */
  daysUntilExpiry: number;
  
  /** Whether certificate is expired */
  isExpired: boolean;
  
  /** Whether certificate expires soon (based on warning threshold) */
  expiresSoon: boolean;
  
  /** Certificate subject */
  subject: string;
  
  /** Certificate issuer */
  issuer: string;
}

/**
 * SAML Client Factory Options
 * Options for creating SAML client instances
 */
export interface SAMLClientOptions {
  /** Environment (dev, staging, production) */
  environment: 'development' | 'staging' | 'production';
  
  /** Whether to enable certificate caching */
  enableCaching: boolean;
  
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTTL?: number;
  
  /** Whether to enable hot reload of certificates */
  enableHotReload?: boolean;
  
  /** Custom logger instance */
  logger?: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, error?: Error, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * SAML Error Types
 * Custom error types for SAML operations
 */
export class SAMLConfigError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'SAMLConfigError';
    Error.captureStackTrace(this, SAMLConfigError);
  }
}

export class SAMLValidationError extends Error {
  constructor(
    message: string,
    public readonly validationType: 'signature' | 'issuer' | 'audience' | 'timestamp' | 'replay' | 'domain',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SAMLValidationError';
    Error.captureStackTrace(this, SAMLValidationError);
  }
}

export class SAMLCertificateError extends Error {
  constructor(message: string, public readonly certificateType: 'idp' | 'sp', public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'SAMLCertificateError';
    Error.captureStackTrace(this, SAMLCertificateError);
  }
}

/**
 * SAML Authentication Context
 * Context information for SAML authentication requests
 */
export interface SAMLAuthContext {
  /** Request ID for correlation */
  requestId: string;
  
  /** User's IP address */
  ipAddress: string;
  
  /** User's user agent */
  userAgent: string;
  
  /** Timestamp of request */
  timestamp: Date;
  
  /** Relay state (optional) */
  relayState?: string;
}

/**
 * Certificate Cache Entry
 * Internal type for certificate caching
 */
export interface CertificateCacheEntry {
  /** Cached certificate (PEM format) */
  certificate: string;
  
  /** Certificate information */
  info: SAMLCertificateInfo;
  
  /** When this entry was cached */
  cachedAt: Date;
  
  /** When this entry expires */
  expiresAt: Date;
  
  /** Cache version (for invalidation) */
  version: number;
}

/**
 * Type guard: Check if object is a valid SAMLProfile
 */
export function isSAMLProfile(obj: unknown): obj is SAMLProfile {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const profile = obj as Record<string, unknown>;
  
  return (
    typeof profile.issuer === 'string' &&
    typeof profile.nameID === 'string' &&
    typeof profile.email === 'string'
  );
}

/**
 * Type guard: Check if object is a valid SAMLConfig
 */
export function isSAMLConfig(obj: unknown): obj is SAMLConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const config = obj as Record<string, unknown>;
  
  return (
    typeof config.entryPoint === 'string' &&
    typeof config.issuer === 'string' &&
    typeof config.callbackUrl === 'string' &&
    typeof config.tenantId === 'string' &&
    typeof config.expectedIssuer === 'string' &&
    typeof config.cert === 'string' &&
    typeof config.security === 'object' &&
    config.security !== null
  );
}

/**
 * Type guard: Check if error is a SAML error
 */
export function isSAMLError(error: unknown): error is SAMLConfigError | SAMLValidationError | SAMLCertificateError {
  return (
    error instanceof SAMLConfigError ||
    error instanceof SAMLValidationError ||
    error instanceof SAMLCertificateError
  );
}

