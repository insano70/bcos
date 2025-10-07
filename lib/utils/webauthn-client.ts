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
        throw new Error('This passkey is already registered. Please try a different device.');
      } else if (error.name === 'NotAllowedError') {
        throw new Error('Passkey registration was cancelled or timed out.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Your browser does not support passkeys. Please use a modern browser.');
      } else if (error.name === 'SecurityError') {
        throw new Error(
          'Security error during passkey registration. Please check your connection.'
        );
      }
    }
    throw new Error('Failed to register passkey. Please try again.');
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
        throw new Error('Passkey authentication was cancelled or timed out.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Your browser does not support passkeys. Please use a modern browser.');
      } else if (error.name === 'SecurityError') {
        throw new Error(
          'Security error during passkey authentication. Please check your connection.'
        );
      }
    }
    throw new Error('Failed to authenticate with passkey. Please try again.');
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
 */
export function getWebAuthnErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for specific WebAuthn error names
    switch (error.name) {
      case 'InvalidStateError':
        return 'This passkey is already registered. Please try a different device.';
      case 'NotAllowedError':
        return 'The operation was cancelled or timed out. Please try again.';
      case 'NotSupportedError':
        return 'Your browser does not support passkeys. Please use a modern browser like Chrome, Safari, or Edge.';
      case 'SecurityError':
        return 'A security error occurred. Please ensure you are using a secure connection (HTTPS).';
      case 'AbortError':
        return 'The operation was cancelled. Please try again.';
      case 'ConstraintError':
        return 'Your authenticator cannot satisfy the requested constraints.';
      case 'UnknownError':
        return 'An unknown error occurred. Please try again.';
      default:
        return error.message || 'An error occurred during passkey operation.';
    }
  }
  return 'An unexpected error occurred. Please try again.';
}
