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
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { secureRoute, type AuthSession } from '@/lib/api/route-handler';
import { requireFreshAuth } from '@/lib/api/middleware/auth';
import { extractRouteParams } from '@/lib/api/utils/params';
import { deleteCredential, renameCredential } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';
import { z } from 'zod';
import type { CredentialUpdateRequest } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const credentialParamsSchema = z.object({
  id: z.string(),
});

/**
 * DELETE - Remove a passkey credential
 * Requires fresh authentication (max 5 minutes)
 */
const deleteHandler = async (request: NextRequest, session: AuthSession | null, ...args: unknown[]) => {
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

    log.info('Passkey credential deleted', {
      userId,
      credentialId: credentialId.substring(0, 16),
    });

    return createSuccessResponse({ success: true }, 'Passkey deleted successfully');
  } catch (error) {
    log.error('Failed to delete passkey credential', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

/**
 * PATCH - Rename a passkey credential
 */
const renameHandler = async (request: NextRequest, session: AuthSession | null, ...args: unknown[]) => {
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

    log.info('Passkey credential renamed', {
      userId,
      credentialId: credentialId.substring(0, 16),
      newName: credential_name,
    });

    return createSuccessResponse({ success: true }, 'Passkey renamed successfully');
  } catch (error) {
    log.error('Failed to rename passkey credential', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const DELETE = secureRoute(deleteHandler, { rateLimit: 'api' });
export const PATCH = secureRoute(renameHandler, { rateLimit: 'api' });
