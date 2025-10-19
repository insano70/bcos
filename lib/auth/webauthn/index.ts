/**
 * WebAuthn Module - Public API
 * Central export point for all WebAuthn functionality
 *
 * Usage:
 * ```typescript
 * import { beginRegistration, completeRegistration } from '@/lib/auth/webauthn';
 * ```
 */

// Registration Flow
export { beginRegistration, completeRegistration, getMFAStatus } from './registration';

// Authentication Flow
export { beginAuthentication, completeAuthentication } from './authentication';

// Credential Management
export {
  getUserCredentials,
  deleteCredential,
  renameCredential,
  adminResetMFA,
} from './credential-manager';

// Challenge Management (for maintenance)
export { cleanupExpiredChallenges } from './challenge-manager';

// Re-export types from main types file
export type {
  MFAStatus,
  WebAuthnCredential,
  WebAuthnChallenge,
  VerifyAssertionParams,
  VerifyAssertionResult,
  RegistrationBeginResponse,
  RegistrationCompleteRequest,
  RegistrationCompleteResponse,
  AuthenticationBeginResponse,
  AuthenticationCompleteRequest,
  AuthenticationCompleteResponse,
  CredentialListItem,
  CredentialUpdateRequest,
} from '@/lib/types/webauthn';
