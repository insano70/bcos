# Reset MFA Button - Design Document

## Overview

This document outlines the design for adding a "Reset MFA" button to the Edit User modal that allows administrators to clear MFA configuration for users who have passkey authentication enabled.

## Current State Analysis

### Database Structure

**MFA Data Storage** (3 tables):

1. **`account_security`** table ([lib/db/refresh-token-schema.ts:122-153](lib/db/refresh-token-schema.ts#L122-L153))
   - `mfa_enabled` (boolean) - MFA status flag
   - `mfa_method` (varchar) - 'webauthn' or future 'totp'
   - `mfa_enforced_at` (timestamp) - When MFA was enforced
   - `mfa_skips_remaining` (integer) - Graceful onboarding tracker (default: 5)
   - `mfa_skip_count` (integer) - Total skips used
   - `mfa_first_skipped_at` (timestamp)
   - `mfa_last_skipped_at` (timestamp)

2. **`webauthn_credentials`** table ([lib/db/webauthn-schema.ts:22-59](lib/db/webauthn-schema.ts#L22-L59))
   - `credential_id` (varchar, PK) - Base64URL encoded credential
   - `user_id` (uuid, FK to users) - User association
   - `public_key` (text) - COSE public key
   - `counter` (integer) - Clone detection counter
   - `credential_name` (varchar) - User-facing name (e.g., "MacBook Pro Touch ID")
   - `is_active` (boolean) - Credential status
   - Additional fields: device type, transports, AAGUID, backup status, registration metadata

3. **`webauthn_challenges`** table ([lib/db/webauthn-schema.ts:66-96](lib/db/webauthn-schema.ts#L66-L96))
   - Temporary storage for registration/auth challenges
   - Auto-cleaned via cron job (every 15 min)
   - 2-minute expiration + 5-minute grace period

### Existing Backend API

**Endpoint**: `POST /api/admin/users/:userId/mfa/reset`
**File**: [app/api/admin/users/[userId]/mfa/reset/route.ts](app/api/admin/users/[userId]/mfa/reset/route.ts)

**Functionality**:
- ✅ Deletes all WebAuthn credentials for user
- ✅ Resets `account_security.mfa_enabled` to false
- ✅ Resets `account_security.mfa_method` to null
- ✅ Resets skip tracking counters
- ✅ Revokes all user sessions for security
- ✅ Prevents admin from resetting their own MFA
- ✅ Audit logging (admin user ID, target user ID, credentials removed)
- ✅ RBAC protection (admin only)
- ✅ Rate limiting (100 req/min)

**Response**:
```typescript
{
  success: true,
  credentials_removed: number,
  sessions_revoked: number
}
```

### Current UI State

**Users List Page**: [app/(default)/configure/users/users-content.tsx](app/(default)/configure/users/users-content.tsx)
- Renders DataTable with user rows
- Edit dropdown action opens `EditUserModal` (line 170-173)

**Edit User Modal**: [components/edit-user-modal.tsx](components/edit-user-modal.tsx)
- Form fields:
  - First Name, Last Name, Email
  - Password Reset (optional)
  - Role Selector
  - Provider UID (analytics)
  - Email Verified (checkbox)
  - Active User (checkbox)
- **Missing**: MFA status display and reset functionality

**User Type**: [lib/hooks/use-users.ts:3-17](lib/hooks/use-users.ts#L3-L17)
```typescript
export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  provider_uid?: number | null;
  created_at: string;
  deleted_at: string | null;
  roles?: Array<{ id: string; name: string; }>;
  // MISSING: MFA status fields
}
```

---

## Design Proposal

### 1. Extend User Type

**File**: `lib/hooks/use-users.ts`

Add MFA status fields to User interface:

```typescript
export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  provider_uid?: number | null;
  created_at: string;
  deleted_at: string | null;
  roles?: Array<{ id: string; name: string; }>;

  // MFA status
  mfa_enabled?: boolean;
  mfa_method?: 'webauthn' | null;
  mfa_credentials_count?: number; // Number of active passkeys
}
```

**Rationale**: We need credential count to show admins HOW MANY passkeys will be removed.

---

### 2. Update API Response

**File**: `app/api/users/route.ts` (GET handler)

Modify the response mapping (lines 43-53) to include MFA status:

```typescript
// Join account_security table for MFA status
const usersWithSecurity = await usersService.getUsersWithSecurityStatus({
  search: query.search,
  is_active: query.is_active,
  email_verified: query.email_verified,
  limit: pagination.limit,
  offset: pagination.offset,
});

// Count credentials per user
const credentialCounts = await getMFACredentialCounts(userIds);

const responseData = users.map((user) => ({
  id: user.user_id,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  email_verified: user.email_verified,
  is_active: user.is_active,
  created_at: user.created_at,
  organizations: user.organizations,
  roles: rolesMap.get(user.user_id) || [],

  // MFA status
  mfa_enabled: user.mfa_enabled || false,
  mfa_method: user.mfa_method || null,
  mfa_credentials_count: credentialCounts.get(user.user_id) || 0,
}));
```

**New Service Method** (add to `lib/services/rbac-users-service.ts`):

```typescript
async getMFACredentialCounts(userIds: string[]): Promise<Map<string, number>> {
  const counts = await db
    .select({
      user_id: webauthn_credentials.user_id,
      count: sql<number>`count(*)::integer`,
    })
    .from(webauthn_credentials)
    .where(
      and(
        inArray(webauthn_credentials.user_id, userIds),
        eq(webauthn_credentials.is_active, true)
      )
    )
    .groupBy(webauthn_credentials.user_id);

  return new Map(counts.map(c => [c.user_id, c.count]));
}
```

---

### 3. Add MFA Status Display to Edit Modal

**File**: `components/edit-user-modal.tsx`

**Location**: After "Active User" checkbox (line 449), before error display (line 451)

```tsx
{/* MFA Status Section */}
{user?.mfa_enabled && (
  <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <svg
            className="w-4 h-4 mr-2 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          MFA Enabled
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Method: Passkey (WebAuthn)
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {user.mfa_credentials_count} {user.mfa_credentials_count === 1 ? 'device' : 'devices'} configured
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowResetMFAModal(true)}
        disabled={isSubmitting}
        className="px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
      >
        Reset MFA
      </button>
    </div>
  </div>
)}

{/* No MFA Message */}
{!user?.mfa_enabled && (
  <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
      <svg
        className="w-4 h-4 mr-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      MFA not configured
    </div>
    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
      User will be prompted to set up passkey authentication on next login.
    </p>
  </div>
)}
```

---

### 4. Create Reset MFA Confirmation Modal

**New Component**: `components/reset-mfa-confirmation-modal.tsx`

```tsx
'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';

interface ResetMFAConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    mfa_credentials_count?: number;
  };
}

export default function ResetMFAConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  user,
}: ResetMFAConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset MFA');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={isSubmitting ? () => {} : onClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-lg w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.082 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Reset MFA Configuration
                  </Dialog.Title>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Are you sure you want to reset MFA for{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {user.first_name} {user.last_name}
                    </span>{' '}
                    ({user.email})?
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  This action will:
                </h4>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>
                    Remove {user.mfa_credentials_count || 0} configured passkey
                    {user.mfa_credentials_count !== 1 ? 's' : ''}
                  </li>
                  <li>Disable MFA for this user</li>
                  <li>Revoke all active sessions (user will be logged out)</li>
                  <li>Require user to re-configure MFA on next login</li>
                </ul>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Resetting MFA...' : 'Reset MFA'}
                </button>
              </div>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
```

---

### 5. Wire Up Reset MFA Logic in Edit Modal

**File**: `components/edit-user-modal.tsx`

Add state and handlers:

```typescript
const [showResetMFAModal, setShowResetMFAModal] = useState(false);
const [resetMFASuccess, setResetMFASuccess] = useState(false);

const handleResetMFA = async () => {
  if (!user) return;

  try {
    const response = await apiClient.post(`/api/admin/users/${user.id}/mfa/reset`);

    if (response.ok) {
      setResetMFASuccess(true);
      setShowResetMFAModal(false);

      // Show success toast
      setShowToast(true);

      // Refresh user data after brief delay
      setTimeout(() => {
        onSuccess?.();
        setResetMFASuccess(false);
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to reset MFA:', error);
    throw error; // Re-throw for modal to handle
  }
};
```

Import and render the confirmation modal:

```tsx
import ResetMFAConfirmationModal from './reset-mfa-confirmation-modal';

// ... inside EditUserModal return:

{/* Reset MFA Confirmation Modal */}
{user && (
  <ResetMFAConfirmationModal
    isOpen={showResetMFAModal}
    onClose={() => setShowResetMFAModal(false)}
    onConfirm={handleResetMFA}
    user={{
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      mfa_credentials_count: user.mfa_credentials_count || 0,
    }}
  />
)}
```

Update success toast message:

```tsx
<Toast
  type="success"
  open={showToast}
  setOpen={setShowToast}
  className="fixed bottom-4 right-4 z-50"
>
  {resetMFASuccess
    ? 'MFA reset successfully! User must re-configure on next login.'
    : 'User updated successfully!'
  }
</Toast>
```

---

## UX Flow

### Admin Perspective

1. **Open Edit User Modal** for user with MFA enabled
2. **See MFA Status Section** showing:
   - Green shield icon with "MFA Enabled"
   - Method: "Passkey (WebAuthn)"
   - Number of devices configured (e.g., "2 devices configured")
   - Red "Reset MFA" button on the right
3. **Click "Reset MFA" button**
4. **Confirmation modal appears** with:
   - Warning icon
   - Clear explanation of consequences
   - Yellow warning box listing all actions
   - Cancel / Reset MFA buttons
5. **Click "Reset MFA"** in confirmation
6. **Modal closes**, success toast appears
7. **User list refreshes**, MFA status updated
8. **Target user is logged out** (all sessions revoked)

### Target User Perspective

1. User is immediately **logged out** from all devices
2. On next login attempt:
   - After successful password authentication
   - **Prompted to set up passkey** (MFA enrollment flow)
   - Can skip up to 5 times (default grace period)
3. Once passkey is configured:
   - MFA re-enabled automatically
   - User can manage devices in settings

---

## Security Considerations

✅ **Backend protections** (already implemented):
- Admin-only endpoint (RBAC)
- Prevents self-reset (admin cannot reset their own MFA)
- Audit logging (who reset MFA for whom)
- Session revocation (immediate logout)
- Rate limiting (100 req/min)

✅ **Frontend validations**:
- Only show Reset button if `mfa_enabled === true`
- Confirmation modal with explicit warning
- Disable button during submission
- Error handling with user-friendly messages

✅ **Data integrity**:
- Backend performs complete cleanup:
  - All credentials deleted (CASCADE from webauthn_credentials table)
  - account_security flags reset
  - Skip counters reset
  - Challenges auto-cleaned by cron job

---

## Testing Checklist

### Unit Tests (Backend)
- [ ] API endpoint returns correct response
- [ ] Prevents admin from resetting own MFA
- [ ] Correctly counts credentials to remove
- [ ] Revokes all user sessions
- [ ] Updates account_security correctly

### Integration Tests
- [ ] Full flow: admin resets MFA → user logs out → user re-enrolls
- [ ] Verify user cannot login with old passkey after reset
- [ ] Verify user can skip MFA setup (up to 5 times)

### UI Tests
- [ ] MFA status section only shows when `mfa_enabled === true`
- [ ] Credential count displays correctly
- [ ] Confirmation modal prevents accidental clicks
- [ ] Success toast appears after successful reset
- [ ] Error messages display properly
- [ ] Button disabled during submission

### Manual Testing
- [ ] Test with user who has 0, 1, 2, 5 passkeys
- [ ] Verify session revocation (check user is logged out)
- [ ] Verify audit logs contain correct data
- [ ] Test error scenarios (network failure, permission denied)

---

## Files to Modify

1. **lib/hooks/use-users.ts** - Add MFA fields to User type
2. **lib/services/rbac-users-service.ts** - Add `getMFACredentialCounts()` method
3. **app/api/users/route.ts** - Include MFA status in GET response
4. **components/edit-user-modal.tsx** - Add MFA status display and Reset button
5. **components/reset-mfa-confirmation-modal.tsx** - NEW FILE (confirmation modal)

---

## RBAC Permissions

**Required Permission**: `users:manage:all` (super admin only)

The existing API endpoint already enforces this via `requireAdmin()` middleware. No changes needed.

---

## Audit Logging

**Existing logs** (from `app/api/admin/users/[userId]/mfa/reset/route.ts`):

```typescript
log.info('Admin MFA reset initiated', {
  adminUserId,
  targetUserId,
});

log.info('Admin MFA reset completed', {
  adminUserId,
  targetUserId,
  credentialsRemoved: result.credentials_removed,
  sessionsRevoked: revokedSessions,
});
```

These logs are already sufficient for compliance and security monitoring.

---

## Future Enhancements (Out of Scope)

1. **Bulk MFA Reset** - Reset MFA for multiple users at once
2. **MFA Status Column** - Add MFA indicator to users table
3. **MFA Enforcement Policy** - Require MFA for all users (system-wide setting)
4. **Backup Codes** - Allow admins to generate one-time backup codes
5. **MFA Analytics** - Dashboard showing MFA adoption rate

---

## Summary

This design adds a **secure, user-friendly MFA reset feature** that:

- ✅ Leverages existing backend infrastructure (API already exists)
- ✅ Follows established UI patterns (modal confirmations, toasts)
- ✅ Maintains security best practices (audit logging, session revocation)
- ✅ Provides clear UX with no ambiguity about consequences
- ✅ Requires minimal code changes (extend type, update 3 files, create 1 component)
- ✅ Fully documented with testing checklist

The implementation is straightforward and ready for development.
