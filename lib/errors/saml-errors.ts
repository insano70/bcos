/**
 * SAML Error Classes
 *
 * Relocated from lib/types/saml.ts to separate runtime code from type definitions.
 *
 * These errors are thrown during SAML authentication operations.
 */

/**
 * Error thrown when SAML configuration is invalid or missing
 */
export class SAMLConfigError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SAMLConfigError';
    Error.captureStackTrace(this, SAMLConfigError);
  }
}

/**
 * Error thrown when SAML response validation fails
 */
export class SAMLValidationError extends Error {
  constructor(
    message: string,
    public readonly validationType:
      | 'signature'
      | 'issuer'
      | 'audience'
      | 'timestamp'
      | 'replay'
      | 'domain',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SAMLValidationError';
    Error.captureStackTrace(this, SAMLValidationError);
  }
}

/**
 * Error thrown when SAML certificate operations fail
 */
export class SAMLCertificateError extends Error {
  constructor(
    message: string,
    public readonly certificateType: 'idp' | 'sp',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SAMLCertificateError';
    Error.captureStackTrace(this, SAMLCertificateError);
  }
}

/**
 * Type guard: Check if error is a SAML error
 */
export function isSAMLError(
  error: unknown
): error is SAMLConfigError | SAMLValidationError | SAMLCertificateError {
  return (
    error instanceof SAMLConfigError ||
    error instanceof SAMLValidationError ||
    error instanceof SAMLCertificateError
  );
}

