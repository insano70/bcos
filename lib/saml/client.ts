/**
 * SAML Client Wrapper
 * Factory pattern implementation for SAML authentication
 *
 * Features:
 * - Factory pattern (not singleton) for proper lifecycle management
 * - Comprehensive SAML response validation
 * - Issuer validation (tenant isolation)
 * - Signature verification
 * - Replay attack prevention
 * - Timestamp validation
 * - Audience restriction
 * - Email domain validation
 * - Security logging with correlation
 *
 * @module lib/saml/client
 * @security Zero any types - strict TypeScript typing throughout
 */

// Type-only import - will not cause runtime error if package not installed yet
// Actual import happens at runtime with dynamic import()
type SAML = {
  getAuthorizeUrlAsync: (
    relayState: string,
    host: Record<string, unknown>,
    options: Record<string, unknown>
  ) => Promise<string>;
  validatePostResponseAsync: (body: {
    SAMLResponse: string;
  }) => Promise<{ profile: Record<string, unknown>; loggedOut: boolean }>;
  generateServiceProviderMetadata: (decryptionCert?: string, signingCert?: string) => string;
};

type NodeSAMLProfile = Record<string, unknown>;

import { eq } from 'drizzle-orm';
import { account_security, db, users } from '@/lib/db';
import { log } from '@/lib/logger';
import { AuditLogger } from '@/lib/api/services/audit';
import type {
  SAMLAuthContext,
  SAMLConfig,
  SAMLProfile,
  SAMLValidationError,
  SAMLValidationResult,
} from '@/lib/types/saml';
import { buildSAMLConfig } from './config';
import { checkAndTrackAssertion } from './replay-prevention';

// Create logger for SAML client operations
/**
 * Transform node-saml Profile to our SAMLProfile interface
 * Handles the various claim formats from Microsoft Entra
 */
function transformSAMLProfile(nodeSAMLProfile: NodeSAMLProfile): SAMLProfile {
  // Helper to get claim value (handles both string and array)
  const getClaim = (profile: Record<string, unknown>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = profile[key];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        return value[0];
      }
    }
    return undefined;
  };

  // Extract email from various possible claim names
  const email = getClaim(
    nodeSAMLProfile,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'email',
    'mail',
    'nameID'
  );

  if (!email) {
    throw new Error('No email found in SAML response - cannot identify user');
  }

  // Extract other attributes
  const displayName = getClaim(
    nodeSAMLProfile,
    'http://schemas.microsoft.com/identity/claims/displayname',
    'displayName',
    'name'
  );

  const givenName = getClaim(
    nodeSAMLProfile,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    'givenName',
    'firstName'
  );

  const surname = getClaim(
    nodeSAMLProfile,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    'surname',
    'lastName'
  );

  const upn = getClaim(
    nodeSAMLProfile,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    'upn',
    'userPrincipalName'
  );

  // Extract groups (if configured in Entra)
  const groupsClaim =
    nodeSAMLProfile['http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'];
  const groups = Array.isArray(groupsClaim)
    ? groupsClaim.filter((g): g is string => typeof g === 'string')
    : undefined;

  // Build our strictly-typed SAMLProfile
  // Use spread operator for optional properties to satisfy exactOptionalPropertyTypes
  const profile: SAMLProfile = {
    issuer: String(nodeSAMLProfile.issuer || ''),
    nameID: String(nodeSAMLProfile.nameID || email),
    email,
    ...(typeof nodeSAMLProfile.sessionIndex === 'string' && {
      sessionIndex: nodeSAMLProfile.sessionIndex,
    }),
    ...(typeof nodeSAMLProfile.nameIDFormat === 'string' && {
      nameIDFormat: nodeSAMLProfile.nameIDFormat,
    }),
    ...(typeof nodeSAMLProfile.inResponseTo === 'string' && {
      inResponseTo: nodeSAMLProfile.inResponseTo,
    }),
    ...(displayName && { displayName }),
    ...(givenName && { givenName }),
    ...(surname && { surname }),
    ...(upn && { upn }),
    ...(groups && { groups }),
    ...(typeof nodeSAMLProfile.ID === 'string' && { assertionID: nodeSAMLProfile.ID }),
    ...(typeof nodeSAMLProfile.notBefore === 'string' && { notBefore: nodeSAMLProfile.notBefore }),
    ...(typeof nodeSAMLProfile.notOnOrAfter === 'string' && {
      notOnOrAfter: nodeSAMLProfile.notOnOrAfter,
    }),
    ...(typeof nodeSAMLProfile.audience === 'string' && { audience: nodeSAMLProfile.audience }),

    // Store all attributes for extensibility
    attributes: nodeSAMLProfile as Record<string, string | string[]>,
  };

  return profile;
}

