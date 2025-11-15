/**
 * Public Practice Service
 * Unauthenticated practice lookup for public website features
 * Used by: contact forms, appointment requests, public practice pages
 */

import { and, eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '@/lib/api/responses/error';
import { db, practice_attributes, practices } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { Practice, PracticeAttributes } from '@/lib/types/practice';
import { transformPractice, transformPracticeAttributes } from '@/lib/types/transformers';

export interface PracticeWithAttributes {
  practice: Practice;
  attributes: PracticeAttributes;
}

/**
 * Get practice by domain with attributes
 * Public function for unauthenticated access to practice data
 * Validates practice is active and not deleted
 *
 * @param domain - Practice domain (e.g., "arthritisdocs.com")
 * @returns Practice with attributes
 * @throws APIError (404) if practice not found or inactive
 */
export async function getPracticeByDomain(domain: string): Promise<PracticeWithAttributes> {
  const startTime = Date.now();

  try {
    // Fetch practice with attributes in single query
    const [result] = await db
      .select()
      .from(practices)
      .leftJoin(
        practice_attributes,
        eq(practices.practice_id, practice_attributes.practice_id)
      )
      .where(
        and(
          eq(practices.domain, domain),
          eq(practices.status, 'active'),
          isNull(practices.deleted_at)
        )
      )
      .limit(1);

    const duration = Date.now() - startTime;

    if (!result) {
      log.info('practice not found for domain', {
        operation: 'get_practice_by_domain',
        domain,
        duration,
        component: 'public-practice-service',
        isPublic: true,
      });
      throw NotFoundError(`Practice not found for domain: ${domain}`);
    }

    log.info('practice fetched successfully', {
      operation: 'get_practice_by_domain',
      practiceId: result.practices.practice_id,
      practiceName: result.practices.name,
      domain,
      hasAttributes: !!result.practice_attributes,
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'public-practice-service',
      isPublic: true,
    });

    return {
      practice: transformPractice(result.practices),
      attributes: result.practice_attributes
        ? transformPracticeAttributes(result.practice_attributes)
        : ({} as PracticeAttributes),
    };
  } catch (error) {
    // Re-throw NotFoundError (APIError with 404 status)
    if (error instanceof Error && error.name === 'APIError') throw error;

    log.error('practice fetch failed', error, {
      operation: 'get_practice_by_domain',
      domain,
      duration: Date.now() - startTime,
      component: 'public-practice-service',
      isPublic: true,
    });
    throw error;
  }
}

