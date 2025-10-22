/**
 * Authentication Types and Interfaces
 *
 * Core type definitions for RBAC authentication system including user models,
 * auth state, MFA flows, and action types for state management.
 */

import type { UserContext } from '@/lib/types/rbac';

/**
 * User model representing authenticated user
 */
export interface User {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
}

/**
 * MFA user model (partial user data during MFA flow)
 */
export interface MFAUser {
  id: string;
  email: string;
  name: string;
}

/**
 * RBAC Authentication State
 * Represents complete authentication state including user, session, RBAC context, and MFA
 */
export interface RBACAuthState {
  // Basic auth state (accessToken removed - now handled server-side only)
  user: User | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  csrfToken?: string | null | undefined;

  // RBAC state
  userContext: UserContext | null;
  rbacLoading: boolean;
  rbacError: string | null;

  // MFA state
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  mfaSetupEnforced: boolean;
  mfaSkipsRemaining: number;
  mfaTempToken: string | null;
  mfaChallenge: unknown | null;
  mfaChallengeId: string | null;
  mfaUser: MFAUser | null;
}

/**
 * MFA completion session data
 * Data returned from server after successful MFA setup or verification
 */
export interface MFASessionData {
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    role: string;
    emailVerified: boolean;
    roles?: string[];
    permissions?: string[];
  };
  sessionId: string;
  csrfToken?: string;
}

/**
 * RBAC Authentication Context Type
 * Complete context value exposed to consuming components
 */
export interface RBACAuthContextType extends RBACAuthState {
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  refreshUserContext: () => Promise<void>;
  ensureCsrfToken: (forceRefresh?: boolean) => Promise<string | null>;
  completeMFASetup: (sessionData: MFASessionData) => void;
  completeMFAVerification: (sessionData: MFASessionData) => void;
  clearMFAState: () => void;
}

/**
 * API User Response
 * User data structure returned from API endpoints
 */
export interface APIUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  roles: Array<{
    id: string;
    name: string;
    description?: string;
    isSystemRole: boolean;
  }>;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  accessibleOrganizations?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  permissions: Array<{
    id?: string;
    name: string;
    description?: string;
    resource: string;
    action: string;
    scope: string;
  }>;
  currentOrganizationId?: string;
  practiceId?: string;
  isSuperAdmin: boolean;
  organizationAdminFor: string[];
}
