'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { useOrganizations, type Organization } from '@/lib/hooks/use-organizations';

interface UseOrgSelectionReturn {
  /** Currently selected organization ID */
  selectedOrgId: string | undefined;
  /** Function to update the selected organization */
  setSelectedOrgId: (id: string | undefined) => void;
  /** Whether the org selector should be displayed (user has multiple orgs) */
  showOrgSelector: boolean;
  /** List of organizations the user can select from */
  selectableOrgs: Organization[];
  /** Whether user has permission to view all organizations */
  canViewAll: boolean;
  /** Whether auth context is still loading */
  authLoading: boolean;
  /** Whether organizations list is still loading */
  loadingOrgs: boolean;
}

/**
 * Shared hook for organization selection logic
 *
 * Used by report card views to handle:
 * - Permission-based org filtering (super users vs regular users)
 * - URL parameter initialization
 * - Auto-selection for single-org users
 *
 * @example
 * ```tsx
 * const {
 *   selectedOrgId,
 *   setSelectedOrgId,
 *   showOrgSelector,
 *   selectableOrgs,
 *   canViewAll,
 *   authLoading,
 *   loadingOrgs,
 * } = useOrgSelection();
 * ```
 */
export function useOrgSelection(): UseOrgSelectionReturn {
  const { userContext, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);

  // Check if user has all-access permission (super user)
  const canViewAll = useMemo(() => {
    if (!userContext?.all_permissions) return false;
    return userContext.all_permissions.some((p) => p.name === 'analytics:read:all');
  }, [userContext]);

  // Fetch organizations for the org selector (super users see all, regular users see theirs)
  const { data: allOrganizations = [], isLoading: loadingOrgs } = useOrganizations();

  // Build list of selectable organizations
  const selectableOrgs = useMemo(() => {
    if (canViewAll) {
      // Super user - can select any organization
      return allOrganizations;
    }
    // Regular user - filter to only their organizations
    if (!userContext?.organizations) return [];
    const userOrgIds = new Set(userContext.organizations.map((o) => o.organization_id));
    return allOrganizations.filter((org) => userOrgIds.has(org.id));
  }, [canViewAll, allOrganizations, userContext?.organizations]);

  // Initialize org from URL param or auto-select for single-org users
  useEffect(() => {
    if (selectedOrgId) return; // Already selected

    // Priority 1: URL param
    const orgFromUrl = searchParams.get('org');
    if (orgFromUrl && selectableOrgs.some((org) => org.id === orgFromUrl)) {
      setSelectedOrgId(orgFromUrl);
      return;
    }

    // Priority 2: Auto-select for single-org users
    if (selectableOrgs.length === 1 && selectableOrgs[0]) {
      setSelectedOrgId(selectableOrgs[0].id);
    }
  }, [selectableOrgs, selectedOrgId, searchParams]);

  // Determine if organization selector should be shown
  // Only show if user has multiple organizations to choose from
  const showOrgSelector = selectableOrgs.length > 1;

  return {
    selectedOrgId,
    setSelectedOrgId,
    showOrgSelector,
    selectableOrgs,
    canViewAll,
    authLoading,
    loadingOrgs,
  };
}
