/**
 * WebAuthn Validation Utilities
 * Centralized validation functions for WebAuthn operations
 *
 * Security: Input validation, format checking, configuration validation
 */

import { log } from '@/lib/logger';

/**
 * Validate RP_ID against origin to prevent subdomain attacks
 *
 * SECURITY CRITICAL: Prevents credential harvesting via subdomain takeover
 *
 * WebAuthn Spec Requirements:
 * - RP_ID must either exactly match the origin hostname, OR
 * - RP_ID must be a valid parent domain of the origin hostname
 *
 * Examples:
 * - RP_ID "example.com" with origin "https://example.com" → VALID (exact match)
 * - RP_ID "example.com" with origin "https://app.example.com" → VALID (parent domain)
 * - RP_ID "evil.com" with origin "https://app.example.com" → INVALID (unrelated domain)
 * - RP_ID "app.example.com" with origin "https://example.com" → INVALID (child can't be RP for parent)
 *
 * @param rpId - Relying Party ID from configuration
 * @param origin - Origin URL from request
 * @throws Error if RP_ID is invalid for the given origin
 */
export function validateRPID(rpId: string, origin: string): void {
  try {
    const originUrl = new URL(origin);
    const originHostname = originUrl.hostname;

    // Case 1: Exact match (most common in production)
    if (rpId === originHostname) {
      return; // Valid
    }

    // Case 2: RP_ID is a valid parent domain of origin
    // Example: rpId="example.com", origin="app.example.com"
    if (originHostname.endsWith(`.${rpId}`)) {
      return; // Valid
    }

    // All other cases are invalid
    log.security('rp_id_validation_failed', 'critical', {
      rpId,
      origin,
      originHostname,
      blocked: true,
      threat: 'rp_id_mismatch_subdomain_attack',
      reason: 'rp_id_does_not_match_origin',
    });

    throw new Error(
      'WebAuthn configuration error: RP_ID does not match origin. This may indicate a subdomain attack or misconfiguration.'
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid URL')) {
      log.error('Invalid origin URL in RP_ID validation', error, {
        origin,
        rpId,
        component: 'auth',
      });
      throw new Error('Invalid origin URL format');
    }
    throw error;
  }
}

/**
 * Validate credential name input
 * Prevents XSS, excessively long strings, and invalid characters
 *
 * Rules:
 * - Cannot be empty or whitespace-only
 * - Maximum 50 characters
 * - Only alphanumeric, spaces, and basic punctuation: - _ ' .
 *
 * @param name - Credential name to validate
 * @throws Error if validation fails with user-friendly message
 */
export function validateCredentialName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Credential name cannot be empty');
  }

  if (name.length > 50) {
    throw new Error('Credential name must be 50 characters or less');
  }

  // Allow alphanumeric, spaces, and common punctuation
  const validPattern = /^[a-zA-Z0-9\s\-_'.]+$/;
  if (!validPattern.test(name)) {
    throw new Error(
      'Credential name contains invalid characters. Only letters, numbers, spaces, and basic punctuation (- _ \' .) are allowed'
    );
  }
}

/**
 * Validate credential ID format (base64url encoded)
 *
 * SECURITY: Prevents injection attacks and ensures proper format
 *
 * Base64url format:
 * - Characters: A-Z, a-z, 0-9, -, _
 * - No padding (= characters)
 * - Length: typically 16-1024 bytes when decoded
 *
 * @param credentialId - Credential ID to validate
 * @throws Error if validation fails
 */
export function validateCredentialId(credentialId: string): void {
  if (!credentialId || typeof credentialId !== 'string') {
    throw new Error('Credential ID is required and must be a string');
  }

  // Validate base64url format (alphanumeric + - and _)
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  if (!base64urlPattern.test(credentialId)) {
    log.warn('Invalid credential ID format detected', {
      operation: 'validate_credential_id',
      credentialIdLength: credentialId.length,
      credentialIdPreview: credentialId.substring(0, 16),
      reason: 'invalid_base64url_format',
      component: 'auth',
    });
    throw new Error('Invalid credential ID format');
  }

  // Validate length bounds
  // Typical credential IDs are 16-256 bytes, base64url encoded increases length by ~33%
  // So we expect roughly 21-342 characters, using conservative bounds
  if (credentialId.length < 16) {
    throw new Error('Credential ID too short');
  }

  if (credentialId.length > 1024) {
    throw new Error('Credential ID too long');
  }
}

/**
 * Validate challenge ID format (nanoid: 32 character alphanumeric)
 *
 * @param challengeId - Challenge ID to validate
 * @throws Error if validation fails
 */
export function validateChallengeId(challengeId: string): void {
  if (!challengeId || typeof challengeId !== 'string') {
    throw new Error('Challenge ID is required and must be a string');
  }

  // nanoid format: alphanumeric with - and _, exactly 32 characters
  if (challengeId.length !== 32) {
    throw new Error('Invalid challenge ID format');
  }

  const nanoidPattern = /^[A-Za-z0-9_-]{32}$/;
  if (!nanoidPattern.test(challengeId)) {
    throw new Error('Invalid challenge ID format');
  }
}
