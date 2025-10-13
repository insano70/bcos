#!/usr/bin/env tsx
/**
 * Analytics Security Testing Script
 * 
 * Tests the three-tier permission model for analytics data security:
 * 1. Super Admin (analytics:read:all) - See all data
 * 2. Organization User (analytics:read:organization) - Filtered by practice_uids
 * 3. Provider User (analytics:read:own) - Filtered by provider_uid
 * 4. No Permission - Fail-closed (no data)
 * 
 * Phase 2 Task 2.4: End-to-end security filtering verification
 */

import { createOrganizationAccessService } from '@/lib/services/organization-access-service';
import type { UserContext } from '@/lib/types/rbac';
import type { Permission, Role, Organization } from '@/lib/types/rbac';

async function runSecurityTests() {
  console.log('🔒 Analytics Security Testing - Three-Tier Permission Model\n');
  console.log('='.repeat(80));

  // Test Data Setup
  const testOrg1: Organization = {
    organization_id: 'org-test-1',
    name: 'Test Healthcare System',
    slug: 'test-healthcare',
    practice_uids: [100, 101, 102],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testOrg2: Organization = {
    organization_id: 'org-test-2',
    name: 'Test Clinic Group',
    slug: 'test-clinic',
    practice_uids: [200, 201],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testOrgNoUids: Organization = {
    organization_id: 'org-test-3',
    name: 'Empty Org (Fail-Closed Test)',
    slug: 'empty-org',
    practice_uids: [], // Fail-closed test: empty array
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const superAdminPermission: Permission = {
    permission_id: 'perm-1',
    name: 'analytics:read:all',
    resource: 'analytics',
    action: 'read',
    scope: 'all',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const orgPermission: Permission = {
    permission_id: 'perm-2',
    name: 'analytics:read:organization',
    resource: 'analytics',
    action: 'read',
    scope: 'organization',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const providerPermission: Permission = {
    permission_id: 'perm-3',
    name: 'analytics:read:own',
    resource: 'analytics',
    action: 'read',
    scope: 'own',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Helper to create role with permissions
  const createRoleWithPermissions = (permissions: Permission[]): Role => ({
    role_id: 'role-1',
    name: 'test_role',
    is_system_role: false,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    permissions,
  });

  // Test 1: Super Admin (analytics:read:all)
  console.log('\n📊 Test 1: Super Admin (analytics:read:all)');
  console.log('-'.repeat(80));

  const superAdminUser: UserContext = {
    user_id: 'user-superadmin',
    email: 'superadmin@test.com',
    first_name: 'Super',
    last_name: 'Admin',
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([superAdminPermission])],
    organizations: [],
    accessible_organizations: [],
    user_roles: [],
    user_organizations: [],
    all_permissions: [superAdminPermission],
    is_super_admin: true,
    organization_admin_for: [],
  };

  const superAdminService = createOrganizationAccessService(superAdminUser);
  const superAdminPracticeAccess = await superAdminService.getAccessiblePracticeUids();
  const superAdminProviderAccess = await superAdminService.getAccessibleProviderUid();

  console.log(`✅ Permission Scope: ${superAdminPracticeAccess.scope}`);
  console.log(`✅ practice_uids: ${JSON.stringify(superAdminPracticeAccess.practiceUids)} (empty = no filtering)`);
  console.log(`✅ provider_uid: ${superAdminProviderAccess.providerUid} (null = no filtering)`);
  console.log(`✅ Expected: Super admin sees ALL data without filtering`);
  console.log(
    `✅ Status: ${superAdminPracticeAccess.scope === 'all' && superAdminPracticeAccess.practiceUids.length === 0 ? 'PASS ✓' : 'FAIL ✗'}`
  );

  // Test 2: Organization User (analytics:read:organization)
  console.log('\n📊 Test 2: Organization User (analytics:read:organization)');
  console.log('-'.repeat(80));

  const orgUser: UserContext = {
    user_id: 'user-org',
    email: 'orguser@test.com',
    first_name: 'Org',
    last_name: 'User',
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([orgPermission])],
    organizations: [testOrg1, testOrg2],
    accessible_organizations: [testOrg1, testOrg2],
    user_roles: [],
    user_organizations: [],
    current_organization_id: testOrg1.organization_id, // Required for org-scoped permission validation
    all_permissions: [orgPermission],
    is_super_admin: false,
    organization_admin_for: [],
  };

  const orgUserService = createOrganizationAccessService(orgUser);
  const orgUserPracticeAccess = await orgUserService.getAccessiblePracticeUids();
  const orgUserProviderAccess = await orgUserService.getAccessibleProviderUid();

  console.log(`✅ Permission Scope: ${orgUserPracticeAccess.scope}`);
  console.log(`✅ practice_uids: ${JSON.stringify(orgUserPracticeAccess.practiceUids)}`);
  console.log(`✅ provider_uid: ${orgUserProviderAccess.providerUid} (null for org users)`);
  console.log(`✅ Organizations: ${orgUserPracticeAccess.organizationIds.length} organizations`);
  console.log(`✅ Includes Hierarchy: ${orgUserPracticeAccess.includesHierarchy}`);
  console.log(`✅ Expected: practice_uids [100, 101, 102, 200, 201] from both orgs`);

  const expectedUids = [100, 101, 102, 200, 201].sort((a, b) => a - b);
  const actualUids = orgUserPracticeAccess.practiceUids.sort((a, b) => a - b);
  const practiceUidsMatch = JSON.stringify(expectedUids) === JSON.stringify(actualUids);

  console.log(`✅ Status: ${practiceUidsMatch && orgUserPracticeAccess.scope === 'organization' ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test 3: Organization User with Empty practice_uids (Fail-Closed)
  console.log('\n📊 Test 3: Organization User with Empty practice_uids (Fail-Closed Security)');
  console.log('-'.repeat(80));

  const emptyOrgUser: UserContext = {
    user_id: 'user-empty',
    email: 'empty@test.com',
    first_name: 'Empty',
    last_name: 'User',
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([orgPermission])],
    organizations: [testOrgNoUids],
    accessible_organizations: [testOrgNoUids],
    user_roles: [],
    user_organizations: [],
    current_organization_id: testOrgNoUids.organization_id, // Required for org-scoped permission validation
    all_permissions: [orgPermission],
    is_super_admin: false,
    organization_admin_for: [],
  };

  const emptyOrgService = createOrganizationAccessService(emptyOrgUser);
  const emptyOrgAccess = await emptyOrgService.getAccessiblePracticeUids();

  console.log(`✅ Permission Scope: ${emptyOrgAccess.scope}`);
  console.log(`✅ practice_uids: ${JSON.stringify(emptyOrgAccess.practiceUids)} (empty array)`);
  console.log(`✅ Expected: Fail-closed security - user sees NO data`);
  console.log(
    `✅ Status: ${emptyOrgAccess.practiceUids.length === 0 && emptyOrgAccess.scope === 'organization' ? 'PASS ✓' : 'FAIL ✗'}`
  );

  // Test 4: Provider User (analytics:read:own)
  console.log('\n📊 Test 4: Provider User (analytics:read:own)');
  console.log('-'.repeat(80));

  const providerUser: UserContext = {
    user_id: 'user-provider',
    email: 'provider@test.com',
    first_name: 'Provider',
    last_name: 'User',
    provider_uid: 42,
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([providerPermission])],
    organizations: [],
    accessible_organizations: [],
    user_roles: [],
    user_organizations: [],
    all_permissions: [providerPermission],
    is_super_admin: false,
    organization_admin_for: [],
  };

  const providerService = createOrganizationAccessService(providerUser);
  const providerPracticeAccess = await providerService.getAccessiblePracticeUids();
  const providerProviderAccess = await providerService.getAccessibleProviderUid();

  console.log(`✅ Permission Scope: ${providerPracticeAccess.scope}`);
  console.log(`✅ practice_uids: ${JSON.stringify(providerPracticeAccess.practiceUids)} (empty for provider users)`);
  console.log(`✅ provider_uid: ${providerProviderAccess.providerUid}`);
  console.log(`✅ Expected: Filtered by provider_uid = 42 only`);
  console.log(
    `✅ Status: ${providerProviderAccess.providerUid === 42 && providerPracticeAccess.scope === 'own' ? 'PASS ✓' : 'FAIL ✗'}`
  );

  // Test 5: Provider User with No provider_uid (Fail-Closed)
  console.log('\n📊 Test 5: Provider User with No provider_uid (Fail-Closed Security)');
  console.log('-'.repeat(80));

  const emptyProviderUser: UserContext = {
    user_id: 'user-empty-provider',
    email: 'emptyprovider@test.com',
    first_name: 'Empty',
    last_name: 'Provider',
    provider_uid: undefined, // No provider_uid configured
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([providerPermission])],
    organizations: [],
    accessible_organizations: [],
    user_roles: [],
    user_organizations: [],
    all_permissions: [providerPermission],
    is_super_admin: false,
    organization_admin_for: [],
  };

  const emptyProviderService = createOrganizationAccessService(emptyProviderUser);
  const emptyProviderAccess = await emptyProviderService.getAccessibleProviderUid();

  console.log(`✅ Permission Scope: ${emptyProviderAccess.scope}`);
  console.log(`✅ provider_uid: ${emptyProviderAccess.providerUid} (null)`);
  console.log(`✅ Expected: Fail-closed security - user sees NO data`);
  console.log(
    `✅ Status: ${emptyProviderAccess.providerUid === null && emptyProviderAccess.scope === 'own' ? 'PASS ✓' : 'FAIL ✗'}`
  );

  // Test 6: No Analytics Permission
  console.log('\n📊 Test 6: User with No Analytics Permission (Fail-Closed)');
  console.log('-'.repeat(80));

  const noPermUser: UserContext = {
    user_id: 'user-noperm',
    email: 'noperm@test.com',
    first_name: 'No',
    last_name: 'Permission',
    is_active: true,
    email_verified: true,
    roles: [createRoleWithPermissions([])], // No analytics permissions
    organizations: [testOrg1],
    accessible_organizations: [testOrg1],
    user_roles: [],
    user_organizations: [],
    current_organization_id: testOrg1.organization_id,
    all_permissions: [],
    is_super_admin: false,
    organization_admin_for: [],
  };

  const noPermService = createOrganizationAccessService(noPermUser);
  const noPermAccess = await noPermService.getAccessiblePracticeUids();

  console.log(`✅ Permission Scope: ${noPermAccess.scope}`);
  console.log(`✅ practice_uids: ${JSON.stringify(noPermAccess.practiceUids)} (empty array)`);
  console.log(`✅ Expected: Fail-closed security - user sees NO data`);
  console.log(`✅ Status: ${noPermAccess.practiceUids.length === 0 && noPermAccess.scope === 'none' ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test 7: Validation Methods
  console.log('\n📊 Test 7: Access Validation Methods');
  console.log('-'.repeat(80));

  const testOrgService = createOrganizationAccessService(orgUser);
  const canAccess100 = await testOrgService.canAccessPracticeUid(100);
  const canAccess999 = await testOrgService.canAccessPracticeUid(999);
  const canAccessOrg1 = await testOrgService.canAccessOrganization('org-test-1');
  const canAccessOrg999 = await testOrgService.canAccessOrganization('org-999');

  console.log(`✅ Can access practice_uid 100: ${canAccess100} (should be true)`);
  console.log(`✅ Can access practice_uid 999: ${canAccess999} (should be false)`);
  console.log(`✅ Can access org-test-1: ${canAccessOrg1} (should be true)`);
  console.log(`✅ Can access org-999: ${canAccessOrg999} (should be false)`);

  const validationPass =
    canAccess100 === true && canAccess999 === false && canAccessOrg1 === true && canAccessOrg999 === false;

  console.log(`✅ Status: ${validationPass ? 'PASS ✓' : 'FAIL ✗'}`);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Summary');
  console.log('='.repeat(80));

  const allTestsPassed =
    superAdminPracticeAccess.scope === 'all' &&
    practiceUidsMatch &&
    emptyOrgAccess.practiceUids.length === 0 &&
    providerProviderAccess.providerUid === 42 &&
    emptyProviderAccess.providerUid === null &&
    noPermAccess.scope === 'none' &&
    validationPass;

  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED ✓');
    console.log('');
    console.log('🔒 Security Model Verified:');
    console.log('   ✓ Super admin sees all data (no filtering)');
    console.log('   ✓ Organization users filtered by practice_uids');
    console.log('   ✓ Provider users filtered by provider_uid');
    console.log('   ✓ Fail-closed security works (empty = no data)');
    console.log('   ✓ Validation methods work correctly');
    console.log('');
    console.log('🎯 Ready for Phase 2.5: Data Leakage Testing');
    console.log('');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED ✗');
    console.log('');
    console.log('Please review the test output above for details.');
    console.log('');
    process.exit(1);
  }
}

// Run the tests
runSecurityTests();
