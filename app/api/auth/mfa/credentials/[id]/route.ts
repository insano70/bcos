/**
 * DELETE /api/auth/mfa/credentials/:id
 * Delete (deactivate) a passkey credential
 *
 * PATCH /api/auth/mfa/credentials/:id
 * Rename a passkey credential
 *
 * Authentication: Required (fresh auth for delete, regular for rename)
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireFreshAuth } from '@/lib/api/middleware/auth';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { authRoute, type AuthSession } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { deleteCredential, renameCredential } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';
import type { CredentialUpdateRequest } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const credentialParamsSchema = z.object({
  id: z.string(),
});

/**
 * DELETE - Remove a passkey credential
 * Requires fresh authentication (max 5 minutes)
 */
const deleteHandler = async (
  request: NextRequest,
  session?: AuthSession,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    // Require fresh authentication for security
    await requireFreshAuth(request, 5);
    const userId = session?.user.id;

    if (!userId) {
      throw new Error('User ID not found in session');
    }

    // Get credential ID from URL
    const { id: credentialId } = await extractRouteParams(args[0], credentialParamsSchema);

    // Delete credential
    await deleteCredential(userId, credentialId);

    const duration = Date.now() - startTime;

    log.info('mfa credential deleted successfully - passkey deactivated', {
      operation: 'delete_mfa_credential',
      userId,
      credentialId: credentialId.substring(0, 16),
      security: {
        freshAuthRequired: true,
        maxAuthAge: 5,
      },
      duration,
      slow: duration > 1000,
      component: 'auth',
    });

    return createSuccessResponse({ success: true }, 'Passkey deleted successfully');
  } catch (error) {
    log.error('Failed to delete passkey credential', error, {
      operation: 'delete_mfa_credential',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

/**
 * PATCH - Rename a passkey credential
 */
const renameHandler = async (
  request: NextRequest,
  session?: AuthSession,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const userId = session?.user.id;

    if (!userId) {
      throw new Error('User ID not found in session');
    }

    // Get credential ID from URL
    const { id: credentialId } = await extractRouteParams(args[0], credentialParamsSchema);

    // Parse request body
    const body = (await request.json()) as CredentialUpdateRequest;
    const { credential_name } = body;

    if (!credential_name || credential_name.trim().length === 0) {
      throw new Error('credential_name is required and cannot be empty');
    }

    if (credential_name.length > 100) {
      throw new Error('credential_name must be 100 characters or less');
    }

    // Rename credential
    await renameCredential(userId, credentialId, credential_name.trim());

    const duration = Date.now() - startTime;

    log.info('mfa credential renamed successfully', {
      operation: 'rename_mfa_credential',
      userId,
      credentialId: credentialId.substring(0, 16),
      newName: credential_name.trim(),
      nameLength: credential_name.trim().length,
      duration,
      slow: duration > 1000,
      component: 'auth',
    });

    return createSuccessResponse({ success: true }, 'Passkey renamed successfully');
  } catch (error) {
    log.error('Failed to rename passkey credential', error, {
      operation: 'rename_mfa_credential',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const DELETE = authRoute(deleteHandler, { rateLimit: 'api' });
export const PATCH = authRoute(renameHandler, { rateLimit: 'api' });
