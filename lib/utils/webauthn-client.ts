'use client';

/**
 * WebAuthn Client Utilities
 * Browser-side helpers for WebAuthn operations
 */

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

/**
 * Register a new passkey with the browser
 * Handles all browser WebAuthn interactions
 */
export async function registerPasskey(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<RegistrationResponseJSON> {
  try {
    const response = await startRegistration({ optionsJSON: options });
    return response;
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific WebAuthn errors
      if (error.name === 'InvalidStateError') {
        throw new Error(
          'This passkey is already registered. Please try a different device or remove the existing passkey first.'
        );
      } else if (error.name === 'NotAllowedError') {
        throw new Error(
          'Passkey registration was cancelled or timed out. Please try again and complete the process within 2 minutes.'
        );
      } else if (error.name === 'NotSupportedError') {
        throw new Error(
          'Your browser does not support passkeys. Please upgrade to Chrome 108+, Safari 16+, Edge 108+, or Firefox 119+.'
        );
      } else if (error.name === 'SecurityError') {
        throw new Error(
          'Security error during passkey registration. Please ensure you are using a secure connection (HTTPS) and try again.'
        );
      }
    }
    throw new Error('Failed to register passkey. Please try again or contact support.');
  }
}

/**
 * Authenticate with an existing passkey
 * Handles all browser WebAuthn interactions
 */
export async function authenticatePasskey(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<AuthenticationResponseJSON> {
  try {
    const response = await startAuthentication({ optionsJSON: options });
    return response;
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific WebAuthn errors
      if (error.name === 'NotAllowedError') {
        throw new Error(
          'Passkey authentication was cancelled or timed out. Please try again and complete the process within 2 minutes.'
        );
      } else if (error.name === 'NotSupportedError') {
        throw new Error(
          'Your browser does not support passkeys. Please upgrade to Chrome 108+, Safari 16+, Edge 108+, or Firefox 119+.'
        );
      } else if (error.name === 'SecurityError') {
        throw new Error(
          'Security error during passkey authentication. Please ensure you are using a secure connection (HTTPS) and try again.'
        );
      }
    }
    throw new Error('Failed to authenticate with passkey. Please try again or contact support.');
  }
}

/**
 * Check if WebAuthn is supported in the current browser
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/**
 * Check if platform authenticators (Touch ID, Face ID, Windows Hello) are available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return false;
  }

  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Get user-friendly device type description
 */
export function getDeviceTypeDescription(deviceType: 'platform' | 'cross-platform'): string {
  if (deviceType === 'platform') {
    // Platform authenticator (Touch ID, Face ID, Windows Hello)
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad')) {
      return 'Touch ID / Face ID';
    } else if (platform.includes('win')) {
      return 'Windows Hello';
    } else {
      return 'Built-in Authenticator';
    }
  } else {
    // Cross-platform authenticator (USB security key, etc.)
    return 'Security Key';
  }
}

/**
 * Get user-friendly error messages for WebAuthn errors
 * Includes browser version requirements and recovery steps
 */
export function getWebAuthnErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for specific WebAuthn error names
    switch (error.name) {
      case 'InvalidStateError':
        return 'This passkey is already registered. Please try a different device or remove the existing passkey first.';
      case 'NotAllowedError':
        return 'The operation was cancelled or timed out. Please try again and complete the authentication within 2 minutes.';
      case 'NotSupportedError':
        return 'Your browser does not support passkeys. Please upgrade to Chrome 108+, Safari 16+, Edge 108+, or Firefox 119+.';
      case 'SecurityError':
        return 'A security error occurred. Please ensure you are using a secure connection (HTTPS) and try again.';
      case 'AbortError':
        return 'The operation was cancelled. Please try again when ready.';
      case 'ConstraintError':
        return 'Your authenticator cannot satisfy the requested constraints. Try using a different device or security key.';
      case 'UnknownError':
        return 'An unknown error occurred with your authenticator. Please try a different device or contact support.';
      default:
        return error.message || 'An error occurred during passkey operation. Please try again or contact support.';
    }
  }
  return 'An unexpected error occurred. Please refresh the page and try again.';
}