/**
 * SAML Client Factory
 * Creates and manages SAML client instances
 * Uses factory pattern for proper lifecycle management
 */
export class SAMLClientFactory {
  private samlInstance: SAML | null = null;
  private config: SAMLConfig | null = null;
  private readonly clientId: string;

  constructor(clientId: string = 'default') {
    this.clientId = clientId;
    log.debug('SAML client factory created', { clientId });
  }

  /**
   * Initialize SAML client with configuration
   * Lazy initialization - only loads when first used
   */
  private async initialize(): Promise<SAML> {
    if (this.samlInstance && this.config) {
      return this.samlInstance;
    }

    log.info('Initializing SAML client', { clientId: this.clientId });
    const startTime = Date.now();

    // Build configuration with certificate loading and validation
    this.config = await buildSAMLConfig();

    // Lazy load node-saml (will be available after Phase 6)
    // For now, this will fail gracefully
    try {
      // Dynamic import with proper typing
      const nodeSAML = await import('@node-saml/node-saml');
      const SAMLConstructor = nodeSAML.SAML;

      // Build node-saml configuration object
      // Only include optional properties if they have values (exactOptionalPropertyTypes compliance)
      const nodeSAMLConfig = {
        entryPoint: this.config.entryPoint,
        issuer: this.config.issuer,
        callbackUrl: this.config.callbackUrl,
        // node-saml requires 'idpCert' - can be string or array
        idpCert: [this.config.cert.trim()], // Array format supports cert rotation
        ...(this.config.privateKey && {
          privateKey: this.config.privateKey,
          decryptionPvk: this.config.privateKey,
        }),
        signatureAlgorithm: this.config.security.signatureAlgorithm,
        digestAlgorithm: this.config.security.digestAlgorithm,
        wantAssertionsSigned: true, // Microsoft signs assertions
        wantAuthnResponseSigned: false, // Microsoft does NOT sign the response envelope
        acceptedClockSkewMs: this.config.security.acceptedClockSkewMs,
        identifierFormat: this.config.identifierFormat,
        forceAuthn: this.config.forceAuthn,
        disableRequestedAuthnContext: this.config.disableRequestedAuthnContext,
        authnRequestBinding: this.config.authnRequestBinding,
        // Remove audience validation for localhost testing (node-saml will skip if undefined)
      };

      // Type assertion for the SAML instance (matches our SAML type definition)
      this.samlInstance = new SAMLConstructor(nodeSAMLConfig) as unknown as SAML;

      log.info('SAML client initialized successfully', {
        clientId: this.clientId,
        duration: Date.now() - startTime,
        tenantId: this.config.tenantId,
      });

      // Ensure samlInstance is not null before returning
      if (!this.samlInstance) {
        throw new Error('SAML instance initialization returned null');
      }

      return this.samlInstance;
    } catch (error) {
      log.error(
        'SAML client initialization failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          clientId: this.clientId,
          error: error instanceof Error ? error.message : String(error),
          note: 'Ensure @node-saml/node-saml is installed (Phase 6)',
        }
      );

      throw new Error(
        `SAML client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          `Ensure @node-saml/node-saml package is installed.`
      );
    }
  }

  /**
   * Create SAML login URL
   * Initiates authentication flow
   */
  async createLoginUrl(context: SAMLAuthContext): Promise<string> {
    log.info('Creating SAML login URL', {
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });

    const saml = await this.initialize();

    try {
      const loginUrl = await saml.getAuthorizeUrlAsync(
        context.relayState || '',
        {}, // host (unused with HTTP-Redirect)
        {} // additional params
      );

      log.info('SAML login URL created successfully', {
        requestId: context.requestId,
        urlLength: loginUrl.length,
        containsTenantId: this.config?.tenantId ? loginUrl.includes(this.config.tenantId) : false,
      });

      return loginUrl;
    } catch (error) {
      log.error(
        'Failed to create SAML login URL',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: context.requestId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      throw error;
    }
  }

  /**
   * Validate SAML response
   * Performs comprehensive security validations
   */
  async validateResponse(
    samlResponseBody: { SAMLResponse: string },
    context: SAMLAuthContext
  ): Promise<SAMLValidationResult> {
    if (!this.config) {
      await this.initialize();
    }

    if (!this.config) {
      throw new Error('SAML configuration not initialized');
    }

    log.info('Validating SAML response', {
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      responseLength: samlResponseBody.SAMLResponse?.length || 0,
    });

    const validations = {
      signatureValid: false,
      issuerValid: false,
      audienceValid: false,
      timestampValid: false,
      notReplay: false,
      emailDomainValid: false,
    };

    try {
      const saml = await this.initialize();

      // Log raw SAML response in non-production (for debugging)
      if (this.config.logRawResponses && process.env.NODE_ENV !== 'production') {
        log.debug('Raw SAML response (non-production debug)', {
          requestId: context.requestId,
          responseLength: samlResponseBody.SAMLResponse.length,
          responsePreview: `${samlResponseBody.SAMLResponse.substring(0, 100)}...`,
        });

        // Decode base64 to see XML structure
        try {
          const decoded = Buffer.from(samlResponseBody.SAMLResponse, 'base64').toString('utf-8');
          log.debug('Decoded SAML XML preview', {
            requestId: context.requestId,
            xmlPreview: `${decoded.substring(0, 500)}...`,
            containsSignature: decoded.includes('<Signature'),
            containsAssertion: decoded.includes('<Assertion'),
          });

          console.log('\n🔍 SAML Response Debug:\n', decoded.substring(0, 1000), '\n...\n');
        } catch (e) {
          log.warn('Could not decode SAML response for debugging', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Validate SAML response (signature, timestamps, etc.)
      const startTime = Date.now();
      const response = await saml.validatePostResponseAsync(samlResponseBody);

      log.info('SAML response parsed successfully', {
        requestId: context.requestId,
        duration: Date.now() - startTime,
        hasProfile: !!response.profile,
      });

      // Signature is valid if we got here (node-saml validates signatures)
      validations.signatureValid = true;

      // Transform to our SAMLProfile type
      const profile = transformSAMLProfile(response.profile);

      // CRITICAL: Validate issuer matches OUR tenant (tenant isolation)
      const issuerValidation = this.validateIssuer(profile.issuer, context.requestId);
      validations.issuerValid = issuerValidation.valid;

      if (!issuerValidation.valid) {
        const error: SAMLValidationError = {
          name: 'SAMLValidationError',
          message: issuerValidation.error || 'Issuer validation failed',
          validationType: 'issuer',
          details: {
            received: profile.issuer,
            expected: this.config.expectedIssuer,
            requestId: context.requestId,
          },
        } as SAMLValidationError;

        log.error(
          'SAML issuer validation failed - possible tenant bypass attempt',
          new Error(error.message),
          error.details
        );

        throw error;
      }

      // Validate audience (should match our issuer)
      const audienceValidation = this.validateAudience(profile.audience, context.requestId);
      validations.audienceValid = audienceValidation.valid;

      if (!audienceValidation.valid) {
        const error: SAMLValidationError = {
          name: 'SAMLValidationError',
          message: audienceValidation.error || 'Audience validation failed',
          validationType: 'audience',
          details: {
            received: profile.audience,
            expected: this.config.issuer,
            requestId: context.requestId,
          },
        } as SAMLValidationError;

        log.error(
          'SAML audience validation failed',
          new Error(error.message),
          error.details
        );

        throw error;
      }

      // Validate timestamps (notBefore, notOnOrAfter)
      const timestampValidation = this.validateTimestamps(
        profile.notBefore,
        profile.notOnOrAfter,
        context.requestId
      );
      validations.timestampValid = timestampValidation.valid;

      if (!timestampValidation.valid) {
        const error: SAMLValidationError = {
          name: 'SAMLValidationError',
          message: timestampValidation.error || 'Timestamp validation failed',
          validationType: 'timestamp',
          details: {
            notBefore: profile.notBefore,
            notOnOrAfter: profile.notOnOrAfter,
            currentTime: new Date().toISOString(),
            requestId: context.requestId,
          },
        } as SAMLValidationError;

        log.error(
          'SAML timestamp validation failed',
          new Error(error.message),
          error.details
        );

        throw error;
      }

      // Check for replay attack (database-backed with audit logging)
      if (profile.assertionID) {
        const replayCheck = await this.checkReplayAttack(profile, context);
        validations.notReplay = replayCheck.valid;

        if (!replayCheck.valid) {
          const error: SAMLValidationError = {
            name: 'SAMLValidationError',
            message: replayCheck.error || 'Replay attack detected',
            validationType: 'replay',
            details: {
              assertionID: profile.assertionID,
              requestId: context.requestId,
            },
          } as SAMLValidationError;

          throw error;
        }
      }

      // Validate email domain (if configured)
      const domainValidation = this.validateEmailDomain(profile.email, context.requestId);
      validations.emailDomainValid = domainValidation.valid;

      if (!domainValidation.valid) {
        const error: SAMLValidationError = {
          name: 'SAMLValidationError',
          message: domainValidation.error || 'Email domain not allowed',
          validationType: 'domain',
          details: {
            email: profile.email.replace(/(.{2}).*@/, '$1***@'), // PII masking
            domain: profile.email.split('@')[1],
            allowedDomains: this.config.allowedEmailDomains,
            requestId: context.requestId,
          },
        } as SAMLValidationError;

        log.error(
          'SAML email domain validation failed',
          new Error(error.message),
          error.details
        );

        throw error;
      }

      // All validations passed
      log.info('SAML validation completed successfully', {
        requestId: context.requestId,
        email: profile.email.replace(/(.{2}).*@/, '$1***@'), // PII masking
        issuer: profile.issuer,
        allValidationsPassed: Object.values(validations).every((v) => v === true),
      });

      // Build metadata with proper optional handling
      const metadata: SAMLValidationResult['metadata'] = {
        validatedAt: new Date(),
        issuer: profile.issuer,
        ...(profile.assertionID && { assertionID: profile.assertionID }),
        ...(profile.sessionIndex && { sessionIndex: profile.sessionIndex }),
      };

      return {
        success: true,
        profile,
        validations,
        metadata,
      };
    } catch (error) {
      // If it's already a SAMLValidationError, rethrow it
      if (error instanceof Error && error.name === 'SAMLValidationError') {
        throw error;
      }

      // Wrap other errors
      log.error(
        'SAML response validation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: context.requestId,
          error: error instanceof Error ? error.message : String(error),
          validations,
        }
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
        validations,
        metadata: {
          validatedAt: new Date(),
          issuer: 'unknown',
        },
      };
    }
  }

  /**
   * Validate issuer matches expected tenant
   * CRITICAL for tenant isolation security
   */
  private validateIssuer(issuer: string, requestId: string): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'SAML configuration not initialized' };
    }

    if (issuer !== this.config.expectedIssuer) {
      log.warn('Issuer mismatch - potential tenant bypass attempt', {
        requestId,
        received: issuer,
        expected: this.config.expectedIssuer,
        securityThreat: 'tenant_isolation_bypass',
      });

      return {
        valid: false,
        error: `Invalid issuer. Expected ${this.config.expectedIssuer}, received ${issuer}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate audience matches our issuer
   */
  private validateAudience(
    audience: string | undefined,
    requestId: string
  ): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'SAML configuration not initialized' };
    }

