import type { PracticeInfo, RawOrganizationRow } from './types';

/**
 * Practice Mapping Utilities
 *
 * Maps healthcare 'practices' concept to RBAC 'organizations'.
 * Provides consistent practice info enrichment across all organization queries.
 *
 * Background:
 * Organizations in RBAC can optionally map to healthcare practices.
 * This is a domain-specific concept for healthcare organizations where:
 * - practice_id links to the practices table
 * - practice_uids are used for analytics security filtering
 *
 * Extracted from query-builder.ts to separate domain mapping concerns
 * from base query building patterns.
 */

// ============================================================
// PRACTICE INFO MAPPING
// ============================================================

/**
 * Map raw database row to practice info
 *
 * Handles null practice associations gracefully.
 * Organizations without practice mappings will have undefined practice_info.
 *
 * @param row - Raw organization row with practice join fields
 * @returns Practice info or undefined if no practice association
 *
 * @example
 * ```typescript
 * const practiceInfo = mapPracticeInfo(organizationRow);
 * // { practice_id: 'uuid', domain: 'clinic.com', status: 'active', template_id: 'template-1' }
 * // or undefined if no practice
 * ```
 */
export function mapPracticeInfo(row: RawOrganizationRow): PracticeInfo | undefined {
  if (!row.practice_id) {
    return undefined;
  }

  return {
    practice_id: row.practice_id,
    domain: row.practice_domain ?? '',
    status: row.practice_status ?? 'active',
    template_id: row.practice_template_id ?? '',
  };
}

// ============================================================
// PRACTICE UID VALIDATION
// ============================================================

/**
 * Validate practice UIDs array
 *
 * Practice UIDs are used for analytics security - they filter which
 * data users can access in analytics queries.
 *
 * @param practice_uids - Array of practice UIDs (numbers)
 * @returns Validated and deduplicated array
 * @throws {Error} If practice UIDs are invalid
 *
 * @example
 * ```typescript
 * const validated = validatePracticeUids([1, 2, 2, 3]); // [1, 2, 3]
 * ```
 */
export function validatePracticeUids(practice_uids: unknown): number[] | undefined {
  if (practice_uids === null || practice_uids === undefined) {
    return undefined;
  }

  if (!Array.isArray(practice_uids)) {
    throw new Error('practice_uids must be an array');
  }

  if (practice_uids.length === 0) {
    return undefined;
  }

  // Validate each UID is a number
  const validated: number[] = [];
  for (const uid of practice_uids) {
    if (typeof uid !== 'number' || !Number.isInteger(uid) || uid < 0) {
      throw new Error(`Invalid practice_uid: ${uid} (must be a positive integer)`);
    }
    validated.push(uid);
  }

  // Deduplicate
  return Array.from(new Set(validated));
}
