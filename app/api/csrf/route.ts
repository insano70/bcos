import { NextRequest } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { createSuccessResponse } from '@/lib/api/responses/success'

export async function GET(_request: NextRequest) {
  // Generate and set CSRF token cookie, and return token for header use
  const token = await CSRFProtection.setCSRFToken()
  return createSuccessResponse({ csrfToken: token }, 'CSRF token issued')
}