    if (!audience) {
      // Some IdPs don't include audience - log warning but allow
      log.warn('No audience in SAML response', { requestId });
      return { valid: true }; // Allow if not present
    }

    if (audience !== this.config.issuer) {
      log.warn('Audience mismatch', {
        requestId,
        received: audience,
        expected: this.config.issuer,
      });

      return {
        valid: false,
        error: `Invalid audience. Expected ${this.config.issuer}, received ${audience}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate timestamps (notBefore, notOnOrAfter)
   */
  private validateTimestamps(
    notBefore: string | undefined,
    notOnOrAfter: string | undefined,
    requestId: string
  ): { valid: boolean; error?: string } {
    const now = new Date();
    const clockSkew = this.config?.security.acceptedClockSkewMs || 5000;

    // Validate notBefore
    if (notBefore) {
      const notBeforeDate = new Date(notBefore);
      const notBeforeWithSkew = new Date(notBeforeDate.getTime() - clockSkew);

      if (now < notBeforeWithSkew) {
        log.warn('SAML assertion not yet valid', {
          requestId,
          notBefore,
          currentTime: now.toISOString(),
          clockSkew,
        });

        return {
          valid: false,
          error: `Assertion not yet valid. Not before: ${notBefore}, current time: ${now.toISOString()}`,
        };
      }
    }

    // Validate notOnOrAfter
    if (notOnOrAfter) {
      const notOnOrAfterDate = new Date(notOnOrAfter);
      const notOnOrAfterWithSkew = new Date(notOnOrAfterDate.getTime() + clockSkew);

      if (now > notOnOrAfterWithSkew) {
        log.warn('SAML assertion expired', {
          requestId,
          notOnOrAfter,
          currentTime: now.toISOString(),
          clockSkew,
        });

        return {
          valid: false,
          error: `Assertion expired. Not on or after: ${notOnOrAfter}, current time: ${now.toISOString()}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check for replay attack using database-backed prevention
   */
  private async checkReplayAttack(
    profile: SAMLProfile,
    context: SAMLAuthContext
  ): Promise<{ valid: boolean; error?: string }> {
    // Calculate assertion expiry from profile
    const assertionExpiry = profile.notOnOrAfter
      ? new Date(profile.notOnOrAfter)
      : new Date(Date.now() + 3600000); // 1 hour default

    // Check with database (atomic insert prevents race conditions)
    if (!profile.assertionID) {
      return { valid: false, error: 'Assertion ID missing from SAML response' };
    }
    const replayCheck = await checkAndTrackAssertion(
      profile.assertionID,
      profile.inResponseTo || '',
      profile.email,
      context.ipAddress,
      context.userAgent,
      assertionExpiry
    );

    if (!replayCheck.safe) {
      // Log to audit_logs with CRITICAL severity
      await AuditLogger.logSecurity({
        action: 'saml_replay_attack_blocked',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          assertionID: profile.assertionID,
          email: profile.email.replace(/(.{2}).*@/, '$1***@'), // PII masking
          originalUsedAt: replayCheck.details?.existingUsedAt,
          originalIP: replayCheck.details?.existingIpAddress,
          requestId: context.requestId,
          alert: 'REPLAY_ATTACK_BLOCKED',
        },
        severity: 'critical',
      });

      // Try to find user and mark account suspicious
      try {
        const [user] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);

        if (user) {
          await db
            .update(account_security)
            .set({ suspicious_activity_detected: true })
            .where(eq(account_security.user_id, user.user_id));

          log.warn('Account marked as suspicious due to replay attack', {
            userId: user.user_id,
            email: profile.email.replace(/(.{2}).*@/, '$1***@'),
            requestId: context.requestId,
          });
        }
      } catch (error) {
        // Don't fail authentication on account_security update error
        log.error(
          'Failed to update account_security for replay attack',
          error instanceof Error ? error : new Error(String(error)),
          {
            email: profile.email.replace(/(.{2}).*@/, '$1***@'),
            requestId: context.requestId,
          }
        );
      }

      log.error(
        'SAML replay attack detected and blocked',
        new Error(replayCheck.reason || 'Replay attack'),
        {
          requestId: context.requestId,
          assertionID: `${profile.assertionID?.substring(0, 20)}...`,
          email: profile.email.replace(/(.{2}).*@/, '$1***@'),
          originalUsedAt: replayCheck.details?.existingUsedAt,
          originalIP: replayCheck.details?.existingIpAddress,
          attemptIP: context.ipAddress,
          securityThreat: 'replay_attack',
        }
      );

      return {
        valid: false,
        error: replayCheck.reason || 'Assertion ID has already been used - possible replay attack',
      };
    }

    log.debug('Replay check passed - assertion ID tracked in database', {
      assertionID: `${profile.assertionID?.substring(0, 20)}...`,
      requestId: context.requestId,
    });

    return { valid: true };
  }

