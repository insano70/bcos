import { z } from 'zod';
import { generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/tokens';
import { ValidationError } from '../responses/error';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Request metadata extracted from HTTP headers
 * Used for device fingerprinting and audit logging
 */
export interface RequestMetadata {
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  deviceName: string;
}

/**
 * Extract device and network metadata from HTTP request
 * Centralizes IP extraction and device fingerprinting for consistency
 *
 * @param request - Next.js request object
 * @returns RequestMetadata with IP, user agent, fingerprint, and device name
 */
export function extractRequestMetadata(request: Request): RequestMetadata {
  const ipAddress =
    request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return {
    ipAddress,
    userAgent,
    fingerprint: generateDeviceFingerprint(ipAddress, userAgent),
    deviceName: generateDeviceName(userAgent),
  };
}

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10) || 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(1000, Math.max(1, parseInt(val || '10', 10) || 10))),
});

export function getPagination(searchParams: URLSearchParams): PaginationParams {
  const validated = paginationSchema.parse({
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '10',
  });

  return {
    ...validated,
    offset: (validated.page - 1) * validated.limit,
  };
}

export function getSearchFilters(searchParams: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const [key, value] of Array.from(searchParams.entries())) {
    if (!['page', 'limit', 'sort', 'order'].includes(key) && value) {
      filters[key] = value;
    }
  }

  return filters;
}

export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export function getSortParams(searchParams: URLSearchParams, allowedFields: string[]): SortParams {
  const sortBy = searchParams.get('sort') || 'created_at';
  const sortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  if (!allowedFields.includes(sortBy)) {
    throw ValidationError(null, `Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
  }

  return { sortBy, sortOrder };
}
