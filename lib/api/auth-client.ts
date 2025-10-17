/**
 * Authentication API Service
 * Centralized service for all authentication-related API calls
 * Extracted from RBACAuthProvider to improve separation of concerns
 */

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { UserContext } from '@/lib/types/rbac';
import type { ApiOrganization, ApiPermission, ApiRole, ApiUser } from './types/auth-api-types';

// User interface (extracted from rbac-auth-provider for decoupling)
export interface User {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
}

// API Response Types
export interface AuthApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

interface UserApiResponse {
  user: User;
  sessionId: string;
}

interface UserContextApiResponse {
  user: ApiUser;
  sessionId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface LoginResponse {
  user: User;
  sessionId: string;
  csrfToken?: string;
  status?: 'success' | 'mfa_setup_optional' | 'mfa_setup_enforced' | 'mfa_required';
  tempToken?: string;
  skipsRemaining?: number;
  challenge?: PublicKeyCredentialRequestOptionsJSON;
  challengeId?: string;
}

export interface MFASetupResponse {
  user: User;
  sessionId: string;
  csrfToken?: string;
}

export interface MFAVerifyResponse {
  user: User;
  sessionId: string;
  csrfToken?: string;
}

export interface RefreshResponse {
  user: User;
  sessionId: string;
  csrfToken?: string;
}

export interface CSRFResponse {
  csrfToken: string;
}

export interface MFASkipRequest {
  tempToken: string;
  csrfToken: string;
}

export interface MFARegisterBeginRequest {
  tempToken: string;
  csrfToken: string;
}

export interface MFARegisterBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge_id: string;
}

export interface MFARegisterCompleteRequest {
  tempToken: string;
  csrfToken: string;
  challenge_id: string;
  credential: unknown; // WebAuthn credential response
  credential_name: string;
}

export interface MFAVerifyRequest {
  tempToken: string;
  csrfToken: string;
  challenge_id: string;
  assertion: unknown; // WebAuthn assertion response
}

/**
 * Authentication API Service
 * Handles all authentication-related API calls with proper error handling
 */
export class AuthApiService {
  private baseUrl: string;

  constructor() {
    // Use current domain instead of hardcoded NEXT_PUBLIC_APP_URL to avoid CORS issues
    this.baseUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  }

  /**
   * Get current user and context information
   */
  async getUserContext(): Promise<UserContext> {
    const response = await fetch(`${this.baseUrl}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      throw new Error(`Failed to fetch user context: ${response.status}`);
    }

    const data: AuthApiResponse<UserContextApiResponse> = await response.json();
    if (!data.success || !data.data?.user) {
      throw new Error('Invalid user context response');
    }

    return this.transformUserContext(data.data.user);
  }

  /**
   * Check if user is authenticated (lightweight call)
   */
  async checkAuthStatus(): Promise<{ user: User; sessionId: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      const data: AuthApiResponse<UserApiResponse> = await response.json();
      if (!data.success || !data.data?.user) {
        return null;
      }

      return {
        user: data.data.user,
        sessionId: data.data.sessionId,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Get CSRF token
   */
  async getCSRFToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/csrf`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`CSRF token fetch failed: ${response.status}`);
    }

    const data: AuthApiResponse<CSRFResponse> = await response.json();
    if (!data.success || !data.data?.csrfToken) {
      throw new Error('CSRF token not found in response');
    }

    return data.data.csrfToken;
  }

  /**
   * Login with credentials
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const csrfToken = await this.getCSRFToken();

    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Login failed');
    }

    return result.data;
  }

  /**
   * Logout current user
   */
  async logout(csrfToken?: string): Promise<void> {
    const token = csrfToken || (await this.getCSRFToken());

    await fetch(`${this.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': token,
      },
      credentials: 'include',
    });

    // Logout is fire-and-forget - don't throw on failure
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(csrfToken?: string): Promise<RefreshResponse> {
    const token = csrfToken || (await this.getCSRFToken());

    const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'x-csrf-token': token,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      throw new Error('Session expired');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Skip MFA setup
   */
  async skipMFA(request: MFASkipRequest): Promise<MFASetupResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/mfa/skip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.tempToken}`,
        'x-csrf-token': request.csrfToken,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to skip MFA setup');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Begin MFA setup process
   */
  async beginMFASetup(request: MFARegisterBeginRequest): Promise<MFARegisterBeginResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/mfa/register/begin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.tempToken}`,
        'x-csrf-token': request.csrfToken,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to begin passkey registration');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Complete MFA setup process
   */
  async completeMFASetup(request: MFARegisterCompleteRequest): Promise<MFASetupResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/mfa/register/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.tempToken}`,
        'x-csrf-token': request.csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({
        challenge_id: request.challenge_id,
        credential: request.credential,
        credential_name: request.credential_name,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to complete passkey registration');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Verify MFA authentication
   */
  async verifyMFA(request: MFAVerifyRequest): Promise<MFAVerifyResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.tempToken}`,
        'x-csrf-token': request.csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({
        challenge_id: request.challenge_id,
        assertion: request.assertion,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to verify passkey');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Transform API user response to UserContext format
   */
  private transformUserContext(apiUser: ApiUser): UserContext {
    return {
      user_id: String(apiUser.id),
      email: apiUser.email,
      first_name: apiUser.firstName,
      last_name: apiUser.lastName,
      is_active: true,
      email_verified: apiUser.emailVerified,

      // RBAC data from API
      roles: apiUser.roles.map((role: ApiRole) => ({
        role_id: String(role.id),
        name: role.name,
        description: role.description || '',
        organization_id: undefined,
        is_system_role: role.isSystemRole,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
        permissions: [], // Will be populated from all_permissions
      })),

      organizations: apiUser.organizations.map((org: ApiOrganization) => ({
        organization_id: org.id,
        name: org.name,
        slug: org.slug,
        parent_organization_id: undefined,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
      })),

      accessible_organizations:
        apiUser.accessibleOrganizations?.map((org: ApiOrganization) => ({
          organization_id: org.id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: undefined,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined,
        })) ||
        apiUser.organizations.map((org: ApiOrganization) => ({
          organization_id: org.id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: undefined,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined,
        })),

      user_roles: [], // Could be populated if needed
      user_organizations: [], // Could be populated if needed

      // Current context
      current_organization_id: apiUser.currentOrganizationId,

      // Computed properties from API
      all_permissions: apiUser.permissions.map((perm: ApiPermission) => ({
        permission_id: String(perm.id),
        name: perm.name,
        description: undefined,
        resource: perm.resource,
        action: perm.action,
        scope: perm.scope as 'own' | 'organization' | 'all',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })),

      is_super_admin: apiUser.isSuperAdmin,
      organization_admin_for: apiUser.organizationAdminFor || [],
    };
  }
}

// Export singleton instance
export const authApiService = new AuthApiService();