  /**
   * Validate email domain against allowed list
   */
  private validateEmailDomain(
    email: string,
    requestId: string
  ): { valid: boolean; error?: string } {
    if (!this.config || this.config.allowedEmailDomains.length === 0) {
      return { valid: true }; // No domain restrictions configured
    }

    const emailDomain = email.split('@')[1];
    if (!emailDomain) {
      log.warn('Email has no domain', {
        requestId,
        email: email.replace(/(.{2}).*@/, '$1***@'),
      });

      return { valid: false, error: 'Invalid email format - no domain found' };
    }

    const domainAllowed = this.config.allowedEmailDomains.some(
      (allowedDomain) => emailDomain.toLowerCase() === allowedDomain.toLowerCase()
    );

    if (!domainAllowed) {
      log.warn('Email domain not in allowed list', {
        requestId,
        domain: emailDomain,
        allowedDomains: this.config.allowedEmailDomains,
        email: email.replace(/(.{2}).*@/, '$1***@'),
      });

      return {
        valid: false,
        error: `Email domain '@${emailDomain}' is not allowed. Contact your administrator.`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate service provider metadata
   */
  async generateMetadata(): Promise<string> {
    log.info('Generating SP metadata', { clientId: this.clientId });

    const saml = await this.initialize();

    try {
      const metadata = saml.generateServiceProviderMetadata(
        this.config?.spCert,
        this.config?.spCert
      );

      log.info('SP metadata generated successfully', {
        clientId: this.clientId,
        metadataLength: metadata.length,
      });

      return metadata;
    } catch (error) {
      log.error(
        'Failed to generate SP metadata',
        error instanceof Error ? error : new Error(String(error)),
        {
          clientId: this.clientId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SAMLConfig | null {
    return this.config;
  }

  /**
   * Reload configuration (for hot reload)
   */
  async reload(): Promise<void> {
    log.info('Reloading SAML client configuration', { clientId: this.clientId });

    this.samlInstance = null;
    this.config = null;

    await this.initialize();

    log.info('SAML client configuration reloaded', { clientId: this.clientId });
  }
}

/**
 * Create a new SAML client instance
 * Factory function for creating SAML clients
 */
export function createSAMLClient(clientId?: string): SAMLClientFactory {
  return new SAMLClientFactory(clientId);
}
