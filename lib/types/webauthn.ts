/**
 * WebAuthn/Passkey Type Definitions
 * Strict TypeScript types for WebAuthn authentication
 */

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';

/**
 * Database record types
 */
export interface WebAuthnCredential {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  credential_device_type: 'platform' | 'cross-platform';
  transports: string | null;
  aaguid: string | null;
  credential_name: string;
  created_at: Date;
  last_used: Date | null;
  is_active: boolean;
  backed_up: boolean;
  registration_ip: string;
  registration_user_agent: string | null;
}

export interface WebAuthnChallenge {
  challenge_id: string;
  user_id: string;
  challenge: string;
  challenge_type: 'registration' | 'authentication';
  ip_address: string;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
}

/**
 * API request/response types
 */
export interface RegistrationBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge_id: string;
}

export interface RegistrationCompleteRequest {
  credential: RegistrationResponseJSON;
  credential_name: string;
  challenge_id: string;
}

export interface RegistrationCompleteResponse {
  success: boolean;
  credential_id: string;
  credential_name: string;
}

export interface AuthenticationBeginResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge_id: string;
}

export interface AuthenticationCompleteRequest {
  assertion: AuthenticationResponseJSON;
  challenge_id: string;
}

export interface AuthenticationCompleteResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
}

/**
 * Credential management types
 */
export interface CredentialListItem {
  credential_id: string;
  credential_name: string;
  credential_device_type: 'platform' | 'cross-platform';
  transports: string[];
  created_at: string;
  last_used: string | null;
  backed_up: boolean;
}

export interface CredentialUpdateRequest {
  credential_name: string;
}

/**
 * Service layer types
 */
export interface CreateCredentialParams {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: 'platform' | 'cross-platform';
  transports: string[];
  aaguid: string | null;
  credentialName: string;
  backedUp: boolean;
  ipAddress: string;
  userAgent: string | null;
}

export interface VerifyAssertionParams {
  userId: string;
  challengeId: string;
  assertion: AuthenticationResponseJSON;
  ipAddress: string;
  userAgent: string | null;
}

export interface VerifyAssertionResult {
  success: boolean;
  credentialId?: string;
  counter?: number;
  error?: string;
}

/**
 * MFA status types
 */
export interface MFAStatus {
  enabled: boolean;
  method: 'webauthn' | null;
  credential_count: number;
  enforced_at: Date | null;
}

/**
 * Temp token payload for MFA flow
 */
export interface MFATempTokenPayload {
  sub: string; // user_id
  type: 'mfa_pending';
  exp: number;
  iat: number;
  challenge_id?: string; // For authentication flow
}
